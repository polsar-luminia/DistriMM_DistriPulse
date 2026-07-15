-- ============================================================================
-- DistriMM MCP Server — RPCs de agregación
-- Applied via Supabase MCP on 2026-07-15
--
-- Funciones consumidas por el servidor MCP del VPS (puerto 3102) para que
-- gerencia consulte ventas, cartera, inventario, comisiones y sugerido
-- desde ChatGPT/Claude vía conector MCP.
--
-- Seguridad: SECURITY DEFINER + EXECUTE revocado a anon/authenticated.
-- Solo el service_role (la llave vive únicamente en el .env del VPS) puede
-- ejecutarlas vía PostgREST.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helpers de contexto
-- ----------------------------------------------------------------------------

-- Fecha "hoy" en Colombia (los datos del negocio son America/Bogota)
CREATE OR REPLACE FUNCTION fn_mcp_hoy() RETURNS DATE
LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'America/Bogota')::DATE;
$$;

-- ----------------------------------------------------------------------------
-- 1. Resumen ejecutivo
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_mcp_resumen()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoy DATE := fn_mcp_hoy();
  v_mes_ini DATE := date_trunc('month', v_hoy)::DATE;
  v_mes_ant_ini DATE := (date_trunc('month', v_hoy) - INTERVAL '1 month')::DATE;
  v_ventas JSONB;
  v_cartera JSONB;
  v_inventario JSONB;
  v_comisiones JSONB;
