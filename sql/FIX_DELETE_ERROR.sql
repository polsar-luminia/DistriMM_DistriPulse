-- FIX: Agregar borrado en cascada para reportes de pago
-- Esto permite eliminar facturas (o cargas completas) sin que bloquee el historial de recordatorios.

-- 1. Eliminar la restricción actual (que bloquea el borrado)
ALTER TABLE reportes_pago
DROP CONSTRAINT IF EXISTS reportes_pago_invoice_id_fkey;

-- 2. Volver a crearla con ON DELETE CASCADE
ALTER TABLE reportes_pago
ADD CONSTRAINT reportes_pago_invoice_id_fkey
FOREIGN KEY (invoice_id)
REFERENCES distrimm_cartera_items (id)
ON DELETE CASCADE;

-- Verificación opcional (solo informativo)
COMMENT ON CONSTRAINT reportes_pago_invoice_id_fkey ON reportes_pago IS 'Permite borrar facturas eliminando automáticamente sus reportes asociados';
