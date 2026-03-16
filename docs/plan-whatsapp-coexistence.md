# Plan: WhatsApp Coexistence con Embedded Signup para DistriMM

## Contexto

DistriMM actualmente usa Meta Cloud API con un solo Phone Number ID hardcoded en `.env`. Los clientes no pueden conectar su propio numero de WhatsApp Business. El usuario es Tech Provider de Meta y quiere que cada cliente pueda vincular su numero existente de WhatsApp Business App mientras sigue usando la app en el celular (Coexistence). Esto requiere implementar **Embedded Signup** con `featureType: "whatsapp_business_app_onboard"`.

### Estado actual del codigo

- `WhatsAppTab.jsx` lee `VITE_META_PHONE_NUMBER_ID` de env vars (estatico)
- `messagingService.js` llama `supabase.functions.invoke("proxy-n8n-whatsapp")` pero la Edge Function **no existe** como archivo — es un bug pre-existente
- `useLotes.js` envia lotes sin `instance_id`
- `.env.example` tiene `VITE_META_WABA_ID` (variable existente no contemplada originalmente)
- `distrimm_whatsapp_instances` esta documentada en CLAUDE.md pero no existe en la DB ni en codigo

---

## Parte 1: Guia para Gemini - Configurar Meta App

> Copiar esto como prompt a Gemini para que guie paso a paso la configuracion de la Meta App.

### PROMPT PARA GEMINI:

```
Soy Tech Provider de Meta y necesito configurar mi Meta App para WhatsApp Embedded Signup con Coexistence. Mi app se llama DistriMM y esta deployada en [TU_DOMINIO]. Guiame paso a paso por cada pantalla de Meta for Developers para:

1. CREAR O VERIFICAR MI META APP
   - Ir a developers.facebook.com/apps
   - Si no tengo app: Create App → tipo "Business" → nombre "DistriMM"
   - Si ya tengo: verificar que sea tipo Business
   - Anotar el APP ID y APP SECRET (Settings → Basic)

2. AGREGAR PRODUCTO WHATSAPP
   - En el dashboard de la app → Add Product → WhatsApp
   - Aceptar WhatsApp Business Terms of Service
   - Confirmar que mi Business Manager esta verificado

3. CONFIGURAR FACEBOOK LOGIN FOR BUSINESS
   - Ir a Facebook Login for Business → Configurations
   - Click "+ Create Configuration" o "Create from template"
   - Seleccionar template: "WhatsApp Embedded Signup Configuration"
   - Nombre: "DistriMM Embedded Signup"
   - Seleccionar variacion: "Embedded Signup"
   - Assets: seleccionar "WhatsApp Account" con permiso "manage"
   - Permissions requeridos (marcar los 3):
     * whatsapp_business_management
     * whatsapp_business_messaging
     * business_management
   - Guardar y ANOTAR el CONFIGURATION ID generado

4. CONFIGURAR DOMINIOS PERMITIDOS
   - En Facebook Login for Business → Settings
   - Valid OAuth Redirect URIs: agregar https://[TU_DOMINIO]
   - Allowed Domains for JavaScript SDK: agregar https://[TU_DOMINIO]
   - Si estoy en desarrollo: agregar tambien http://localhost:5173

5. CONFIGURAR WEBHOOKS DE WHATSAPP
   - Ir a WhatsApp → Configuration
   - Webhook URL: configurar el endpoint que recibira eventos
   - Verify Token: generar un token secreto y guardarlo
   - Suscribir a: messages, message_status (para delivery reports)
   - IMPORTANTE: La app DEBE estar suscrita a webhooks ANTES de que clientes hagan Embedded Signup

6. APP REVIEW (si no esta aprobada)
   - Ir a App Review → Permissions and Features
   - Solicitar aprobacion para:
     * whatsapp_business_management
     * whatsapp_business_messaging
     * business_management
   - Proporcionar: video demo, descripcion de uso, privacy policy URL
   - NOTA: Como Tech Provider ya aprobado, estos permisos deberian estar disponibles

7. OBTENER SOLUTION ID (opcional pero recomendado)
   - En WhatsApp → Embedded Signup → Solution ID
   - O crear uno desde el Business Manager
   - Esto pre-configura opciones para los clientes durante el signup

8. VERIFICAR CONFIGURACION FINAL
   - APP ID: _______________
   - APP SECRET: _______________ (NUNCA compartir, solo backend)
   - CONFIGURATION ID: _______________
   - SOLUTION ID: _______________ (opcional)
   - Webhooks configurados: SI/NO
   - App Review aprobada: SI/NO
   - Dominios agregados: SI/NO

Responde pantalla por pantalla con screenshots si es posible, y dime que hacer en cada campo.
```

