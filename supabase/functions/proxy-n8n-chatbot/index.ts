import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Auth: verify JWT ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Read secrets ---
    const n8nChatUrl = Deno.env.get("N8N_CHAT_URL");
    const n8nAuthKey = Deno.env.get("N8N_AUTH_KEY") || "";

    if (!n8nChatUrl) {
      return new Response(
        JSON.stringify({ error: "N8N_CHAT_URL not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // --- Parse body ---
    const body = await req.json();
    const { action, sessionId, chatInput } = body;

    if (!sessionId || !chatInput) {
      return new Response(
        JSON.stringify({ error: "Missing sessionId or chatInput" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
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
          ...(n8nAuthKey ? { authKey: n8nAuthKey } : {}),
        }),
        signal: controller.signal,
      });

      if (!n8nResponse.ok) {
        const text = await n8nResponse.text();
        console.error("n8n error:", n8nResponse.status, text);
        return new Response(
          JSON.stringify({
            error: `n8n returned ${n8nResponse.status}`,
            detail: text.substring(0, 200),
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const result = await n8nResponse.json();
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error("proxy-n8n-chatbot error:", err);
    const message =
      err instanceof DOMException && err.name === "AbortError"
        ? "n8n request timed out (100s)"
        : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: err instanceof DOMException && err.name === "AbortError" ? 504 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
