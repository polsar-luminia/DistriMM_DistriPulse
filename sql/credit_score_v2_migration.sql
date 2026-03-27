-- DistriMM Credit Score V2 — Multi-dimensional model with configurable weights
-- Run this in the Supabase SQL editor:
-- https://supabase.com/dashboard/project/xzhqhmjfhnvqxndxayxs/sql/new
--
-- This does NOT drop fn_calcular_credit_score (v1). The v2 is independent.

-- ============================================================================
-- 1. Config table
-- ============================================================================

CREATE TABLE IF NOT EXISTS distrimm_config (
  id INT PRIMARY KEY DEFAULT 1,
  max_plazo_dias INT DEFAULT 45,
  score_config JSONB DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed row if empty
INSERT INTO distrimm_config (id, max_plazo_dias)
SELECT 1, 45
WHERE NOT EXISTS (SELECT 1 FROM distrimm_config WHERE id = 1);

-- Add score_config column if table already existed without it
ALTER TABLE distrimm_config
  ADD COLUMN IF NOT EXISTS score_config JSONB DEFAULT NULL;

ALTER TABLE distrimm_config ENABLE ROW LEVEL SECURITY;

-- Idempotent policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'distrimm_config' AND policyname = 'auth_access'
  ) THEN
    CREATE POLICY "auth_access" ON distrimm_config FOR ALL TO authenticated USING (true);
  END IF;
END $$;

