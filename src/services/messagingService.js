/**
 * @fileoverview Messaging Service
 * Handles WhatsApp messaging via n8n webhook, template management,
 * and message logging through Supabase.
 * @module services/messagingService
 */

import { supabase } from "../lib/supabase";
import { COLOMBIA_OFFSET, DAILY_LIMIT } from "../constants";

// ============================================================================
// ANTI-BAN: HORARIO & RATE LIMITING (Frontend side)
// ============================================================================

/**
 * Gets current hour in Colombia timezone.
 * @returns {number} Hour 0-23
 */
export const getColombiaHour = () => {
  const now = new Date();
  const utcH = now.getUTCHours();
  return (utcH + COLOMBIA_OFFSET + 24) % 24;
};

/**
 * Checks if sending is allowed based on Colombia business hours (7am-9pm).
 * @returns {{ allowed: boolean, reason: string|null, hour: number }}
 */
export const checkSendingHours = () => {
  const hour = getColombiaHour();
  if (hour >= 21 || hour < 7) {
    return {
      allowed: false,
      reason: `Fuera de horario (${hour}:00). Solo se envía entre 7am y 9pm hora Colombia.`,
      hour,
    };
  }
  return { allowed: true, reason: null, hour };
};

/**
 * Checks daily send count from log to enforce rate limits.
 * @returns {{ allowed: boolean, sent: number, limit: number }}
 */
export const checkDailyLimit = async () => {
  try {
    // Use Colombia timezone (UTC-5) to determine "today"
    const now = new Date();
    const colombiaTime = new Date(now.getTime() + (now.getTimezoneOffset() + COLOMBIA_OFFSET * 60) * 60000);
    colombiaTime.setHours(0, 0, 0, 0);
    // Convert back to UTC for the database query
    const todayStartUTC = new Date(colombiaTime.getTime() - (now.getTimezoneOffset() + COLOMBIA_OFFSET * 60) * 60000);
    const { count, error } = await supabase
      .from("distrimm_mensajes_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStartUTC.toISOString());

    if (error) throw error;
    return {
      allowed: (count || 0) < DAILY_LIMIT,
      sent: count || 0,
      limit: DAILY_LIMIT,
    };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[messagingService] Error checking daily limit:", error);
    // Fail closed — if we can't verify the limit, block sending for safety
    return { allowed: false, reason: "Error verificando límite diario", count: 0, error };
  }
};

// ============================================================================
// PHONE NORMALIZATION (Colombian numbers)
// ============================================================================

/**
 * Normalizes a Colombian phone number for WhatsApp.
 * Strips non-digits, handles 10-digit (prefix 57), validates result.
 * @param {string} raw - Raw phone input
 * @returns {{ phone: string|null, valid: boolean, original: string }}
 */
export const normalizePhone = (raw) => {
  if (!raw) return { phone: null, valid: false, original: raw };

  // Strip everything except digits
  let digits = String(raw).replace(/\D/g, "");

  // Handle Colombian formats:
  // 10 digits starting with 3 -> mobile, prefix 57
  // 12 digits starting with 57 -> already prefixed
  // 7-8 digits -> landline (not WhatsApp capable)
  if (digits.length === 10 && digits.startsWith("3")) {
    digits = "57" + digits;
  } else if (digits.length === 11 && digits.startsWith("57")) {
    // Missing one digit? Unlikely but handle
    return { phone: null, valid: false, original: raw };
  } else if (digits.length === 12 && digits.startsWith("57")) {
    // Already correct format
  } else {
    return { phone: null, valid: false, original: raw };
  }

  // Final validation: must be 12 digits starting with 573
  const valid = digits.length === 12 && digits.startsWith("573");
  return { phone: valid ? digits : null, valid, original: raw };
};

/**
 * Resolves the best phone number for a client.
 * Priority: celular > telefono_1 > cartera telefono
 * @param {object} client - Client data with possible phone fields
 * @returns {{ phone: string|null, valid: boolean, source: string }}
 */
export const resolveClientPhone = (client) => {
  // Try celular first (best for WhatsApp)
  const sources = [
    { field: "celular", label: "celular" },
    { field: "telefono_1", label: "telefono_1" },
    { field: "telefono", label: "cartera" },
  ];

  for (const { field, label } of sources) {
    const raw = client?.[field];
    if (raw) {
      const result = normalizePhone(raw);
      if (result.valid) {
        return { ...result, source: label };
      }
    }
  }

  return { phone: null, valid: false, source: "ninguno", original: null };
};

// ============================================================================
// TEMPLATE RENDERING
// ============================================================================

/**
 * Renders a template by replacing {{variable}} placeholders.
 * @param {string} template - Template content with {{var}} placeholders
 * @param {object} variables - Key-value pairs for replacement
 * @returns {string} Rendered message
 */
export const renderTemplate = (template, variables = {}) => {
  if (!template) return "";
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
};

/**
 * Builds invoice detail text for recordatorio templates.
 * @param {object[]} items - Invoice items
 * @returns {{ detalle_facturas: string, total: string }}
 */
export const buildInvoiceDetail = (items = []) => {
  const formatter = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });

  const totalSum = items.reduce(
    (sum, inv) => sum + (Number(inv.valor_saldo) || 0),
    0,
  );

  const detalle = items
    .map((inv) => {
      const val = formatter.format(inv.valor_saldo || 0);
      const doc = inv.nro_factura || inv.documento_id || "S/N";
      const vence = inv.fecha_vencimiento || "N/A";
      return `• *Factura ${doc}* | Vence: ${vence} | ${val}`;
    })
    .join("\n");

  return {
    detalle_facturas: detalle || "Sin facturas pendientes.",
    total: formatter.format(totalSum),
  };
};

