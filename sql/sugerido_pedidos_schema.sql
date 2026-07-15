-- ============================================================================
-- DistriMM Sugerido de Pedidos — Schema
-- Applied via Supabase MCP on 2026-07-15
--
-- Módulo para gerencia: a partir del Excel "Saldos de Productos" (inventario
-- por bodega) y el histórico de ventas (distrimm_comisiones_ventas), calcula
-- el sugerido de compra por producto y clasifica el stock (muerto, lento,
-- agotado, crítico, normal).
-- ============================================================================

-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- Registro de cada archivo de saldos subido
CREATE TABLE distrimm_inventario_cargas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre_archivo TEXT NOT NULL,
  fecha_saldos DATE NOT NULL,
  total_registros INTEGER DEFAULT 0,
  total_valor NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cada línea del Excel de saldos (una fila por producto/bodega).
-- Se guardan TODAS las bodegas; el filtro de bodegas confiables (1, 5, 6)
-- se aplica en el RPC para poder ajustarlo sin recargar el archivo.
CREATE TABLE distrimm_inventario_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  carga_id UUID REFERENCES distrimm_inventario_cargas(id) ON DELETE CASCADE,
  producto_codigo TEXT NOT NULL,
  producto_nombre TEXT,
  bodega SMALLINT NOT NULL,
  cantidad NUMERIC(12,2) DEFAULT 0,
  valor NUMERIC(15,2) DEFAULT 0,
  transito NUMERIC(12,2) DEFAULT 0,
  categoria_codigo TEXT,
  categoria_nombre TEXT,
  marca TEXT,
  ult_compra DATE,               -- NULL si el Excel trae 01/01/1900 (nunca)
  ult_val_compra NUMERIC(12,2) DEFAULT 0,
  ult_val_venta NUMERIC(12,2) DEFAULT 0,
  precio_medio NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Parámetros predeterminados del sugerido ("Guardar como predeterminado").
-- Fila única global: la configuración es de la organización, no por usuario.
CREATE TABLE distrimm_sugerido_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dias_cobertura INTEGER NOT NULL DEFAULT 30 CHECK (dias_cobertura BETWEEN 1 AND 365),
  pct_crecimiento NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (pct_crecimiento BETWEEN 0 AND 100),
  pct_reserva NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (pct_reserva BETWEEN 0 AND 100),
  dias_analisis INTEGER NOT NULL DEFAULT 90 CHECK (dias_analisis BETWEEN 7 AND 365),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID
);

INSERT INTO distrimm_sugerido_config (id) VALUES (1);

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

CREATE INDEX idx_inventario_items_carga_id
  ON distrimm_inventario_items(carga_id);

CREATE INDEX idx_inventario_items_producto
  ON distrimm_inventario_items(producto_codigo);

-- La demanda se calcula sobre una ventana de fechas de ventas
CREATE INDEX IF NOT EXISTS idx_comisiones_ventas_fecha
  ON distrimm_comisiones_ventas(fecha);

-- ============================================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE distrimm_inventario_cargas ENABLE ROW LEVEL SECURITY;
ALTER TABLE distrimm_inventario_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE distrimm_sugerido_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on distrimm_inventario_cargas"
  ON distrimm_inventario_cargas FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access on distrimm_inventario_items"
  ON distrimm_inventario_items FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access on distrimm_sugerido_config"
  ON distrimm_sugerido_config FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- 4. RPC: Sugerido de pedidos
--
-- Fórmula por producto:
--   venta_diaria      = cantidad neta vendida (VE - DV) en la ventana / días de ventana
--   demanda_proyectada = venta_diaria × días_cobertura × (1 + %crecimiento) × (1 + %reserva)
--   sugerido          = CEIL(demanda_proyectada - (stock + tránsito)), mínimo 0
--
-- Clasificación (umbral relativo a la cobertura pedida):
--   MUERTO   sin ventas en la ventana y con stock > 0
--   AGOTADO  con ventas en la ventana y stock <= 0
--   CRITICO  cobertura actual < 25% de los días de cobertura pedidos
--   LENTO    cobertura actual > 3× los días de cobertura pedidos
--   NORMAL   resto
--
-- FULL JOIN ventas↔inventario: productos vendidos que no aparecen en el Excel
-- de saldos entran como AGOTADO (stock 0); productos en bodega sin ventas
-- entran como MUERTO.
-- ============================================================================

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
  IF auth.uid() IS NULL THEN
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
  demanda AS (
    -- Ventas netas (devoluciones DV restan cantidad) en la ventana de análisis,
    -- anclada a la fecha del archivo de saldos para que el cálculo sea
    -- reproducible aunque se consulte semanas después.
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
      -- Cobertura actual en días: NULL si no hay ventas (no aplica)
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
  -- Productos sin stock y sin ventas en la ventana no aportan nada
  WHERE NOT (ca.stock <= 0 AND ca.cantidad_vendida = 0)
  ORDER BY ca.sugerido * ca.ult_val_compra DESC, ca.codigo;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_sugerido_pedidos(UUID, INTEGER, NUMERIC, NUMERIC, INTEGER, SMALLINT[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION fn_sugerido_pedidos(UUID, INTEGER, NUMERIC, NUMERIC, INTEGER, SMALLINT[]) FROM anon;
