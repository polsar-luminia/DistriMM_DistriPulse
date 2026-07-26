import { supabase, fetchAllRows } from "../lib/supabase";
import {
  COLOMBIA_OFFSET,
  DAILY_LIMIT,
  CHUNK_SIZE_WHATSAPP,
  CHUNK_DELAY_MS_WHATSAPP,
} from "../constants";

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
    const colombiaTime = new Date(
      now.getTime() + (now.getTimezoneOffset() + COLOMBIA_OFFSET * 60) * 60000,
    );
    colombiaTime.setHours(0, 0, 0, 0);
    // Convert back to UTC for the database query
    const todayStartUTC = new Date(
      colombiaTime.getTime() -
        (now.getTimezoneOffset() + COLOMBIA_OFFSET * 60) * 60000,
    );
    const { count, error } = await supabase
      .from("distrimm_recordatorios_detalle")
      .select("id", { count: "exact", head: true })
      .eq("estado_envio", "enviado")
      .gte("enviado_at", todayStartUTC.toISOString());

    if (error) throw error;
    return {
      allowed: (count || 0) < DAILY_LIMIT,
      sent: count || 0,
      limit: DAILY_LIMIT,
    };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[messagingService] Error checking daily limit:", error);
    // Fail closed — if we can't verify the limit, block sending for safety
    return {
      allowed: false,
      sent: 0,
      limit: DAILY_LIMIT,
      reason: "Error verificando límite diario",
      error,
    };
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

// Priority: celular > telefono_1 > telefono_2 > cartera telefono

export const resolveClientPhone = (client) => {
  const sources = [
    { field: "celular", label: "celular" },
    { field: "telefono_1", label: "telefono_1" },
    { field: "telefono_2", label: "telefono_2" },
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
  const META_PARAM_LIMIT = 900;
  const formatter = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });

  const totalSum = items.reduce(
    (sum, inv) => sum + (Number(inv.valor_saldo) || 0),
    0,
  );

  // Meta Cloud API prohíbe \n y \t en parámetros de template.
  // Usamos " | " como separador entre facturas.
  const lines = items.map((inv) => {
    const val = formatter.format(inv.valor_saldo || 0);
    const doc = inv.nro_factura || inv.documento_id || "S/N";
    const vence = inv.fecha_vencimiento || "N/A";
    return `Fact. ${doc} - ${vence} - ${val}`;
  });

  const SEP = " | ";
  let detalle = "";
  let included = 0;
  for (const line of lines) {
    const remaining = lines.length - included - 1;
    const suffix = remaining > 0 ? `${SEP}+${remaining} mas` : "";
    const candidate = detalle ? detalle + SEP + line : line;
    if (detalle && (candidate + suffix).length > META_PARAM_LIMIT) {
      detalle += `${SEP}+${lines.length - included} mas`;
      break;
    }
    detalle = candidate;
    included++;
  }

  return {
    detalle_facturas: detalle || "Sin facturas pendientes.",
    total: formatter.format(totalSum),
  };
};

// ============================================================================
// WHATSAPP INSTANCE (multi-instance support)
// ============================================================================

/**
 * Gets the active WhatsApp instance for the current user.
 * @returns {{ data: { id: string, phone_number_id: string, phone_display: string } | null, error: object | null }}
 */
export const getActiveInstance = async () => {
  try {
    // Instancia compartida: cualquier usuario autenticado usa la única instancia activa
    // de la organización (decisión de producto — ver commit d20bda7).
    const { data, error } = await supabase
      .from("distrimm_whatsapp_instances")
      .select("id, phone_number_id, phone_display, business_name, status")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    if (import.meta.env.DEV)
      console.error("[messagingService] Error fetching active instance:", err);
    return { data: null, error: err };
  }
};

// ============================================================================
// WHATSAPP SEND (via Edge Function → Meta Cloud API)
// ============================================================================

/**
 * Sends a WhatsApp message via Edge Function (Meta Cloud API).
 * Includes instance_id so the Edge Function can resolve credentials.
 * @param {{ phone: string, message: string, clientName: string, tipo: string, instance_id?: string }} payload
 * @returns {{ success: boolean, error: string|null }}
 */
