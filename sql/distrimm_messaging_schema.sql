-- =============================================================================
-- Módulo: Mensajería WhatsApp
-- Descripción: Plantillas, log de mensajes, lotes de recordatorios y detalle
--              de envíos para la integración con Meta Cloud API vía n8n.
-- Tablas: distrimm_plantillas_mensajes, distrimm_mensajes_log,
--          distrimm_recordatorios_lote, distrimm_recordatorios_detalle
-- =============================================================================

-- ---------------------------------------------------------------------------
-- distrimm_plantillas_mensajes
-- Plantillas reutilizables para mensajes de WhatsApp.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS distrimm_plantillas_mensajes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text        NOT NULL,
  tipo        text        NOT NULL,
  contenido   text        NOT NULL,
  variables   text[]      DEFAULT '{}',
  activa      boolean     DEFAULT true,
  created_at  timestamptz DEFAULT timezone('utc', now()),
  updated_at  timestamptz DEFAULT timezone('utc', now())
);

-- RLS
ALTER TABLE distrimm_plantillas_mensajes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados pueden ver plantillas"
  ON distrimm_plantillas_mensajes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuarios autenticados pueden crear plantillas"
  ON distrimm_plantillas_mensajes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar plantillas"
  ON distrimm_plantillas_mensajes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden eliminar plantillas"
  ON distrimm_plantillas_mensajes FOR DELETE
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- distrimm_mensajes_log
-- Registro de cada mensaje enviado (individual o parte de un lote).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS distrimm_mensajes_log (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                  text        NOT NULL,
  destinatario_nombre   text,
  destinatario_telefono text,
  destinatario_nit      text,
  plantilla_id          uuid,
  mensaje_renderizado   text,
  estado                text        DEFAULT 'pendiente',
  error_detalle         text,
  facturas_ids          uuid[]      DEFAULT '{}',
  created_at            timestamptz DEFAULT timezone('utc', now()),
  user_id               uuid        DEFAULT auth.uid(),
  meta_message_id       text,
  chatwoot_message_id   bigint
);

-- RLS
ALTER TABLE distrimm_mensajes_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados pueden ver log de mensajes"
  ON distrimm_mensajes_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuarios autenticados pueden crear log de mensajes"
  ON distrimm_mensajes_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar log de mensajes"
  ON distrimm_mensajes_log FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden eliminar log de mensajes"
  ON distrimm_mensajes_log FOR DELETE
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- distrimm_recordatorios_lote
-- Cabecera de un envío masivo de recordatorios.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS distrimm_recordatorios_lote (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                 text        NOT NULL,
  mensaje_plantilla    text        NOT NULL,
  plantilla_id         uuid,
  filtros_aplicados    jsonb       DEFAULT '{}',
  total_destinatarios  integer     DEFAULT 0,
  enviados             integer     DEFAULT 0,
  fallidos             integer     DEFAULT 0,
  estado               text        DEFAULT 'pendiente',
  created_at           timestamptz DEFAULT timezone('utc', now()),
  updated_at           timestamptz DEFAULT timezone('utc', now()),
  created_by           uuid        DEFAULT auth.uid()
);

-- RLS
ALTER TABLE distrimm_recordatorios_lote ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados pueden ver lotes"
  ON distrimm_recordatorios_lote FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuarios autenticados pueden crear lotes"
  ON distrimm_recordatorios_lote FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar lotes"
  ON distrimm_recordatorios_lote FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden eliminar lotes"
  ON distrimm_recordatorios_lote FOR DELETE
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- distrimm_recordatorios_detalle
-- Detalle por destinatario dentro de un lote de recordatorios.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS distrimm_recordatorios_detalle (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id               uuid        NOT NULL REFERENCES distrimm_recordatorios_lote(id) ON DELETE CASCADE,
  cliente_nombre        text,
  cliente_nit           text,
  telefono              text,
  mensaje_personalizado text,
  estado_envio          text        DEFAULT 'pendiente',
  error_detalle         text,
  facturas_ids          uuid[]      DEFAULT '{}',
  enviado_at            timestamptz,
  created_at            timestamptz DEFAULT timezone('utc', now())
);

-- RLS
ALTER TABLE distrimm_recordatorios_detalle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados pueden ver detalle de recordatorios"
  ON distrimm_recordatorios_detalle FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuarios autenticados pueden crear detalle de recordatorios"
  ON distrimm_recordatorios_detalle FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar detalle de recordatorios"
  ON distrimm_recordatorios_detalle FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden eliminar detalle de recordatorios"
  ON distrimm_recordatorios_detalle FOR DELETE
  TO authenticated
  USING (true);
