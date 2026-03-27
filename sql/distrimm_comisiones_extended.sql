-- =============================================================================
-- Módulo: Comisiones — Recaudo y Presupuestos
-- Descripción: Tablas extendidas del módulo de comisiones para cargas de
--              recaudo, líneas de recaudo, presupuestos de recaudo por tramos
--              y presupuestos por marca con porcentaje de comisión.
-- Tablas: distrimm_comisiones_cargas_recaudo, distrimm_comisiones_recaudos,
--          distrimm_comisiones_presupuestos_recaudo,
--          distrimm_comisiones_presupuestos_marca
-- =============================================================================

-- ---------------------------------------------------------------------------
-- distrimm_comisiones_cargas_recaudo
-- Cabecera de cada carga (archivo Excel) de recaudo subida al sistema.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS distrimm_comisiones_cargas_recaudo (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_archivo          text        NOT NULL,
  fecha_periodo           date,
  vendedor_codigo         text,
  total_registros         integer     DEFAULT 0,
  total_recaudado         numeric     DEFAULT 0,
  total_comisionable      numeric     DEFAULT 0,
  registros_excluidos_mora integer    DEFAULT 0,
  total_iva          NUMERIC     DEFAULT 0,
  created_at              timestamptz DEFAULT timezone('utc', now())
);

-- RLS
ALTER TABLE distrimm_comisiones_cargas_recaudo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados pueden ver cargas de recaudo"
  ON distrimm_comisiones_cargas_recaudo FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuarios autenticados pueden crear cargas de recaudo"
  ON distrimm_comisiones_cargas_recaudo FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar cargas de recaudo"
  ON distrimm_comisiones_cargas_recaudo FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden eliminar cargas de recaudo"
  ON distrimm_comisiones_cargas_recaudo FOR DELETE
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- distrimm_comisiones_recaudos
-- Líneas individuales de recaudo asociadas a una carga.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS distrimm_comisiones_recaudos (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  carga_id         uuid        REFERENCES distrimm_comisiones_cargas_recaudo(id) ON DELETE CASCADE,
  vendedor_codigo  text        NOT NULL,
  cliente_nit      text,
  cliente_nombre   text,
  factura          text,
  comprobante      text,
  fecha_abono      date,
  fecha_cxc        date,
  fecha_vence      date,
  valor_recaudo    numeric     DEFAULT 0,
  valor_excluido_marca NUMERIC DEFAULT 0,
  valor_iva          NUMERIC     DEFAULT 0,
  dias_mora        integer     DEFAULT 0,
  aplica_comision  boolean     DEFAULT true,
  periodo_year     integer,
  periodo_month    integer,
  created_at       timestamptz DEFAULT timezone('utc', now())
);

-- RLS
ALTER TABLE distrimm_comisiones_recaudos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados pueden ver recaudos"
  ON distrimm_comisiones_recaudos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuarios autenticados pueden crear recaudos"
  ON distrimm_comisiones_recaudos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar recaudos"
  ON distrimm_comisiones_recaudos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden eliminar recaudos"
  ON distrimm_comisiones_recaudos FOR DELETE
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- distrimm_comisiones_presupuestos_recaudo
-- Metas y tramos de comisión por recaudo para cada vendedor/periodo.
-- Hasta 5 tramos escalonados (tramo1..tramo5).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS distrimm_comisiones_presupuestos_recaudo (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_codigo  text        NOT NULL,
  periodo_year     integer     NOT NULL,
  periodo_month    integer     NOT NULL,
  meta_recaudo     numeric     NOT NULL DEFAULT 0,
  tramo1_min       numeric     DEFAULT 0,
  tramo1_max       numeric,
  tramo1_pct       numeric     DEFAULT 0,
  tramo2_min       numeric,
  tramo2_max       numeric,
  tramo2_pct       numeric     DEFAULT 0,
  tramo3_min       numeric,
  tramo3_max       numeric,
  tramo3_pct       numeric     DEFAULT 0,
  tramo4_min       numeric,
  tramo4_max       numeric,
  tramo4_pct       numeric     DEFAULT 0,
  tramo5_min       numeric,
  tramo5_max       numeric,
  tramo5_pct       numeric     DEFAULT 0,
  activo           boolean     DEFAULT true,
  created_at       timestamptz DEFAULT timezone('utc', now()),
  updated_at       timestamptz DEFAULT timezone('utc', now()),

  UNIQUE (vendedor_codigo, periodo_year, periodo_month)
);

-- RLS
ALTER TABLE distrimm_comisiones_presupuestos_recaudo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados pueden ver presupuestos de recaudo"
  ON distrimm_comisiones_presupuestos_recaudo FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuarios autenticados pueden crear presupuestos de recaudo"
  ON distrimm_comisiones_presupuestos_recaudo FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar presupuestos de recaudo"
  ON distrimm_comisiones_presupuestos_recaudo FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden eliminar presupuestos de recaudo"
  ON distrimm_comisiones_presupuestos_recaudo FOR DELETE
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- distrimm_comisiones_presupuestos_marca
-- Porcentaje de comisión y meta de ventas por marca/vendedor/periodo.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS distrimm_comisiones_presupuestos_marca (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_codigo  text        NOT NULL,
  marca            text        NOT NULL,
  periodo_year     integer     NOT NULL,
  periodo_month    integer     NOT NULL,
  pct_comision     numeric     NOT NULL DEFAULT 0,
  meta_ventas      numeric     DEFAULT 0,
  activo           boolean     DEFAULT true,
  created_at       timestamptz DEFAULT timezone('utc', now()),
  updated_at       timestamptz DEFAULT timezone('utc', now()),
  UNIQUE (vendedor_codigo, marca, periodo_year, periodo_month)
);

-- RLS
ALTER TABLE distrimm_comisiones_presupuestos_marca ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados pueden ver presupuestos por marca"
  ON distrimm_comisiones_presupuestos_marca FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuarios autenticados pueden crear presupuestos por marca"
  ON distrimm_comisiones_presupuestos_marca FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar presupuestos por marca"
  ON distrimm_comisiones_presupuestos_marca FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden eliminar presupuestos por marca"
  ON distrimm_comisiones_presupuestos_marca FOR DELETE
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- distrimm_comisiones_ventas — columna tipo (VE = venta, DV = devolución)
-- La tabla se define en comisiones_schema.sql; aquí solo la extensión.
-- ---------------------------------------------------------------------------
ALTER TABLE distrimm_comisiones_ventas
  ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'VE';
