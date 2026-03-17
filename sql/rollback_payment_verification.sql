-- =====================================================
-- ROLLBACK: ELIMINAR PROCESO DE VERIFICACIÓN DE PAGOS
-- =====================================================

-- 1. Eliminar todas las variantes de la función de verificación (RPC)
DROP FUNCTION IF EXISTS public.verify_distrimm_payment_v4(jsonb);
DROP FUNCTION IF EXISTS public.verify_distrimm_payment(uuid, text);
DROP FUNCTION IF EXISTS public.verify_distrimm_payment(text, uuid);
DROP FUNCTION IF EXISTS public.verify_distrimm_payment(p_report_id uuid, p_status text);
DROP FUNCTION IF EXISTS public.process_payment_report(uuid, text);
DROP FUNCTION IF EXISTS public.process_payment_report(text, uuid);
DROP FUNCTION IF EXISTS public.process_payment_report(report_id uuid, new_status text);
DROP FUNCTION IF EXISTS public.process_payment_report(new_status text, report_id uuid);

-- 2. (Opcional) Si también quieres eliminar la tabla de reportes, descomenta esto:
-- DROP TABLE IF EXISTS public.reportes_pago CASCADE;

-- 3. Limpiar caché de funciones
NOTIFY pgrst, 'reload schema';
