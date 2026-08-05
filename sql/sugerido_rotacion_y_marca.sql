-- ============================================================================
-- DistriMM Sugerido de Pedidos — corrección de rotación, marca y costo
-- 2026-07-28
--
-- Reporte de gerencia (nota de voz 28/07/2026), dos síntomas:
--
--   1. "Filtro la marca Corteva y no me aparece el INTREPID litro."
--      El producto está agotado, no tiene fila en el corte de inventario, y
--      marca/categoría SOLO salían de ahí. Llegaban NULL y el filtro de
--      proveedor los descarta (`aplicarAlcance` hace `set.has(r.marca)`).
--      Son 463 productos con demanda, invisibles al filtrar por proveedor —
--      justo los agotados, que es cuando más importa verlos.
--
--   2. "Del INTREPID 100 pedí dos veces 24 unidades este mes, tengo 14 y no
--      me da sugerencia."
--      La venta diaria dividía SIEMPRE entre la ventana completa (90 días),
--      aunque el producto llevara 19 días existiendo. El 90497 vendió 38
--      unidades en 19 días (2 diarias) y el cálculo reportaba 0,42 — seis
--      veces menos. Con esa rotación 14 unidades "cubren" 33 días y el
--      sugerido daba 0.
--
-- Corrección: la venta diaria se divide entre los días que el producto
-- realmente estuvo disponible, no entre la ventana nominal.
--
--   dias_historia = días desde que el producto existe (lo más viejo entre su
--                   primera venta y su primera aparición con existencia en un
--                   corte de inventario), acotado a la ventana de análisis.
--   dias_efectivos = dias_historia, con piso en los días de cobertura pedidos.
--
-- El piso es el guardarraíl que impide que un producto con una sola venta
-- reciente dispare un pedido absurdo: como dias_efectivos >= dias_cobertura,
-- se cumple que sugerido <= cantidad vendida en la ventana - stock. Nunca se
-- sugiere pedir más de lo que se vendió.
--
-- Un producto lento que lleva años en bodega NO se ve afectado: su primera
-- aparición es anterior a la ventana, así que sigue dividiendo entre los 90
-- días. Medido sobre el corte del 28/07/2026: de 909 productos con ventas
-- concentradas al final de la ventana, solo 339 son realmente nuevos y solo
-- 116 suben de sugerido. El costo total del pedido pasa de 80,8 a 83,3
-- millones (+3,1%).
--
-- Se añade además el respaldo de costo unitario: un producto sin fila en el
-- corte actual mostraba "—" y costo estimado $0 aunque tuviera sugerido (el
-- 93129 del reporte). Ahora hereda el último valor de compra conocido.
-- ============================================================================

-- La firma cambia (nueva columna dias_historia), hay que soltarla primero.
DROP FUNCTION IF EXISTS fn_sugerido_pedidos(UUID, INTEGER, NUMERIC, NUMERIC, INTEGER, SMALLINT[]);

