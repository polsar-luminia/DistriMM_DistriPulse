/**
 * @fileoverview Edge Function: token-refresh-cron
 * Renueva proactivamente tokens de WhatsApp que expiran en < 14 días.
 * Llamado semanalmente por pg_cron vía pg_net.
 *
 * Secrets requeridos: META_APP_ID, META_APP_SECRET
 * Built-in: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const META_GRAPH_URL = "https://graph.facebook.com/v21.0";
const REFRESH_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000; // 14 días

Deno.serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const appId = Deno.env.get("META_APP_ID");
  const appSecret = Deno.env.get("META_APP_SECRET");

  if (!appId || !appSecret) {
    console.error("[token-refresh-cron] Faltan META_APP_ID o META_APP_SECRET");
    return new Response(JSON.stringify({ error: "Secrets no configurados" }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const now = new Date();
  const threshold = new Date(now.getTime() + REFRESH_THRESHOLD_MS).toISOString();

  // Credenciales que expiran en < 14 días pero aún no han vencido
  const { data: credentials, error } = await supabase
    .from("distrimm_whatsapp_credentials")
    .select("instance_id, access_token, token_expires_at")
    .not("token_expires_at", "is", null)
    .gt("token_expires_at", now.toISOString())
    .lt("token_expires_at", threshold);

  if (error) {
    console.error("[token-refresh-cron] Error consultando credenciales:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!credentials || credentials.length === 0) {
    console.log("[token-refresh-cron] Sin tokens próximos a vencer.");
    return new Response(JSON.stringify({ processed: 0, results: [] }));
  }

  console.log(`[token-refresh-cron] ${credentials.length} token(s) próximos a vencer.`);

  const results = [];

  for (const cred of credentials) {
    try {
      const url =
        `${META_GRAPH_URL}/oauth/access_token` +
        `?grant_type=fb_exchange_token` +
        `&client_id=${appId}` +
        `&client_secret=${appSecret}` +
        `&fb_exchange_token=${encodeURIComponent(cred.access_token)}`;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error?.message ?? `Meta error (${res.status})`);
      }

      const newExpiresAt = new Date(
        Date.now() + (data.expires_in || 5184000) * 1000,
      ).toISOString();

      await supabase
        .from("distrimm_whatsapp_credentials")
        .update({
          access_token: data.access_token,
          token_expires_at: newExpiresAt,
          token_refreshed_at: new Date().toISOString(),
        })
        .eq("instance_id", cred.instance_id);

      console.log(
        `[token-refresh-cron] OK instance=${cred.instance_id} expira=${newExpiresAt}`,
      );
      results.push({ instance_id: cred.instance_id, ok: true, expires_at: newExpiresAt });
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`[token-refresh-cron] FALLO instance=${cred.instance_id}: ${msg}`);
      results.push({ instance_id: cred.instance_id, ok: false, error: msg });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`[token-refresh-cron] Completado: ${ok} renovados, ${failed} fallidos`);

  return new Response(
    JSON.stringify({ processed: results.length, ok, failed, results }),
    { headers: { "Content-Type": "application/json" } },
  );
});
