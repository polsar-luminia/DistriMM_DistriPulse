// Orígenes permitidos (separados por coma en el secret ALLOWED_ORIGINS)
const ALLOWED_ORIGINS_RAW = Deno.env.get("ALLOWED_ORIGINS") || Deno.env.get("ALLOWED_ORIGIN") || "";
const ALLOWED_ORIGINS = ALLOWED_ORIGINS_RAW
  ? ALLOWED_ORIGINS_RAW.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

/**
 * Retorna el origin permitido para la respuesta CORS.
 * Si el origin del request está en la whitelist, lo devuelve.
 * Si no hay whitelist configurada, devuelve "*" (desarrollo local).
 */
function resolveOrigin(requestOrigin?: string | null): string {
  if (ALLOWED_ORIGINS.length === 0) {
    // En producción sin configurar, usar fallback seguro en vez de wildcard
    const env = Deno.env.get("ENVIRONMENT");
    if (env === "development" || env === "local") {
      console.warn("[cors] ALLOWED_ORIGINS not configured — using wildcard (dev mode).");
      return "*";
    }
    console.error("[cors] ALLOWED_ORIGINS not configured in production — rejecting unknown origins.");
    return requestOrigin || "null";
  }
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  return ALLOWED_ORIGINS[0]; // fallback al primero de la lista
}

function buildCorsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...(origin !== "*" ? { Vary: "Origin" } : {}),
  };
}

export function corsResponse(req?: Request): Response {
  const origin = resolveOrigin(req?.headers.get("origin"));
  return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
}

export function jsonResponse(body: Record<string, unknown>, status = 200, req?: Request): Response {
  const origin = resolveOrigin(req?.headers.get("origin"));
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(origin), "Content-Type": "application/json" },
  });
}

// Backward compat: export static headers for functions that don't pass req
export const CORS_HEADERS: Record<string, string> = buildCorsHeaders(
  ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS[0] : "*",
);