---

## Parte 2: Implementacion en DistriMM

### Paso 1 — Migracion SQL: tablas para instancias WhatsApp

**Archivo:** `sql/020_whatsapp_instances.sql` (nuevo)

Se usan **dos tablas** para separar datos publicos (consultables por el usuario) de credenciales sensibles (solo accesibles desde Edge Functions con `service_role`).

```sql
-- Tabla publica: info de la instancia (visible al usuario via RLS)
CREATE TABLE IF NOT EXISTS distrimm_whatsapp_instances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  waba_id TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  phone_display TEXT,           -- "+57 318 ..." para mostrar en UI
  business_name TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','disconnected','expired')),
  coexistence BOOLEAN DEFAULT true,
  meta_business_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, phone_number_id)
);

-- RLS: usuarios ven solo sus instancias
ALTER TABLE distrimm_whatsapp_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own instances"
  ON distrimm_whatsapp_instances FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users update own instances"
  ON distrimm_whatsapp_instances FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
-- INSERT y DELETE solo desde Edge Functions (service_role), no desde frontend

-- Trigger updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON distrimm_whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- Tabla privada: credenciales (SIN RLS para usuario, solo service_role)
CREATE TABLE IF NOT EXISTS distrimm_whatsapp_credentials (
  instance_id UUID PRIMARY KEY REFERENCES distrimm_whatsapp_instances(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  token_refreshed_at TIMESTAMPTZ DEFAULT now()
);

-- RLS habilitado pero SIN policies para usuarios = solo service_role puede leer
ALTER TABLE distrimm_whatsapp_credentials ENABLE ROW LEVEL SECURITY;
-- No se crean policies → ningun usuario autenticado puede leer access_token
```

**Por que dos tablas:**
- `distrimm_whatsapp_instances` — el frontend la lee (SELECT) para mostrar estado, phone display, etc.
- `distrimm_whatsapp_credentials` — solo Edge Functions con `service_role` key acceden. El `access_token` nunca llega al browser.

### Paso 2 — Edge Function: `proxy-embedded-signup`

**Archivo:** `supabase/functions/proxy-embedded-signup/index.ts` (nuevo)

Responsabilidades:
- Recibir el `code` del frontend (resultado del FB.login)
- Intercambiarlo por un **access token** con Meta Graph API:
  ```
  GET https://graph.facebook.com/v21.0/oauth/access_token
    ?client_id={APP_ID}
    &client_secret={APP_SECRET}
    &code={CODE}
  ```
- Obtener info de la WABA y phone number usando el token
- Guardar datos publicos en `distrimm_whatsapp_instances` (con `service_role`)
- Guardar `access_token` en `distrimm_whatsapp_credentials` (con `service_role`)
- Suscribir la WABA a webhooks automaticamente:
  ```
  POST https://graph.facebook.com/v21.0/{WABA_ID}/subscribed_apps
    ?access_token={ACCESS_TOKEN}
  ```
- Retornar al frontend solo datos publicos (id, phone_display, status) — nunca el token

Secrets necesarios en Supabase Edge Functions:
- `META_APP_ID`
- `META_APP_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY` (ya disponible como variable de entorno built-in en Edge Functions)

### Paso 3 — Token Refresh

**Problema:** Los tokens obtenidos via Embedded Signup son short-lived (~1h). Se deben intercambiar por un long-lived token (~60 dias) y renovar periodicamente.

**Solucion — en `proxy-embedded-signup`:**

1. Despues de obtener el short-lived token, intercambiarlo inmediatamente:
   ```
   GET https://graph.facebook.com/v21.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id={APP_ID}
     &client_secret={APP_SECRET}
     &fb_exchange_token={SHORT_LIVED_TOKEN}
   ```
2. Guardar el long-lived token en `distrimm_whatsapp_credentials` con `token_expires_at = now() + 60 days`

**Renovacion automatica — dos opciones (elegir una):**

| Opcion | Como | Pro | Contra |
|--------|------|-----|--------|
| **A. Cron Edge Function** | Supabase pg_cron o Edge Function scheduled que renueva tokens proximos a vencer (< 7 dias) | Automatico, confiable | Requiere setup de cron |
| **B. Lazy refresh** | Antes de cada envio, `proxy-n8n-whatsapp` verifica `token_expires_at`. Si < 7 dias, renueva inline | Sin infra extra | Agrega latencia al primer envio post-renovacion |

