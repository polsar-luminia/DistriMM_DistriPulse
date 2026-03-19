import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsResponse, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return corsResponse(req);
  }

  try {
    // --- Auth: verify JWT ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "No authorization header" }, 401, req);
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: "Invalid token" }, 401, req);
    }

    // --- Read secrets ---
    const n8nChatUrl = Deno.env.get("N8N_CHAT_URL");
    const n8nAuthKey = Deno.env.get("N8N_AUTH_KEY") || "";

    if (!n8nChatUrl) {
      return jsonResponse({ error: "N8N_CHAT_URL not configured" }, 500, req);
    }

    // --- Parse body ---
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Body JSON inválido" }, 400, req);
    }
    const { action, sessionId, chatInput } = body;

    if (!sessionId || !chatInput) {
      return jsonResponse({ error: "Missing sessionId or chatInput" }, 400, req);
    }

    // --- Proxy to n8n (long timeout: AI Agent takes 40-70s) ---
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 100_000);

    try {
      const n8nResponse = await fetch(n8nChatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(n8nAuthKey ? { "x-n8n-auth": n8nAuthKey } : {}),
        },
        body: JSON.stringify({
          action: action || "sendMessage",
          sessionId,
          chatInput,
        }),
        signal: controller.signal,
      });

      if (!n8nResponse.ok) {
        const text = await n8nResponse.text();
        console.error("n8n error:", n8nResponse.status, text.substring(0, 500));
        return jsonResponse(
          { error: `n8n returned ${n8nResponse.status}` },
          502,
          req,
        );
      }

      const result = await n8nResponse.json();
      return jsonResponse(result, 200, req);
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error("proxy-n8n-chatbot error:", err);
    const message =
      err instanceof DOMException && err.name === "AbortError"
        ? "n8n request timed out (100s)"
        : "Internal error";
    const status = err instanceof DOMException && err.name === "AbortError" ? 504 : 500;
    return jsonResponse({ error: message }, status, req);
  }
});