export const sendWhatsAppMessage = async ({
  phone,
  message,
  clientName,
  tipo = "recordatorio",
  instance_id,
}) => {
  try {
    // If no instance_id provided, try to get it automatically
    let resolvedInstanceId = instance_id;
    if (!resolvedInstanceId) {
      const { data: inst } = await getActiveInstance();
      resolvedInstanceId = inst?.id;
    }

    if (!resolvedInstanceId) {
      return {
        success: false,
        data: null,
        error:
          "No hay instancia de WhatsApp activa. Conecta tu numero primero.",
      };
    }

    const { data, error } = await supabase.functions.invoke(
      "proxy-n8n-whatsapp",
      {
        body: {
          phone,
          message,
          clientName,
          tipo,
          instance_id: resolvedInstanceId,
        },
      },
    );

    if (error) throw error;
    return { success: true, data, error: null };
  } catch (err) {
    if (import.meta.env.DEV)
      console.error("[messagingService] Error sending WhatsApp:", err);
    return { success: false, data: null, error: err };
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
    if (import.meta.env.DEV)
      console.error("[messagingService] Error fetching templates:", err);
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
    if (import.meta.env.DEV)
      console.error("[messagingService] Error saving template:", err);
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
    if (import.meta.env.DEV)
      console.error("[messagingService] Error deleting template:", err);
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
    if (import.meta.env.DEV)
      console.error("[messagingService] Error logging message:", err);
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
    if (import.meta.env.DEV)
      console.error("[messagingService] Error updating log:", err);
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
    if (filters.offset != null) {
      query = query.range(
        filters.offset,
        filters.offset + (filters.limit || 50) - 1,
      );
    } else if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, count, error } = await query;
    if (error) throw error;
    return { data, count, error: null };
  } catch (err) {
    if (import.meta.env.DEV)
      console.error("[messagingService] Error fetching message log:", err);
    return { data: null, count: 0, error: err };
  }
};

// Returns a map: { [nit]: { celular, telefono_1, telefono_2, nombre_completo } }

export const getClientPhones = async (nits) => {
  if (!nits || nits.length === 0) return { data: {}, error: null };

  try {
    const BATCH = 200;
    const allData = [];
    for (let i = 0; i < nits.length; i += BATCH) {
      const { data, error } = await supabase
        .from("distrimm_clientes")
        .select(
          "no_identif, celular, telefono_1, telefono_2, nombre_completo, municipio",
        )
        .in("no_identif", nits.slice(i, i + BATCH));
      if (error) throw error;
      if (data) allData.push(...data);
    }

    const phoneMap = {};
    allData.forEach((c) => {
      phoneMap[c.no_identif] = c;
    });

    return { data: phoneMap, error: null };
  } catch (err) {
    if (import.meta.env.DEV)
      console.error("[messagingService] Error fetching client phones:", err);
    return { data: null, error: err };
  }
};

export async function getClientesCarteraFiltrados(filters = {}) {
  try {
    const { data, error } = await supabase.rpc(
      "fn_clientes_cartera_filtrados",
      {
        p_carga_id: filters.cargaId,
        p_tipo_filtro: filters.tipoFiltro || "morosos",
        p_dias_mora_min: filters.diasMoraMin ?? 1,
        p_dias_vencer_max: filters.diasVencerMax ?? 30,
        p_monto_min: filters.montoMin ?? 0,
        p_monto_max: filters.montoMax ?? 999999999,
      },
    );

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    if (import.meta.env.DEV)
      console.error("[messagingService] Error fetching filtered clients:", err);
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
      template_params:
        d.template_var2 != null
          ? [
              d.cliente_nombre || "Cliente",
              d.template_var2,
              d.template_var3 || "",
            ]
          : null,
    }));

    // Batch insert to avoid PostgREST request size limits
    const DETAIL_BATCH = 100;
    let detalle = [];
    let detalleError = null;
    for (let i = 0; i < detalleRows.length; i += DETAIL_BATCH) {
      const batch = detalleRows.slice(i, i + DETAIL_BATCH);
      const { data: batchData, error: batchErr } = await supabase
        .from("distrimm_recordatorios_detalle")
        .insert(batch)
        .select();
      if (batchErr) {
        detalleError = batchErr;
        break;
      }
      detalle = detalle.concat(batchData || []);
    }

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
    if (import.meta.env.DEV)
      console.error("[messagingService] Error creating lote:", err);
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
    if (import.meta.env.DEV)
      console.error("[messagingService] Error fetching lotes:", err);
    return { data: null, error: err };
  }
}

export async function getLoteDetalle(loteId) {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("distrimm_recordatorios_detalle")
        .select("*")
        .eq("lote_id", loteId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );
    return { data, error: null };
  } catch (err) {
    if (import.meta.env.DEV)
      console.error("[messagingService] Error fetching lote detalle:", err);
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
    if (import.meta.env.DEV)
      console.error("[messagingService] Error fetching lote by ID:", err);
    return { data: null, error: err };
  }
}

