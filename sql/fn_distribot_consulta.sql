-- ============================================================================
-- fn_distribot_consulta — herramienta SQL del chatbot DistriBot (ampliada)
--
-- Reemplaza el alcance de fn_distribot_consulta_cartera (solo cartera) para
-- que el bot consulte también ventas, inventario y comisiones.
--
-- Guardas (defensa en profundidad, alineado con buenas prácticas de agentes SQL):
--   1. Solo SELECT / WITH.
--   2. default_transaction_read_only = on  → guard determinista a nivel de motor
--      (aunque el modelo alucine un INSERT/UPDATE, el motor lo rechaza).
--   3. Bloqueo de palabras DML/DDL con límites de palabra \y (evita falsos
--      positivos como "created_at" que contiene "create").
--   4. Allowlist: la consulta debe referenciar una relación analítica permitida.
--   5. Denylist: bloquea relaciones sensibles (credenciales, auth, chat, etc.).
--
-- REGLA DE DEDUP: para agregados de ventas/márgenes usar distrimm_ventas_vigentes
-- (deduplicada). distrimm_comisiones_ventas solo con un carga_id específico.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_distribot_consulta(consulta_sql text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  resultado json;
  q text;
BEGIN
  q := lower(rtrim(trim(consulta_sql), ';'));

  IF NOT (q LIKE 'select%' OR q LIKE 'with%') THEN
    RAISE EXCEPTION 'Solo se permiten consultas SELECT o CTE (WITH)';
  END IF;

  -- Bloqueo DML/DDL con límites de palabra (no marca identificadores como created_at)
  IF q ~ '\y(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|merge|call|do|vacuum|analyze)\y' THEN
    RAISE EXCEPTION 'Consulta no permitida';
  END IF;

  -- Debe referenciar al menos una relación permitida
  IF NOT (q ~ '(distrimm_cartera_ultima|distrimm_cartera_historico|distrimm_cartera_items|distrimm_ventas_vigentes|distrimm_comisiones_ventas|distrimm_inventario_items|distrimm_inventario_cargas|distrimm_productos_catalogo|distrimm_comisiones_exclusiones|distrimm_comisiones_cargas)') THEN
    RAISE EXCEPTION 'La consulta debe referenciar una vista/tabla permitida (cartera, ventas, inventario o comisiones)';
  END IF;

  -- Denylist de relaciones sensibles
  IF q ~ '(whatsapp|credential|secret|token|auth\.|pg_catalog|pg_class|pg_proc|information_schema|distrimm_chat|distrimm_cfo|distrimm_vendedores|distrimm_recordatorios|distrimm_mensajes|distrimm_plantillas|distrimm_whatsapp)' THEN
    RAISE EXCEPTION 'Consulta no permitida (relación restringida)';
  END IF;

  -- Guard determinista: nada podrá escribir en esta transacción
  SET LOCAL default_transaction_read_only = on;

  EXECUTE 'SELECT json_agg(t) FROM (' || consulta_sql || ') t' INTO resultado;
  IF resultado IS NULL THEN
    resultado := '[]'::json;
  END IF;
  RETURN resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_distribot_consulta(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_distribot_consulta(text) TO service_role;