**Recomendacion:** Opcion B (lazy refresh) para MVP. Migrar a cron cuando haya >10 instancias activas.

### Paso 4 — Componente frontend: EmbeddedSignup

**Archivo:** editar `src/components/messages/WhatsAppTab.jsx`

Cambios:
1. Cargar Facebook JS SDK (`https://connect.facebook.net/en_US/sdk.js`)
2. Agregar boton "Conectar WhatsApp" que llama a `launchWhatsAppSignup()`
3. La funcion ejecuta:

```javascript
// Flujo de Embedded Signup
FB.init({ appId: import.meta.env.VITE_META_APP_ID, version: 'v21.0' });

function launchWhatsAppSignup() {
  FB.login(callback, {
    config_id: import.meta.env.VITE_META_CONFIG_ID,
    response_type: 'code',
    override_default_response_type: true,
    extras: {
      feature: 'whatsapp_embedded_signup',
      featureType: 'whatsapp_business_app_onboard', // <-- COEXISTENCE
      sessionInfoVersion: 3,
      setup: {
        solutionID: import.meta.env.VITE_META_SOLUTION_ID // opcional
      }
    }
  });
}

// Listener para recibir WABA ID y Phone Number ID durante el flujo
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://www.facebook.com') return;
  try {
    const data = JSON.parse(event.data);
    if (data.type === 'WA_EMBEDDED_SIGNUP') {
      if (data.event === 'FINISH') {
        const { phone_number_id, waba_id } = data.data;
        // Enviar al backend junto con el code del callback
      }
      if (data.event === 'CANCEL') {
        // Usuario cancelo el flujo — mostrar mensaje
      }
      if (data.event === 'ERROR') {
        // Error en el flujo — mostrar error
      }
    }
  } catch (e) {
    // Ignorar mensajes que no son JSON (otros iframes)
  }
});
```

4. Enviar `code` + `waba_id` + `phone_number_id` a la Edge Function `proxy-embedded-signup`
5. Mostrar estado de conexion desde `distrimm_whatsapp_instances` en vez de env vars

### Paso 5 — Actualizar WhatsAppTab UI

**Archivo:** `src/components/messages/WhatsAppTab.jsx`

| Antes | Despues |
|-------|---------|
| Lee `VITE_META_PHONE_NUMBER_ID` del .env | Lee de `distrimm_whatsapp_instances` (Supabase) |
| Muestra status estatico | Muestra instancia conectada con boton desconectar |
| Sin onboarding | Boton "Conectar WhatsApp" con Embedded Signup |
| Un solo numero | Soporte para la instancia del usuario |

### Paso 6 — Actualizar flujo de envio de mensajes

**Archivos:**
- `src/services/messagingService.js`
- `src/hooks/messaging/useLotes.js`

Cambios:
- `sendWhatsAppMessage()` y `triggerLoteProcessing()` incluyen `instance_id` del usuario
- Edge Function `proxy-n8n-whatsapp` recibe `instance_id`, busca credenciales en `distrimm_whatsapp_credentials` (con `service_role`), y pasa `phone_number_id` + `access_token` a n8n
- n8n usa las credenciales recibidas para enviar via Meta Cloud API

### Paso 7 — Crear Edge Function faltante: `proxy-n8n-whatsapp`

**Archivo:** `supabase/functions/proxy-n8n-whatsapp/index.ts` (nuevo — ya estaba referenciado en messagingService.js pero no existia)

Responsabilidades:
1. Recibir request del frontend con `instance_id` + datos del mensaje
2. Buscar credenciales en `distrimm_whatsapp_credentials` usando `service_role`
3. **Lazy token refresh:** si `token_expires_at < now() + 7 days`, renovar token inline
4. Pasar `phone_number_id` + `access_token` + datos del mensaje a n8n webhook
5. Retornar respuesta de n8n al frontend

Misma estructura que `proxy-n8n-cfo` pero con logica de credenciales multi-instancia.

### Paso 8 — Webhook Routing (mensajes entrantes)

**Problema:** Cuando hay multiples WABAs suscritas, todos los webhooks llegan al mismo endpoint. Se debe identificar a que instancia corresponde cada evento.

**Solucion:** El payload de webhook de Meta incluye el `phone_number_id` del destinatario en cada entrada:

```json
{
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "value": {
        "metadata": {
          "phone_number_id": "PHONE_NUMBER_ID",
          "display_phone_number": "57XXXXXXXXXX"
        },
        "messages": [...]
      }
    }]
  }]
}
```

