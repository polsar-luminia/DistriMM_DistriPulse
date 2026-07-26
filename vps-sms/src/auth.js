/**
 * Middleware de autenticación: valida el JWT de Supabase del usuario.
 * Mismo patrón que las Edge Functions (proxy-n8n-whatsapp): se verifica el token
 * con el service role, sin depender de la anon key. No se exige ownership de
 * instancia — basta con que el usuario esté autenticado en la organización.
 */
const { supabaseAdmin } = require("./supabase");

async function requireAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !/^Bearer\s+/i.test(authHeader)) {
    return res.status(401).json({ error: "Token de autenticación requerido" });
  }

  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  try {
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(jwt);

    if (error || !user) {
      return res.status(401).json({ error: "Usuario no autenticado" });
    }
    req.user = user;
    return next();
  } catch (err) {
    console.error("[distrimm-sms] Error verificando JWT:", err.message);
    return res.status(401).json({ error: "Usuario no autenticado" });
  }
}

module.exports = { requireAuth };
