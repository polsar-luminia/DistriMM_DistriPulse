/**
 * @fileoverview Edge Function: proxy-n8n-whatsapp
 * Proxy de mensajes WhatsApp hacia n8n con credenciales multi-instancia
 * y lazy token refresh.
 *
 * Flujo:
 * 1. Recibe request del frontend con instance_id + datos del mensaje
 * 2. Verifica que instance_id pertenece al usuario autenticado
 * 3. Busca credenciales en distrimm_whatsapp_credentials (service_role)
 * 4. Lazy refresh: si token expira en < 7 días, renueva inline
 * 5. Envía phone_number_id + access_token + datos a n8n webhook
 * 6. Retorna respuesta de n8n al frontend (sin exponer credenciales)
 *
 * Soporta dos formatos de payload:
 * - Mensaje individual: { instance_id, phone, message, clientName, tipo }
 * - Lote (array): [{ instance_id, phone, message, clientName, tipo, lote_id, detalle_id }]
 *
 * Secrets: N8N_WHATSAPP_URL, N8N_AUTH_KEY, META_APP_ID, META_APP_SECRET
 * Built-in: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsResponse, jsonResponse } from "../_shared/cors.ts";

const META_GRAPH_URL = "https://graph.facebook.com/v21.0";
const TOKEN_REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const N8N_TIMEOUT_MS = 30_000; // 30 segundos

// Override de testing desactivado — los mensajes van al destinatario real.
// Para testing, configurar OVERRIDE_PHONE en Supabase Edge Function secrets.
const PRODUCTION_TEST_OVERRIDE_PHONE = Deno.env.get("OVERRIDE_PHONE") || "";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function errorResponse(
  message: string,
  status = 400,
  details?: string,
  req?: Request,
): Response {
  console.error(`[proxy-n8n-whatsapp] ERROR: ${message}`, details ?? "");
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

/**
 * Renueva un long-lived token con Meta Graph API.
 * Los long-lived tokens se renuevan con el mismo endpoint de exchange.
 */
