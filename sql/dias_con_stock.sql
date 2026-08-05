-- ============================================================================
-- DistriMM — Días CON stock por producto, y su uso en el sugerido
-- 2026-07-28
--
-- Segunda mitad del arreglo de precisión del sugerido. La primera (28/07, por
-- la mañana) hizo que la venta diaria se dividiera entre los días que el
-- producto llevaba EXISTIENDO en vez de la ventana entera, con la primera
-- aparición en una foto mensual de inventario como evidencia. Eso resolvió el
-- producto nuevo, pero no el producto que se AGOTÓ a mitad de la ventana:
-- las fotos son mensuales y no ven que se quedó en cero el día 12 y volvió el
-- día 40.
--
-- Con `distrimm_inventario_movimientos` el stock es reconstruible día a día,
-- así que el denominador pasa a ser lo que siempre debió ser: **los días en
-- que el producto realmente tuvo con qué venderse**.
--
-- Tamaño del problema, medido sobre los 90 días previos al 28/07/2026 con
-- esta misma función, de 1.071 productos con venta:
--   · 584 (55%) tuvieron quiebre de stock en la ventana
--   · 430 (40%) estuvieron sin stock más de 30 días
--   · promedio: 30,8 días sin stock de 90
--   · demanda del catálogo: 1.040 u/día medida vs 1.223 real (+17,6%)
--
-- OJO: una estimación previa dio +55%. Estaba mal por dos motivos y no debe
-- volver a citarse: se calculó con una consulta ad-hoc sobre el ERP que solo
-- contaba tramos iniciados por un movimiento —ignorando el stock de apertura
-- de productos con pocos movimientos— y con un piso de 7 días, que deja
-- extrapolar sin freno. Ver la validación en la cabecera de la sección 2.
--
-- ANCLA, NO ACUMULACIÓN DESDE CERO. El saldo al inicio de la ventana se toma
-- de la foto mensual de inventario más reciente anterior a esa fecha, y desde
-- ahí se avanza con los movimientos. No se acumula desde enero a propósito:
-- `IN_ProdBodega` tiene buckets `AjusteD/C` que NO pasan por `IN_Movimiento`
-- (se detectaron 2 unidades movidas entre bodegas sin documento), y acumular
-- desde el origen arrastraría ese error para siempre. Anclando cada vez, un
-- ajuste sin documento solo puede desviar el cálculo dentro de un mes.
-- ============================================================================

