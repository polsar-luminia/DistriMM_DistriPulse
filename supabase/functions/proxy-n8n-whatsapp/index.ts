/**
 * @fileoverview Edge Function: proxy-n8n-whatsapp
 * Envía mensajes WhatsApp via Meta Cloud API directamente (sin n8n).
 *
 * Flujo:
 * 1. Recibe lote de destinatarios del frontend
 * 2. Verifica que el usuario esté autenticado
 * 3. Por cada destinatario: envía template via Meta Cloud API
 * 4. Actualiza distrimm_recordatorios_detalle con estado + error_detalle
 * 5. Actualiza distrimm_recordatorios_lote con conteos finales
 *
 * Un solo número para toda la organización: el número y el token salen del
 * entorno del VPS, no de base de datos. No hay instancias, ni credenciales
 * guardadas, ni refresco de token — el token es de System User y no caduca.
 *
 * Templates Meta:
 *   recordatorio_urgente_v2 — facturas vencidas (default)
 *   recordatorio_cobro_v2   — facturas próximas a vencer (tipo="cobro")
 *
 * Secrets: META_PHONE_NUMBER_ID, META_ACCESS_TOKEN
 * Built-in: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsResponse, jsonResponse } from "../_shared/cors.ts";

const META_GRAPH_URL = "https://graph.facebook.com/v21.0";
const TEMPLATE_URGENTE = "recordatorio_urgente_v2";
const TEMPLATE_COBRO = "recordatorio_cobro_v2";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function errorResponse(message: string, status = 400, details?: string, req?: Request): Response {
  console.error(`[proxy-whatsapp] ERROR: ${message}`, details ?? "");
  return jsonResponse({ error: message }, status, req);
}

/** Envía un mensaje de template a un destinatario.
 *  Retorna { error: null, wamid } en éxito, o { error: string, wamid: null } en fallo. */
async function sendTemplateMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  templateName: string,
  params: [string, string, string],
): Promise<{ error: string | null; wamid: string | null }> {
  const res = await fetch(`${META_GRAPH_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: "es" },
        components: [{
          type: "body",
          parameters: [
            { type: "text", text: params[0] },
            { type: "text", text: params[1] },
            { type: "text", text: params[2] },
          ],
        }],
      },
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    return { error: data.error?.message ?? `Meta API error (${res.status})`, wamid: null };
  }
  const wamid = (data.messages as Array<{ id: string }> | undefined)?.[0]?.id ?? null;
  return { error: null, wamid };
}

// --------------------------------------------------------------------------
// Main handler
// --------------------------------------------------------------------------

const handler = (async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse(req);
  if (req.method !== "POST") return errorResponse("Método no permitido", 405, undefined, req);

  // --- Configuración del número (entorno, no base de datos) ---
  const phoneNumberId = Deno.env.get("META_PHONE_NUMBER_ID");
  const accessToken = Deno.env.get("META_ACCESS_TOKEN");
  if (!phoneNumberId || !accessToken) {
    return errorResponse(
      "WhatsApp no está configurado en el servidor. Falta META_PHONE_NUMBER_ID o META_ACCESS_TOKEN.",
      503,
      undefined,
      req,
    );
  }

  // --- Autenticación ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Token de autenticación requerido", 401, undefined, req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Validar JWT del usuario usando service role (no depende de SUPABASE_ANON_KEY)
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt);
  if (authError || !user) {
    console.error("[proxy-whatsapp] Auth failed:", authError?.message, "user:", user?.id ?? "null");
    return errorResponse("Usuario no autenticado", 401, undefined, req);
  }
  console.log(`[proxy-whatsapp] Auth OK: user=${user.id} email=${user.email}`);

  // --- Parsear payload ---
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400, undefined, req);
  }

  const items: Record<string, unknown>[] = Array.isArray(rawBody) ? rawBody : [rawBody];
  if (items.length === 0) return errorResponse("Payload vacío", 400, undefined, req);
  if (items.length > 500) return errorResponse("Máximo 500 destinatarios por lote", 400, undefined, req);

  // --- Procesar cada destinatario ---
  const loteId = items[0].lote_id as string | null;
  let enviados = 0;
  let fallidos = 0;

  console.log(`[proxy-whatsapp] Procesando ${items.length} mensajes desde phone_number_id=${phoneNumberId}`);

  for (const item of items) {
    const phone = item.phone as string;
    const clientName = (item.clientName as string) || "Cliente";
    const tipo = (item.tipo as string) || "recordatorio";
    const detalleId = item.detalle_id as string | null;

    // Params del template: {{1}} nombre, {{2}} detalle facturas, {{3}} total
    const var2 = (item.template_var2 as string) || (item.message as string) || "Ver detalle de facturas";
    const var3 = (item.template_var3 as string) || "";
    const templateName = tipo === "cobro" ? TEMPLATE_COBRO : TEMPLATE_URGENTE;

    let errorMsg: string | null = null;
    let wamid: string | null = null;
    try {
      const result = await sendTemplateMessage(
        phoneNumberId,
        accessToken,
        phone,
        templateName,
        [clientName, var2, var3],
      );
      errorMsg = result.error;
      wamid = result.wamid;
    } catch (err) {
      errorMsg = (err as Error).message;
    }

    const ok = errorMsg === null;
    if (ok) enviados++; else fallidos++;

    if (detalleId) {
      await supabaseAdmin
        .from("distrimm_recordatorios_detalle")
        .update({
          estado_envio: ok ? "enviado" : "fallido",
          error_detalle: errorMsg,
          enviado_at: ok ? new Date().toISOString() : null,
          wamid,
          phone_number_id: phoneNumberId,
        })
        .eq("id", detalleId);
    }
  }

  // --- Actualizar conteos del lote (recomputa desde detalle para ser idempotente y correcto en retries) ---
  if (loteId) {
    const { data: detalleStats } = await supabaseAdmin
      .from("distrimm_recordatorios_detalle")
      .select("estado_envio")
      .eq("lote_id", loteId);

    const rows = detalleStats || [];
    const totalEnviados = rows.filter((r) => r.estado_envio === "enviado").length;
    const totalFallidos = rows.filter((r) => r.estado_envio === "fallido").length;
    const totalPendientes = rows.filter((r) => r.estado_envio === "pendiente").length;

    const estadoFinal = totalPendientes > 0
      ? "en_proceso"
      : totalEnviados === 0
        ? "fallido"
        : totalFallidos > 0
          ? "parcial"
          : "completado";

    await supabaseAdmin
      .from("distrimm_recordatorios_lote")
      .update({
        enviados: totalEnviados,
        fallidos: totalFallidos,
        estado: estadoFinal,
        updated_at: new Date().toISOString(),
      })
      .eq("id", loteId);
  }

  console.log(`[proxy-whatsapp] Lote completado: ${enviados} enviados, ${fallidos} fallidos`);
  return jsonResponse({ data: { enviados, fallidos, total: items.length } }, 200, req);
});

// Servido por el router del VPS (Deno) o standalone en Supabase Edge Functions.
export default handler;
if (!Deno.env.get("DISTRIMM_ROUTER")) Deno.serve(handler);
