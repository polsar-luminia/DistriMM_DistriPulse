-- =============================================================================
-- Módulo: Comisiones — Snapshots de Liquidación
-- Descripción: Almacena el estado completo de una liquidación de comisiones
--              para un periodo (año/mes), incluyendo referencias a cargas,
--              presupuestos, y el resultado calculado (liquidación + resumen).
-- Tabla: distrimm_comisiones_snapshots
-- =============================================================================

-- ---------------------------------------------------------------------------
-- distrimm_comisiones_snapshots
-- Un snapshot por periodo. Contiene el hash de los inputs para detectar
-- cambios y evitar recalcular si nada ha cambiado.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS distrimm_comisiones_snapshots (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at                timestamptz NOT NULL DEFAULT timezone('utc', now()),
  periodo_year              integer     NOT NULL,
  periodo_month             integer     NOT NULL,
  carga_ids                 jsonb       NOT NULL DEFAULT '[]',
  total_ventas_count        integer     NOT NULL DEFAULT 0,
  total_recaudos_count      integer     NOT NULL DEFAULT 0,
  liquidacion               jsonb       NOT NULL DEFAULT '[]',
  resumen                   jsonb       NOT NULL DEFAULT '{}',
  presupuestos_marca_ids    jsonb       NOT NULL DEFAULT '[]',
  presupuestos_recaudo_ids  jsonb       NOT NULL DEFAULT '[]',
  input_hash                text        NOT NULL DEFAULT '',
  totales_ventas            jsonb       NOT NULL DEFAULT '{}',

  UNIQUE (periodo_year, periodo_month)
);

-- RLS
ALTER TABLE distrimm_comisiones_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados pueden ver snapshots"
  ON distrimm_comisiones_snapshots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuarios autenticados pueden crear snapshots"
  ON distrimm_comisiones_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar snapshots"
  ON distrimm_comisiones_snapshots FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden eliminar snapshots"
  ON distrimm_comisiones_snapshots FOR DELETE
  TO authenticated
  USING (true);
