-- ============================================================================
-- fn_cfo_distrimm_dashboard v2 — Analista CFO con datos mejor conectados
--
-- Novedades vs v1:
--   1. TENDENCIA: compara la carga actual contra la carga más cercana a ~30
--      días atrás (las cargas de cartera son diarias) y entrega deltas.
--   2. VENTAS: conecta distrimm_ventas_vigentes para calcular un DSO REAL
--      (cartera / venta diaria promedio de 90d) — el v1 rotulaba "DSO" a una
--      mora ponderada, que no es DSO.
--   3. POR VENDEDOR vía VENTAS: vendedor_codigo en cartera tiene 0% de
--      cobertura, así que se atribuye cada cliente al vendedor que más le
--      vendió (cliente_nit ↔ vendedor en ventas) → nombres reales.
--   4. TOP DEUDORES enriquecidos con compras de los últimos 90d y días desde
--      la última compra (¿el que debe sigue comprando a crédito?).
--
-- Join key: cartera_items.tercero_nit ↔ distrimm_ventas_vigentes.cliente_nit
--           cartera_items.tercero_nit ↔ distrimm_clientes.no_identif
-- Excluye siempre cliente_nombre = 'MENORES CUANTIAS'.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_cfo_distrimm_dashboard(p_carga_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_carga_id uuid;
  v_fecha_corte date;
  v_prev_carga_id uuid;
  v_prev_fecha date;
  v_result jsonb;
  v_cartera jsonb;
  v_cartera_prev jsonb;
  v_aging jsonb;
  v_por_vendedor jsonb;
  v_por_municipio jsonb;
  v_top_deudores jsonb;
  v_top_antiguos jsonb;
  v_clientes_info jsonb;
  v_ventas jsonb;
  v_tendencia jsonb;
  v_ventas_netas_90d numeric;
  v_ventas_netas_30d numeric;
  v_dso_real numeric;
  v_total_cartera numeric;
  v_clientes_activos bigint;
BEGIN
  -- ── Resolver carga actual (más reciente por fecha_corte) ─────────────────
  IF p_carga_id IS NULL THEN
    SELECT id, fecha_corte INTO v_carga_id, v_fecha_corte
    FROM historial_cargas
    WHERE deleted_at IS NULL
    ORDER BY fecha_corte DESC, created_at DESC LIMIT 1;
  ELSE
    v_carga_id := p_carga_id;
    SELECT fecha_corte INTO v_fecha_corte
    FROM historial_cargas WHERE id = v_carga_id;
  END IF;

  IF v_carga_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No hay cargas disponibles');
  END IF;

  -- ── Carga de comparación: la más cercana a ~1 mes atrás ──────────────────
  -- (las cargas son diarias; comparar contra "ayer" no dice nada)
  SELECT id, fecha_corte INTO v_prev_carga_id, v_prev_fecha
  FROM historial_cargas
  WHERE deleted_at IS NULL AND fecha_corte <= v_fecha_corte - 28
  ORDER BY fecha_corte DESC LIMIT 1;

  -- ── Ventas netas (VE - DV) en ventanas ancladas a la fecha de corte ──────
  SELECT COALESCE(SUM(valor_total), 0)
  INTO v_ventas_netas_90d
  FROM distrimm_ventas_vigentes
  WHERE fecha > v_fecha_corte - 90 AND fecha <= v_fecha_corte;

  SELECT COALESCE(SUM(valor_total), 0)
  INTO v_ventas_netas_30d
  FROM distrimm_ventas_vigentes
  WHERE fecha > v_fecha_corte - 30 AND fecha <= v_fecha_corte;

  -- ── KPIs de cartera actuales (excluye MENORES CUANTIAS) ──────────────────
  SELECT jsonb_build_object(
    'total_cartera', COALESCE(SUM(valor_saldo), 0),
    'total_vencida', COALESCE(SUM(CASE WHEN COALESCE(dias_mora, 0) > 0 THEN valor_saldo ELSE 0 END), 0),
    'total_al_dia', COALESCE(SUM(CASE WHEN COALESCE(dias_mora, 0) <= 0 THEN valor_saldo ELSE 0 END), 0),
    'pct_vencida', CASE WHEN SUM(valor_saldo) > 0
      THEN ROUND((SUM(CASE WHEN COALESCE(dias_mora, 0) > 0 THEN valor_saldo ELSE 0 END) / SUM(valor_saldo) * 100)::numeric, 1)
      ELSE 0 END,
    'mora_promedio', ROUND(COALESCE(AVG(CASE WHEN COALESCE(dias_mora, 0) > 0 THEN dias_mora ELSE NULL END), 0)::numeric, 1),
    'mora_maxima', COALESCE(MAX(dias_mora), 0),
    'facturas_total', COUNT(*),
    'facturas_vencidas', COUNT(CASE WHEN COALESCE(dias_mora, 0) > 0 THEN 1 END),
    'facturas_al_dia', COUNT(CASE WHEN COALESCE(dias_mora, 0) <= 0 THEN 1 END),
    'clientes_activos', COUNT(DISTINCT cliente_nombre),
    'clientes_en_mora', COUNT(DISTINCT CASE WHEN COALESCE(dias_mora, 0) > 0 THEN cliente_nombre END),
    'ticket_promedio', ROUND(COALESCE(AVG(valor_saldo), 0)::numeric, 0),
    'total_incobrables', COALESCE(SUM(CASE WHEN COALESCE(dias_mora, 0) > 360 THEN valor_saldo ELSE 0 END), 0),
    'total_riesgo_alto', COALESCE(SUM(CASE WHEN COALESCE(dias_mora, 0) > 90 AND COALESCE(dias_mora, 0) <= 360 THEN valor_saldo ELSE 0 END), 0),
    -- Mora ponderada por valor (lo que v1 llamaba "dso_estimado", conservado como referencia)
    'mora_ponderada_dias', CASE WHEN SUM(valor_saldo) > 0
      THEN ROUND((SUM(CASE WHEN COALESCE(dias_mora, 0) > 0 THEN valor_saldo * dias_mora ELSE 0 END) / SUM(valor_saldo))::numeric, 1)
      ELSE 0 END,
    'fecha_corte', v_fecha_corte,
    'carga_id', v_carga_id
  ) INTO v_cartera
  FROM cartera_items
  WHERE carga_id = v_carga_id AND deleted_at IS NULL
    AND cliente_nombre != 'MENORES CUANTIAS';

  v_total_cartera := (v_cartera->>'total_cartera')::numeric;
  v_clientes_activos := (v_cartera->>'clientes_activos')::bigint;

  -- ── DSO real = cartera_total / (venta diaria promedio de 90d) ────────────
  v_dso_real := CASE WHEN v_ventas_netas_90d > 0
    THEN ROUND((v_total_cartera / (v_ventas_netas_90d / 90.0))::numeric, 1)
    ELSE NULL END;

  -- Sobrescribe dso_estimado con el DSO REAL (antes era mora ponderada)
  v_cartera := v_cartera || jsonb_build_object('dso_estimado', v_dso_real);

  v_ventas := jsonb_build_object(
    'ventas_netas_30d', ROUND(v_ventas_netas_30d),
    'ventas_netas_90d', ROUND(v_ventas_netas_90d),
    'venta_diaria_promedio', ROUND(v_ventas_netas_90d / 90.0),
    'dso_real_dias', v_dso_real,
    'meses_cartera_sobre_ventas', CASE WHEN v_ventas_netas_30d > 0
      THEN ROUND((v_total_cartera / v_ventas_netas_30d)::numeric, 2) ELSE NULL END,
    'nota', 'DSO real = cartera total / venta diaria promedio (ventana 90d, ventas netas VE-DV de distrimm_ventas_vigentes).'
  );

  -- ── Aging (excluye MENORES CUANTIAS) ─────────────────────────────────────
  SELECT jsonb_build_object(
    'al_dia', COALESCE(SUM(CASE WHEN COALESCE(dias_mora, 0) <= 0 THEN valor_saldo ELSE 0 END), 0),
    'mora_1_30', COALESCE(SUM(CASE WHEN dias_mora BETWEEN 1 AND 30 THEN valor_saldo ELSE 0 END), 0),
    'mora_31_60', COALESCE(SUM(CASE WHEN dias_mora BETWEEN 31 AND 60 THEN valor_saldo ELSE 0 END), 0),
    'mora_61_90', COALESCE(SUM(CASE WHEN dias_mora BETWEEN 61 AND 90 THEN valor_saldo ELSE 0 END), 0),
    'mora_91_180', COALESCE(SUM(CASE WHEN dias_mora BETWEEN 91 AND 180 THEN valor_saldo ELSE 0 END), 0),
    'mora_181_360', COALESCE(SUM(CASE WHEN dias_mora BETWEEN 181 AND 360 THEN valor_saldo ELSE 0 END), 0),
    'mora_360_plus', COALESCE(SUM(CASE WHEN dias_mora > 360 THEN valor_saldo ELSE 0 END), 0)
  ) INTO v_aging
  FROM cartera_items
  WHERE carga_id = v_carga_id AND deleted_at IS NULL
    AND cliente_nombre != 'MENORES CUANTIAS';

  -- ── TENDENCIA: KPIs de la carga de comparación + deltas ──────────────────
  IF v_prev_carga_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'total_cartera', COALESCE(SUM(valor_saldo), 0),
      'total_vencida', COALESCE(SUM(CASE WHEN COALESCE(dias_mora, 0) > 0 THEN valor_saldo ELSE 0 END), 0),
      'pct_vencida', CASE WHEN SUM(valor_saldo) > 0
        THEN ROUND((SUM(CASE WHEN COALESCE(dias_mora, 0) > 0 THEN valor_saldo ELSE 0 END) / SUM(valor_saldo) * 100)::numeric, 1)
        ELSE 0 END,
      'mora_promedio', ROUND(COALESCE(AVG(CASE WHEN COALESCE(dias_mora, 0) > 0 THEN dias_mora ELSE NULL END), 0)::numeric, 1),
      'clientes_en_mora', COUNT(DISTINCT CASE WHEN COALESCE(dias_mora, 0) > 0 THEN cliente_nombre END),
      'total_riesgo_alto', COALESCE(SUM(CASE WHEN COALESCE(dias_mora, 0) > 90 AND COALESCE(dias_mora, 0) <= 360 THEN valor_saldo ELSE 0 END), 0),
      'total_incobrables', COALESCE(SUM(CASE WHEN COALESCE(dias_mora, 0) > 360 THEN valor_saldo ELSE 0 END), 0)
    ) INTO v_cartera_prev
    FROM cartera_items
    WHERE carga_id = v_prev_carga_id AND deleted_at IS NULL
      AND cliente_nombre != 'MENORES CUANTIAS';

    v_tendencia := jsonb_build_object(
      'disponible', true,
      'fecha_actual', v_fecha_corte,
      'fecha_comparacion', v_prev_fecha,
      'dias_entre_cortes', (v_fecha_corte - v_prev_fecha),
      'anterior', v_cartera_prev,
      'delta_total', ROUND((v_total_cartera - (v_cartera_prev->>'total_cartera')::numeric)),
      'delta_vencida', ROUND(((v_cartera->>'total_vencida')::numeric - (v_cartera_prev->>'total_vencida')::numeric)),
      'delta_pct_vencida', ROUND(((v_cartera->>'pct_vencida')::numeric - (v_cartera_prev->>'pct_vencida')::numeric), 1),
      'delta_mora_promedio', ROUND(((v_cartera->>'mora_promedio')::numeric - (v_cartera_prev->>'mora_promedio')::numeric), 1),
      'delta_clientes_mora', ((v_cartera->>'clientes_en_mora')::bigint - (v_cartera_prev->>'clientes_en_mora')::bigint),
      'delta_incobrables', ROUND(((v_cartera->>'total_incobrables')::numeric - (v_cartera_prev->>'total_incobrables')::numeric))
    );
  ELSE
    v_tendencia := jsonb_build_object('disponible', false, 'nota', 'No hay carga anterior (~30d) para comparar tendencia.');
  END IF;

  -- ── POR VENDEDOR vía atribución por ventas ───────────────────────────────
  WITH ventas_cli_vend AS (
    SELECT cliente_nit, vendedor_codigo, MAX(vendedor_nombre) AS vendedor_nombre,
           SUM(valor_total) AS venta_neta
    FROM distrimm_ventas_vigentes
    WHERE vendedor_codigo IS NOT NULL AND cliente_nit IS NOT NULL
    GROUP BY cliente_nit, vendedor_codigo
  ),
  cliente_vendedor AS (
    -- vendedor dominante por cliente = el de mayor venta neta acumulada
    SELECT DISTINCT ON (cliente_nit) cliente_nit, vendedor_codigo, vendedor_nombre
    FROM ventas_cli_vend
    ORDER BY cliente_nit, venta_neta DESC
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.cartera_total DESC), '[]'::jsonb)
  INTO v_por_vendedor
  FROM (
    SELECT
      COALESCE(cv.vendedor_nombre, 'Sin atribución') AS vendedor,
      cv.vendedor_codigo,
      COUNT(DISTINCT ci.cliente_nombre)::int AS clientes,
      COUNT(*)::int AS facturas,
      ROUND(SUM(ci.valor_saldo)::numeric, 0)::bigint AS cartera_total,
      ROUND(SUM(CASE WHEN COALESCE(ci.dias_mora, 0) > 0 THEN ci.valor_saldo ELSE 0 END)::numeric, 0)::bigint AS cartera_vencida,
      CASE WHEN SUM(ci.valor_saldo) > 0
        THEN ROUND((SUM(CASE WHEN COALESCE(ci.dias_mora, 0) > 0 THEN ci.valor_saldo ELSE 0 END) / SUM(ci.valor_saldo) * 100)::numeric, 1)
        ELSE 0 END AS pct_vencida,
      ROUND(COALESCE(AVG(CASE WHEN COALESCE(ci.dias_mora, 0) > 0 THEN ci.dias_mora ELSE NULL END), 0)::numeric, 0)::int AS mora_promedio,
      MAX(ci.dias_mora)::int AS mora_maxima
    FROM cartera_items ci
    LEFT JOIN cliente_vendedor cv ON cv.cliente_nit = ci.tercero_nit
    WHERE ci.carga_id = v_carga_id AND ci.deleted_at IS NULL
      AND ci.cliente_nombre != 'MENORES CUANTIAS'
    GROUP BY cv.vendedor_nombre, cv.vendedor_codigo
  ) t;

  -- ── POR MUNICIPIO (excluye MENORES CUANTIAS) ─────────────────────────────
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_por_municipio
  FROM (
    SELECT
      COALESCE(dc.municipio, 'Sin Municipio') AS municipio,
      COUNT(*)::int AS facturas,
      COUNT(DISTINCT ci.cliente_nombre)::int AS clientes,
      ROUND(SUM(ci.valor_saldo)::numeric, 0)::bigint AS cartera_total,
      ROUND(SUM(CASE WHEN COALESCE(ci.dias_mora, 0) > 0 THEN ci.valor_saldo ELSE 0 END)::numeric, 0)::bigint AS cartera_vencida,
      CASE WHEN SUM(ci.valor_saldo) > 0
        THEN ROUND((SUM(CASE WHEN COALESCE(ci.dias_mora, 0) > 0 THEN ci.valor_saldo ELSE 0 END) / SUM(ci.valor_saldo) * 100)::numeric, 1)
        ELSE 0 END AS pct_vencida
    FROM cartera_items ci
    LEFT JOIN distrimm_clientes dc ON ci.tercero_nit = dc.no_identif
    WHERE ci.carga_id = v_carga_id AND ci.deleted_at IS NULL
      AND ci.cliente_nombre != 'MENORES CUANTIAS'
    GROUP BY COALESCE(dc.municipio, 'Sin Municipio')
    ORDER BY 4 DESC LIMIT 15
  ) t;

  -- ── TOP 15 DEUDORES enriquecidos con compras (ventas 90d) ────────────────
  WITH deud AS (
    SELECT
      cliente_nombre,
      MAX(tercero_nit) AS tercero_nit,
      ROUND(SUM(valor_saldo)::numeric, 0)::bigint AS deuda_total,
      COUNT(*)::int AS facturas,
      MAX(dias_mora)::int AS max_mora,
      ROUND(AVG(CASE WHEN COALESCE(dias_mora, 0) > 0 THEN dias_mora ELSE NULL END)::numeric, 0)::int AS mora_promedio,
      ROUND(SUM(CASE WHEN COALESCE(dias_mora, 0) > 0 THEN valor_saldo ELSE 0 END)::numeric, 0)::bigint AS deuda_vencida
    FROM cartera_items
    WHERE carga_id = v_carga_id AND deleted_at IS NULL
      AND cliente_nombre != 'MENORES CUANTIAS'
    GROUP BY cliente_nombre
    ORDER BY 3 DESC LIMIT 15
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.deuda_total DESC), '[]'::jsonb)
  INTO v_top_deudores
  FROM (
    SELECT
      d.cliente_nombre, d.tercero_nit, d.deuda_total, d.facturas, d.max_mora,
      d.mora_promedio, d.deuda_vencida,
      COALESCE(vt.compras_90d, 0)::bigint AS compras_90d,
      vt.dias_ultima_compra,
      cvd.vendedor_nombre
    FROM deud d
    LEFT JOIN LATERAL (
      SELECT
        ROUND(SUM(v.valor_total))::bigint AS compras_90d,
        (v_fecha_corte - MAX(v.fecha) FILTER (WHERE v.tipo <> 'DV'))::int AS dias_ultima_compra
      FROM distrimm_ventas_vigentes v
      WHERE v.cliente_nit = d.tercero_nit
        AND v.fecha > v_fecha_corte - 90 AND v.fecha <= v_fecha_corte
    ) vt ON true
    LEFT JOIN LATERAL (
      SELECT vendedor_nombre
      FROM distrimm_ventas_vigentes v
      WHERE v.cliente_nit = d.tercero_nit AND v.vendedor_codigo IS NOT NULL
      GROUP BY vendedor_nombre
      ORDER BY SUM(v.valor_total) DESC
      LIMIT 1
    ) cvd ON true
  ) t;

  -- ── TOP 10 facturas más antiguas (excluye MENORES CUANTIAS) ──────────────
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_top_antiguos
  FROM (
    SELECT cliente_nombre, documento_id, valor_saldo::bigint, dias_mora::int,
           fecha_vencimiento::text, fecha_emision::text
    FROM cartera_items
    WHERE carga_id = v_carga_id AND deleted_at IS NULL
      AND COALESCE(dias_mora, 0) > 0
      AND cliente_nombre != 'MENORES CUANTIAS'
    ORDER BY dias_mora DESC LIMIT 10
  ) t;

  -- ── Info maestro de clientes + cobertura ─────────────────────────────────
  SELECT jsonb_build_object(
    'total_registrados', COUNT(*)::int,
    'con_celular', COUNT(CASE WHEN celular IS NOT NULL AND celular != '' THEN 1 END)::int,
    'con_correo', COUNT(CASE WHEN correo_electronico IS NOT NULL AND correo_electronico != '' THEN 1 END)::int,
    'cobertura_celular_pct', CASE WHEN COUNT(*) > 0
      THEN ROUND((COUNT(CASE WHEN celular IS NOT NULL AND celular != '' THEN 1 END)::numeric / COUNT(*)::numeric * 100), 1) ELSE 0 END,
    'cobertura_correo_pct', CASE WHEN COUNT(*) > 0
      THEN ROUND((COUNT(CASE WHEN correo_electronico IS NOT NULL AND correo_electronico != '' THEN 1 END)::numeric / COUNT(*)::numeric * 100), 1) ELSE 0 END,
    'juridicas', COUNT(CASE WHEN tipo_persona = 'Juridica' THEN 1 END)::int,
    'naturales', COUNT(CASE WHEN tipo_persona = 'Natural' THEN 1 END)::int,
    'municipios_distintos', COUNT(DISTINCT municipio)::int,
    'con_municipio', COUNT(CASE WHEN municipio IS NOT NULL AND municipio != '' THEN 1 END)::int,
    'cobertura_municipio_pct', CASE WHEN COUNT(*) > 0
      THEN ROUND((COUNT(CASE WHEN municipio IS NOT NULL AND municipio != '' THEN 1 END)::numeric / COUNT(*)::numeric * 100), 1) ELSE 0 END
  ) INTO v_clientes_info
  FROM distrimm_clientes;

  -- ── Ensamblar resultado ──────────────────────────────────────────────────
  v_result := jsonb_build_object(
    'cartera', v_cartera,
    'aging', v_aging,
    'ventas', v_ventas,
    'tendencia', v_tendencia,
    'por_vendedor', v_por_vendedor,
    'por_municipio', v_por_municipio,
    'top_deudores', v_top_deudores,
    'top_antiguos', v_top_antiguos,
    'clientes_info', v_clientes_info,
    'data_quality', jsonb_build_object(
      'vendedor_coverage_pct', (
        SELECT ROUND((COUNT(CASE WHEN vendedor_codigo IS NOT NULL THEN 1 END)::numeric / NULLIF(COUNT(*)::numeric, 0) * 100), 1)
        FROM cartera_items
        WHERE carga_id = v_carga_id AND deleted_at IS NULL AND cliente_nombre != 'MENORES CUANTIAS'
      ),
      -- Cobertura de la NUEVA atribución por ventas (lo que realmente alimenta por_vendedor)
      'vendedor_atribucion_ventas_pct', (
        SELECT ROUND(100.0 * COUNT(DISTINCT ci.tercero_nit) FILTER (
                 WHERE EXISTS (SELECT 1 FROM distrimm_ventas_vigentes v
                               WHERE v.cliente_nit = ci.tercero_nit AND v.vendedor_codigo IS NOT NULL))
               / NULLIF(COUNT(DISTINCT ci.tercero_nit), 0), 1)
        FROM cartera_items ci
        WHERE ci.carga_id = v_carga_id AND ci.deleted_at IS NULL AND ci.cliente_nombre != 'MENORES CUANTIAS'
      ),
      'municipio_coverage_pct', (
        SELECT ROUND((COUNT(CASE WHEN dc.municipio IS NOT NULL THEN 1 END)::numeric / NULLIF(COUNT(*)::numeric, 0) * 100), 1)
        FROM cartera_items ci
        LEFT JOIN distrimm_clientes dc ON ci.tercero_nit = dc.no_identif
        WHERE ci.carga_id = v_carga_id AND ci.deleted_at IS NULL AND ci.cliente_nombre != 'MENORES CUANTIAS'
      ),
      'clientes_en_cartera_vs_directorio', jsonb_build_object(
        'en_cartera', v_clientes_activos,
        'en_directorio', (SELECT COUNT(*) FROM distrimm_clientes),
        'match_pct', (
          SELECT ROUND((COUNT(DISTINCT ci.tercero_nit) FILTER (WHERE dc.no_identif IS NOT NULL)::numeric
                 / NULLIF(COUNT(DISTINCT ci.tercero_nit)::numeric, 0) * 100), 1)
          FROM cartera_items ci
          LEFT JOIN distrimm_clientes dc ON ci.tercero_nit = dc.no_identif
          WHERE ci.carga_id = v_carga_id AND ci.deleted_at IS NULL AND ci.cliente_nombre != 'MENORES CUANTIAS'
        )
      )
    )
  );

  RETURN v_result;
END;
$function$;
