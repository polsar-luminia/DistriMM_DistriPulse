-- DistriMM Credit Score Function
-- Run this in the Supabase SQL editor:
-- https://supabase.com/dashboard/project/xzhqhmjfhnvqxndxayxs/sql/new

CREATE OR REPLACE FUNCTION fn_calcular_credit_score(p_nit TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_carga_id uuid;
  v_total_deuda numeric := 0;
  v_deuda_vencida numeric := 0;
  v_mora_sum_ponderada numeric := 0;
  v_max_mora int := 0;
  v_num_facturas int := 0;
  v_primera_aparicion date;
  v_antiguedad_dias int := 0;
  v_mora_prom numeric := 0;

  v_score_mora_prom numeric := 0;
  v_score_max_mora numeric := 0;
  v_score_concentracion numeric := 0;
  v_score_num_facturas numeric := 0;
  v_score_antiguedad numeric := 0;

  v_score_final numeric := 0;
  v_nivel text;
  v_plazo_dias int;
  v_facturas_vencidas jsonb;
BEGIN
  -- 1. Get the latest carga
  SELECT id INTO v_carga_id
  FROM historial_cargas
  ORDER BY fecha_corte DESC
  LIMIT 1;

  IF v_carga_id IS NULL THEN
    RETURN jsonb_build_object(
      'score', 0, 'nivel', 'Sin datos',
      'plazo_sugerido_dias', 0,
      'detalles', '{}'::jsonb,
      'facturas_vencidas', '[]'::jsonb
    );
  END IF;

  -- 2. Aggregate invoice data (recalculate dias_mora from fecha_vencimiento)
  SELECT
    COUNT(*)::int,
    COALESCE(SUM(valor_saldo), 0),
    COALESCE(SUM(CASE WHEN GREATEST(CURRENT_DATE - fecha_vencimiento::date, 0) > 0
      THEN valor_saldo ELSE 0 END), 0),
    COALESCE(SUM(GREATEST(CURRENT_DATE - fecha_vencimiento::date, 0)::numeric * valor_saldo), 0),
    COALESCE(MAX(GREATEST(CURRENT_DATE - fecha_vencimiento::date, 0)), 0)::int,
    MIN(fecha_emision::date)
  INTO
    v_num_facturas, v_total_deuda, v_deuda_vencida,
    v_mora_sum_ponderada, v_max_mora, v_primera_aparicion
  FROM cartera_items
  WHERE carga_id = v_carga_id
    AND tercero_nit = p_nit;

  IF v_num_facturas IS NULL OR v_num_facturas = 0 THEN
    RETURN jsonb_build_object(
      'score', 0, 'nivel', 'Sin datos',
      'plazo_sugerido_dias', 0,
      'detalles', '{}'::jsonb,
      'facturas_vencidas', '[]'::jsonb
    );
  END IF;

  -- 3. Antiquity in days from earliest invoice date in current load
  v_antiguedad_dias := COALESCE(CURRENT_DATE - v_primera_aparicion, 0);

  -- 4. Weighted average mora (days, weighted by invoice amount)
  v_mora_prom := CASE WHEN v_total_deuda > 0
    THEN v_mora_sum_ponderada / v_total_deuda
    ELSE 0 END;

  -- 5. Sub-scores (each 0–100, higher = better credit)
  -- V1: Mora promedio ponderada (35%): 0d=100, 90d=50, 180d+=0
  v_score_mora_prom := GREATEST(0, LEAST(100, 100 - (v_mora_prom * 100.0 / 180)));

  -- V2: Max mora actual (20%): same scale
  v_score_max_mora := GREATEST(0, LEAST(100, 100 - (v_max_mora * 100.0 / 180)));

  -- V3: Concentración deuda vencida (20%): 0%=100, 100%=0
  v_score_concentracion := CASE WHEN v_total_deuda > 0
    THEN GREATEST(0, 100 - (v_deuda_vencida / v_total_deuda * 100))
    ELSE 100 END;

  -- V4: Número de facturas (10%): more history = better
  v_score_num_facturas := CASE
    WHEN v_num_facturas >= 16 THEN 100
    WHEN v_num_facturas >= 9  THEN 80
    WHEN v_num_facturas >= 4  THEN 60
    ELSE 30
  END;

  -- V5: Antigüedad (15%): longer relationship = more reliable
  v_score_antiguedad := CASE
    WHEN v_antiguedad_dias >= 365 THEN 100
    WHEN v_antiguedad_dias >= 181 THEN 80
    WHEN v_antiguedad_dias >= 91  THEN 60
    WHEN v_antiguedad_dias >= 31  THEN 40
    ELSE 20
  END;

  -- 6. Weighted final score
  v_score_final := ROUND(
    v_score_mora_prom    * 0.35 +
    v_score_max_mora     * 0.20 +
    v_score_concentracion * 0.20 +
    v_score_num_facturas  * 0.10 +
    v_score_antiguedad    * 0.15
  );

  -- 7. Level and suggested credit term
  IF v_score_final >= 80 THEN
    v_nivel := 'Excelente'; v_plazo_dias := 90;
  ELSIF v_score_final >= 60 THEN
    v_nivel := 'Bueno'; v_plazo_dias := 60;
  ELSIF v_score_final >= 40 THEN
    v_nivel := 'Regular'; v_plazo_dias := 30;
  ELSIF v_score_final >= 20 THEN
    v_nivel := 'Riesgo'; v_plazo_dias := 15;
  ELSE
    v_nivel := 'Alto riesgo'; v_plazo_dias := 0;
  END IF;

  -- 8. Collect overdue invoices for display
  SELECT jsonb_agg(
    jsonb_build_object(
      'documento_id', documento_id,
      'fecha_vencimiento', to_char(fecha_vencimiento::date, 'YYYY-MM-DD'),
      'dias_mora', GREATEST(CURRENT_DATE - fecha_vencimiento::date, 0),
      'valor_saldo', valor_saldo
    ) ORDER BY valor_saldo DESC
  ) INTO v_facturas_vencidas
  FROM cartera_items
  WHERE carga_id = v_carga_id
    AND tercero_nit = p_nit
    AND GREATEST(CURRENT_DATE - fecha_vencimiento::date, 0) > 0;

  RETURN jsonb_build_object(
    'score', v_score_final,
    'nivel', v_nivel,
    'plazo_sugerido_dias', v_plazo_dias,
    'detalles', jsonb_build_object(
      'mora_promedio_ponderada', ROUND(v_mora_prom),
      'max_mora', v_max_mora,
      'concentracion_vencida_pct',
        CASE WHEN v_total_deuda > 0
          THEN ROUND(v_deuda_vencida / v_total_deuda * 100)
          ELSE 0 END,
      'num_facturas', v_num_facturas,
      'antiguedad_dias', v_antiguedad_dias,
      'total_deuda', v_total_deuda,
      'deuda_vencida', v_deuda_vencida,
      'scores_parciales', jsonb_build_object(
        'mora_prom',     ROUND(v_score_mora_prom),
        'max_mora',      ROUND(v_score_max_mora),
        'concentracion', ROUND(v_score_concentracion),
        'num_facturas',  ROUND(v_score_num_facturas),
        'antiguedad',    ROUND(v_score_antiguedad)
      )
    ),
    'facturas_vencidas', COALESCE(v_facturas_vencidas, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_calcular_credit_score(TEXT) TO anon, authenticated;
