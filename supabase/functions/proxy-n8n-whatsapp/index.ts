/**
 * @fileoverview Edge Function: proxy-n8n-whatsapp
 * Envía mensajes WhatsApp via Meta Cloud API directamente (sin n8n).
 *
 * Flujo:
 * 1. Recibe lote de destinatarios del frontend
 * 2. Verifica autenticación y que la instancia pertenece al usuario
 * 3. Obtiene credenciales (con lazy token refresh)
 * 4. Por cada destinatario: envía template via Meta Cloud API
 * 5. Actualiza distrimm_recordatorios_detalle con estado + error_detalle
 * 6. Actualiza distrimm_recordatorios_lote con conteos finales
 *
 * Templates Meta:
 *   recordatorio_urgente_v2 — facturas vencidas (default)
 *   recordatorio_cobro_v2   — facturas próximas a vencer (tipo="cobro")
 *
 * Secrets: META_APP_ID, META_APP_SECRET
 * Built-in: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsResponse, jsonResponse } from "../_shared/cors.ts";

const META_GRAPH_URL = "https://graph.facebook.com/v21.0";
const TOKEN_REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
const TEMPLATE_URGENTE = "recordatorio_urgente_v2";
const TEMPLATE_COBRO = "recordatorio_cobro_v2";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function errorResponse(message: string, status = 400, details?: string, req?: Request): Response {
  console.error(`[proxy-whatsapp] ERROR: ${message}`, details ?? "");
  return jsonResponse({ error: message }, status, req);
}

interface Credentials {
  instance_id: string;
  access_token: string;
  token_expires_at: string | null;
  token_refreshed_at: string | null;
}

interface InstanceInfo {
  id: string;
  user_id: string;
  phone_number_id: string;
  status: string;
}

async function refreshToken(currentToken: string, appId: string, appSecret: string) {
  const url = `${META_GRAPH_URL}/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${appId}` +
    `&client_secret=${appSecret}` +
    `&fb_exchange_token=${encodeURIComponent(currentToken)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error?.message ?? `Token refresh failed (${res.status})`);
  return { access_token: data.access_token, expires_in: data.expires_in || 5184000 };
}

/** Envía un mensaje de template a un destinatario. Retorna null si OK, o mensaje de error. */
async function sendTemplateMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  templateName: string,
  params: [string, string, string],
): Promise<string | null> {
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
    return data.error?.message ?? `Meta API error (${res.status})`;
  }
  return null;
}

// --------------------------------------------------------------------------
// Main handler
// --------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse(req);
  if (req.method !== "POST") return errorResponse("Método no permitido", 405, undefined, req);

  // --- Autenticación ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Token de autenticación requerido", 401, undefined, req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) {
    console.error("[proxy-whatsapp] Auth failed:", authError?.message, "user:", user?.id ?? "null", "anonKey:", Deno.env.get("SUPABASE_ANON_KEY") ? "present" : "MISSING");
    return errorResponse("Usuario no autenticado", 401, undefined, req);
  }
  console.log(`[proxy-whatsapp] Auth OK: user=${user.id} email=${user.email}`);

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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

  const instanceId = items[0].instance_id as string | undefined;
  if (!instanceId) return errorResponse("instance_id es requerido", 400, undefined, req);

  // --- Verificar instancia ---
  const { data: instance, error: instanceError } = await supabaseAdmin
    .from("distrimm_whatsapp_instances")
    .select("id, user_id, phone_number_id, status")
    .eq("id", instanceId)
    .single();

  if (instanceError || !instance) return errorResponse("Instancia de WhatsApp no encontrada", 404, undefined, req);
  const inst = instance as InstanceInfo;
  if (inst.status !== "active") {
    return errorResponse(`La instancia de WhatsApp está ${inst.status}. Reconecta desde Configuración.`, 409, undefined, req);
  }

  // --- Obtener credenciales ---
  const { data: creds, error: credsError } = await supabaseAdmin
    .from("distrimm_whatsapp_credentials")
    .select("instance_id, access_token, token_expires_at, token_refreshed_at")
    .eq("instance_id", instanceId)
    .single();

  if (credsError || !creds) {
    return errorResponse("Credenciales de WhatsApp no encontradas. Reconecta la instancia.", 404, undefined, req);
  }

  let credentials = creds as Credentials;

  // --- Lazy token refresh ---
  if (credentials.token_expires_at) {
    const expiresAt = new Date(credentials.token_expires_at).getTime();
    const now = Date.now();

    if (expiresAt <= now) {
      await supabaseAdmin.from("distrimm_whatsapp_instances").update({ status: "expired" }).eq("id", instanceId);
      return errorResponse("El token de WhatsApp ha expirado. Reconecta la instancia.", 401, undefined, req);
    }

    if (expiresAt - now < TOKEN_REFRESH_THRESHOLD_MS) {
      const appId = Deno.env.get("META_APP_ID");
      const appSecret = Deno.env.get("META_APP_SECRET");
      if (appId && appSecret) {
        try {
          const refreshed = await refreshToken(credentials.access_token, appId, appSecret);
          const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
          await supabaseAdmin.from("distrimm_whatsapp_credentials").update({
            access_token: refreshed.access_token,
            token_expires_at: newExpiresAt,
            token_refreshed_at: new Date().toISOString(),
          }).eq("instance_id", instanceId);
          credentials = { ...credentials, access_token: refreshed.access_token, token_expires_at: newExpiresAt };
          console.log(`[proxy-whatsapp] Token renovado OK, expira: ${newExpiresAt}`);
        } catch (refreshErr) {
          console.warn("[proxy-whatsapp] Token refresh falló:", (refreshErr as Error).message);
        }
      }
    }
  }

  // --- Procesar cada destinatario ---
  const loteId = items[0].lote_id as string | null;
  let enviados = 0;
  let fallidos = 0;

  console.log(`[proxy-whatsapp] Procesando ${items.length} mensajes para instance=${instanceId}`);

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
    try {
      errorMsg = await sendTemplateMessage(
        inst.phone_number_id,
        credentials.access_token,
        phone,
        templateName,
        [clientName, var2, var3],
      );
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
        })
        .eq("id", detalleId);
    }
  }

  // --- Actualizar conteos del lote ---
  if (loteId) {
    const { data: loteRow } = await supabaseAdmin
      .from("distrimm_recordatorios_lote")
      .select("enviados, fallidos, total_destinatarios")
      .eq("id", loteId)
      .single();

    if (loteRow) {
      const totalEnviados = (loteRow.enviados || 0) + enviados;
      const totalFallidos = (loteRow.fallidos || 0) + fallidos;
      const totalProcesados = totalEnviados + totalFallidos;
      const estadoFinal = totalProcesados >= loteRow.total_destinatarios
        ? (totalEnviados === 0 ? "fallido" : "completado")
        : "en_proceso";

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
  }

  console.log(`[proxy-whatsapp] Lote completado: ${enviados} enviados, ${fallidos} fallidos`);
  return jsonResponse({ data: { enviados, fallidos, total: items.length } }, 200, req);
});
