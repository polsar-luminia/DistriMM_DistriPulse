/**
 * Router de las Edge Functions para el VPS (fuera de Supabase).
 *
 * Sirve las mismas funciones que Supabase expone en /functions/v1/<nombre>.
 * Cada módulo exporta su handler por default y se auto-sirve SOLO si
 * DISTRIMM_ROUTER no está definido — así el mismo archivo sigue siendo
 * desplegable a Supabase sin cambios durante la convivencia.
 *
 * nginx hace proxy_pass a 127.0.0.1:3112 con barra final, así que el prefijo
 * /functions/v1 ya viene recortado cuando la petición llega aquí.
 */
import proxyN8nCfo from "./proxy-n8n-cfo/index.ts";
import proxyN8nChatbot from "./proxy-n8n-chatbot/index.ts";
import proxyN8nWhatsapp from "./proxy-n8n-whatsapp/index.ts";
import whatsappWebhook from "./whatsapp-webhook/index.ts";
import tokenRefreshCron from "./token-refresh-cron/index.ts";
import syncIngest from "./sync-ingest/index.ts";

type Handler = (req: Request) => Promise<Response>;

const routes: Record<string, Handler> = {
  "proxy-n8n-cfo": proxyN8nCfo,
  "proxy-n8n-chatbot": proxyN8nChatbot,
  "proxy-n8n-whatsapp": proxyN8nWhatsapp,
  // proxy-embedded-signup se retiró: el número es uno solo y se configura por
  // entorno (META_PHONE_NUMBER_ID / META_ACCESS_TOKEN). El archivo se conserva
  // en el repo por si alguna vez se vuelve a multi-número.
  "whatsapp-webhook": whatsappWebhook,
  "token-refresh-cron": tokenRefreshCron,
  "sync-ingest": syncIngest,
};

const port = Number(Deno.env.get("PORT") ?? 3112);

Deno.serve({ port, hostname: "127.0.0.1" }, async (req: Request) => {
  const { pathname } = new URL(req.url);
  const nombre = pathname.replace(/^\/+/, "").split("/")[0];

  if (nombre === "health") {
    return new Response(
      JSON.stringify({ ok: true, funciones: Object.keys(routes) }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  const handler = routes[nombre];
  if (!handler) {
    return new Response(
      JSON.stringify({ error: `Función no encontrada: ${nombre}` }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    return await handler(req);
  } catch (err) {
    console.error(`[router] ${nombre} lanzó:`, err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