async function refreshToken(
  currentToken: string,
  appId: string,
  appSecret: string,
): Promise<{ access_token: string; expires_in: number }> {
  const url =
    `${META_GRAPH_URL}/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${appId}` +
    `&client_secret=${appSecret}` +
    `&fb_exchange_token=${encodeURIComponent(currentToken)}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok || data.error) {
    throw new Error(
      data.error?.message ?? `Token refresh failed (${res.status})`,
    );
  }

  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 5184000,
  };
}

// --------------------------------------------------------------------------
// Main handler
// --------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return corsResponse(req);
  }

  if (req.method !== "POST") {
    return errorResponse("Método no permitido", 405, undefined, req);
  }

  // --- 1. Autenticación ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Token de autenticación requerido", 401, undefined, req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabaseUser = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error: authError,
  } = await supabaseUser.auth.getUser();

  if (authError || !user) {
    return errorResponse("Usuario no autenticado", 401, undefined, req);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // --- 2. Parsear payload ---
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400, undefined, req);
  }

  // Normalizar: puede ser un objeto individual o un array (lote)
  const items: Record<string, unknown>[] = Array.isArray(rawBody)
    ? rawBody
    : [rawBody];

  if (items.length === 0) {
    return errorResponse("Payload vacío", 400, undefined, req);
  }

  if (items.length > 500) {
    return errorResponse("Máximo 500 destinatarios por lote", 400, undefined, req);
  }

  // Extraer instance_id del primer item (todos los items de un lote usan la misma instancia)
  const instanceId = items[0].instance_id as string | undefined;

  if (!instanceId) {
    return errorResponse("instance_id es requerido", 400, undefined, req);
  }

  // --- 3. Verificar que la instancia pertenece al usuario ---
  const { data: instance, error: instanceError } = await supabaseAdmin
    .from("distrimm_whatsapp_instances")
    .select("id, user_id, phone_number_id, status")
    .eq("id", instanceId)
    .single();

  if (instanceError || !instance) {
    return errorResponse("Instancia de WhatsApp no encontrada", 404, undefined, req);
  }

  const inst = instance as InstanceInfo;

  if (inst.user_id !== user.id) {
    console.warn(
      `[proxy-n8n-whatsapp] Intento de acceso no autorizado: user=${user.id} intentó usar instance=${instanceId} de user=${inst.user_id}`,
    );
    return errorResponse("No autorizado para esta instancia", 403, undefined, req);
  }

  if (inst.status !== "active") {
    return errorResponse(
      `La instancia de WhatsApp está ${inst.status}. Reconecta desde Configuración.`,
      409,
      undefined,
      req,
    );
  }

  // --- 4. Obtener credenciales (service_role bypasea RLS) ---
  const { data: creds, error: credsError } = await supabaseAdmin
    .from("distrimm_whatsapp_credentials")
    .select("instance_id, access_token, token_expires_at, token_refreshed_at")
    .eq("instance_id", instanceId)
    .single();

  if (credsError || !creds) {
    return errorResponse(
      "Credenciales de WhatsApp no encontradas. Reconecta la instancia.",
      404,
      undefined,
      req,
    );
  }

  let credentials = creds as Credentials;

  // --- 5. Lazy token refresh ---
  if (credentials.token_expires_at) {
    const expiresAt = new Date(credentials.token_expires_at).getTime();
    const now = Date.now();

    if (expiresAt <= now) {
      // Token ya expiró — marcar instancia como expired
      await supabaseAdmin
        .from("distrimm_whatsapp_instances")
        .update({ status: "expired" })
        .eq("id", instanceId);
      return errorResponse(
        "El token de WhatsApp ha expirado. Reconecta la instancia.",
        401,
        undefined,
        req,
      );
    }

    if (expiresAt - now < TOKEN_REFRESH_THRESHOLD_MS) {
      // Token próximo a vencer — renovar inline
      const appId = Deno.env.get("META_APP_ID");
      const appSecret = Deno.env.get("META_APP_SECRET");

      if (appId && appSecret) {
        try {
          console.log(
            `[proxy-n8n-whatsapp] Renovando token para instance=${instanceId}`,
          );
          const refreshed = await refreshToken(
            credentials.access_token,
            appId,
            appSecret,
          );

          const newExpiresAt = new Date(
            Date.now() + refreshed.expires_in * 1000,
          ).toISOString();

          await supabaseAdmin
            .from("distrimm_whatsapp_credentials")
            .update({
              access_token: refreshed.access_token,
              token_expires_at: newExpiresAt,
              token_refreshed_at: new Date().toISOString(),
            })
            .eq("instance_id", instanceId);

          // Usar el token renovado para este envío
          credentials = {
            ...credentials,
            access_token: refreshed.access_token,
            token_expires_at: newExpiresAt,
          };

          console.log(
            `[proxy-n8n-whatsapp] Token renovado OK, expira: ${newExpiresAt}`,
          );
        } catch (refreshErr) {
          // No fallar el envío si el refresh falla — el token actual aún sirve
          console.warn(
            "[proxy-n8n-whatsapp] Advertencia: token refresh falló:",
            (refreshErr as Error).message,
          );
        }
      }
    }
  }

  // --- 6. Preparar payload para n8n ---
  const n8nUrl = Deno.env.get("N8N_WHATSAPP_URL");
  const n8nAuthKey = Deno.env.get("N8N_AUTH_KEY");
  if (!n8nAuthKey) {
    console.error("[proxy-n8n-whatsapp] N8N_AUTH_KEY not configured — n8n requests are unauthenticated");
  }

  if (!n8nUrl) {
    return errorResponse(
      "Configuración del servidor incompleta (N8N_WHATSAPP_URL)",
      500,
      undefined,
      req,
    );
  }

  // SECURITY: access_token se pasa a n8n porque lo necesita para llamar Meta Cloud API.
  // No loguear este payload. TODO: migrar a que n8n lea el token desde DB por instance_id.
  const n8nPayload = items.map((item) => ({
    phone: PRODUCTION_TEST_OVERRIDE_PHONE || item.phone,
    message: item.message,
    clientName: item.clientName,
    tipo: item.tipo || "recordatorio",
    detalle_id: item.detalle_id || null,
    lote_id: item.lote_id || null,
    phone_number_id: inst.phone_number_id,
    access_token: credentials.access_token,
  }));

  // --- 7. Enviar a n8n ---
  try {
    if (PRODUCTION_TEST_OVERRIDE_PHONE) {
      console.warn(
        `[proxy-n8n-whatsapp] ⚠️ OVERRIDE ACTIVO: todos los mensajes van a ${PRODUCTION_TEST_OVERRIDE_PHONE}`,
      );
    }
    console.log(
      `[proxy-n8n-whatsapp] Enviando ${n8nPayload.length} item(s) a n8n para instance=${instanceId}`,
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), N8N_TIMEOUT_MS);

    const n8nHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (n8nAuthKey) {
      n8nHeaders["x-n8n-auth"] = n8nAuthKey;
    }

    const n8nResponse = await fetch(n8nUrl, {
      method: "POST",
      headers: n8nHeaders,
      body: JSON.stringify(
        n8nPayload.length === 1 ? n8nPayload[0] : n8nPayload,
      ),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const n8nData = await n8nResponse.json().catch(() => ({}));

    if (!n8nResponse.ok) {
      console.error(
        `[proxy-n8n-whatsapp] n8n respondió con status=${n8nResponse.status}`,
      );
      return jsonResponse(
        {
          error: "Error al procesar mensaje en n8n",
          n8n_status: n8nResponse.status,
        },
        502,
        req,
      );
    }

    console.log(
      `[proxy-n8n-whatsapp] Envío exitoso: ${n8nPayload.length} item(s)`,
    );

    // Retornar respuesta de n8n sin exponer credenciales
    return jsonResponse({ data: n8nData }, 200, req);
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return errorResponse(
        "Timeout: n8n no respondió en 30 segundos",
        504,
        undefined,
        req,
      );
    }
    return errorResponse(
      "Error comunicándose con n8n",
      502,
      (err as Error).message,
      req,
    );
  }
});