CREATE OR REPLACE FUNCTION fn_sugerido_pedidos(
  p_carga_id UUID,
  p_dias_cobertura INTEGER DEFAULT 30,
  p_pct_crecimiento NUMERIC DEFAULT 0,
  p_pct_reserva NUMERIC DEFAULT 0,
  p_dias_analisis INTEGER DEFAULT 90,
  p_bodegas SMALLINT[] DEFAULT '{3,5,6}'
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
  dias_historia INTEGER,
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
  v_primer_corte DATE;
  v_inicio_ventana DATE;
  v_piso NUMERIC;
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

  -- Corte de inventario más antiguo que existe. Un producto que ya aparecía
  -- ahí venía de antes de nuestros registros: no es nuevo, es que no tenemos
  -- historia previa. Sin este ancla, una ventana de análisis más larga que la
  -- historia de cortes inflaría la rotación de TODO el catálogo viejo.
  SELECT MIN(c.fecha_saldos) INTO v_primer_corte FROM distrimm_inventario_cargas c;

  v_inicio_ventana := v_fecha_saldos - p_dias_analisis;

  -- Piso del denominador. Se acota a la ventana para que una cobertura mayor
  -- que la ventana de análisis no invente días de historia inexistentes.
  v_piso := LEAST(p_dias_cobertura, p_dias_analisis);

  v_factor := (1 + COALESCE(p_pct_crecimiento, 0) / 100.0)
            * (1 + COALESCE(p_pct_reserva, 0) / 100.0);

  RETURN QUERY
  WITH inventario AS (
    -- Consolidado por producto sobre las bodegas confiables
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
  -- Primera vez que el producto se vio CON EXISTENCIA en cualquier corte.
  -- Si ya estaba en el corte más antiguo que tenemos, no es nuevo: es que no
  -- hay historia previa. En ese caso se ancla al inicio de la ventana, que es
  -- lo mismo que decir "existe desde siempre". OJO: no sirve dejarlo en NULL,
  -- porque LEAST ignora los NULL y caería en la primera venta, acelerando la
  -- rotación de todo el catálogo viejo — justo lo contrario de lo que se busca.
  aparicion AS (
    SELECT
      i.producto_codigo AS codigo,
      CASE WHEN MIN(c.fecha_saldos) <= v_primer_corte
        THEN v_inicio_ventana
        ELSE MIN(c.fecha_saldos)
      END AS desde
    FROM distrimm_inventario_items i
    JOIN distrimm_inventario_cargas c ON c.id = i.carga_id
    WHERE i.bodega = ANY(p_bodegas)
      AND i.cantidad > 0
      AND c.fecha_saldos <= v_fecha_saldos
    GROUP BY i.producto_codigo
  ),
  -- Último valor de compra conocido, para productos que ya no figuran en el
  -- corte actual (agotados). Sin esto su costo estimado sale en cero.
  costo_previo AS (
    SELECT DISTINCT ON (i.producto_codigo)
      i.producto_codigo AS codigo,
      i.ult_val_compra AS costo
    FROM distrimm_inventario_items i
    JOIN distrimm_inventario_cargas c ON c.id = i.carga_id
    WHERE i.bodega = ANY(p_bodegas)
      AND i.ult_val_compra > 0
      AND c.fecha_saldos <= v_fecha_saldos
    ORDER BY i.producto_codigo, c.fecha_saldos DESC
  ),
  demanda AS (
    -- Ventas netas (devoluciones DV restan cantidad) en la ventana de análisis,
    -- anclada a la fecha del archivo de saldos para que el cálculo sea
    -- reproducible aunque se consulte semanas después.
    SELECT
      v.producto_codigo AS codigo,
      MAX(v.producto_descripcion) AS descripcion,
      SUM(CASE WHEN v.tipo = 'DV' THEN -v.cantidad ELSE v.cantidad END) AS cantidad_vendida,
      MAX(v.fecha) FILTER (WHERE v.tipo <> 'DV') AS ultima_venta,
      MIN(v.fecha) FILTER (WHERE v.tipo <> 'DV') AS primera_venta
    FROM distrimm_ventas_vigentes v
    WHERE v.fecha > v_inicio_ventana
      AND v.fecha <= v_fecha_saldos
    GROUP BY v.producto_codigo
  ),
  combinado AS (
    SELECT
      COALESCE(inv.codigo, d.codigo) AS codigo,
      COALESCE(inv.nombre, cat.nombre, d.descripcion) AS nombre,
      -- Marca y línea salen del catálogo del ERP cuando el producto no está
      -- en el corte (agotado). Antes llegaban NULL y el filtro de proveedor
      -- los escondía.
      COALESCE(inv.marca, cat.marca) AS marca,
      COALESCE(inv.categoria, cat.categoria_nombre) AS categoria,
      COALESCE(inv.stock, 0) AS stock,
      COALESCE(inv.transito, 0) AS transito,
      COALESCE(inv.stock_valor, 0) AS stock_valor,
      GREATEST(COALESCE(d.cantidad_vendida, 0), 0) AS cantidad_vendida,
      d.ultima_venta,
      COALESCE(NULLIF(inv.ult_val_compra, 0), cp.costo, 0) AS ult_val_compra,
      -- Arranque de la historia del producto dentro de la ventana: lo más
      -- viejo entre su primera venta y su primera aparición en bodega.
      -- Un producto sin NINGUNA fila de inventario en ningún corte no da
      -- evidencia de ser nuevo, así que se asume disponible desde el inicio
      -- de la ventana (comportamiento conservador: no se le acelera la
      -- rotación por no tener historia de bodega).
      GREATEST(
        v_inicio_ventana,
        LEAST(
          COALESCE(d.primera_venta, v_fecha_saldos),
          COALESCE(ap.desde, v_inicio_ventana)
        )
      ) AS inicio_historia
    FROM inventario inv
    FULL JOIN demanda d ON d.codigo = inv.codigo
    LEFT JOIN distrimm_productos_catalogo cat
      ON cat.codigo = COALESCE(inv.codigo, d.codigo)
    LEFT JOIN aparicion ap ON ap.codigo = COALESCE(inv.codigo, d.codigo)
    LEFT JOIN costo_previo cp ON cp.codigo = COALESCE(inv.codigo, d.codigo)
  ),
  calculado AS (
    SELECT
      c.*,
      (v_fecha_saldos - c.inicio_historia)::INTEGER AS dias_hist,
      -- Denominador real de la rotación: los días que el producto existió,
      -- con piso en la cobertura pedida (ver cabecera del archivo).
      GREATEST(
        LEAST(p_dias_analisis::NUMERIC, (v_fecha_saldos - c.inicio_historia)::NUMERIC),
        v_piso
      ) AS dias_efectivos
    FROM combinado c
  ),
  final AS (
    SELECT
      ca.*,
      ca.cantidad_vendida / ca.dias_efectivos AS v_diaria
    FROM calculado ca
  )
  SELECT
    f.codigo,
    f.nombre,
    f.marca,
    f.categoria,
    ROUND(f.stock, 2),
    ROUND(f.transito, 2),
    ROUND(f.stock_valor, 2),
    ROUND(f.cantidad_vendida, 2),
    ROUND(f.v_diaria, 4),
    f.ultima_venta,
    CASE WHEN f.ultima_venta IS NOT NULL
      THEN (v_fecha_saldos - f.ultima_venta)::INTEGER
    END AS dias_sin_venta,
    f.dias_hist,
    -- Cobertura actual en días: NULL si no hay ventas (no aplica)
    CASE WHEN f.v_diaria > 0
      THEN ROUND((f.stock + f.transito) / f.v_diaria, 1)
    END AS cobertura_dias,
    CASE
      WHEN f.cantidad_vendida = 0 AND f.stock > 0 THEN 'MUERTO'
      WHEN f.cantidad_vendida > 0 AND (f.stock + f.transito) <= 0 THEN 'AGOTADO'
      -- CRÍTICO = no alcanza a cubrir la meta de cobertura. Antes exigía bajar
      -- del 25% de la meta, y productos con 11 días de cobertura contra una
      -- meta de 30 salían NORMAL: quedaban fuera del filtro que usa gerencia
      -- para priorizar. Decisión del dueño 28/07/2026: el umbral es el 100%.
      WHEN f.v_diaria > 0
        AND (f.stock + f.transito) / f.v_diaria < p_dias_cobertura THEN 'CRITICO'
      WHEN f.v_diaria > 0
        AND (f.stock + f.transito) / f.v_diaria > p_dias_cobertura * 3 THEN 'LENTO'
      ELSE 'NORMAL'
    END AS clasificacion,
    GREATEST(
      CEIL(f.v_diaria * p_dias_cobertura * v_factor - (f.stock + f.transito)),
      0
    ) AS sugerido_cantidad,
    ROUND(f.ult_val_compra, 2),
    ROUND(
      GREATEST(
        CEIL(f.v_diaria * p_dias_cobertura * v_factor - (f.stock + f.transito)),
        0
      ) * f.ult_val_compra,
      2
    ) AS sugerido_costo
  FROM final f
  -- Productos sin stock y sin ventas en la ventana no aportan nada
  WHERE NOT (f.stock <= 0 AND f.cantidad_vendida = 0)
  ORDER BY
    GREATEST(
      CEIL(f.v_diaria * p_dias_cobertura * v_factor - (f.stock + f.transito)),
      0
    ) * f.ult_val_compra DESC,
    f.codigo;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_sugerido_pedidos(UUID, INTEGER, NUMERIC, NUMERIC, INTEGER, SMALLINT[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION fn_sugerido_pedidos(UUID, INTEGER, NUMERIC, NUMERIC, INTEGER, SMALLINT[]) FROM anon;
