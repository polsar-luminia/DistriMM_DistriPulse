-- DistriMM Comisiones Module Migration
-- Run this in the Supabase SQL editor:
-- https://supabase.com/dashboard/project/xzhqhmjfhnvqxndxayxs/sql/new

-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- Registro de cada archivo de ventas subido
CREATE TABLE distrimm_comisiones_cargas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre_archivo TEXT NOT NULL,
  fecha_ventas DATE NOT NULL,
  total_registros INTEGER DEFAULT 0,
  total_ventas NUMERIC(15,2) DEFAULT 0,
  total_costo NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cada línea de venta del Excel
CREATE TABLE distrimm_comisiones_ventas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  carga_id UUID REFERENCES distrimm_comisiones_cargas(id) ON DELETE CASCADE,
  vendedor_codigo TEXT,
  vendedor_nit TEXT,
  vendedor_nombre TEXT,
  producto_codigo TEXT NOT NULL,
  producto_descripcion TEXT,
  cliente_nit TEXT,
  cliente_nombre TEXT,
  municipio TEXT,
  fecha DATE,
  factura TEXT,
  precio NUMERIC(12,2) DEFAULT 0,
  descuento NUMERIC(12,2) DEFAULT 0,
  valor_unidad NUMERIC(12,2) DEFAULT 0,
  cantidad NUMERIC(10,2) DEFAULT 0,
  valor_total NUMERIC(15,2) DEFAULT 0,
  costo NUMERIC(15,2) DEFAULT 0,
  margen_valor NUMERIC(15,2) GENERATED ALWAYS AS (valor_total - costo) STORED,
  margen_pct NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN valor_total <> 0 THEN ((valor_total - costo) / valor_total) * 100 ELSE 0 END
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Catálogo maestro de productos (del Excel "Saldos de Productos")
CREATE TABLE distrimm_productos_catalogo (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT UNIQUE NOT NULL,
  nombre TEXT,
  categoria_codigo TEXT,
  categoria_nombre TEXT,
  marca TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reglas de exclusión para el cálculo de comisiones
CREATE TABLE distrimm_comisiones_exclusiones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('marca', 'producto')),
  valor TEXT NOT NULL,
  descripcion TEXT,
  motivo TEXT,
  activa BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice único para evitar duplicados activos
CREATE UNIQUE INDEX idx_exclusiones_tipo_valor
  ON distrimm_comisiones_exclusiones(tipo, valor)
  WHERE activa = TRUE;

-- Índice para búsqueda por carga_id en ventas
CREATE INDEX idx_comisiones_ventas_carga_id
  ON distrimm_comisiones_ventas(carga_id);

-- Índice para búsqueda por producto_codigo en ventas
CREATE INDEX idx_comisiones_ventas_producto
  ON distrimm_comisiones_ventas(producto_codigo);

-- ============================================================================
-- 2. ROW LEVEL SECURITY (permissive, authenticated)
-- ============================================================================

ALTER TABLE distrimm_comisiones_cargas ENABLE ROW LEVEL SECURITY;
ALTER TABLE distrimm_comisiones_ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE distrimm_productos_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE distrimm_comisiones_exclusiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can do everything on distrimm_comisiones_cargas"
  ON distrimm_comisiones_cargas FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything on distrimm_comisiones_ventas"
  ON distrimm_comisiones_ventas FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything on distrimm_productos_catalogo"
  ON distrimm_productos_catalogo FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything on distrimm_comisiones_exclusiones"
  ON distrimm_comisiones_exclusiones FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- 3. RPC: Cálculo de comisiones por vendedor
-- ============================================================================

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
          JOIN distrimm_productos_catalogo p
            ON normalize_brand(p.marca) = normalize_brand(ea.valor)
           AND ea.tipo = 'marca'
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
    SUM(ve.valor_total)::NUMERIC AS total_ventas,
    SUM(ve.costo)::NUMERIC AS total_costo,
    SUM(CASE WHEN ve.excluido THEN ve.valor_total ELSE 0 END)::NUMERIC AS ventas_excluidas,
    SUM(CASE WHEN NOT ve.excluido THEN ve.valor_total ELSE 0 END)::NUMERIC AS ventas_comisionables,
    SUM(CASE WHEN NOT ve.excluido THEN ve.costo ELSE 0 END)::NUMERIC AS costo_comisionable,
    SUM(CASE WHEN NOT ve.excluido THEN ve.valor_total - ve.costo ELSE 0 END)::NUMERIC AS margen_comisionable,
    CASE
      WHEN SUM(CASE WHEN NOT ve.excluido THEN ve.valor_total ELSE 0 END) > 0
      THEN (SUM(CASE WHEN NOT ve.excluido THEN ve.valor_total - ve.costo ELSE 0 END) /
            SUM(CASE WHEN NOT ve.excluido THEN ve.valor_total ELSE 0 END) * 100)::NUMERIC
      ELSE 0
    END AS margen_pct,
    COUNT(*)::INTEGER AS items_total,
    SUM(CASE WHEN ve.excluido THEN 1 ELSE 0 END)::INTEGER AS items_excluidos,
    SUM(CASE WHEN NOT ve.excluido THEN 1 ELSE 0 END)::INTEGER AS items_comisionables
  FROM ventas_con_exclusion ve
  GROUP BY ve.vendedor_codigo, ve.vendedor_nombre
  ORDER BY ventas_comisionables DESC;
END;
$$;
