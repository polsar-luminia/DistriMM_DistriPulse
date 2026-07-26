/**
 * Cliente Supabase con service role. Único punto de creación para reusar la instancia.
 * El service role omite RLS — solo se usa server-side en el VPS, nunca en el frontend.
 */
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "[distrimm-sms] Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno",
  );
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

module.exports = { supabaseAdmin };
