-- fn_cfo_historico_cartera — serie histórica de cartera para la sección
-- "Evolución Histórica" del dashboard.
--
-- Esta función NO estaba versionada: vivía solo en la base. Se exporta aquí
-- para que sea reproducible.
--
-- CORTE (26/07/2026): filtra `hc.origen = 'erp'`. Sin ese filtro devolvía 90
-- puntos mezclando las 83 cargas manuales con las 7 mensuales sincronizadas,
-- con meses duplicados (dos entradas para enero) y una gráfica ilegible de
-- barras de 1 px. Con el filtro son 7 puntos, uno por mes.

CREATE OR REPLACE FUNCTION public.fn_cfo_historico_cartera()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.fecha_corte ASC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      hc.id as carga_id,
      hc.fecha_corte,
      hc.total_registros,
      COUNT(ci.id)::int as facturas_total,
      COUNT(DISTINCT ci.cliente_nombre)::int as clientes_activos,
      ROUND(SUM(ci.valor_saldo)::numeric, 0)::bigint as cartera_total,
      ROUND(SUM(CASE WHEN COALESCE(ci.dias_mora, 0) > 0 THEN ci.valor_saldo ELSE 0 END)::numeric, 0)::bigint as cartera_vencida,
      ROUND(SUM(CASE WHEN COALESCE(ci.dias_mora, 0) <= 0 THEN ci.valor_saldo ELSE 0 END)::numeric, 0)::bigint as cartera_al_dia,
      CASE WHEN SUM(ci.valor_saldo) > 0 
        THEN ROUND((SUM(CASE WHEN COALESCE(ci.dias_mora, 0) > 0 THEN ci.valor_saldo ELSE 0 END) / SUM(ci.valor_saldo) * 100)::numeric, 1)
        ELSE 0 END as pct_vencida,
      ROUND(COALESCE(AVG(CASE WHEN COALESCE(ci.dias_mora, 0) > 0 THEN ci.dias_mora ELSE NULL END), 0)::numeric, 1) as mora_promedio,
      COALESCE(MAX(ci.dias_mora), 0)::int as mora_maxima,
      COUNT(CASE WHEN COALESCE(ci.dias_mora, 0) > 0 THEN 1 END)::int as facturas_vencidas,
      COUNT(DISTINCT CASE WHEN COALESCE(ci.dias_mora, 0) > 0 THEN ci.cliente_nombre END)::int as clientes_en_mora,
      ROUND(COALESCE(AVG(ci.valor_saldo), 0)::numeric, 0)::bigint as ticket_promedio,
      ROUND(COALESCE(SUM(CASE WHEN COALESCE(ci.dias_mora, 0) > 90 THEN ci.valor_saldo ELSE 0 END), 0)::numeric, 0)::bigint as riesgo_alto,
      ROUND(COALESCE(SUM(CASE WHEN COALESCE(ci.dias_mora, 0) > 360 THEN ci.valor_saldo ELSE 0 END), 0)::numeric, 0)::bigint as incobrables,
      -- DSO estimado
      CASE WHEN SUM(ci.valor_saldo) > 0 
        THEN ROUND((SUM(CASE WHEN COALESCE(ci.dias_mora, 0) > 0 THEN ci.valor_saldo * ci.dias_mora ELSE 0 END) / SUM(ci.valor_saldo))::numeric, 1)
        ELSE 0 END as dso_estimado,
      -- Aging buckets
      ROUND(COALESCE(SUM(CASE WHEN COALESCE(ci.dias_mora, 0) <= 0 THEN ci.valor_saldo ELSE 0 END), 0)::numeric, 0)::bigint as aging_al_dia,
      ROUND(COALESCE(SUM(CASE WHEN ci.dias_mora BETWEEN 1 AND 30 THEN ci.valor_saldo ELSE 0 END), 0)::numeric, 0)::bigint as aging_1_30,
      ROUND(COALESCE(SUM(CASE WHEN ci.dias_mora BETWEEN 31 AND 60 THEN ci.valor_saldo ELSE 0 END), 0)::numeric, 0)::bigint as aging_31_60,
      ROUND(COALESCE(SUM(CASE WHEN ci.dias_mora BETWEEN 61 AND 90 THEN ci.valor_saldo ELSE 0 END), 0)::numeric, 0)::bigint as aging_61_90,
      ROUND(COALESCE(SUM(CASE WHEN ci.dias_mora > 90 THEN ci.valor_saldo ELSE 0 END), 0)::numeric, 0)::bigint as aging_90_plus
    FROM historial_cargas hc
    LEFT JOIN cartera_items ci ON ci.carga_id = hc.id AND ci.deleted_at IS NULL AND ci.cliente_nombre != 'MENORES CUANTIAS'
    -- CORTE (26/07/2026): solo cargas sincronizadas del ERP. Sin este filtro
    -- la evolucion mezclaba las 83 cargas manuales con las 7 mensuales del
    -- ERP, duplicando meses y saturando la grafica con ~90 puntos.
    WHERE hc.deleted_at IS NULL AND hc.origen = 'erp'
    GROUP BY hc.id, hc.fecha_corte, hc.total_registros
    ORDER BY hc.fecha_corte ASC
  ) t;

  RETURN v_result;
END;
$function$

;
