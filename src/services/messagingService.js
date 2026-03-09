import { supabase } from "../lib/supabase";
import { COLOMBIA_OFFSET, DAILY_LIMIT } from "../constants";

export const getColombiaHour = () => {
  const now = new Date();
  const utcH = now.getUTCHours();
  return (utcH + COLOMBIA_OFFSET + 24) % 24;
};

// Only allow sending between 7am-9pm Colombia time

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

// Normalizes a Colombian phone number for WhatsApp (Meta Cloud API format: 57XXXXXXXXXX)

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

// Priority: celular > telefono_1 > cartera telefono

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

export const renderTemplate = (template, variables = {}) => {
  if (!template) return "";
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
};

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

// Returns a map: { [nit]: { celular, telefono_1, nombre_completo } }

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

// n8n uses Split in Batches to loop through each item

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
