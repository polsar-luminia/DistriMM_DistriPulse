-- DistriMM: Soporte devoluciones (DV) en comisiones_ventas
-- Run in Supabase SQL editor: Dashboard → SQL Editor → New query

-- 1. Agregar columna tipo a ventas
ALTER TABLE distrimm_comisiones_ventas
  ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'VE';

-- 2. Comentario de documentación
COMMENT ON COLUMN distrimm_comisiones_ventas.tipo
  IS 'Tipo de movimiento: VE=Venta, DV=Devolución. Los montos de DV ya vienen con signo negativo desde el ETL.';
