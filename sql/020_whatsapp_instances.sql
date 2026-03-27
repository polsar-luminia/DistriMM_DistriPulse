-- ============================================================================
-- DistriMM WhatsApp Embedded Signup — Schema Migration
-- Crea tablas para instancias WhatsApp multi-tenant con Coexistence
-- ============================================================================
-- SEGURIDAD: Se separan datos publicos (instances) de credenciales (credentials).
-- El access_token NUNCA debe ser accesible desde el frontend.
-- instances: RLS permite SELECT/UPDATE al usuario dueño.
-- credentials: RLS habilitado SIN policies = solo service_role puede acceder.
-- INSERT/DELETE en instances: solo service_role (Edge Functions).
-- ============================================================================

-- ============================================================================
-- 1. TABLA PUBLICA: distrimm_whatsapp_instances
-- Datos visibles al usuario via RLS (estado, telefono, nombre de negocio)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.distrimm_whatsapp_instances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  waba_id TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  phone_display TEXT,              -- "+57 318 ..." para mostrar en UI
  business_name TEXT,
  status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'disconnected', 'expired')),
  coexistence BOOLEAN DEFAULT true,
  meta_business_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Un usuario no puede tener el mismo phone_number_id duplicado
  UNIQUE(user_id, phone_number_id)
);

-- Comentarios de tabla y columnas clave
COMMENT ON TABLE public.distrimm_whatsapp_instances
  IS 'Instancias WhatsApp vinculadas via Embedded Signup. Datos publicos (sin tokens).';
COMMENT ON COLUMN public.distrimm_whatsapp_instances.coexistence
  IS 'true = el cliente sigue usando WhatsApp Business App en su celular (modo Coexistence).';
COMMENT ON COLUMN public.distrimm_whatsapp_instances.status
  IS 'active: conectada y funcional. disconnected: desvinculada por el usuario. expired: token vencido sin renovar.';

-- Indice para buscar instancias por usuario (usado en el frontend y Edge Functions)
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_user_id
  ON public.distrimm_whatsapp_instances(user_id);

-- Indice para webhook routing: buscar instancia por phone_number_id
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_phone_number
  ON public.distrimm_whatsapp_instances(phone_number_id);

-- ============================================================================
-- 2. RLS: distrimm_whatsapp_instances
-- SELECT y UPDATE: solo el usuario dueño.
-- INSERT y DELETE: solo service_role (Edge Functions) — sin policy = bloqueado.
-- ============================================================================

ALTER TABLE public.distrimm_whatsapp_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own whatsapp instances"
  ON public.distrimm_whatsapp_instances
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own whatsapp instances"
  ON public.distrimm_whatsapp_instances
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Sin CREATE POLICY para INSERT ni DELETE:
-- Solo service_role (Supabase Edge Functions) puede insertar o eliminar instancias.
-- Esto previene que un usuario malicioso cree instancias falsas desde el frontend.

-- ============================================================================
-- 3. TRIGGER: auto-actualizar updated_at
-- Requiere extension moddatetime (habilitada por defecto en Supabase)
-- ============================================================================

CREATE TRIGGER set_updated_at_whatsapp_instances
  BEFORE UPDATE ON public.distrimm_whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- ============================================================================
-- 4. TABLA PRIVADA: distrimm_whatsapp_credentials
-- Credenciales sensibles — SOLO accesible via service_role
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.distrimm_whatsapp_credentials (
  instance_id UUID PRIMARY KEY
    REFERENCES public.distrimm_whatsapp_instances(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,    -- null = token sin fecha de expiracion conocida
  token_refreshed_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.distrimm_whatsapp_credentials
  IS 'Credenciales WhatsApp (access_token). SOLO accesible via service_role. Nunca exponer al frontend.';
COMMENT ON COLUMN public.distrimm_whatsapp_credentials.token_expires_at
  IS 'Fecha de expiracion del long-lived token (~60 dias desde emision). Se usa para lazy refresh.';

-- ============================================================================
-- 5. RLS: distrimm_whatsapp_credentials
-- RLS habilitado pero SIN policies = ningun usuario autenticado puede leer.
-- Solo service_role (Edge Functions) bypasea RLS y puede operar.
-- ============================================================================

ALTER TABLE public.distrimm_whatsapp_credentials ENABLE ROW LEVEL SECURITY;

-- INTENCIONALMENTE sin policies:
-- Ningun rol autenticado (ni admin via frontend) puede leer access_token.
-- Solo service_role key (server-side) bypasea RLS automaticamente.