// URL base del servicio VPS (Express) que envía SMS vía LabsMobile.
// Ej: https://distrimm.luminiatech.digital/api  (nginx proxya /api -> :3103)
const VPS_API_URL = import.meta.env.VITE_VPS_API_URL;

/**
 * Fallback SMS: envía por LabsMobile (servicio VPS) los destinatarios del lote
 * que NO quedaron 'enviado' (fallido o pendiente). Idempotente: no reenvía a los
 * que ya salieron por WhatsApp. Solo móviles válidos; las fijas se omiten.
 * @param {string} loteId
 * @param {string} smsTipo - 'vencido' (morosos) | 'cobro' (por vencer)
 * @returns {{ enviados: number, fallidos: number, omitidos: number, skipped?: boolean }}
 */
export async function enviarFallbackSms(loteId, smsTipo) {
  if (!VPS_API_URL) {
    if (import.meta.env.DEV)
      console.warn(
        "[messagingService] VITE_VPS_API_URL no configurado; fallback SMS omitido.",
      );
    return { enviados: 0, fallidos: 0, omitidos: 0, skipped: true };
  }

  // 1. Detalle no enviado (fallido = falló WhatsApp; pendiente = no se intentó WhatsApp)
  const { data: rows, error } = await supabase
    .from("distrimm_recordatorios_detalle")
    .select(
      "id, telefono, cliente_nombre, template_params, facturas_ids, estado_envio",
    )
    .eq("lote_id", loteId)
    .in("estado_envio", ["fallido", "pendiente"]);

  if (error) throw error;
  if (!rows || rows.length === 0)
    return { enviados: 0, fallidos: 0, omitidos: 0 };

  // 2. Mapear a items SMS (solo móviles válidos)
  const items = rows
    .map((r) => {
      const norm = normalizePhone(r.telefono);
      if (!norm.valid) return null;
      return {
        detalle_id: r.id,
        telefono: norm.phone,
        cliente_nombre: r.cliente_nombre,
        total: r.template_params?.[2] || "",
        n_facturas: (r.facturas_ids || []).length,
        tipo: smsTipo,
      };
    })
    .filter(Boolean);

  if (items.length === 0)
    return { enviados: 0, fallidos: 0, omitidos: rows.length };

  // 3. Token del usuario para autenticar contra el VPS
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Sesión no válida para enviar SMS");

  // 4. POST al servicio VPS
  const resp = await fetch(`${VPS_API_URL}/sms/enviar-lote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ lote_id: loteId, items }),
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.error || `Error SMS (HTTP ${resp.status})`);
  return json.data || { enviados: 0, fallidos: 0, omitidos: 0 };
}

/**
 * Triggers lote processing by sending all recipients to the Edge Function.
 * La Edge Function hace loop secuencial sobre cada destinatario.
 * @param {string} loteId - UUID of the lote (for tracking)
 * @param {object[]} destinatarios - Array of { cliente_nombre, cliente_nit, telefono, mensaje_personalizado, detalle_id }
 * @param {string} [instanceId] - UUID of the WhatsApp instance. If omitted, resolved automatically.
 * @returns {{ success: boolean, data: object|null, error: string|null }}
 */
export async function triggerLoteProcessing(
  loteId,
  destinatarios = [],
  instanceId,
  onChunkProgress,
) {
  try {
    // Resolver instance_id (puede no existir: el fallback SMS cubre ese caso).
    let resolvedInstanceId = instanceId;
    if (!resolvedInstanceId) {
      const { data: inst } = await getActiveInstance();
      resolvedInstanceId = inst?.id || null;
    }

    let totalEnviados = 0;
    let totalFallidos = 0;
    let firstError = null;
    let chunksCount = 0;

    // --- 1. Intento por WhatsApp (solo si hay instancia activa) ---
    if (resolvedInstanceId) {
      const items = destinatarios.map((d) => ({
        phone: d.telefono,
        message: d.mensaje_personalizado,
        clientName: d.cliente_nombre,
        tipo: "recordatorio",
        detalle_id: d.detalle_id || null,
        lote_id: loteId,
        instance_id: resolvedInstanceId,
        template_var2: d.template_var2 ?? d.template_params?.[1] ?? null,
        template_var3: d.template_var3 ?? d.template_params?.[2] ?? null,
      }));

      // Chunking para evitar timeout del Edge Function (~150s wall-clock).
      const chunks = [];
      for (let i = 0; i < items.length; i += CHUNK_SIZE_WHATSAPP) {
        chunks.push(items.slice(i, i + CHUNK_SIZE_WHATSAPP));
      }
      chunksCount = chunks.length;

      for (let i = 0; i < chunks.length; i++) {
        const { data, error } = await supabase.functions.invoke(
          "proxy-n8n-whatsapp",
          { body: chunks[i] },
        );

        if (error) {
          firstError = firstError || error;
          if (import.meta.env.DEV)
            console.error(
              `[messagingService] Chunk ${i + 1}/${chunks.length} falló:`,
              error,
            );
        } else if (data?.data) {
          totalEnviados += data.data.enviados || 0;
          totalFallidos += data.data.fallidos || 0;
        }

        if (onChunkProgress) {
          onChunkProgress({
            chunkIndex: i + 1,
            totalChunks: chunks.length,
            enviados: totalEnviados,
            fallidos: totalFallidos,
          });
        }

        if (i < chunks.length - 1 && CHUNK_DELAY_MS_WHATSAPP > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, CHUNK_DELAY_MS_WHATSAPP),
          );
        }
      }
    } else if (import.meta.env.DEV) {
      console.warn(
        "[messagingService] Sin instancia WhatsApp activa; el lote se intenta solo por SMS.",
      );
    }

    // --- 2. Fallback SMS automático para los no enviados (fallido/pendiente) ---
    let sms = { enviados: 0, fallidos: 0, omitidos: 0 };
    try {
      const { data: lote } = await getLoteById(loteId);
      const smsTipo = lote?.tipo === "morosos" ? "vencido" : "cobro";
      sms = await enviarFallbackSms(loteId, smsTipo);
    } catch (smsErr) {
      firstError = firstError || smsErr;
      if (import.meta.env.DEV)
        console.error("[messagingService] Fallback SMS falló:", smsErr);
    }

    const enviadosTotal = totalEnviados + (sms.enviados || 0);

    // Si nada salió por ningún canal y hubo error, propágalo.
    if (enviadosTotal === 0 && firstError) {
      throw firstError;
    }

    return {
      success: true,
      data: {
        enviados: enviadosTotal,
        enviadosWhatsapp: totalEnviados,
        enviadosSms: sms.enviados || 0,
        fallidos: Math.max(0, destinatarios.length - enviadosTotal),
        total: destinatarios.length,
        chunks: chunksCount,
      },
      error: firstError,
    };
  } catch (err) {
    if (import.meta.env.DEV)
      console.error(
        "[messagingService] Error triggering lote processing:",
        err,
      );
    return { success: false, data: null, error: err };
  }
}

export async function retryLoteFailed(loteId) {
  try {
    const { data: failedRows, error: fetchError } = await supabase
      .from("distrimm_recordatorios_detalle")
      .select(
        "id, cliente_nombre, cliente_nit, telefono, mensaje_personalizado, template_params",
      )
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

    const destinatarios = failedRows.map((r) => ({
      cliente_nombre: r.cliente_nombre,
      cliente_nit: r.cliente_nit,
      telefono: r.telefono,
      mensaje_personalizado: r.mensaje_personalizado,
      detalle_id: r.id,
      template_params: r.template_params || null,
    }));

    const triggerResult = await triggerLoteProcessing(loteId, destinatarios);
    if (!triggerResult.success) {
      // Rollback: restore failed state so the lote isn't stuck in "en_proceso"
      await supabase
        .from("distrimm_recordatorios_detalle")
        .update({ estado_envio: "fallido" })
        .in("id", failedIds);
      await supabase
        .from("distrimm_recordatorios_lote")
        .update({ estado: "fallido", updated_at: new Date().toISOString() })
        .eq("id", loteId);
      throw triggerResult.error || new Error("Error al reintentar envío");
    }

    return { success: true, retriedCount: failedIds.length, error: null };
  } catch (err) {
    if (import.meta.env.DEV)
      console.error("[messagingService] Error retrying lote failed:", err);
    return { success: false, retriedCount: 0, error: err };
  }
}

export async function cancelLote(loteId) {
  try {
    // Cancel all pending/in-progress detail rows first
    const { error: detailErr } = await supabase
      .from("distrimm_recordatorios_detalle")
      .update({ estado_envio: "cancelado" })
      .eq("lote_id", loteId)
      .in("estado_envio", ["pendiente", "en_proceso"]);
    if (detailErr) throw detailErr;

    const { error } = await supabase
      .from("distrimm_recordatorios_lote")
      .update({ estado: "cancelado", updated_at: new Date().toISOString() })
      .eq("id", loteId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    if (import.meta.env.DEV)
      console.error("[messagingService] Error cancelling lote:", err);
    return { success: false, error: err };
  }
}
