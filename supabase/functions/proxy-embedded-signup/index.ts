/**
 * @fileoverview Edge Function: proxy-embedded-signup
 * Maneja el flujo OAuth de WhatsApp Embedded Signup con Coexistence.
 *
 * Flujo:
 * 1. Recibe code + waba_id + phone_number_id del frontend (post FB.login)
 * 2. Intercambia code por short-lived token con Meta Graph API
 * 3. Intercambia short-lived por long-lived token (~60 días)
 * 4. Obtiene info de WABA y phone number display
 * 5. Guarda instancia + credenciales en DB (service_role)
 * 6. Suscribe WABA a webhooks
 * 7. Retorna solo datos públicos al frontend
 *
 * Secrets requeridos: META_APP_ID, META_APP_SECRET
 * Built-in: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsResponse, jsonResponse } from "../_shared/cors.ts";

const META_GRAPH_URL = "https://graph.facebook.com/v21.0";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/** Crea respuesta de error consistente — detalles solo se logean server-side */
function errorResponse(
  message: string,
  status = 400,
  details?: string,
  req?: Request,
): Response {
  console.error(`[proxy-embedded-signup] ERROR: ${message}`, details ?? "");
  return jsonResponse({ error: message }, status, req);
}

/** Llama a Meta Graph API y retorna JSON o lanza error */
async function metaGraphFetch(
  url: string,
  options?: RequestInit,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, options);
  const data = await res.json();

  if (!res.ok || data.error) {
    const msg = data.error?.message ?? `Meta API error (${res.status})`;
    throw new Error(msg);
  }
  return data;
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

  // --- 1. Autenticación: extraer usuario del JWT ---
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Token de autenticación requerido", 401, undefined, req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Cliente con JWT del usuario para verificar identidad
  const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabaseUser.auth.getUser();

  if (authError || !user) {
    return errorResponse("Usuario no autenticado", 401, undefined, req);
  }

  // Cliente con service_role para escribir en tablas protegidas
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // --- 2. Validar payload ---
  let body: { code?: string; waba_id?: string; phone_number_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400, undefined, req);
  }

  const { code, waba_id, phone_number_id } = body;

  if (!code || !waba_id || !phone_number_id) {
    return errorResponse(
      "Campos requeridos: code, waba_id, phone_number_id",
      400,
      undefined,
      req,
    );
  }

  const appId = Deno.env.get("META_APP_ID");
  const appSecret = Deno.env.get("META_APP_SECRET");

  if (!appId || !appSecret) {
    return errorResponse(
      "Configuración del servidor incompleta (META_APP_ID/META_APP_SECRET)",
      500,
      undefined,
      req,
    );
  }

  try {
    // --- 3. Intercambiar code por short-lived token ---
    console.log(
      `[proxy-embedded-signup] Intercambiando code para user=${user.id}, waba=${waba_id}`,
    );

    const shortLivedData = await metaGraphFetch(
      `${META_GRAPH_URL}/oauth/access_token` +
        `?client_id=${appId}` +
        `&client_secret=${appSecret}` +
        `&code=${encodeURIComponent(code)}`,
    );

    const shortLivedToken = shortLivedData.access_token as string;
    if (!shortLivedToken) {
      return errorResponse(
        "No se recibió access_token de Meta",
        502,
        undefined,
        req,
      );
    }

    // --- 4. Intercambiar short-lived por long-lived token (~60 días) ---
    console.log("[proxy-embedded-signup] Intercambiando por long-lived token");

    const longLivedData = await metaGraphFetch(
      `${META_GRAPH_URL}/oauth/access_token` +
        `?grant_type=fb_exchange_token` +
        `&client_id=${appId}` +
        `&client_secret=${appSecret}` +
        `&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`,
    );

    const longLivedToken = longLivedData.access_token as string;
    // expires_in viene en segundos (≈5184000 para 60 días)
    const expiresInSeconds = (longLivedData.expires_in as number) || 5184000;
    const tokenExpiresAt = new Date(
      Date.now() + expiresInSeconds * 1000,
    ).toISOString();

    if (!longLivedToken) {
      return errorResponse(
        "No se recibió long-lived token de Meta",
        502,
        undefined,
        req,
      );
    }

    // --- 5. Obtener info de WABA y phone number ---
    console.log(
      `[proxy-embedded-signup] Obteniendo info de WABA=${waba_id}, phone=${phone_number_id}`,
    );

    // Info del phone number (display number)
    const phoneData = await metaGraphFetch(
      `${META_GRAPH_URL}/${phone_number_id}?access_token=${encodeURIComponent(longLivedToken)}`,
    );

    const phoneDisplay =
      (phoneData.display_phone_number as string) ||
      (phoneData.verified_name as string) ||
      null;

    // Info del WABA (nombre del negocio, meta_business_id)
    const wabaData = await metaGraphFetch(
      `${META_GRAPH_URL}/${waba_id}?access_token=${encodeURIComponent(longLivedToken)}`,
    );

    const businessName = (wabaData.name as string) || null;
    const metaBusinessId =
      (wabaData.owner_business_info as Record<string, unknown>)?.id as string ||
      (wabaData.on_behalf_of_business_info as Record<string, unknown>)?.id as string ||
      null;

    // --- 6. Guardar instancia en DB (upsert para manejar reconexiones) ---
    console.log(
      `[proxy-embedded-signup] Guardando instancia para user=${user.id}`,
    );

    const { data: instance, error: instanceError } = await supabaseAdmin
      .from("distrimm_whatsapp_instances")
      .upsert(
        {
          user_id: user.id,
          waba_id,
          phone_number_id,
          phone_display: phoneDisplay,
          business_name: businessName,
          status: "active",
          coexistence: true,
          meta_business_id: metaBusinessId,
        },
        { onConflict: "user_id,phone_number_id" },
      )
      .select("id, phone_display, business_name, status, coexistence, created_at")
      .single();

    if (instanceError) {
      console.error(
        "[proxy-embedded-signup] Error guardando instancia:",
        instanceError.message,
      );
      return errorResponse(
        "Error guardando instancia de WhatsApp",
        500,
        instanceError.message,
        req,
      );
    }

    // --- 7. Guardar credenciales (upsert por si ya existían) ---
    const { error: credError } = await supabaseAdmin
      .from("distrimm_whatsapp_credentials")
      .upsert(
        {
          instance_id: instance.id,
          access_token: longLivedToken,
          token_expires_at: tokenExpiresAt,
          token_refreshed_at: new Date().toISOString(),
        },
        { onConflict: "instance_id" },
      );

    if (credError) {
      console.error(
        "[proxy-embedded-signup] Error guardando credenciales:",
        credError.message,
      );
      // Solo limpiar instancia si fue recién creada (no en reconexión)
      const isNewInstance =
        Date.now() - new Date(instance.created_at).getTime() < 10_000;
      if (isNewInstance) {
        await supabaseAdmin
          .from("distrimm_whatsapp_instances")
          .delete()
          .eq("id", instance.id);
      }
      return errorResponse(
        "Error guardando credenciales",
        500,
        credError.message,
        req,
      );
    }

    // --- 8. Suscribir WABA a webhooks de la app ---
    try {
      console.log(
        `[proxy-embedded-signup] Suscribiendo WABA=${waba_id} a webhooks`,
      );
      await metaGraphFetch(
        `${META_GRAPH_URL}/${waba_id}/subscribed_apps`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${longLivedToken}` },
        },
      );
      console.log("[proxy-embedded-signup] WABA suscrita a webhooks OK");
    } catch (webhookErr) {
      // No fallar el signup si la suscripción falla — se puede reintentar
      console.warn(
        "[proxy-embedded-signup] Advertencia: no se pudo suscribir a webhooks:",
        (webhookErr as Error).message,
      );
    }

    // --- 9. Retornar solo datos públicos ---
    console.log(
      `[proxy-embedded-signup] Signup exitoso: instance=${instance.id}`,
    );

    return jsonResponse({
      data: {
        id: instance.id,
        phone_display: instance.phone_display,
        business_name: instance.business_name,
        status: instance.status,
        coexistence: instance.coexistence,
        created_at: instance.created_at,
      },
    }, 200, req);
  } catch (err) {
    const message = (err as Error).message || "Error desconocido";
    return errorResponse(
      "Error en el flujo de Embedded Signup",
      502,
      message,
      req,
    );
  }
});