// ============================================================================
// WHATSAPP SEND (via n8n webhook)
// ============================================================================

/**
 * Sends a WhatsApp message via n8n webhook.
 * @param {{ phone: string, message: string, clientName: string, tipo: string }} payload
 * @returns {{ success: boolean, error: string|null }}
 */
export const sendWhatsAppMessage = async ({
  phone,
  message,
  clientName,
  tipo = "recordatorio",
}) => {
  try {
    const { data, error } = await supabase.functions.invoke(
      "proxy-n8n-whatsapp",
      { body: { phone, message, clientName, tipo } },
    );

    if (error) throw error;
    return { success: true, data, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[messagingService] Error sending WhatsApp:", err);
    return { success: false, data: null, error: err.message };
  }
};

// ============================================================================
// TEMPLATE CRUD (Supabase)
// ============================================================================

/**
 * Fetches all active message templates, optionally filtered by type.
 * @param {string} [tipo] - Filter by 'recordatorio', 'promocional', 'personalizado'
 * @returns {{ data: object[]|null, error: object|null }}
 */
export const getTemplates = async (tipo) => {
  try {
    let query = supabase
      .from("distrimm_plantillas_mensajes")
      .select("*")
      .eq("activa", true)
      .order("created_at", { ascending: true });

    if (tipo) {
      query = query.eq("tipo", tipo);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[messagingService] Error fetching templates:", err);
    return { data: null, error: err };
  }
};

/**
 * Creates or updates a message template.
 * @param {object} template - Template data
 * @returns {{ data: object|null, error: object|null }}
 */
export const saveTemplate = async (template) => {
  try {
    const payload = {
      nombre: template.nombre,
      tipo: template.tipo,
      contenido: template.contenido,
      variables: template.variables || [],
      activa: template.activa !== false,
      updated_at: new Date().toISOString(),
    };

    let query;
    if (template.id) {
      query = supabase
        .from("distrimm_plantillas_mensajes")
        .update(payload)
        .eq("id", template.id)
        .select()
        .single();
    } else {
      query = supabase
        .from("distrimm_plantillas_mensajes")
        .insert(payload)
        .select()
        .single();
    }

    const { data, error } = await query;
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[messagingService] Error saving template:", err);
    return { data: null, error: err };
  }
};

/**
 * Soft-deletes a template (sets activa = false).
 * @param {string} id - Template UUID
 */
export const deleteTemplate = async (id) => {
  try {
    const { error } = await supabase
      .from("distrimm_plantillas_mensajes")
      .update({ activa: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[messagingService] Error deleting template:", err);
    return { success: false, error: err };
  }
};

// ============================================================================
// MESSAGE LOG (Supabase)
// ============================================================================

/**
 * Logs a message send attempt.
 * @param {object} entry - Log entry data
 * @returns {{ data: object|null, error: object|null }}
 */
export const logMessage = async (entry) => {
  try {
    const { data, error } = await supabase
      .from("distrimm_mensajes_log")
      .insert({
        tipo: entry.tipo,
        destinatario_nombre: entry.destinatarioNombre,
        destinatario_telefono: entry.destinatarioTelefono,
        destinatario_nit: entry.destinatarioNit,
        plantilla_id: entry.plantillaId || null,
        mensaje_renderizado: entry.mensajeRenderizado,
        estado: entry.estado || "pendiente",
        error_detalle: entry.errorDetalle || null,
        facturas_ids: entry.facturasIds || [],
      })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[messagingService] Error logging message:", err);
    return { data: null, error: err };
  }
};

/**
 * Updates a message log entry status.
 * @param {string} id - Log entry UUID
 * @param {string} estado - New status: 'enviado' | 'fallido'
 * @param {string} [errorDetalle] - Error details if failed
 */
export const updateLogStatus = async (id, estado, errorDetalle = null) => {
  try {
    const { error } = await supabase
      .from("distrimm_mensajes_log")
      .update({ estado, error_detalle: errorDetalle })
      .eq("id", id);
    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[messagingService] Error updating log:", err);
    return { success: false, error: err };
  }
};

/**
 * Fetches message log entries with optional filters.
 * @param {{ tipo?: string, estado?: string, limit?: number, offset?: number }} filters
 * @returns {{ data: object[]|null, count: number, error: object|null }}
 */
export const getMessageLog = async (filters = {}) => {
  try {
    let query = supabase
      .from("distrimm_mensajes_log")
      .select("*, distrimm_plantillas_mensajes(nombre)", { count: "exact" })
      .order("created_at", { ascending: false });

    if (filters.tipo) query = query.eq("tipo", filters.tipo);
    if (filters.estado) query = query.eq("estado", filters.estado);
    if (filters.limit) query = query.limit(filters.limit);
    if (filters.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);

    const { data, count, error } = await query;
    if (error) throw error;
    return { data, count, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[messagingService] Error fetching message log:", err);
    return { data: null, count: 0, error: err };
  }
};

// ============================================================================
// CLIENT PHONE RESOLUTION (Supabase query)
// ============================================================================

/**
 * Fetches phone data for clients by their NITs from distrimm_clientes.
 * @param {string[]} nits - Array of tercero_nit values
 * @returns {{ data: object|null, error: object|null }}
 * Returns a map: { [nit]: { celular, telefono_1, nombre_completo } }
 */
export const getClientPhones = async (nits) => {
  if (!nits || nits.length === 0) return { data: {}, error: null };

  try {
    const { data, error } = await supabase
      .from("distrimm_clientes")
      .select("no_identif, celular, telefono_1, nombre_completo, municipio")
      .in("no_identif", nits);

    if (error) throw error;

    // Build lookup map
    const phoneMap = {};
    (data || []).forEach((c) => {
      phoneMap[c.no_identif] = c;
    });

    return { data: phoneMap, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[messagingService] Error fetching client phones:", err);
    return { data: null, error: err };
  }
};

// ============================================================================
// LOTE (BATCH) OPERATIONS
// ============================================================================

/**
 * Fetches filtered clients with cartera data via the database RPC function.
 * @param {object} filters
 * @param {string} filters.cargaId - UUID of the active carga
 * @param {string} [filters.tipoFiltro='morosos'] - 'morosos' | 'por_vencer' | 'todos'
 * @param {number} [filters.diasMoraMin=1] - Minimum days overdue
 * @param {number} [filters.diasVencerMax=30] - Maximum days until due
 * @param {number} [filters.montoMin=0] - Minimum balance
 * @param {number} [filters.montoMax=999999999] - Maximum balance
 * @returns {{ data: object[]|null, error: object|null }}
 */
export async function getClientesCarteraFiltrados(filters = {}) {
  try {
    const { data, error } = await supabase.rpc("fn_clientes_cartera_filtrados", {
      p_carga_id: filters.cargaId,
      p_tipo_filtro: filters.tipoFiltro || "morosos",
      p_dias_mora_min: filters.diasMoraMin ?? 1,
      p_dias_vencer_max: filters.diasVencerMax ?? 30,
      p_monto_min: filters.montoMin ?? 0,
      p_monto_max: filters.montoMax ?? 999999999,
    });

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[messagingService] Error fetching filtered clients:", err);
    return { data: null, error: err };
  }
}

/**
 * Creates a lote (batch) header and inserts its destinatarios (detail rows).
 * Inserts the lote first, then batch-inserts all destinatario records linked to it.
 * @param {object} lote - Lote header data
 * @param {string} lote.tipo - 'morosos' | 'por_vencer' | 'promocional' | 'personalizado'
 * @param {string} lote.mensaje_plantilla - Template message text
 * @param {string} [lote.plantilla_id] - UUID of the template used
 * @param {object} [lote.filtros_aplicados] - JSON object of filters used
 * @param {object[]} destinatarios - Array of recipient records
 * @param {string} destinatarios[].cliente_nombre
 * @param {string} destinatarios[].cliente_nit
 * @param {string} destinatarios[].telefono
 * @param {string} destinatarios[].mensaje_personalizado
 * @param {string[]} [destinatarios[].facturas_ids]
 * @returns {{ data: { lote: object, detalle: object[] }|null, error: object|null }}
 */
export async function createLote(lote, destinatarios = []) {
  try {
    const { data: loteRow, error: loteError } = await supabase
      .from("distrimm_recordatorios_lote")
      .insert({
        tipo: lote.tipo,
        mensaje_plantilla: lote.mensaje_plantilla,
        plantilla_id: lote.plantilla_id || null,
        filtros_aplicados: lote.filtros_aplicados || {},
        total_destinatarios: destinatarios.length,
        enviados: 0,
        fallidos: 0,
        estado: "pendiente",
      })
      .select()
      .single();

    if (loteError) throw loteError;

    const detalleRows = destinatarios.map((d) => ({
      lote_id: loteRow.id,
      cliente_nombre: d.cliente_nombre,
      cliente_nit: d.cliente_nit,
      telefono: d.telefono,
      mensaje_personalizado: d.mensaje_personalizado,
      estado_envio: "pendiente",
      facturas_ids: d.facturas_ids || [],
    }));

    const { data: detalle, error: detalleError } = await supabase
      .from("distrimm_recordatorios_detalle")
      .insert(detalleRows)
      .select();

    if (detalleError) {
      // Cleanup orphaned lote to keep operation atomic
      await supabase
        .from("distrimm_recordatorios_lote")
        .delete()
        .eq("id", loteRow.id);
      throw detalleError;
    }

    return { data: { lote: loteRow, detalle }, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[messagingService] Error creating lote:", err);
    return { data: null, error: err };
  }
}

/**
 * Fetches lotes ordered by most recent first.
 * @param {number} [limit=20] - Maximum number of lotes to return
 * @returns {{ data: object[]|null, error: object|null }}
 */
export async function getLotes(limit = 20) {
  try {
    const { data, error } = await supabase
      .from("distrimm_recordatorios_lote")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[messagingService] Error fetching lotes:", err);
    return { data: null, error: err };
  }
}

/**
 * Fetches all detalle (recipient) records for a given lote.
 * @param {string} loteId - UUID of the lote
 * @returns {{ data: object[]|null, error: object|null }}
 */
export async function getLoteDetalle(loteId) {
  try {
    const { data, error } = await supabase
      .from("distrimm_recordatorios_detalle")
      .select("*")
      .eq("lote_id", loteId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[messagingService] Error fetching lote detalle:", err);
    return { data: null, error: err };
  }
}

/**
 * Fetches a single lote by its ID.
 * @param {string} loteId - UUID of the lote
 * @returns {{ data: object|null, error: object|null }}
 */
export async function getLoteById(loteId) {
  try {
    const { data, error } = await supabase
      .from("distrimm_recordatorios_lote")
      .select("*")
      .eq("id", loteId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[messagingService] Error fetching lote by ID:", err);
    return { data: null, error: err };
  }
}

/**
 * Triggers lote processing by sending all recipients to the n8n webhook.
 * n8n uses Split in Batches to loop through each item.
 * @param {string} loteId - UUID of the lote (for tracking)
 * @param {object[]} destinatarios - Array of { cliente_nombre, cliente_nit, telefono, mensaje_personalizado, detalle_id }
 * @returns {{ success: boolean, data: object|null, error: string|null }}
 */
export async function triggerLoteProcessing(loteId, destinatarios = []) {
  try {
    // Build the array of items that n8n will iterate with Split in Batches
    const items = destinatarios.map((d) => ({
      phone: d.telefono,
      message: d.mensaje_personalizado,
      clientName: d.cliente_nombre,
      tipo: "recordatorio",
      detalle_id: d.detalle_id || null,
      lote_id: loteId,
    }));

    const { data, error } = await supabase.functions.invoke(
      "proxy-n8n-whatsapp",
      { body: items },
    );

    if (error) throw error;
    return { success: true, data, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[messagingService] Error triggering lote processing:", err);
    return { success: false, data: null, error: err.message };
  }
}

/**
 * Retries failed messages in a lote.
 * Resets all failed detalle records back to 'pendiente', updates the lote
 * estado to 'en_proceso', and triggers processing again.
 * @param {string} loteId - UUID of the lote
 * @returns {{ success: boolean, retriedCount: number, error: string|null }}
 */
export async function retryLoteFailed(loteId) {
  try {
    const { data: failedRows, error: fetchError } = await supabase
      .from("distrimm_recordatorios_detalle")
      .select("id, cliente_nombre, cliente_nit, telefono, mensaje_personalizado")
      .eq("lote_id", loteId)
      .eq("estado_envio", "fallido");

    if (fetchError) throw fetchError;

    if (!failedRows || failedRows.length === 0) {
      return { success: true, retriedCount: 0, error: null };
    }

    const failedIds = failedRows.map((r) => r.id);

    const { error: resetError } = await supabase
      .from("distrimm_recordatorios_detalle")
      .update({ estado_envio: "pendiente", error_detalle: null })
      .in("id", failedIds);

    if (resetError) throw resetError;

    const { error: loteError } = await supabase
      .from("distrimm_recordatorios_lote")
      .update({ estado: "en_proceso", updated_at: new Date().toISOString() })
      .eq("id", loteId);

    if (loteError) throw loteError;

    // Send the failed rows as array to n8n for retry
    const destinatarios = failedRows.map((r) => ({
      cliente_nombre: r.cliente_nombre,
      cliente_nit: r.cliente_nit,
      telefono: r.telefono,
      mensaje_personalizado: r.mensaje_personalizado,
      detalle_id: r.id,
    }));

    const triggerResult = await triggerLoteProcessing(loteId, destinatarios);
    if (!triggerResult.success) {
      throw new Error(triggerResult.error);
    }

    return { success: true, retriedCount: failedIds.length, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[messagingService] Error retrying lote failed:", err);
    return { success: false, retriedCount: 0, error: err.message };
  }
}

/**
 * Cancels a lote by setting its estado to 'cancelado'.
 * @param {string} loteId - UUID of the lote
 * @returns {{ success: boolean, error: object|null }}
 */
export async function cancelLote(loteId) {
  try {
    const { error } = await supabase
      .from("distrimm_recordatorios_lote")
      .update({ estado: "cancelado", updated_at: new Date().toISOString() })
      .eq("id", loteId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[messagingService] Error cancelling lote:", err);
    return { success: false, error: err };
  }
}
