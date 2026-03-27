-- =============================================================================
-- Módulo: Chat / Chatbot (DistriBot)
-- Descripción: Sesiones y mensajes del chatbot IA integrado con n8n.
-- Tablas: distrimm_chat_sessions, distrimm_chat_messages
-- =============================================================================

-- ---------------------------------------------------------------------------
-- distrimm_chat_sessions
-- Cada sesión agrupa una conversación del usuario con el agente IA.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS distrimm_chat_sessions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL,
  session_id       text        NOT NULL,
  title            text        NOT NULL DEFAULT 'Nueva conversacion',
  message_count    integer     NOT NULL DEFAULT 0,
  last_message_at  timestamptz DEFAULT timezone('utc', now()),
  created_at       timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at       timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- RLS
ALTER TABLE distrimm_chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados pueden ver sus sesiones"
  ON distrimm_chat_sessions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuarios autenticados pueden crear sesiones"
  ON distrimm_chat_sessions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar sus sesiones"
  ON distrimm_chat_sessions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden eliminar sus sesiones"
  ON distrimm_chat_sessions FOR DELETE
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- distrimm_chat_messages
-- Mensajes individuales dentro de una sesión (role = 'user' | 'assistant').
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS distrimm_chat_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_session_id uuid        NOT NULL REFERENCES distrimm_chat_sessions(id) ON DELETE CASCADE,
  role            text        NOT NULL,
  content         text        NOT NULL,
  is_error        boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- RLS
ALTER TABLE distrimm_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados pueden ver mensajes"
  ON distrimm_chat_messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuarios autenticados pueden crear mensajes"
  ON distrimm_chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden actualizar mensajes"
  ON distrimm_chat_messages FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuarios autenticados pueden eliminar mensajes"
  ON distrimm_chat_messages FOR DELETE
  TO authenticated
  USING (true);
