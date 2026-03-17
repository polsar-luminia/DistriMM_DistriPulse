-- DistriMM: Actualizar fn_calcular_comisiones — base comisionable = costo
-- Run in Supabase SQL editor

CREATE OR REPLACE FUNCTION fn_calcular_comisiones(p_carga_id UUID)
RETURNS TABLE (
  vendedor_codigo TEXT,
  vendedor_nombre TEXT,
  total_ventas NUMERIC,
  total_costo NUMERIC,
  ventas_excluidas NUMERIC,
  ventas_comisionables NUMERIC,
  costo_comisionable NUMERIC,
  margen_comisionable NUMERIC,
  margen_pct NUMERIC,
  items_total INTEGER,
  items_excluidos INTEGER,
  items_comisionables INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH exclusiones_activas AS (
    SELECT e.tipo, e.valor
    FROM distrimm_comisiones_exclusiones e
    WHERE e.activa = TRUE
  ),
  ventas_con_exclusion AS (
    SELECT
      v.*,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM exclusiones_activas ea
          WHERE ea.tipo = 'producto' AND ea.valor = v.producto_codigo
        ) THEN TRUE
        WHEN EXISTS (
          SELECT 1 FROM exclusiones_activas ea
          JOIN distrimm_productos_catalogo p ON p.marca = ea.valor AND ea.tipo = 'marca'
          WHERE p.codigo = v.producto_codigo
        ) THEN TRUE
        ELSE FALSE
      END AS excluido
    FROM distrimm_comisiones_ventas v
    WHERE v.carga_id = p_carga_id
  )
  SELECT
    ve.vendedor_codigo,
    ve.vendedor_nombre,
    SUM(ve.valor_total)::NUMERIC                                                        AS total_ventas,
    SUM(ve.costo)::NUMERIC                                                              AS total_costo,
    SUM(CASE WHEN ve.excluido     THEN ve.valor_total ELSE 0 END)::NUMERIC              AS ventas_excluidas,
    -- CHANGED: base comisionable = costo (DV tienen costo negativo → restan automáticamente)
    SUM(CASE WHEN NOT ve.excluido THEN ve.costo       ELSE 0 END)::NUMERIC              AS ventas_comisionables,
    SUM(CASE WHEN NOT ve.excluido THEN ve.costo       ELSE 0 END)::NUMERIC              AS costo_comisionable,
    SUM(CASE WHEN NOT ve.excluido THEN ve.valor_total - ve.costo ELSE 0 END)::NUMERIC   AS margen_comisionable,
    CASE
      WHEN SUM(CASE WHEN NOT ve.excluido THEN ve.valor_total ELSE 0 END) > 0
      THEN (
        SUM(CASE WHEN NOT ve.excluido THEN ve.valor_total - ve.costo ELSE 0 END) /
        SUM(CASE WHEN NOT ve.excluido THEN ve.valor_total ELSE 0 END) * 100
      )::NUMERIC
      ELSE 0
    END                                                                                 AS margen_pct,
    COUNT(*)::INTEGER                                                                   AS items_total,
    SUM(CASE WHEN ve.excluido     THEN 1 ELSE 0 END)::INTEGER                           AS items_excluidos,
    SUM(CASE WHEN NOT ve.excluido THEN 1 ELSE 0 END)::INTEGER                           AS items_comisionables
  FROM ventas_con_exclusion ve
  GROUP BY ve.vendedor_codigo, ve.vendedor_nombre
  ORDER BY ventas_comisionables DESC;
END;
$$;