BEGIN
  SELECT jsonb_build_object(
    'mes_actual', jsonb_build_object(
      'periodo', to_char(v_mes_ini, 'YYYY-MM'),
      'total', COALESCE(SUM(valor_total) FILTER (WHERE fecha >= v_mes_ini), 0),
      'margen', COALESCE(SUM(margen_valor) FILTER (WHERE fecha >= v_mes_ini), 0),
      'facturas', COUNT(DISTINCT factura) FILTER (WHERE fecha >= v_mes_ini AND tipo <> 'DV'),
      'clientes', COUNT(DISTINCT cliente_nit) FILTER (WHERE fecha >= v_mes_ini AND tipo <> 'DV'),
      'ultima_venta', MAX(fecha)
    ),
    'mes_anterior_completo', jsonb_build_object(
      'periodo', to_char(v_mes_ant_ini, 'YYYY-MM'),
      'total', COALESCE(SUM(valor_total) FILTER (WHERE fecha >= v_mes_ant_ini AND fecha < v_mes_ini), 0)
    ),
    'mes_anterior_mismo_corte', jsonb_build_object(
      'nota', 'mismo rango de dias del mes anterior, para comparar peras con peras',
      'total', COALESCE(SUM(valor_total) FILTER (
        WHERE fecha >= v_mes_ant_ini
          AND fecha < v_mes_ant_ini + (v_hoy - v_mes_ini + 1)), 0)
    )
  ) INTO v_ventas
  FROM distrimm_comisiones_ventas
  WHERE fecha >= v_mes_ant_ini;

  SELECT jsonb_build_object(
    'fecha_corte', c.fecha_corte,
    'total_cartera', COALESCE(SUM(i.valor_saldo), 0),
    'vencido', COALESCE(SUM(i.valor_saldo) FILTER (WHERE i.dias_mora > 0), 0),
    'pct_vencido', ROUND(COALESCE(SUM(i.valor_saldo) FILTER (WHERE i.dias_mora > 0), 0)
                   / NULLIF(SUM(i.valor_saldo), 0) * 100, 1),
    'vencido_mas_90_dias', COALESCE(SUM(i.valor_saldo) FILTER (WHERE i.dias_mora > 90), 0),
    'clientes_con_saldo', COUNT(DISTINCT i.tercero_nit),
    'documentos', COUNT(*)
  ) INTO v_cartera
  FROM historial_cargas c
  JOIN cartera_items i ON i.carga_id = c.id AND i.deleted_at IS NULL
  WHERE c.id = (SELECT id FROM historial_cargas WHERE deleted_at IS NULL
                ORDER BY fecha_corte DESC, created_at DESC LIMIT 1)
  GROUP BY c.fecha_corte;

  SELECT jsonb_build_object(
    'fecha_saldos', c.fecha_saldos,
    'valor_bodegas_confiables', COALESCE(SUM(i.valor) FILTER (WHERE i.bodega IN (1,5,6)), 0),
    'valor_todas_bodegas', COALESCE(SUM(i.valor), 0),
    'productos_con_stock', COUNT(DISTINCT i.producto_codigo) FILTER (WHERE i.bodega IN (1,5,6) AND i.cantidad > 0),
    'nota', 'bodegas confiables: 1, 5 y 6'
  ) INTO v_inventario
  FROM distrimm_inventario_cargas c
  JOIN distrimm_inventario_items i ON i.carga_id = c.id
  WHERE c.id = (SELECT id FROM distrimm_inventario_cargas ORDER BY fecha_saldos DESC LIMIT 1)
  GROUP BY c.fecha_saldos;

  SELECT jsonb_build_object(
    'periodo', periodo_year || '-' || lpad(periodo_month::TEXT, 2, '0'),
    'resumen', resumen,
    'actualizado', updated_at::DATE
  ) INTO v_comisiones
  FROM distrimm_comisiones_snapshots
  ORDER BY periodo_year DESC, periodo_month DESC LIMIT 1;

  RETURN jsonb_build_object(
    'fecha_consulta', v_hoy,
    'moneda', 'COP',
    'ventas', v_ventas,
    'cartera', COALESCE(v_cartera, jsonb_build_object('nota', 'sin cargas de cartera')),
    'inventario', COALESCE(v_inventario, jsonb_build_object('nota', 'sin cargas de inventario')),
    'comisiones_ultimo_periodo', COALESCE(v_comisiones, jsonb_build_object('nota', 'sin liquidaciones'))
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Ventas agregadas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_mcp_ventas(
  p_desde DATE DEFAULT NULL,
  p_hasta DATE DEFAULT NULL,
  p_agrupar TEXT DEFAULT 'mes',
  p_buscar TEXT DEFAULT NULL,
  p_limite INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_desde DATE := COALESCE(p_desde, date_trunc('month', fn_mcp_hoy())::DATE);
  v_hasta DATE := COALESCE(p_hasta, fn_mcp_hoy());
  v_limite INT := LEAST(GREATEST(COALESCE(p_limite, 20), 1), 100);
  v_grupos JSONB;
  v_totales JSONB;
BEGIN
  IF p_agrupar NOT IN ('mes','dia','vendedor','marca','categoria','producto','cliente','municipio') THEN
    RETURN jsonb_build_object('error', 'agrupar_por invalido. Opciones: mes, dia, vendedor, marca, categoria, producto, cliente, municipio');
  END IF;

  WITH base AS (
    SELECT
      v.*,
      p.marca AS cat_marca,
      p.categoria_nombre AS cat_categoria,
      CASE p_agrupar
        WHEN 'mes' THEN to_char(v.fecha, 'YYYY-MM')
        WHEN 'dia' THEN v.fecha::TEXT
        WHEN 'vendedor' THEN COALESCE(v.vendedor_nombre, v.vendedor_codigo)
        WHEN 'marca' THEN COALESCE(p.marca, 'SIN CATALOGO')
        WHEN 'categoria' THEN COALESCE(p.categoria_nombre, 'SIN CATALOGO')
        WHEN 'producto' THEN v.producto_codigo || ' — ' || COALESCE(v.producto_descripcion, '')
        WHEN 'cliente' THEN COALESCE(v.cliente_nombre, v.cliente_nit)
        WHEN 'municipio' THEN COALESCE(v.municipio, 'SIN MUNICIPIO')
      END AS grupo
    FROM distrimm_comisiones_ventas v
    LEFT JOIN distrimm_productos_catalogo p ON p.codigo = v.producto_codigo
    WHERE v.fecha BETWEEN v_desde AND v_hasta
      AND (p_buscar IS NULL OR
           v.producto_descripcion ILIKE '%' || p_buscar || '%' OR
           v.cliente_nombre ILIKE '%' || p_buscar || '%' OR
           p.marca ILIKE '%' || p_buscar || '%' OR
           v.producto_codigo = p_buscar)
  ),
  agg AS (
    SELECT
      grupo,
      SUM(valor_total) AS venta_neta,
      SUM(margen_valor) AS margen,
      SUM(CASE WHEN tipo = 'DV' THEN -cantidad ELSE cantidad END) AS unidades,
      SUM(valor_total) FILTER (WHERE tipo = 'DV') AS devoluciones,
      COUNT(DISTINCT factura) FILTER (WHERE tipo <> 'DV') AS facturas,
      COUNT(DISTINCT cliente_nit) AS clientes
    FROM base
    GROUP BY grupo
  ),
  top AS (
    SELECT * FROM agg ORDER BY
      CASE WHEN p_agrupar IN ('mes','dia') THEN grupo END ASC,
      CASE WHEN p_agrupar NOT IN ('mes','dia') THEN venta_neta END DESC
    LIMIT v_limite
  )
  SELECT
    jsonb_agg(jsonb_build_object(
      'grupo', grupo,
      'venta_neta', ROUND(venta_neta),
      'margen', ROUND(margen),
      'margen_pct', ROUND(margen / NULLIF(venta_neta, 0) * 100, 1),
      'unidades', unidades,
      'devoluciones', ROUND(COALESCE(devoluciones, 0)),
      'facturas', facturas,
      'clientes', clientes
    ) ORDER BY CASE WHEN p_agrupar IN ('mes','dia') THEN grupo END ASC,
               CASE WHEN p_agrupar NOT IN ('mes','dia') THEN venta_neta END DESC),
    jsonb_build_object(
      'venta_neta', ROUND(SUM(venta_neta)),
      'margen', ROUND(SUM(margen)),
      'grupos_totales', COUNT(*)
    )
  INTO v_grupos, v_totales
  FROM top;

  RETURN jsonb_build_object(
    'periodo', jsonb_build_object('desde', v_desde, 'hasta', v_hasta),
    'agrupado_por', p_agrupar,
    'filtro', p_buscar,
    'moneda', 'COP',
    'nota', 'venta_neta descuenta devoluciones (DV). Limitado a ' || v_limite || ' grupos.',
    'totales_de_grupos_mostrados', v_totales,
    'grupos', COALESCE(v_grupos, '[]'::JSONB)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Cartera
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_mcp_cartera(
  p_agrupar TEXT DEFAULT 'aging',
  p_dias_mora_min INT DEFAULT NULL,
  p_limite INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_carga_id UUID;
  v_fecha_corte DATE;
  v_limite INT := LEAST(GREATEST(COALESCE(p_limite, 20), 1), 100);
  v_result JSONB;
  v_totales JSONB;
BEGIN
  SELECT id, fecha_corte INTO v_carga_id, v_fecha_corte
  FROM historial_cargas WHERE deleted_at IS NULL
  ORDER BY fecha_corte DESC, created_at DESC LIMIT 1;

  IF v_carga_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No hay cargas de cartera');
  END IF;

  IF p_agrupar NOT IN ('aging','vendedor','cliente','zona','ciudad') THEN
    RETURN jsonb_build_object('error', 'agrupar_por invalido. Opciones: aging, vendedor, cliente, zona, ciudad');
  END IF;

  SELECT jsonb_build_object(
    'total_cartera', ROUND(COALESCE(SUM(valor_saldo), 0)),
    'documentos', COUNT(*),
    'clientes', COUNT(DISTINCT tercero_nit)
  ) INTO v_totales
  FROM cartera_items
  WHERE carga_id = v_carga_id AND deleted_at IS NULL
    AND (p_dias_mora_min IS NULL OR dias_mora >= p_dias_mora_min);

  IF p_agrupar = 'aging' THEN
    SELECT jsonb_agg(jsonb_build_object(
      'rango', rango, 'saldo', ROUND(saldo), 'documentos', docs, 'clientes', clientes,
      'pct_del_total', ROUND(saldo / NULLIF(total, 0) * 100, 1)
    ) ORDER BY orden)
    INTO v_result
    FROM (
      SELECT
        CASE
          WHEN dias_mora <= 0 THEN 'Al dia (sin vencer)'
          WHEN dias_mora <= 30 THEN 'Vencido 1-30 dias'
          WHEN dias_mora <= 60 THEN 'Vencido 31-60 dias'
          WHEN dias_mora <= 90 THEN 'Vencido 61-90 dias'
          ELSE 'Vencido mas de 90 dias'
        END AS rango,
        CASE
          WHEN dias_mora <= 0 THEN 0 WHEN dias_mora <= 30 THEN 1
          WHEN dias_mora <= 60 THEN 2 WHEN dias_mora <= 90 THEN 3 ELSE 4
        END AS orden,
        SUM(valor_saldo) AS saldo,
        COUNT(*) AS docs,
        COUNT(DISTINCT tercero_nit) AS clientes,
        SUM(SUM(valor_saldo)) OVER () AS total
      FROM cartera_items
      WHERE carga_id = v_carga_id AND deleted_at IS NULL
        AND (p_dias_mora_min IS NULL OR dias_mora >= p_dias_mora_min)
      GROUP BY 1, 2
    ) t;
  ELSE
    SELECT jsonb_agg(jsonb_build_object(
      'grupo', grupo, 'saldo', ROUND(saldo), 'vencido', ROUND(vencido),
      'mora_maxima_dias', mora_max, 'documentos', docs, 'clientes', clientes
    ) ORDER BY saldo DESC)
    INTO v_result
    FROM (
      SELECT
        CASE p_agrupar
          WHEN 'vendedor' THEN COALESCE(NULLIF(asesor, ''), vendedor_codigo, 'SIN VENDEDOR')
          WHEN 'cliente' THEN COALESCE(cliente_nombre, tercero_nit)
          WHEN 'zona' THEN COALESCE(NULLIF(zona, ''), 'SIN ZONA')
          WHEN 'ciudad' THEN COALESCE(NULLIF(ciudad, ''), 'SIN CIUDAD')
        END AS grupo,
        SUM(valor_saldo) AS saldo,
        SUM(valor_saldo) FILTER (WHERE dias_mora > 0) AS vencido,
        MAX(dias_mora) AS mora_max,
        COUNT(*) AS docs,
        COUNT(DISTINCT tercero_nit) AS clientes
      FROM cartera_items
      WHERE carga_id = v_carga_id AND deleted_at IS NULL
        AND (p_dias_mora_min IS NULL OR dias_mora >= p_dias_mora_min)
      GROUP BY 1
      ORDER BY SUM(valor_saldo) DESC
      LIMIT v_limite
    ) t;
  END IF;

  RETURN jsonb_build_object(
    'fecha_corte', v_fecha_corte,
    'agrupado_por', p_agrupar,
    'filtro_dias_mora_min', p_dias_mora_min,
    'moneda', 'COP',
    'totales', v_totales,
    'grupos', COALESCE(v_result, '[]'::JSONB)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Inventario
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_mcp_inventario(
  p_agrupar TEXT DEFAULT 'bodega',
  p_buscar TEXT DEFAULT NULL,
  p_solo_confiables BOOLEAN DEFAULT TRUE,
  p_limite INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_carga_id UUID;
  v_fecha DATE;
  v_limite INT := LEAST(GREATEST(COALESCE(p_limite, 20), 1), 100);
  v_result JSONB;
  v_totales JSONB;
BEGIN
  SELECT id, fecha_saldos INTO v_carga_id, v_fecha
  FROM distrimm_inventario_cargas ORDER BY fecha_saldos DESC LIMIT 1;

  IF v_carga_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No hay cargas de inventario. Gerencia debe subir el Excel Saldos de Productos en el modulo Sugerido de Pedidos.');
  END IF;

  IF p_agrupar NOT IN ('bodega','marca','categoria','producto') THEN
    RETURN jsonb_build_object('error', 'agrupar_por invalido. Opciones: bodega, marca, categoria, producto');
  END IF;

  SELECT jsonb_build_object(
    'valor_total', ROUND(COALESCE(SUM(valor), 0)),
    'unidades', COALESCE(SUM(cantidad), 0),
    'productos', COUNT(DISTINCT producto_codigo)
  ) INTO v_totales
  FROM distrimm_inventario_items
  WHERE carga_id = v_carga_id
    AND (NOT p_solo_confiables OR bodega IN (1,5,6))
    AND (p_buscar IS NULL OR producto_nombre ILIKE '%' || p_buscar || '%'
         OR marca ILIKE '%' || p_buscar || '%' OR producto_codigo = p_buscar);

  SELECT jsonb_agg(jsonb_build_object(
    'grupo', grupo, 'valor', ROUND(valor), 'unidades', unidades, 'productos', productos
  ) ORDER BY valor DESC)
  INTO v_result
  FROM (
    SELECT
      CASE p_agrupar
        WHEN 'bodega' THEN 'Bodega ' || bodega
        WHEN 'marca' THEN COALESCE(NULLIF(marca, ''), 'SIN MARCA')
        WHEN 'categoria' THEN COALESCE(NULLIF(categoria_nombre, ''), 'SIN CATEGORIA')
        WHEN 'producto' THEN producto_codigo || ' — ' || COALESCE(producto_nombre, '')
      END AS grupo,
      SUM(valor) AS valor,
      SUM(cantidad) AS unidades,
      COUNT(DISTINCT producto_codigo) AS productos
    FROM distrimm_inventario_items
    WHERE carga_id = v_carga_id
      AND (NOT p_solo_confiables OR bodega IN (1,5,6))
      AND (p_buscar IS NULL OR producto_nombre ILIKE '%' || p_buscar || '%'
           OR marca ILIKE '%' || p_buscar || '%' OR producto_codigo = p_buscar)
    GROUP BY 1
    ORDER BY SUM(valor) DESC
    LIMIT v_limite
  ) t;

  RETURN jsonb_build_object(
    'fecha_saldos', v_fecha,
    'agrupado_por', p_agrupar,
    'solo_bodegas_confiables', p_solo_confiables,
    'filtro', p_buscar,
    'moneda', 'COP',
    'totales', v_totales,
    'grupos', COALESCE(v_result, '[]'::JSONB)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Sugerido de pedidos y clasificación de stock
--    Permite service_role en fn_sugerido_pedidos y expone un wrapper con
--    resumen + top de la clasificación pedida.
-- ----------------------------------------------------------------------------

-- Ajuste del guard: el MCP (service_role) también puede calcular el sugerido
-- (el guard original solo contemplaba usuarios del frontend con JWT).
-- Se reemplaza únicamente la condición del IF; el resto del cuerpo es idéntico
-- al de sql/sugerido_pedidos_schema.sql.
CREATE OR REPLACE FUNCTION fn_sugerido_pedidos(
  p_carga_id UUID,
  p_dias_cobertura INTEGER DEFAULT 30,
  p_pct_crecimiento NUMERIC DEFAULT 0,
  p_pct_reserva NUMERIC DEFAULT 0,
  p_dias_analisis INTEGER DEFAULT 90,
  p_bodegas SMALLINT[] DEFAULT '{1,5,6}'
)
RETURNS TABLE (
  producto_codigo TEXT,
  producto_nombre TEXT,
  marca TEXT,
  categoria_nombre TEXT,
  stock NUMERIC,
  transito NUMERIC,
  stock_valor NUMERIC,
  cantidad_vendida NUMERIC,
  venta_diaria NUMERIC,
  ultima_venta DATE,
  dias_sin_venta INTEGER,
  cobertura_dias NUMERIC,
  clasificacion TEXT,
  sugerido_cantidad NUMERIC,
  costo_unitario NUMERIC,
  sugerido_costo NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fecha_saldos DATE;
  v_factor NUMERIC;
BEGIN
  IF auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT c.fecha_saldos INTO v_fecha_saldos
  FROM distrimm_inventario_cargas c
  WHERE c.id = p_carga_id;

  IF v_fecha_saldos IS NULL THEN
    RAISE EXCEPTION 'Carga de inventario % no encontrada', p_carga_id;
  END IF;

  v_factor := (1 + COALESCE(p_pct_crecimiento, 0) / 100.0)
            * (1 + COALESCE(p_pct_reserva, 0) / 100.0);

  RETURN QUERY
  WITH inventario AS (
    SELECT
      i.producto_codigo AS codigo,
      MAX(i.producto_nombre) AS nombre,
      MAX(i.marca) AS marca,
      MAX(i.categoria_nombre) AS categoria,
      SUM(i.cantidad) AS stock,
      SUM(i.transito) AS transito,
      SUM(i.valor) AS stock_valor,
      MAX(i.ult_val_compra) AS ult_val_compra
    FROM distrimm_inventario_items i
    WHERE i.carga_id = p_carga_id
      AND i.bodega = ANY(p_bodegas)
    GROUP BY i.producto_codigo
  ),
  demanda AS (
    SELECT
      v.producto_codigo AS codigo,
      MAX(v.producto_descripcion) AS descripcion,
      SUM(CASE WHEN v.tipo = 'DV' THEN -v.cantidad ELSE v.cantidad END) AS cantidad_vendida,
      MAX(v.fecha) FILTER (WHERE v.tipo <> 'DV') AS ultima_venta
    FROM distrimm_comisiones_ventas v
    WHERE v.fecha > v_fecha_saldos - p_dias_analisis
      AND v.fecha <= v_fecha_saldos
    GROUP BY v.producto_codigo
  ),
  combinado AS (
    SELECT
      COALESCE(inv.codigo, d.codigo) AS codigo,
      COALESCE(inv.nombre, d.descripcion) AS nombre,
      inv.marca,
      inv.categoria,
      COALESCE(inv.stock, 0) AS stock,
      COALESCE(inv.transito, 0) AS transito,
      COALESCE(inv.stock_valor, 0) AS stock_valor,
      GREATEST(COALESCE(d.cantidad_vendida, 0), 0) AS cantidad_vendida,
      d.ultima_venta,
      COALESCE(inv.ult_val_compra, 0) AS ult_val_compra
    FROM inventario inv
    FULL JOIN demanda d ON d.codigo = inv.codigo
  ),
  calculado AS (
    SELECT
      c.*,
      c.cantidad_vendida / p_dias_analisis AS venta_diaria,
      CASE
        WHEN c.cantidad_vendida > 0
        THEN (c.stock + c.transito) / (c.cantidad_vendida / p_dias_analisis)
      END AS cobertura,
      GREATEST(
        CEIL(
          (c.cantidad_vendida / p_dias_analisis) * p_dias_cobertura * v_factor
          - (c.stock + c.transito)
        ),
        0
      ) AS sugerido
    FROM combinado c
  )
  SELECT
    ca.codigo,
    ca.nombre,
    ca.marca,
    ca.categoria,
    ROUND(ca.stock, 2),
    ROUND(ca.transito, 2),
    ROUND(ca.stock_valor, 2),
    ROUND(ca.cantidad_vendida, 2),
    ROUND(ca.venta_diaria, 4),
    ca.ultima_venta,
    CASE WHEN ca.ultima_venta IS NOT NULL
      THEN (v_fecha_saldos - ca.ultima_venta)::INTEGER
    END AS dias_sin_venta,
    ROUND(ca.cobertura, 1),
    CASE
      WHEN ca.cantidad_vendida = 0 AND ca.stock > 0 THEN 'MUERTO'
      WHEN ca.cantidad_vendida > 0 AND (ca.stock + ca.transito) <= 0 THEN 'AGOTADO'
      WHEN ca.cobertura < p_dias_cobertura * 0.25 THEN 'CRITICO'
      WHEN ca.cobertura > p_dias_cobertura * 3 THEN 'LENTO'
      ELSE 'NORMAL'
    END AS clasificacion,
    ca.sugerido,
    ROUND(ca.ult_val_compra, 2),
    ROUND(ca.sugerido * ca.ult_val_compra, 2) AS sugerido_costo
  FROM calculado ca
  WHERE NOT (ca.stock <= 0 AND ca.cantidad_vendida = 0)
  ORDER BY ca.sugerido * ca.ult_val_compra DESC, ca.codigo;
END;
$$;

CREATE OR REPLACE FUNCTION fn_mcp_sugerido(
  p_clasificacion TEXT DEFAULT NULL,
  p_dias_cobertura INT DEFAULT NULL,
  p_pct_crecimiento NUMERIC DEFAULT NULL,
  p_pct_reserva NUMERIC DEFAULT NULL,
  p_limite INT DEFAULT 25
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_carga RECORD;
  v_cfg RECORD;
  v_limite INT := LEAST(GREATEST(COALESCE(p_limite, 25), 1), 100);
  v_resumen JSONB;
  v_top JSONB;
BEGIN
  SELECT id, fecha_saldos INTO v_carga
  FROM distrimm_inventario_cargas ORDER BY fecha_saldos DESC LIMIT 1;
  IF v_carga.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No hay cargas de inventario. Gerencia debe subir el Excel Saldos de Productos.');
  END IF;

  IF p_clasificacion IS NOT NULL
     AND upper(p_clasificacion) NOT IN ('AGOTADO','CRITICO','NORMAL','LENTO','MUERTO','POR_PEDIR') THEN
    RETURN jsonb_build_object('error', 'clasificacion invalida. Opciones: AGOTADO, CRITICO, NORMAL, LENTO, MUERTO, POR_PEDIR');
  END IF;

  SELECT * INTO v_cfg FROM distrimm_sugerido_config WHERE id = 1;

  CREATE TEMP TABLE IF NOT EXISTS tmp_sugerido ON COMMIT DROP AS
  SELECT * FROM fn_sugerido_pedidos(
    v_carga.id,
    COALESCE(p_dias_cobertura, v_cfg.dias_cobertura, 30),
    COALESCE(p_pct_crecimiento, v_cfg.pct_crecimiento, 0),
    COALESCE(p_pct_reserva, v_cfg.pct_reserva, 0),
    COALESCE(v_cfg.dias_analisis, 90)
  );

  SELECT jsonb_agg(jsonb_build_object(
    'clasificacion', clasificacion, 'productos', n,
    'stock_valor', ROUND(stock_valor),
    'unidades_sugeridas', sugerido,
    'costo_sugerido', ROUND(costo)
  ) ORDER BY n DESC)
  INTO v_resumen
  FROM (
    SELECT clasificacion, COUNT(*) n, SUM(stock_valor) stock_valor,
           SUM(sugerido_cantidad) sugerido, SUM(sugerido_costo) costo
    FROM tmp_sugerido GROUP BY clasificacion
  ) s;

  SELECT jsonb_agg(jsonb_build_object(
    'codigo', producto_codigo, 'producto', producto_nombre, 'marca', marca,
    'stock', stock, 'venta_diaria', venta_diaria, 'cobertura_dias', cobertura_dias,
    'dias_sin_venta', dias_sin_venta, 'clasificacion', clasificacion,
    'stock_valor', ROUND(stock_valor),
    'sugerido_cantidad', sugerido_cantidad, 'costo_estimado', ROUND(sugerido_costo)
  ))
  INTO v_top
  FROM (
    SELECT * FROM tmp_sugerido
    WHERE p_clasificacion IS NULL
       OR (upper(p_clasificacion) = 'POR_PEDIR' AND sugerido_cantidad > 0)
       OR clasificacion = upper(p_clasificacion)
    ORDER BY CASE WHEN upper(COALESCE(p_clasificacion,'')) IN ('MUERTO','LENTO')
                  THEN stock_valor ELSE COALESCE(sugerido_costo, 0) END DESC,
             sugerido_cantidad DESC
    LIMIT v_limite
  ) t;

  DROP TABLE IF EXISTS tmp_sugerido;

  RETURN jsonb_build_object(
    'fecha_saldos', v_carga.fecha_saldos,
    'parametros', jsonb_build_object(
      'dias_cobertura', COALESCE(p_dias_cobertura, v_cfg.dias_cobertura, 30),
      'pct_crecimiento', COALESCE(p_pct_crecimiento, v_cfg.pct_crecimiento, 0),
      'pct_reserva', COALESCE(p_pct_reserva, v_cfg.pct_reserva, 0),
      'dias_analisis', COALESCE(v_cfg.dias_analisis, 90),
      'bodegas', '1,5,6'
    ),
    'moneda', 'COP',
    'resumen_por_clasificacion', COALESCE(v_resumen, '[]'::JSONB),
    'filtro_clasificacion', p_clasificacion,
    'productos', COALESCE(v_top, '[]'::JSONB)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Comisiones (desde snapshots de liquidación)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_mcp_comisiones(
  p_year INT DEFAULT NULL,
  p_month INT DEFAULT NULL,
  p_vendedor TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_snap RECORD;
  v_vendedores JSONB;
  v_detalle JSONB;
  v_disponibles JSONB;
BEGIN
  SELECT * INTO v_snap
  FROM distrimm_comisiones_snapshots
  WHERE (p_year IS NULL OR periodo_year = p_year)
    AND (p_month IS NULL OR periodo_month = p_month)
  ORDER BY periodo_year DESC, periodo_month DESC
  LIMIT 1;

  IF v_snap.id IS NULL THEN
    SELECT jsonb_agg(periodo_year || '-' || lpad(periodo_month::TEXT, 2, '0')
                     ORDER BY periodo_year DESC, periodo_month DESC)
    INTO v_disponibles FROM distrimm_comisiones_snapshots;
    RETURN jsonb_build_object(
      'error', 'No hay liquidacion para ese periodo',
      'periodos_disponibles', COALESCE(v_disponibles, '[]'::JSONB)
    );
  END IF;

  IF p_vendedor IS NOT NULL THEN
    -- Detalle completo de un vendedor (por código o por nombre parcial)
    SELECT v INTO v_detalle
    FROM jsonb_array_elements(v_snap.liquidacion) v
    WHERE v->>'vendedor_codigo' = p_vendedor
       OR v->>'vendedor_nombre' ILIKE '%' || p_vendedor || '%'
    LIMIT 1;
    IF v_detalle IS NULL THEN
      RETURN jsonb_build_object('error', 'Vendedor no encontrado en la liquidacion',
        'vendedores', (SELECT jsonb_agg(v->>'vendedor_nombre') FROM jsonb_array_elements(v_snap.liquidacion) v));
    END IF;
    -- Recortar detalleMarcas a las relevantes (con venta o con comisión)
    v_detalle := jsonb_set(
      v_detalle,
      '{comisionVentas,detalleMarcas}',
      COALESCE((
        SELECT jsonb_agg(m) FROM jsonb_array_elements(v_detalle->'comisionVentas'->'detalleMarcas') m
        WHERE (m->>'comision')::NUMERIC > 0 OR (m->>'totalVenta')::NUMERIC > 0
      ), '[]'::JSONB)
    );
    RETURN jsonb_build_object(
      'periodo', v_snap.periodo_year || '-' || lpad(v_snap.periodo_month::TEXT, 2, '0'),
      'moneda', 'COP',
      'nota', 'detalleMarcas recortado a marcas con venta o comision > 0',
      'vendedor', v_detalle
    );
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'codigo', v->>'vendedor_codigo',
    'vendedor', v->>'vendedor_nombre',
    'comision_total', (v->>'totalComision')::NUMERIC,
    'comision_ventas', (v->'comisionVentas'->>'totalComisionVentas')::NUMERIC,
    'comision_recaudo', (v->'comisionRecaudo'->>'comisionRecaudo')::NUMERIC,
    'recaudado', (v->'comisionRecaudo'->>'totalRecaudado')::NUMERIC,
    'meta_recaudo', (v->'comisionRecaudo'->>'metaRecaudo')::NUMERIC,
    'pct_cumplimiento_recaudo', (v->'comisionRecaudo'->>'pctCumplimiento')::NUMERIC
  ) ORDER BY (v->>'totalComision')::NUMERIC DESC)
  INTO v_vendedores
  FROM jsonb_array_elements(v_snap.liquidacion) v;

  RETURN jsonb_build_object(
    'periodo', v_snap.periodo_year || '-' || lpad(v_snap.periodo_month::TEXT, 2, '0'),
    'actualizado', v_snap.updated_at::DATE,
    'moneda', 'COP',
    'resumen', v_snap.resumen,
    'vendedores', COALESCE(v_vendedores, '[]'::JSONB),
    'nota', 'Para el detalle por marcas de un vendedor, consultar de nuevo indicando el vendedor.'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Búsqueda y ficha (para las tools search/fetch de ChatGPT)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_mcp_buscar(p_query TEXT, p_limite INT DEFAULT 10)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limite INT := LEAST(GREATEST(COALESCE(p_limite, 10), 1), 25);
  v_result JSONB;
BEGIN
  IF p_query IS NULL OR length(trim(p_query)) < 2 THEN
    RETURN jsonb_build_object('error', 'query demasiado corto');
  END IF;

  WITH productos AS (
    SELECT 'producto:' || codigo AS id,
           nombre || ' (' || COALESCE(marca, 'sin marca') || ')' AS titulo,
           'producto' AS tipo
    FROM distrimm_productos_catalogo
    WHERE nombre ILIKE '%' || p_query || '%' OR marca ILIKE '%' || p_query || '%'
       OR codigo = p_query
    LIMIT v_limite
  ),
  clientes AS (
    SELECT 'cliente:' || no_identif AS id,
           nombre_completo || ' (NIT ' || no_identif || ')' AS titulo,
           'cliente' AS tipo
    FROM distrimm_clientes
    WHERE nombre_completo ILIKE '%' || p_query || '%' OR no_identif = p_query
    LIMIT v_limite
  ),
  vendedores AS (
    -- distrimm_vendedores está vacía: se derivan de las ventas
    SELECT DISTINCT ON (v.vendedor_codigo)
           'vendedor:' || v.vendedor_codigo AS id,
           v.vendedor_nombre || ' (codigo ' || v.vendedor_codigo || ')' AS titulo,
           'vendedor' AS tipo
    FROM distrimm_comisiones_ventas v
    WHERE v.vendedor_nombre ILIKE '%' || p_query || '%' OR v.vendedor_codigo = p_query
    LIMIT v_limite
  )
  SELECT jsonb_agg(jsonb_build_object('id', id, 'title', titulo, 'tipo', tipo))
  INTO v_result
  FROM (
    SELECT * FROM productos
    UNION ALL SELECT * FROM clientes
    UNION ALL SELECT * FROM vendedores
    LIMIT v_limite
  ) t;

  RETURN jsonb_build_object('query', p_query, 'resultados', COALESCE(v_result, '[]'::JSONB));
END;
$$;

CREATE OR REPLACE FUNCTION fn_mcp_ficha(p_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tipo TEXT := split_part(p_id, ':', 1);
  v_clave TEXT := split_part(p_id, ':', 2);
  v_hoy DATE := fn_mcp_hoy();
  v_result JSONB;
BEGIN
  IF v_tipo = 'producto' THEN
    SELECT jsonb_build_object(
      'tipo', 'producto',
      'codigo', p.codigo, 'nombre', p.nombre, 'marca', p.marca,
      'categoria', p.categoria_nombre,
      'stock_bodegas_confiables', (
        SELECT jsonb_build_object('unidades', COALESCE(SUM(i.cantidad),0), 'valor', ROUND(COALESCE(SUM(i.valor),0)))
        FROM distrimm_inventario_items i
        WHERE i.producto_codigo = p.codigo AND i.bodega IN (1,5,6)
          AND i.carga_id = (SELECT id FROM distrimm_inventario_cargas ORDER BY fecha_saldos DESC LIMIT 1)
      ),
      'ventas_ultimos_90_dias', (
        SELECT jsonb_build_object(
          'unidades', COALESCE(SUM(CASE WHEN tipo='DV' THEN -cantidad ELSE cantidad END),0),
          'venta_neta', ROUND(COALESCE(SUM(valor_total),0)),
          'clientes', COUNT(DISTINCT cliente_nit),
          'ultima_venta', MAX(fecha))
        FROM distrimm_comisiones_ventas
        WHERE producto_codigo = p.codigo AND fecha > v_hoy - 90
      ),
      'top_clientes_90_dias', (
        SELECT jsonb_agg(jsonb_build_object('cliente', cliente, 'venta', ROUND(venta)))
        FROM (SELECT COALESCE(cliente_nombre, cliente_nit) cliente, SUM(valor_total) venta
              FROM distrimm_comisiones_ventas
              WHERE producto_codigo = p.codigo AND fecha > v_hoy - 90
              GROUP BY 1 ORDER BY 2 DESC LIMIT 5) t
      )
    ) INTO v_result
    FROM distrimm_productos_catalogo p WHERE p.codigo = v_clave;

  ELSIF v_tipo = 'cliente' THEN
    SELECT jsonb_build_object(
      'tipo', 'cliente',
      'nit', c.no_identif, 'nombre', c.nombre_completo,
      'municipio', c.municipio, 'vendedor_codigo', c.vendedor_codigo,
      'cupo_venta', c.cupo_venta,
      'cartera_actual', (
        SELECT jsonb_build_object('saldo', ROUND(COALESCE(SUM(valor_saldo),0)),
          'vencido', ROUND(COALESCE(SUM(valor_saldo) FILTER (WHERE dias_mora > 0),0)),
          'mora_maxima_dias', MAX(dias_mora), 'documentos', COUNT(*))
        FROM cartera_items
        WHERE tercero_nit = c.no_identif AND deleted_at IS NULL
          AND carga_id = (SELECT id FROM historial_cargas WHERE deleted_at IS NULL
                          ORDER BY fecha_corte DESC, created_at DESC LIMIT 1)
      ),
      'compras_ultimos_90_dias', (
        SELECT jsonb_build_object('venta_neta', ROUND(COALESCE(SUM(valor_total),0)),
          'facturas', COUNT(DISTINCT factura) FILTER (WHERE tipo <> 'DV'),
          'ultima_compra', MAX(fecha))
        FROM distrimm_comisiones_ventas
        WHERE cliente_nit = c.no_identif AND fecha > v_hoy - 90
      ),
      'top_productos_90_dias', (
        SELECT jsonb_agg(jsonb_build_object('producto', producto, 'venta', ROUND(venta)))
        FROM (SELECT COALESCE(producto_descripcion, producto_codigo) producto, SUM(valor_total) venta
              FROM distrimm_comisiones_ventas
              WHERE cliente_nit = c.no_identif AND fecha > v_hoy - 90
              GROUP BY 1 ORDER BY 2 DESC LIMIT 5) t
      )
    ) INTO v_result
    FROM distrimm_clientes c WHERE c.no_identif = v_clave;

  ELSIF v_tipo = 'vendedor' THEN
    SELECT jsonb_build_object(
      'tipo', 'vendedor',
      'codigo', v.vendedor_codigo, 'nombre', v.vendedor_nombre,
      'ventas_mes_actual', (
        SELECT jsonb_build_object('venta_neta', ROUND(COALESCE(SUM(valor_total),0)),
          'margen', ROUND(COALESCE(SUM(margen_valor),0)),
          'clientes', COUNT(DISTINCT cliente_nit))
        FROM distrimm_comisiones_ventas
        WHERE vendedor_codigo = v.vendedor_codigo AND fecha >= date_trunc('month', v_hoy)::DATE
      ),
      'cartera_asignada', (
        SELECT jsonb_build_object('saldo', ROUND(COALESCE(SUM(valor_saldo),0)),
          'vencido', ROUND(COALESCE(SUM(valor_saldo) FILTER (WHERE dias_mora > 0),0)),
          'clientes', COUNT(DISTINCT tercero_nit))
        FROM cartera_items
        WHERE vendedor_codigo = v.vendedor_codigo AND deleted_at IS NULL
          AND carga_id = (SELECT id FROM historial_cargas WHERE deleted_at IS NULL
                          ORDER BY fecha_corte DESC, created_at DESC LIMIT 1)
      ),
      'comision_ultimo_periodo', (
        SELECT jsonb_build_object(
          'periodo', s.periodo_year || '-' || lpad(s.periodo_month::TEXT,2,'0'),
          'comision_total', (l->>'totalComision')::NUMERIC)
        FROM distrimm_comisiones_snapshots s,
             jsonb_array_elements(s.liquidacion) l
        WHERE l->>'vendedor_codigo' = v.vendedor_codigo
        ORDER BY s.periodo_year DESC, s.periodo_month DESC LIMIT 1
      )
    ) INTO v_result
    FROM (
      -- distrimm_vendedores está vacía: se deriva de las ventas
      SELECT DISTINCT ON (vendedor_codigo) vendedor_codigo, vendedor_nombre
      FROM distrimm_comisiones_ventas
      WHERE vendedor_codigo = v_clave
      ORDER BY vendedor_codigo, fecha DESC
    ) v;
  ELSE
    RETURN jsonb_build_object('error', 'id invalido. Formato: producto:CODIGO, cliente:NIT o vendedor:CODIGO');
  END IF;

  RETURN COALESCE(v_result, jsonb_build_object('error', 'No encontrado: ' || p_id));
END;
$$;

-- ----------------------------------------------------------------------------
-- PERMISOS: solo service_role
-- ----------------------------------------------------------------------------
DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'fn_mcp_resumen()',
    'fn_mcp_ventas(DATE, DATE, TEXT, TEXT, INT)',
    'fn_mcp_cartera(TEXT, INT, INT)',
    'fn_mcp_inventario(TEXT, TEXT, BOOLEAN, INT)',
    'fn_mcp_sugerido(TEXT, INT, NUMERIC, NUMERIC, INT)',
    'fn_mcp_comisiones(INT, INT, TEXT)',
    'fn_mcp_buscar(TEXT, INT)',
    'fn_mcp_ficha(TEXT)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