-- ============================================================================
-- 1. Días con stock dentro de una ventana
--
-- Devuelve, por producto, cuántos días del intervalo (p_desde, p_hasta] tuvo
-- existencia positiva en las bodegas pedidas. Va aparte de fn_sugerido_pedidos
-- para poder contrastarla sola contra el ERP.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_dias_con_stock(
  p_desde DATE,
  p_hasta DATE,
  p_bodegas SMALLINT[] DEFAULT '{3,5,6}'
)
RETURNS TABLE (
  producto_codigo TEXT,
  stock_inicio NUMERIC,
  dias_con_stock INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ancla_fecha DATE;
  v_ancla_carga UUID;
  v_ventana     INTEGER;
BEGIN
  v_ventana := GREATEST((p_hasta - p_desde)::INTEGER, 0);

  -- Foto de inventario más reciente en o antes del inicio de la ventana.
  SELECT c.id, c.fecha_saldos INTO v_ancla_carga, v_ancla_fecha
  FROM distrimm_inventario_cargas c
  WHERE c.origen = 'erp' AND c.fecha_saldos <= p_desde
  ORDER BY c.fecha_saldos DESC
  LIMIT 1;

  -- Sin ancla no hay forma honesta de saber el saldo inicial. Se devuelve
  -- vacío y quien llama decide (fn_sugerido_pedidos cae a la medida anterior).
  IF v_ancla_carga IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH ancla AS (
    SELECT i.producto_codigo AS codigo, SUM(i.cantidad) AS q
    FROM distrimm_inventario_items i
    WHERE i.carga_id = v_ancla_carga AND i.bodega = ANY(p_bodegas)
    GROUP BY i.producto_codigo
  ),
  -- Del ancla al inicio de la ventana: movimientos que ya no están en la foto
  -- pero sí ocurrieron antes de que empiece a contar.
  puente AS (
    SELECT m.producto_codigo AS codigo, SUM(m.delta) AS d
    FROM distrimm_inventario_movimientos m
    WHERE m.origen = 'erp' AND m.bodega = ANY(p_bodegas)
      AND m.fecha > v_ancla_fecha AND m.fecha <= p_desde
    GROUP BY m.producto_codigo
  ),
  inicio AS (
    SELECT COALESCE(a.codigo, p.codigo) AS codigo,
           COALESCE(a.q, 0) + COALESCE(p.d, 0) AS q
    FROM ancla a FULL JOIN puente p ON p.codigo = a.codigo
  ),
  -- Un evento por producto y día: varios movimientos del mismo día se suman,
  -- porque el saldo solo se observa a nivel de día.
  eventos AS (
    SELECT m.producto_codigo AS codigo, m.fecha, SUM(m.delta) AS d
    FROM distrimm_inventario_movimientos m
    WHERE m.origen = 'erp' AND m.bodega = ANY(p_bodegas)
      AND m.fecha > p_desde AND m.fecha <= p_hasta
    GROUP BY m.producto_codigo, m.fecha
  ),
  corrida AS (
    SELECT
      e.codigo,
      e.fecha,
      COALESCE(i.q, 0) + SUM(e.d) OVER (
        PARTITION BY e.codigo ORDER BY e.fecha ROWS UNBOUNDED PRECEDING
      ) AS saldo,
      LEAD(e.fecha) OVER (PARTITION BY e.codigo ORDER BY e.fecha) AS sig,
      FIRST_VALUE(e.fecha) OVER (
        PARTITION BY e.codigo ORDER BY e.fecha ROWS UNBOUNDED PRECEDING
      ) AS primer_evento,
      COALESCE(i.q, 0) AS q_inicio
    FROM eventos e
    LEFT JOIN inicio i ON i.codigo = e.codigo
  ),
  -- Suma de los tramos con saldo positivo. Cada tramo va desde su movimiento
  -- hasta el siguiente (o hasta el fin de la ventana).
  tramos AS (
    SELECT
      c.codigo,
      MAX(c.q_inicio) AS q_inicio,
      -- Tramo inicial: desde el arranque de la ventana hasta el primer
      -- movimiento, con el saldo que traía el producto.
      CASE WHEN MAX(c.q_inicio) > 0
        THEN (MIN(c.primer_evento) - p_desde)::INTEGER ELSE 0 END
      + SUM(
          CASE WHEN c.saldo > 0
            THEN (LEAST(COALESCE(c.sig, p_hasta), p_hasta) - c.fecha)::INTEGER
            ELSE 0 END
        ) AS dias
    FROM corrida c
    GROUP BY c.codigo
  )
  -- Productos SIN movimientos en la ventana: su saldo no cambió, así que o
  -- tuvieron stock todos los días o ninguno.
  SELECT i.codigo, i.q,
         CASE WHEN i.q > 0 THEN v_ventana ELSE 0 END
  FROM inicio i
  WHERE NOT EXISTS (SELECT 1 FROM tramos t WHERE t.codigo = i.codigo)
  UNION ALL
  -- El cast es necesario: SUM() sobre enteros devuelve bigint y la firma
  -- declara integer.
  SELECT t.codigo, t.q_inicio, LEAST(GREATEST(t.dias, 0), v_ventana)::INTEGER
  FROM tramos t;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_dias_con_stock(DATE, DATE, SMALLINT[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION fn_dias_con_stock(DATE, DATE, SMALLINT[]) FROM anon;

-- ============================================================================
-- 2. fn_sugerido_pedidos — el denominador pasa a ser los días CON stock
--
-- Reemplaza la versión de la mañana (sql/sugerido_rotacion_y_marca.sql), que
-- usaba la primera aparición en una foto mensual como evidencia de "desde
-- cuándo existe". Esa medida resolvía el producto nuevo pero no el que se
-- agotó a mitad de la ventana.
--
-- MEDIDO sobre el corte del 28/07/2026, de 1.071 productos con venta:
--   · 584 (55%) tuvieron quiebre de stock en la ventana
--   · 430 (40%) estuvieron sin stock más de 30 días
--   · promedio: 30,8 días sin stock de 90
--   · demanda del catálogo: 1.040 u/día medida vs 1.223 real (+17,6%)
--
-- El piso sigue siendo `dias_cobertura`, y sigue garantizando
-- `sugerido <= vendido en la ventana − stock`. Sin él, un producto con stock
-- 3 días y 5 unidades vendidas daría 1,67/día y un pedido desbocado.
--
-- FALLBACK EXPLÍCITO. `fn_dias_con_stock` necesita una foto de inventario
-- anterior al inicio de la ventana, y los movimientos solo existen desde
-- enero de 2026. Para cargas viejas —o ventanas de análisis largas— no hay
-- con qué, y se vuelve a la medida por disponibilidad. La columna
-- `base_calculo` dice cuál se usó: no se calla la diferencia, porque el
-- número lo usa gerencia para comprar.
-- ============================================================================

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
  base_calculo TEXT,
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
  FROM distrimm_inventario_cargas c WHERE c.id = p_carga_id;

  IF v_fecha_saldos IS NULL THEN
    RAISE EXCEPTION 'Carga de inventario % no encontrada', p_carga_id;
  END IF;

  SELECT MIN(c.fecha_saldos) INTO v_primer_corte FROM distrimm_inventario_cargas c;
  v_inicio_ventana := v_fecha_saldos - p_dias_analisis;
  v_piso := LEAST(p_dias_cobertura, p_dias_analisis);
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
    WHERE i.carga_id = p_carga_id AND i.bodega = ANY(p_bodegas)
    GROUP BY i.producto_codigo
  ),
  -- Días en que el producto SÍ tuvo con qué venderse. Vacío si no hay foto
  -- de inventario anterior a la ventana (ver fallback en la cabecera).
  con_stock AS (
    SELECT d.producto_codigo AS codigo, d.dias_con_stock
    FROM fn_dias_con_stock(v_inicio_ventana, v_fecha_saldos, p_bodegas) d
  ),
  -- Medida anterior, que sobrevive solo como respaldo.
  aparicion AS (
    SELECT
      i.producto_codigo AS codigo,
      CASE WHEN MIN(c.fecha_saldos) <= v_primer_corte
        THEN v_inicio_ventana ELSE MIN(c.fecha_saldos) END AS desde
    FROM distrimm_inventario_items i
    JOIN distrimm_inventario_cargas c ON c.id = i.carga_id
    WHERE i.bodega = ANY(p_bodegas) AND i.cantidad > 0
      AND c.fecha_saldos <= v_fecha_saldos
    GROUP BY i.producto_codigo
  ),
  costo_previo AS (
    SELECT DISTINCT ON (i.producto_codigo)
      i.producto_codigo AS codigo, i.ult_val_compra AS costo
    FROM distrimm_inventario_items i
    JOIN distrimm_inventario_cargas c ON c.id = i.carga_id
    WHERE i.bodega = ANY(p_bodegas) AND i.ult_val_compra > 0
      AND c.fecha_saldos <= v_fecha_saldos
    ORDER BY i.producto_codigo, c.fecha_saldos DESC
  ),
  demanda AS (
    SELECT
      v.producto_codigo AS codigo,
      MAX(v.producto_descripcion) AS descripcion,
      SUM(CASE WHEN v.tipo = 'DV' THEN -v.cantidad ELSE v.cantidad END) AS cantidad_vendida,
      MAX(v.fecha) FILTER (WHERE v.tipo <> 'DV') AS ultima_venta,
      MIN(v.fecha) FILTER (WHERE v.tipo <> 'DV') AS primera_venta
    FROM distrimm_ventas_vigentes v
    WHERE v.fecha > v_inicio_ventana AND v.fecha <= v_fecha_saldos
    GROUP BY v.producto_codigo
  ),
  combinado AS (
    SELECT
      COALESCE(inv.codigo, d.codigo) AS codigo,
      COALESCE(inv.nombre, cat.nombre, d.descripcion) AS nombre,
      COALESCE(inv.marca, cat.marca) AS marca,
      COALESCE(inv.categoria, cat.categoria_nombre) AS categoria,
      COALESCE(inv.stock, 0) AS stock,
      COALESCE(inv.transito, 0) AS transito,
      COALESCE(inv.stock_valor, 0) AS stock_valor,
      GREATEST(COALESCE(d.cantidad_vendida, 0), 0) AS cantidad_vendida,
      d.ultima_venta,
      COALESCE(NULLIF(inv.ult_val_compra, 0), cp.costo, 0) AS ult_val_compra,
      cs.dias_con_stock,
      (v_fecha_saldos - GREATEST(
        v_inicio_ventana,
        LEAST(COALESCE(d.primera_venta, v_fecha_saldos),
              COALESCE(ap.desde, v_inicio_ventana))
      ))::INTEGER AS dias_disponible
    FROM inventario inv
    FULL JOIN demanda d ON d.codigo = inv.codigo
    LEFT JOIN distrimm_productos_catalogo cat ON cat.codigo = COALESCE(inv.codigo, d.codigo)
    LEFT JOIN aparicion ap ON ap.codigo = COALESCE(inv.codigo, d.codigo)
    LEFT JOIN costo_previo cp ON cp.codigo = COALESCE(inv.codigo, d.codigo)
    LEFT JOIN con_stock cs ON cs.codigo = COALESCE(inv.codigo, d.codigo)
  ),
  calculado AS (
    SELECT
      c.*,
      COALESCE(c.dias_con_stock, c.dias_disponible) AS dias_base,
      CASE WHEN c.dias_con_stock IS NOT NULL THEN 'con_stock' ELSE 'disponible' END AS base_txt
    FROM combinado c
  ),
  final AS (
    SELECT
      ca.*,
      ca.cantidad_vendida / GREATEST(
        LEAST(p_dias_analisis::NUMERIC, ca.dias_base::NUMERIC), v_piso
      ) AS v_diaria
    FROM calculado ca
  ),
  proyectado AS (
    SELECT
      f.*,
      -- El ROUND antes del CEIL no es cosmético. `29/30` en numeric da
      -- 0,96666…67, y multiplicado por 30 vuelve como 29,0000…001: el CEIL
      -- lo subía a 30 y sugería pedir una unidad más de las que se vendieron,
      -- rompiendo el guardarraíl. Pasaba en 69 de 1.477 filas, siempre por
      -- exactamente 1 unidad.
      GREATEST(
        CEIL(ROUND(f.v_diaria * p_dias_cobertura * v_factor, 6)
             - (f.stock + f.transito)),
        0
      ) AS sug
    FROM final f
  )
  SELECT
    f.codigo, f.nombre, f.marca, f.categoria,
    ROUND(f.stock, 2), ROUND(f.transito, 2), ROUND(f.stock_valor, 2),
    ROUND(f.cantidad_vendida, 2), ROUND(f.v_diaria, 4), f.ultima_venta,
    CASE WHEN f.ultima_venta IS NOT NULL
      THEN (v_fecha_saldos - f.ultima_venta)::INTEGER END,
    f.dias_base,
    f.base_txt,
    CASE WHEN f.v_diaria > 0
      THEN ROUND((f.stock + f.transito) / f.v_diaria, 1) END,
    CASE
      WHEN f.cantidad_vendida = 0 AND f.stock > 0 THEN 'MUERTO'
      WHEN f.cantidad_vendida > 0 AND (f.stock + f.transito) <= 0 THEN 'AGOTADO'
      WHEN f.v_diaria > 0
        AND (f.stock + f.transito) / f.v_diaria < p_dias_cobertura THEN 'CRITICO'
      WHEN f.v_diaria > 0
        AND (f.stock + f.transito) / f.v_diaria > p_dias_cobertura * 3 THEN 'LENTO'
      ELSE 'NORMAL'
    END,
    f.sug,
    ROUND(f.ult_val_compra, 2),
    ROUND(f.sug * f.ult_val_compra, 2)
  FROM proyectado f
  WHERE NOT (f.stock <= 0 AND f.cantidad_vendida = 0)
  ORDER BY f.sug * f.ult_val_compra DESC, f.codigo;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_sugerido_pedidos(UUID, INTEGER, NUMERIC, NUMERIC, INTEGER, SMALLINT[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION fn_sugerido_pedidos(UUID, INTEGER, NUMERIC, NUMERIC, INTEGER, SMALLINT[]) FROM anon;