**Implementacion en n8n:**
- El webhook recibe el evento
- Extraer `phone_number_id` de `entry[0].changes[0].value.metadata.phone_number_id`
- Buscar en `distrimm_whatsapp_instances` a que `user_id` pertenece
- Rutear la logica (respuestas, logs) al usuario correcto

**Para MVP:** Si solo hay 1-2 instancias, el routing es trivial. La estructura queda lista para escalar.

### Paso 9 — Variables de entorno

**Frontend (.env) — NUEVAS:**
```
VITE_META_APP_ID=123456789          # Facebook App ID (publico, OK en frontend)
VITE_META_CONFIG_ID=abc123          # Configuration ID del Login for Business
VITE_META_SOLUTION_ID=xyz789        # Solution ID (opcional)
```

**Frontend (.env) — SE ELIMINA:**
```
# VITE_META_PHONE_NUMBER_ID  <- ya no se hardcodea, viene de la DB
# VITE_META_PHONE_DISPLAY    <- viene de la DB
# VITE_META_SANDBOX          <- se maneja por instancia
# VITE_META_WABA_ID          <- viene de la DB (existia en .env.example)
```

**Supabase Edge Function Secrets — NUEVAS:**
```
META_APP_ID=123456789
META_APP_SECRET=xxxxxxxxx           # NUNCA en frontend
```

---

## Orden de ejecucion

| # | Tarea | Donde | Dependencia |
|---|-------|-------|-------------|
| 1 | Configurar Meta App (con Gemini) | Meta for Developers | Ninguna |
| 2 | Crear migracion SQL (2 tablas) | Supabase Dashboard / CLI | Ninguna |
| 3 | Crear Edge Function `proxy-embedded-signup` (con token exchange) | Supabase | 1, 2 |
| 4 | Crear Edge Function `proxy-n8n-whatsapp` (con lazy refresh) | Supabase | 2 |
| 5 | Implementar Embedded Signup en WhatsAppTab | Frontend React | 1, 3 |
| 6 | Actualizar messagingService + useLotes (pasar instance_id) | Frontend React | 2, 4 |
| 7 | Actualizar n8n workflow para multi-instance + webhook routing | n8n | 2 |
| 8 | Actualizar CLAUDE.md (quitar "solo n8n" de whatsapp_instances) | Docs | 2 |
| 9 | Testing end-to-end en sandbox | Todo | 1-8 |

---

## Verificacion

1. **Embedded Signup**: Click "Conectar WhatsApp" → flujo de Facebook → QR code pairing → instancia guardada en DB → token long-lived guardado en credentials
2. **Seguridad**: `access_token` no aparece en Network tab del browser ni en respuestas de Supabase al frontend
3. **Envio**: Crear lote → seleccionar destinatarios → enviar → Edge Function busca credenciales → n8n envia con token correcto → mensaje llega
4. **Coexistence**: El cliente sigue recibiendo mensajes en su app WhatsApp Business Y los automatizados de DistriMM llegan por API
5. **Token refresh**: Simular token proximo a vencer → lazy refresh lo renueva → envio exitoso
6. **Webhook routing**: Mensaje entrante → n8n extrae phone_number_id → identifica instancia → rutea correctamente
7. **Desconexion**: Boton "Desconectar" → marca instancia como disconnected → deja de enviar

---

## Archivos a crear/modificar

| Archivo | Accion |
|---------|--------|
| `sql/020_whatsapp_instances.sql` | CREAR (2 tablas: instances + credentials) |
| `supabase/functions/proxy-embedded-signup/index.ts` | CREAR |
| `supabase/functions/proxy-n8n-whatsapp/index.ts` | CREAR |
| `src/components/messages/WhatsAppTab.jsx` | MODIFICAR |
| `src/services/messagingService.js` | MODIFICAR |
| `src/hooks/messaging/useLotes.js` | MODIFICAR |
| `.env.example` | MODIFICAR |
| `CLAUDE.md` | MODIFICAR (actualizar descripcion de whatsapp_instances) |

---

## Fuentes

- [Meta Embedded Signup Docs](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/)
- [Onboarding Business App Users (Coexistence)](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/)
- [WhatsApp Coexistence - Clientify](https://clientify.com/en/blog/communication/whatsapp-coexistence)
- [WhatsApp Coexistence - yCloud](https://www.ycloud.com/blog/whatsapp-business-app-coexistence-meta-update)
- [Chatwoot Embedded Signup Docs](https://developers.chatwoot.com/self-hosted/configuration/features/integrations/whatsapp-embedded-signup)
- [Meta Long-Lived Tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/)
