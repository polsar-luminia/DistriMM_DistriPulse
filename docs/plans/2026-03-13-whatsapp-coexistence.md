# WhatsApp Coexistence + Edge Functions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Habilitar WhatsApp Embedded Signup con coexistencia para que cada cliente conecte su propio numero de WhatsApp Business, y crear las Edge Functions faltantes que desbloquean todo el flujo de mensajeria.

**Architecture:** El frontend usa `supabase.functions.invoke()` para proxear llamadas a n8n via Edge Functions (protege secretos). Cada usuario tendra su propia instancia WhatsApp guardada en `distrimm_whatsapp_instances`. El Embedded Signup usa Facebook JS SDK con `featureType: "whatsapp_business_app_onboard"` para coexistencia. El `proxy-embedded-signup` intercambia el code de OAuth por un access token y guarda la instancia.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), React 19, Supabase PostgreSQL + RLS, Facebook JS SDK v21.0, Meta Graph API v21.0

**Contexto Meta App Review:** Los permisos `whatsapp_business_messaging` y `manage_app_solution` estan aprobados. Faltan `whatsapp_business_management` (necesita video mostrando template management) y `whatsapp_business_manage_events` (re-aplicar ahora que messaging esta aprobado).

---

## Task 1: Edge Function `proxy-n8n-whatsapp`

**Prioridad: CRITICA** — Sin esto, el envio de mensajes no funciona. Todo el frontend ya llama a esta funcion.

**Files:**
- Create: `supabase/functions/proxy-n8n-whatsapp/index.ts`

**Step 1: Create the Edge Function**

Usar la misma estructura que `proxy-n8n-chatbot/index.ts` pero apuntando a `N8N_WHATSAPP_URL`.

```typescript
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
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Read secrets ---
    const n8nWhatsAppUrl = Deno.env.get("N8N_WHATSAPP_URL");
    const n8nAuthKey = Deno.env.get("N8N_AUTH_KEY") || "";

    if (!n8nWhatsAppUrl) {
      return new Response(
        JSON.stringify({ error: "N8N_WHATSAPP_URL not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Parse body (single message or array for batch) ---
    const body = await req.json();

    // --- Proxy to n8n ---
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const n8nResponse = await fetch(n8nWhatsAppUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(n8nAuthKey ? { "x-n8n-auth": n8nAuthKey } : {}),
        },
        body: JSON.stringify(
          Array.isArray(body)
            ? { items: body, authKey: n8nAuthKey }
            : { ...body, authKey: n8nAuthKey },
        ),
        signal: controller.signal,
      });

      if (!n8nResponse.ok) {
        const text = await n8nResponse.text();
        console.error("n8n error:", n8nResponse.status, text);
        return new Response(
          JSON.stringify({ error: `n8n returned ${n8nResponse.status}`, detail: text.substring(0, 200) }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
    console.error("proxy-n8n-whatsapp error:", err);
    const message =
      err instanceof DOMException && err.name === "AbortError"
        ? "n8n request timed out (30s)"
        : "Internal error";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: err instanceof DOMException && err.name === "AbortError" ? 504 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
```

**Step 2: Verify file structure**

```bash
ls supabase/functions/proxy-n8n-whatsapp/index.ts
```

**Step 3: Commit**

```bash
git add supabase/functions/proxy-n8n-whatsapp/index.ts
git commit -m "feat(whatsapp): create proxy-n8n-whatsapp Edge Function"
```

**Deploy note:** Run `supabase functions deploy proxy-n8n-whatsapp` and add `N8N_WHATSAPP_URL` + `N8N_AUTH_KEY` as secrets in Supabase Dashboard.

---

## Task 2: SQL Migration — `distrimm_whatsapp_instances`

**Files:**
- Create: `sql/020_whatsapp_instances.sql`

**Step 1: Write the migration**

