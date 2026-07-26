/**
 * @fileoverview Edge Function: whatsapp-webhook
 * Recibe eventos entrantes de Meta WhatsApp Cloud API.
 *
 * Responsabilidades:
 * 1. GET  — verificación del webhook (challenge de Meta)
 * 2. POST — mensajes entrantes → rutea por phone_number_id:
 *    - El Club del Licor (1086250197900757) → forward al bot VPS (analitica.distripolsar.com/bot)
 *    - DistriPolsar (787779341079688) → reenvía a la Edge Function de DistriPolsar
 *    - DistriMM → envía auto-respuesta al remitente
 *
 * Secrets requeridos:
 *   WHATSAPP_WEBHOOK_VERIFY_TOKEN — token que configurás en Meta App → Webhooks
 *   META_PHONE_NUMBER_ID          — ID del número desde el que se responde (DistriMM)
 *   META_ACCESS_TOKEN             — token de acceso (long-lived) de Meta
 */

// Phone number ID de El Club del Licor (WABA DistriPolsar, instancia LuminIA aislada).
// El bot del Club del Licor corre en el VPS (Node.js + OpenAI + pgvector).
// Aquí solo reenviamos el evento crudo al bot para que procese y responda.
const CLUB_DEL_LICOR_PHONE_NUMBER_ID = "1086250197900757";
const CLUB_DEL_LICOR_BOT_URL = "https://analitica.distripolsar.com/bot/webhook";

// Phone number ID de DistriPolsar suscrito a la app DistriMM
const DISTRIPOLSAR_PHONE_NUMBER_ID = "787779341079688";
const DISTRIPOLSAR_WEBHOOK_URL =
  "https://rwxczwykqxhxugmcaoha.supabase.co/functions/v1/whatsapp-webhook";

const META_GRAPH_URL = "https://graph.facebook.com/v21.0";

const AUTO_REPLY_TEXT =
  "Gracias por comunicarse con *Almacén Agropecuario Distri MM*. " +
  "Este número es exclusivo para notificaciones automáticas.\n\n" +
  "Para confirmar su pago o comunicarse con nosotros, escríbanos al " +
  "📞 *+57 322 3806883*.\n\n" +
  "_Mensaje automático_";

const handler = (async (req: Request) => {
  const url = new URL(req.url);

  // -----------------------------------------------------------------------
  // GET — verificación del webhook por Meta
  // -----------------------------------------------------------------------
  if (req.method === "GET") {
    const verifyToken = Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === verifyToken) {
      console.log("[whatsapp-webhook] Webhook verificado OK");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // -----------------------------------------------------------------------
  // POST — evento de Meta (mensaje entrante, status update, etc.)
  // -----------------------------------------------------------------------
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // Iterar sobre todos los cambios del evento
  const entries = (body.entry as Array<Record<string, unknown>>) || [];

  // Helper: extraer phone_number_id del primer change del evento
  const extractPhoneNumberId = (): string | null => {
    for (const e of entries) {
      for (const c of ((e.changes as Array<Record<string, unknown>>) || [])) {
        const meta = ((c.value as Record<string, unknown>)?.metadata as Record<string, unknown>);
        const pid = meta?.phone_number_id;
        if (typeof pid === "string") return pid;
      }
    }
    return null;
  };

  const phoneNumberId = extractPhoneNumberId();

  // Rutear: El Club del Licor → forwardear al bot del VPS (fire-and-forget).
  if (phoneNumberId === CLUB_DEL_LICOR_PHONE_NUMBER_ID) {
    console.log("[whatsapp-webhook] Forwarding Club del Licor → VPS bot");
    fetch(CLUB_DEL_LICOR_BOT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch((err: Error) =>
      console.error("[whatsapp-webhook] Error forwarding Club del Licor:", err.message)
    );
    return new Response("OK", { status: 200 });
  }

  // Rutear por phone_number_id: si el mensaje pertenece a DistriPolsar, reenviar
  const isForDistrPolsar = phoneNumberId === DISTRIPOLSAR_PHONE_NUMBER_ID;

  if (isForDistrPolsar) {
    console.log("[whatsapp-webhook] Redirigiendo evento a DistriPolsar");
    fetch(DISTRIPOLSAR_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch((err: Error) =>
      console.error("[whatsapp-webhook] Error forwarding DistriPolsar:", err.message)
    );
    return new Response("OK", { status: 200 });
  }

  for (const entry of entries) {
    const changes = (entry.changes as Array<Record<string, unknown>>) || [];

    for (const change of changes) {
      const value = change.value as Record<string, unknown>;
      if (!value) continue;

      const messages = value.messages as Array<Record<string, unknown>>;
      if (!messages || messages.length === 0) continue;

      // Solo responder al primer mensaje del batch para evitar duplicados
      const msg = messages[0];
      const from = msg.from as string; // número del remitente (ej: "573183224021")
      const msgType = msg.type as string;

      // Solo responder a mensajes de texto de clientes reales
      if (!from || msgType !== "text") continue;

      console.log(`[whatsapp-webhook] Mensaje entrante de ${from}, tipo=${msgType}`);

      await sendAutoReply(from);
    }
  }

  // Meta requiere respuesta 200 rápida para no reintentar
  return new Response("OK", { status: 200 });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sendAutoReply(to: string): Promise<void> {
  const phoneNumberId = Deno.env.get("META_PHONE_NUMBER_ID");
  const accessToken = Deno.env.get("META_ACCESS_TOKEN");

  if (!phoneNumberId || !accessToken) {
    console.error("[whatsapp-webhook] Faltan META_PHONE_NUMBER_ID o META_ACCESS_TOKEN");
    return;
  }

  try {
    const res = await fetch(`${META_GRAPH_URL}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: AUTO_REPLY_TEXT },
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("[whatsapp-webhook] Error enviando auto-respuesta:", JSON.stringify(err));
    } else {
      console.log(`[whatsapp-webhook] Auto-respuesta enviada a ${to}`);
    }
  } catch (err) {
    console.error("[whatsapp-webhook] Error de red:", (err as Error).message);
  }
}

// Servido por el router del VPS (Deno) o standalone en Supabase Edge Functions.
export default handler;
if (!Deno.env.get("DISTRIMM_ROUTER")) Deno.serve(handler);
