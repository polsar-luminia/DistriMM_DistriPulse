import { supabase } from "../lib/supabase";

/**
 * Registra una acción de usuario en distrimm_audit_log.
 * Fire-and-forget: no bloquea el flujo si falla.
 *
 * @param {string} action - Acción (UPLOAD_VENTAS, GENERAR_LIQUIDACION, etc.)
 * @param {string} tableName - Entidad o módulo afectado
 * @param {string} [recordId] - ID del registro afectado (carga_id, periodo, etc.)
 * @param {object} [detalle] - Contexto adicional (JSONB)
 */
export async function logAudit(action, tableName, recordId, detalle) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from("distrimm_audit_log").insert({
      user_id: user?.id || null,
      action,
      table_name: tableName,
      record_id: recordId || null,
      new_data: detalle || null,
    });
  } catch {
    // Fire-and-forget: nunca bloquear el flujo principal
  }
}