```sql
-- WhatsApp Business instances for Embedded Signup (coexistence mode)
-- Each user can connect their own WhatsApp Business number

CREATE TABLE IF NOT EXISTS distrimm_whatsapp_instances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  waba_id TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  phone_display TEXT,
  business_name TEXT,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'expired')),
  coexistence BOOLEAN DEFAULT true,
  meta_business_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, phone_number_id)
);

ALTER TABLE distrimm_whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own instances"
  ON distrimm_whatsapp_instances FOR ALL
  USING (auth.uid() = user_id);

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON distrimm_whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Step 2: Commit**

```bash
git add sql/020_whatsapp_instances.sql
git commit -m "feat(whatsapp): add distrimm_whatsapp_instances migration"
```

**Deploy note:** Run this SQL in Supabase Dashboard > SQL Editor.

---

## Task 3: Edge Function `proxy-embedded-signup`

**Files:**
- Create: `supabase/functions/proxy-embedded-signup/index.ts`

**Step 1: Write the Edge Function**

This function:
1. Receives the `code` from Facebook OAuth + `waba_id` + `phone_number_id` from the Embedded Signup event
2. Exchanges `code` for an access token via Meta Graph API
3. Fetches phone number display info
4. Saves the instance in `distrimm_whatsapp_instances`
5. Subscribes the WABA to the app's webhooks

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API = "https://graph.facebook.com/v21.0";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Secrets ---
    const appId = Deno.env.get("META_APP_ID");
    const appSecret = Deno.env.get("META_APP_SECRET");
    if (!appId || !appSecret) {
      return new Response(
        JSON.stringify({ error: "META_APP_ID or META_APP_SECRET not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Parse body ---
    const { code, waba_id, phone_number_id } = await req.json();
    if (!code || !waba_id || !phone_number_id) {
      return new Response(
        JSON.stringify({ error: "Missing code, waba_id, or phone_number_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // --- Step 1: Exchange code for access token ---
    const tokenUrl = `${GRAPH_API}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("Token exchange failed:", tokenData.error);
      return new Response(
        JSON.stringify({ error: "Token exchange failed", detail: tokenData.error.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const accessToken = tokenData.access_token;

    // --- Step 2: Get phone number display info ---
    let phoneDisplay = null;
    let businessName = null;
    try {
      const phoneRes = await fetch(
        `${GRAPH_API}/${phone_number_id}?fields=display_phone_number,verified_name`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const phoneData = await phoneRes.json();
      phoneDisplay = phoneData.display_phone_number || null;
      businessName = phoneData.verified_name || null;
    } catch (e) {
      console.error("Failed to fetch phone info:", e);
    }

    // --- Step 3: Get WABA business info ---
    let metaBusinessId = null;
    try {
      const wabaRes = await fetch(
        `${GRAPH_API}/${waba_id}?fields=owner_business_info`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const wabaData = await wabaRes.json();
      metaBusinessId = wabaData.owner_business_info?.id || null;
    } catch (e) {
      console.error("Failed to fetch WABA info:", e);
    }

    // --- Step 4: Subscribe WABA to app webhooks ---
    try {
      await fetch(
        `${GRAPH_API}/${waba_id}/subscribed_apps`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
    } catch (e) {
      console.error("Failed to subscribe WABA:", e);
    }

    // --- Step 5: Upsert instance in DB ---
    const { data: instance, error: dbError } = await supabase
      .from("distrimm_whatsapp_instances")
      .upsert(
        {
          user_id: user.id,
          waba_id,
          phone_number_id,
          phone_display: phoneDisplay,
          business_name: businessName,
          access_token: accessToken,
          status: "active",
          coexistence: true,
          meta_business_id: metaBusinessId,
        },
        { onConflict: "user_id,phone_number_id" },
      )
      .select("id, phone_display, business_name, status")
      .single();

    if (dbError) {
      console.error("DB upsert failed:", dbError);
      return new Response(
        JSON.stringify({ error: "Failed to save instance", detail: dbError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, instance }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("proxy-embedded-signup error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
```

**Step 2: Commit**

```bash
git add supabase/functions/proxy-embedded-signup/index.ts
git commit -m "feat(whatsapp): create proxy-embedded-signup Edge Function"
```

**Deploy note:** Add `META_APP_ID` and `META_APP_SECRET` as secrets in Supabase Edge Functions.

---

## Task 4: Rewrite WhatsAppTab with Embedded Signup

**Files:**
- Modify: `src/components/messages/WhatsAppTab.jsx`

**Step 1: Rewrite WhatsAppTab**

Replace the entire component. The new version:
- Loads the user's instance from `distrimm_whatsapp_instances` instead of env vars
- Shows "Conectar WhatsApp" button with Facebook Embedded Signup when no instance exists
- Shows connected instance info + disconnect button when instance exists
- Loads Facebook JS SDK dynamically
- Handles the OAuth flow and sends code to `proxy-embedded-signup`
- Keeps the existing stats cards (today/week sent counts)

Key env vars needed (public, OK in frontend):
- `VITE_META_APP_ID` — Facebook App ID
- `VITE_META_CONFIG_ID` — Facebook Login for Business Configuration ID

The component must:
1. On mount: query `distrimm_whatsapp_instances` for user's active instance
2. If no instance: show "Conectar WhatsApp" button
3. On click: load FB SDK → call `FB.login()` with Embedded Signup config
4. Listen for `WA_EMBEDDED_SIGNUP` message event to get `waba_id` + `phone_number_id`
5. Send `code` + `waba_id` + `phone_number_id` to `proxy-embedded-signup`
6. On success: reload instance from DB
7. Disconnect: update instance status to 'disconnected'

**Important implementation details:**

```jsx
// FB.login callback gives the code
FB.login((response) => {
  if (response.authResponse) {
    const code = response.authResponse.code;
    // Send to Edge Function with waba_id and phone_number_id from message event
  }
}, {
  config_id: import.meta.env.VITE_META_CONFIG_ID,
  response_type: 'code',
  override_default_response_type: true,
  extras: {
    feature: 'whatsapp_embedded_signup',
    featureType: 'whatsapp_business_app_onboard', // COEXISTENCE
    sessionInfoVersion: 3,
  }
});

// Message event listener for WABA data
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://www.facebook.com' &&
      event.origin !== 'https://web.facebook.com') return;
  try {
    const data = JSON.parse(event.data);
    if (data.type === 'WA_EMBEDDED_SIGNUP') {
      if (data.event === 'FINISH') {
        // data.data contains { phone_number_id, waba_id }
      }
      if (data.event === 'CANCEL' || data.event === 'ERROR') {
        // Handle cancellation or error
      }
    }
  } catch { /* ignore non-JSON messages */ }
});
```

**Step 2: Commit**

```bash
git add src/components/messages/WhatsAppTab.jsx
git commit -m "feat(whatsapp): rewrite WhatsAppTab with Embedded Signup"
```

---

## Task 5: Update messagingService for instance_id

**Files:**
- Modify: `src/services/messagingService.js` (functions `sendWhatsAppMessage` and `triggerLoteProcessing`)

**Step 1: Add instance_id parameter**

Both `sendWhatsAppMessage` and `triggerLoteProcessing` should accept an optional `instance_id` parameter and pass it through to the Edge Function body. This allows n8n to look up the correct credentials per instance.

Changes to `sendWhatsAppMessage`:
```javascript
export const sendWhatsAppMessage = async ({
  phone, message, clientName, tipo = "recordatorio", instanceId = null,
}) => {
  // ... existing code, add instanceId to the body
  { body: { phone, message, clientName, tipo, instance_id: instanceId } },
```

Changes to `triggerLoteProcessing`:
```javascript
// Add instance_id to each item in the array sent to n8n
const items = destinatarios.map((d) => ({
  ...existing fields...,
  instance_id: instanceId || null,
}));
```

**Step 2: Commit**

```bash
git add src/services/messagingService.js
git commit -m "feat(whatsapp): pass instance_id through messaging service"
```

---

## Task 6: Update .env.example

**Files:**
- Modify: `.env.example`

**Step 1: Add new Embedded Signup variables**

Add after the existing Meta section:

```bash
# =============================================================================
# META EMBEDDED SIGNUP (WhatsApp Coexistence)
# Estas variables son para el flujo de Embedded Signup donde cada cliente
# conecta su propio numero de WhatsApp Business.
# =============================================================================

# APP_ID — developers.facebook.com → tu App → Settings → Basic → App ID
VITE_META_APP_ID=TU_APP_ID

# CONFIG_ID — Facebook Login for Business → Configurations → tu config → ID
VITE_META_CONFIG_ID=TU_CONFIG_ID
```

Add to the Supabase Edge Functions secrets section:
```bash
#   META_APP_ID=123456789
#   META_APP_SECRET=xxxxxxxxx   (NUNCA en frontend)
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add Embedded Signup env vars to .env.example"
```

---

## Task 7: Build verification

**Step 1: Run lint**
```bash
pnpm lint
```

**Step 2: Run tests**
```bash
pnpm test
```

**Step 3: Run build**
```bash
pnpm build
```

Expected: all pass with no errors.

**Step 4: Final commit if any fixes needed**

---

## Execution Order & Dependencies

```
Task 1 (proxy-n8n-whatsapp)     ←── no deps, CRITICAL, unblocks existing send flow
Task 2 (SQL migration)          ←── no deps, needed for Tasks 3-5
Task 3 (proxy-embedded-signup)  ←── depends on Task 2
Task 4 (WhatsAppTab rewrite)    ←── depends on Tasks 2, 3
Task 5 (messagingService)       ←── depends on Task 2
Task 6 (.env.example)           ←── no deps
Task 7 (verification)           ←── depends on all
```

Tasks 1, 2, and 6 are independent and can be done in parallel.
Tasks 3 and 5 can be done in parallel after Task 2.
Task 4 depends on Tasks 2 and 3.

---

## Post-Implementation: Meta App Review Video

After implementing, record a screencast (in English or with English subtitles) showing:

1. **Login** — Authenticate into DistriMM
2. **Navigate to Messages** — Go to `/mensajes`
3. **Templates tab** — Create a new template with variables like `{{nombre}}`, `{{total}}`
4. **WhatsApp tab** — Click "Conectar WhatsApp" → show Embedded Signup flow
5. **New Batch tab** — Select recipients, choose template, preview messages
6. **Send** — Send a test message to a verified number
7. **History tab** — Show delivery status in the log

This covers everything the Meta reviewer asked for: template creation, template management, and message sending.

---

## Deploy Checklist

- [ ] Run SQL migration `020_whatsapp_instances.sql` in Supabase Dashboard
- [ ] Deploy `proxy-n8n-whatsapp`: `supabase functions deploy proxy-n8n-whatsapp`
- [ ] Deploy `proxy-embedded-signup`: `supabase functions deploy proxy-embedded-signup`
- [ ] Add secrets in Supabase Edge Functions:
  - `N8N_WHATSAPP_URL`
  - `N8N_AUTH_KEY`
  - `META_APP_ID`
  - `META_APP_SECRET`
- [ ] Add to `.env`:
  - `VITE_META_APP_ID`
  - `VITE_META_CONFIG_ID`
- [ ] Remove old env vars after confirming new flow works:
  - `VITE_META_PHONE_NUMBER_ID`
  - `VITE_META_PHONE_DISPLAY`
  - `VITE_META_SANDBOX`
- [ ] Re-apply for `whatsapp_business_manage_events` (should auto-approve now)
- [ ] Record new video and re-apply for `whatsapp_business_management`
