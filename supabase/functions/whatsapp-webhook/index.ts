/**
 * @fileoverview Edge Function: whatsapp-webhook
 * Recibe eventos entrantes de Meta WhatsApp Cloud API.
 *
 * Responsabilidades:
 * 1. GET  — verificación del webhook (challenge de Meta)
 * 2. POST — mensajes entrantes → envía auto-respuesta al remitente
 *
 * La auto-respuesta redirige al cliente al número de atención humana.
 *
 * Secrets requeridos:
 *   WHATSAPP_WEBHOOK_VERIFY_TOKEN — token que configurás en Meta App → Webhooks
 *   META_PHONE_NUMBER_ID          — ID del número desde el que se responde
 *   META_ACCESS_TOKEN             — token de acceso (long-lived) de Meta
 */

const META_GRAPH_URL = "https://graph.facebook.com/v21.0";

const AUTO_REPLY_TEXT =
  "Gracias por comunicarse con *Almacén Agropecuario Distri MM*. " +
  "Este número es exclusivo para notificaciones automáticas.\n\n" +
  "Para confirmar su pago o comunicarse con nosotros, escríbanos al " +
  "📞 *+57 322 3806883*.\n\n" +
  "_Mensaje automático_";

Deno.serve(async (req: Request) => {
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

      // No responder a mensajes de sistema o nuestros propios mensajes
      if (!from || msgType === "system") continue;

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