-- ============================================================================
-- 2. fn_calcular_credit_score_v2
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_calcular_credit_score_v2(
  p_nit    TEXT,
  p_config JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  -- Config values
  w_mora_prom      NUMERIC;
  w_tendencia      NUMERIC;
  w_cumplimiento   NUMERIC;
  w_concentracion  NUMERIC;
  w_mora_max       NUMERIC;
  w_volatilidad    NUMERIC;
  w_antiguedad     NUMERIC;
  w_volumen        NUMERIC;
  v_techo_mora     INT;
  v_periodo_meses  INT;
  v_umbrales       JSONB;
  v_plazos         JSONB;
  v_peso_total     NUMERIC;

  -- Corte tracking
  v_cargas         UUID[];
  v_num_cortes     INT;
  v_latest_carga   UUID;

  -- V1: Mora promedio ponderada
  v_mora_por_corte NUMERIC[];
  v_mora_prom_global NUMERIC := 0;
  v_score_mora_prom  NUMERIC := 0;
  v_iter_mora        NUMERIC;
  v_iter_deuda       NUMERIC;
  v_i                INT;

  -- V2: Tendencia
  v_mora_reciente    NUMERIC := 0;
  v_mora_anterior    NUMERIC := 0;
  v_score_tendencia  NUMERIC := 50;
  v_tendencia_label  TEXT := 'estable';

  -- V3: Cumplimiento
  v_facturas_al_dia  INT := 0;
  v_facturas_total   INT := 0;
  v_tasa_cumpl       NUMERIC := 50;
  v_score_cumpl      NUMERIC := 50;

  -- V4: Concentracion vencida (ultimo corte)
  v_total_deuda      NUMERIC := 0;
  v_deuda_vencida    NUMERIC := 0;
  v_concentracion_pct NUMERIC := 0;
  v_score_concentracion NUMERIC := 100;

  -- V5: Mora maxima (ultimo corte)
  v_max_mora         INT := 0;
  v_score_mora_max   NUMERIC := 0;

  -- V6: Volatilidad
  v_stddev           NUMERIC := 0;
  v_score_volatilidad NUMERIC := 50;

  -- V7: Antiguedad
  v_primera_fecha    DATE;
  v_antiguedad_dias  INT := 0;
  v_score_antiguedad NUMERIC := 50;

  -- V8: Volumen
  v_volumen_cliente  NUMERIC := 0;
  v_percentil_rank   NUMERIC := 0;
  v_volumen_label    TEXT := 'sin_datos';
  v_score_volumen    NUMERIC := 50;

  -- Final
  v_score_final      NUMERIC := 0;
  v_nivel            TEXT;
  v_plazo_dias       INT;
  v_facturas_vencidas JSONB;
  v_num_facturas_actual INT := 0;

  -- Dimension scores (weighted)
  v_dim_comportamiento NUMERIC;
  v_dim_exposicion     NUMERIC;
  v_dim_relacion       NUMERIC;

  -- Temp
  rec RECORD;
BEGIN
  -- ========================================================================
  -- PARSE CONFIG
  -- ========================================================================
  w_mora_prom     := COALESCE((p_config->'pesos'->>'mora_prom')::NUMERIC,     20);
  w_tendencia     := COALESCE((p_config->'pesos'->>'tendencia')::NUMERIC,     15);
  w_cumplimiento  := COALESCE((p_config->'pesos'->>'cumplimiento')::NUMERIC,  15);
  w_concentracion := COALESCE((p_config->'pesos'->>'concentracion')::NUMERIC, 15);
  w_mora_max      := COALESCE((p_config->'pesos'->>'mora_max')::NUMERIC,      10);
  w_volatilidad   := COALESCE((p_config->'pesos'->>'volatilidad')::NUMERIC,    5);
  w_antiguedad    := COALESCE((p_config->'pesos'->>'antiguedad')::NUMERIC,    10);
  w_volumen       := COALESCE((p_config->'pesos'->>'volumen')::NUMERIC,       10);

  v_techo_mora    := COALESCE((p_config->>'techo_mora_dias')::INT,           180);
  v_periodo_meses := COALESCE((p_config->>'periodo_evaluacion_meses')::INT,   12);

  v_umbrales := COALESCE(p_config->'umbrales_nivel', '{
    "excelente": 80, "bueno": 60, "regular": 40, "riesgo": 20
  }'::JSONB);

  v_plazos := COALESCE(p_config->'plazos_por_nivel', '{
    "excelente": 90, "bueno": 60, "regular": 30, "riesgo": 15, "alto_riesgo": 0
  }'::JSONB);

  -- Normalize weights if they don't sum to 100
  v_peso_total := w_mora_prom + w_tendencia + w_cumplimiento + w_concentracion
                + w_mora_max + w_volatilidad + w_antiguedad + w_volumen;

  IF v_peso_total > 0 AND v_peso_total != 100 THEN
    w_mora_prom     := w_mora_prom     / v_peso_total * 100;
    w_tendencia     := w_tendencia     / v_peso_total * 100;
    w_cumplimiento  := w_cumplimiento  / v_peso_total * 100;
    w_concentracion := w_concentracion / v_peso_total * 100;
    w_mora_max      := w_mora_max      / v_peso_total * 100;
    w_volatilidad   := w_volatilidad   / v_peso_total * 100;
    w_antiguedad    := w_antiguedad    / v_peso_total * 100;
    w_volumen       := w_volumen       / v_peso_total * 100;
    v_peso_total    := 100;
  END IF;

  -- ========================================================================
  -- GET RELEVANT CARGAS (within evaluation period)
  -- ========================================================================
  SELECT ARRAY_AGG(id ORDER BY fecha_corte DESC)
  INTO v_cargas
  FROM historial_cargas
  WHERE fecha_corte >= (CURRENT_DATE - (v_periodo_meses * INTERVAL '1 month'));

  v_num_cortes := COALESCE(array_length(v_cargas, 1), 0);

  IF v_num_cortes = 0 THEN
    RETURN jsonb_build_object(
      'score', 0, 'nivel', 'Sin datos',
      'plazo_sugerido_dias', 0,
      'dimensiones', '{}'::JSONB,
      'detalles', '{}'::JSONB,
      'facturas_vencidas', '[]'::JSONB,
      'config_aplicada', p_config
    );
  END IF;

  v_latest_carga := v_cargas[1]; -- most recent

  -- Check client exists in latest carga
  SELECT COUNT(*)::INT INTO v_num_facturas_actual
  FROM cartera_items
  WHERE carga_id = v_latest_carga AND tercero_nit = p_nit;

  IF v_num_facturas_actual = 0 THEN
    RETURN jsonb_build_object(
      'score', 0, 'nivel', 'Sin datos',
      'plazo_sugerido_dias', 0,
      'dimensiones', '{}'::JSONB,
      'detalles', '{}'::JSONB,
      'facturas_vencidas', '[]'::JSONB,
      'config_aplicada', p_config
    );
  END IF;

  -- ========================================================================
  -- V1: MORA PROMEDIO PONDERADA (across all cortes)
  -- ========================================================================
  v_mora_por_corte := ARRAY[]::NUMERIC[];

  FOR v_i IN 1 .. v_num_cortes LOOP
    SELECT
      CASE WHEN COALESCE(SUM(valor_saldo), 0) > 0
        THEN SUM(GREATEST(CURRENT_DATE - fecha_vencimiento::date, 0)::NUMERIC * valor_saldo)
             / SUM(valor_saldo)
        ELSE 0
      END,
      COALESCE(SUM(valor_saldo), 0)
    INTO v_iter_mora, v_iter_deuda
    FROM cartera_items
    WHERE carga_id = v_cargas[v_i] AND tercero_nit = p_nit;

    IF v_iter_deuda > 0 THEN
      v_mora_por_corte := array_append(v_mora_por_corte, v_iter_mora);
    END IF;
  END LOOP;

  IF array_length(v_mora_por_corte, 1) > 0 THEN
    SELECT AVG(val) INTO v_mora_prom_global
    FROM unnest(v_mora_por_corte) AS val;
  END IF;

  v_score_mora_prom := GREATEST(0, LEAST(100, 100 - (v_mora_prom_global * 100.0 / v_techo_mora)));

  -- ========================================================================
  -- V2: TENDENCIA DE MORA
  -- ========================================================================
  IF array_length(v_mora_por_corte, 1) >= 4 THEN
    -- Last 3 cortes (indices 1-3 since ordered DESC)
    v_mora_reciente := (
      COALESCE(v_mora_por_corte[1], 0) +
      COALESCE(v_mora_por_corte[2], 0) +
      COALESCE(v_mora_por_corte[3], 0)
    ) / 3.0;

    -- Previous 3 (indices 4-6, or whatever is available)
    DECLARE
      v_prev_count INT := 0;
      v_prev_sum   NUMERIC := 0;
      v_j          INT;
    BEGIN
      FOR v_j IN 4 .. LEAST(6, array_length(v_mora_por_corte, 1)) LOOP
        v_prev_sum := v_prev_sum + v_mora_por_corte[v_j];
        v_prev_count := v_prev_count + 1;
      END LOOP;

      IF v_prev_count > 0 THEN
        v_mora_anterior := v_prev_sum / v_prev_count;
      ELSE
        v_mora_anterior := v_mora_reciente;
      END IF;
    END;

    IF v_mora_reciente < v_mora_anterior THEN
      v_tendencia_label := 'mejorando';
      v_score_tendencia := LEAST(100, 50 + (
        (v_mora_anterior - v_mora_reciente) / GREATEST(v_mora_anterior, 1) * 50
      ));
    ELSIF v_mora_reciente > v_mora_anterior THEN
      v_tendencia_label := 'empeorando';
      v_score_tendencia := GREATEST(0, 50 - (
        (v_mora_reciente - v_mora_anterior) / GREATEST(v_mora_anterior, 1) * 50
      ));
    ELSE
      v_tendencia_label := 'estable';
      v_score_tendencia := 50;
    END IF;
  ELSE
    v_score_tendencia := 50;
    v_tendencia_label := 'sin_historial';
  END IF;

  -- ========================================================================
  -- V3: TASA DE CUMPLIMIENTO (across all cortes)
  -- ========================================================================
  SELECT
    COUNT(*)::INT,
    COUNT(*) FILTER (WHERE GREATEST(CURRENT_DATE - fecha_vencimiento::date, 0) <= 0)::INT
  INTO v_facturas_total, v_facturas_al_dia
  FROM cartera_items
  WHERE carga_id = ANY(v_cargas) AND tercero_nit = p_nit;

  IF v_facturas_total > 0 THEN
    v_tasa_cumpl := v_facturas_al_dia::NUMERIC / v_facturas_total * 100;
    v_score_cumpl := v_tasa_cumpl; -- already 0-100
  ELSE
    v_score_cumpl := 50;
  END IF;

  -- ========================================================================
  -- V4: CONCENTRACION VENCIDA (latest corte only)
  -- ========================================================================
  SELECT
    COALESCE(SUM(valor_saldo), 0),
    COALESCE(SUM(CASE WHEN GREATEST(CURRENT_DATE - fecha_vencimiento::date, 0) > 0
      THEN valor_saldo ELSE 0 END), 0)
  INTO v_total_deuda, v_deuda_vencida
  FROM cartera_items
  WHERE carga_id = v_latest_carga AND tercero_nit = p_nit;

  IF v_total_deuda > 0 THEN
    v_concentracion_pct := v_deuda_vencida / v_total_deuda * 100;
    v_score_concentracion := GREATEST(0, 100 - v_concentracion_pct);
  ELSE
    v_score_concentracion := 100;
  END IF;

  -- ========================================================================
  -- V5: MORA MAXIMA (latest corte)
  -- ========================================================================
  SELECT COALESCE(MAX(GREATEST(CURRENT_DATE - fecha_vencimiento::date, 0)), 0)::INT
  INTO v_max_mora
  FROM cartera_items
  WHERE carga_id = v_latest_carga AND tercero_nit = p_nit;

  v_score_mora_max := GREATEST(0, LEAST(100, 100 - (v_max_mora * 100.0 / v_techo_mora)));

  -- ========================================================================
  -- V6: VOLATILIDAD DE PAGO
  -- ========================================================================
  IF array_length(v_mora_por_corte, 1) >= 2 THEN
    SELECT STDDEV_SAMP(val) INTO v_stddev
    FROM unnest(v_mora_por_corte) AS val;

    v_stddev := COALESCE(v_stddev, 0);
    v_score_volatilidad := GREATEST(0, LEAST(100, 100 - (v_stddev * 100.0 / (v_techo_mora::NUMERIC / 2))));
  ELSE
    v_score_volatilidad := 50;
  END IF;

  -- ========================================================================
  -- V7: ANTIGUEDAD DE RELACION
  -- ========================================================================
  SELECT MIN(hc.fecha_corte)
  INTO v_primera_fecha
  FROM historial_cargas hc
  WHERE EXISTS (
    SELECT 1 FROM cartera_items ci
    WHERE ci.carga_id = hc.id AND ci.tercero_nit = p_nit
  );

  IF v_primera_fecha IS NOT NULL THEN
    v_antiguedad_dias := CURRENT_DATE - v_primera_fecha;
    v_score_antiguedad := CASE
      WHEN v_antiguedad_dias >= 730 THEN 100
      WHEN v_antiguedad_dias >= 365 THEN 85
      WHEN v_antiguedad_dias >= 181 THEN 70
      WHEN v_antiguedad_dias >= 91  THEN 50
      WHEN v_antiguedad_dias >= 31  THEN 30
      ELSE 15
    END;
  ELSE
    v_score_antiguedad := 15;
  END IF;

  -- ========================================================================
  -- V8: VOLUMEN DE NEGOCIO (percentile ranking)
  -- ========================================================================
  -- Client's total volume
  SELECT COALESCE(SUM(valor_saldo), 0)
  INTO v_volumen_cliente
  FROM cartera_items
  WHERE carga_id = ANY(v_cargas) AND tercero_nit = p_nit;

  IF v_volumen_cliente > 0 THEN
    -- Percentile: what fraction of clients have volume <= this client
    SELECT
      COALESCE(
        COUNT(*) FILTER (WHERE vol <= v_volumen_cliente)::NUMERIC
        / NULLIF(COUNT(*), 0) * 100,
        50
      )
    INTO v_percentil_rank
    FROM (
      SELECT tercero_nit, SUM(valor_saldo) AS vol
      FROM cartera_items
      WHERE carga_id = ANY(v_cargas)
      GROUP BY tercero_nit
    ) sub;

    IF v_percentil_rank >= 90 THEN
      v_score_volumen := 100; v_volumen_label := 'top_10';
    ELSIF v_percentil_rank >= 75 THEN
      v_score_volumen := 85;  v_volumen_label := 'top_25';
    ELSIF v_percentil_rank >= 50 THEN
      v_score_volumen := 70;  v_volumen_label := 'top_50';
    ELSIF v_percentil_rank >= 25 THEN
      v_score_volumen := 50;  v_volumen_label := 'top_75';
    ELSE
      v_score_volumen := 30;  v_volumen_label := 'bottom_25';
    END IF;
  ELSE
    v_score_volumen := 50;
    v_volumen_label := 'sin_datos';
  END IF;

  -- ========================================================================
  -- FINAL SCORE
  -- ========================================================================
  v_score_final := ROUND(
    v_score_mora_prom     * (w_mora_prom     / 100.0) +
    v_score_tendencia     * (w_tendencia     / 100.0) +
    v_score_cumpl         * (w_cumplimiento  / 100.0) +
    v_score_concentracion * (w_concentracion / 100.0) +
    v_score_mora_max      * (w_mora_max      / 100.0) +
    v_score_volatilidad   * (w_volatilidad   / 100.0) +
    v_score_antiguedad    * (w_antiguedad    / 100.0) +
    v_score_volumen       * (w_volumen       / 100.0)
  );

  -- Dimension aggregate scores (weighted average within each dimension)
  v_dim_comportamiento := CASE
    WHEN (w_mora_prom + w_tendencia + w_cumplimiento) > 0 THEN ROUND(
      (v_score_mora_prom * w_mora_prom + v_score_tendencia * w_tendencia + v_score_cumpl * w_cumplimiento)
      / (w_mora_prom + w_tendencia + w_cumplimiento)
    ) ELSE 0 END;

  v_dim_exposicion := CASE
    WHEN (w_concentracion + w_mora_max + w_volatilidad) > 0 THEN ROUND(
      (v_score_concentracion * w_concentracion + v_score_mora_max * w_mora_max + v_score_volatilidad * w_volatilidad)
      / (w_concentracion + w_mora_max + w_volatilidad)
    ) ELSE 0 END;

  v_dim_relacion := CASE
    WHEN (w_antiguedad + w_volumen) > 0 THEN ROUND(
      (v_score_antiguedad * w_antiguedad + v_score_volumen * w_volumen)
      / (w_antiguedad + w_volumen)
    ) ELSE 0 END;

  -- ========================================================================
  -- LEVEL & SUGGESTED TERM
  -- ========================================================================
  IF v_score_final >= COALESCE((v_umbrales->>'excelente')::INT, 80) THEN
    v_nivel := 'Excelente';
    v_plazo_dias := COALESCE((v_plazos->>'excelente')::INT, 90);
  ELSIF v_score_final >= COALESCE((v_umbrales->>'bueno')::INT, 60) THEN
    v_nivel := 'Bueno';
    v_plazo_dias := COALESCE((v_plazos->>'bueno')::INT, 60);
  ELSIF v_score_final >= COALESCE((v_umbrales->>'regular')::INT, 40) THEN
    v_nivel := 'Regular';
    v_plazo_dias := COALESCE((v_plazos->>'regular')::INT, 30);
  ELSIF v_score_final >= COALESCE((v_umbrales->>'riesgo')::INT, 20) THEN
    v_nivel := 'Riesgo';
    v_plazo_dias := COALESCE((v_plazos->>'riesgo')::INT, 15);
  ELSE
    v_nivel := 'Alto riesgo';
    v_plazo_dias := COALESCE((v_plazos->>'alto_riesgo')::INT, 0);
  END IF;

  -- ========================================================================
  -- OVERDUE INVOICES (latest corte)
  -- ========================================================================
  SELECT jsonb_agg(
    jsonb_build_object(
      'documento_id', documento_id,
      'fecha_vencimiento', to_char(fecha_vencimiento::date, 'YYYY-MM-DD'),
      'dias_mora', GREATEST(CURRENT_DATE - fecha_vencimiento::date, 0),
      'valor_saldo', valor_saldo
    ) ORDER BY valor_saldo DESC
  ) INTO v_facturas_vencidas
  FROM cartera_items
  WHERE carga_id = v_latest_carga
    AND tercero_nit = p_nit
    AND GREATEST(CURRENT_DATE - fecha_vencimiento::date, 0) > 0;

  -- ========================================================================
  -- RETURN
  -- ========================================================================
  RETURN jsonb_build_object(
    'score', v_score_final,
    'nivel', v_nivel,
    'plazo_sugerido_dias', v_plazo_dias,
    'dimensiones', jsonb_build_object(
      'comportamiento', jsonb_build_object(
        'score', v_dim_comportamiento,
        'peso_total', ROUND(w_mora_prom + w_tendencia + w_cumplimiento),
        'variables', jsonb_build_object(
          'mora_prom', jsonb_build_object('score', ROUND(v_score_mora_prom), 'peso', ROUND(w_mora_prom), 'valor_raw', ROUND(v_mora_prom_global, 1)),
          'tendencia', jsonb_build_object('score', ROUND(v_score_tendencia), 'peso', ROUND(w_tendencia), 'valor_raw', v_tendencia_label),
          'cumplimiento', jsonb_build_object('score', ROUND(v_score_cumpl), 'peso', ROUND(w_cumplimiento), 'valor_raw', ROUND(v_tasa_cumpl, 1))
        )
      ),
      'exposicion', jsonb_build_object(
        'score', v_dim_exposicion,
        'peso_total', ROUND(w_concentracion + w_mora_max + w_volatilidad),
        'variables', jsonb_build_object(
          'concentracion', jsonb_build_object('score', ROUND(v_score_concentracion), 'peso', ROUND(w_concentracion), 'valor_raw', ROUND(v_concentracion_pct, 1)),
          'mora_max', jsonb_build_object('score', ROUND(v_score_mora_max), 'peso', ROUND(w_mora_max), 'valor_raw', v_max_mora),
          'volatilidad', jsonb_build_object('score', ROUND(v_score_volatilidad), 'peso', ROUND(w_volatilidad), 'valor_raw', ROUND(v_stddev, 1))
        )
      ),
      'relacion', jsonb_build_object(
        'score', v_dim_relacion,
        'peso_total', ROUND(w_antiguedad + w_volumen),
        'variables', jsonb_build_object(
          'antiguedad', jsonb_build_object('score', ROUND(v_score_antiguedad), 'peso', ROUND(w_antiguedad), 'valor_raw', v_antiguedad_dias),
          'volumen', jsonb_build_object('score', ROUND(v_score_volumen), 'peso', ROUND(w_volumen), 'valor_raw', v_volumen_label)
        )
      )
    ),
    'detalles', jsonb_build_object(
      'mora_promedio_ponderada', ROUND(v_mora_prom_global, 1),
      'max_mora', v_max_mora,
      'concentracion_vencida_pct', ROUND(v_concentracion_pct),
      'tasa_cumplimiento_pct', ROUND(v_tasa_cumpl, 1),
      'tendencia', v_tendencia_label,
      'volatilidad_dias', ROUND(v_stddev, 1),
      'antiguedad_dias', v_antiguedad_dias,
      'volumen_percentil', v_volumen_label,
      'num_facturas_actual', v_num_facturas_actual,
      'num_cortes_evaluados', v_num_cortes,
      'total_deuda', v_total_deuda,
      'deuda_vencida', v_deuda_vencida
    ),
    'facturas_vencidas', COALESCE(v_facturas_vencidas, '[]'::JSONB),
    'config_aplicada', jsonb_build_object(
      'pesos', jsonb_build_object(
        'mora_prom', ROUND(w_mora_prom),
        'tendencia', ROUND(w_tendencia),
        'cumplimiento', ROUND(w_cumplimiento),
        'concentracion', ROUND(w_concentracion),
        'mora_max', ROUND(w_mora_max),
        'volatilidad', ROUND(w_volatilidad),
        'antiguedad', ROUND(w_antiguedad),
        'volumen', ROUND(w_volumen)
      ),
      'techo_mora_dias', v_techo_mora,
      'periodo_evaluacion_meses', v_periodo_meses,
      'umbrales_nivel', v_umbrales,
      'plazos_por_nivel', v_plazos
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_calcular_credit_score_v2(TEXT, JSONB) TO anon, authenticated;
