/**
 * DistriMM MCP Server — StreamableHTTP (stateless).
 *
 * Expone las herramientas de negocio (ventas, cartera, inventario,
 * comisiones, sugerido) para conectores MCP de ChatGPT y Claude.
 *
 * Auth: capability URL — el token va en la ruta (/mcp/<MCP_ACCESS_TOKEN>)
 * o como Authorization: Bearer. Los conectores de ChatGPT solo soportan
 * OAuth o "sin autenticación", así que el token en la URL hace de llave.
 *
 * Stateless: cada request crea servidor y transporte nuevos (sin sesiones),
 * el modo más robusto para conectores remotos.
 */
import "dotenv/config";
import express from "express";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools.js";

const PORT = process.env.PORT || 3102;
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MCP_ACCESS_TOKEN } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !MCP_ACCESS_TOKEN) {
  console.error(
    "[mcp] Faltan variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y/o MCP_ACCESS_TOKEN",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const SERVER_INFO = { name: "distrimm-analytics", version: "2.0.0" };
const INSTRUCTIONS = `Servidor de datos de DistriMM (distribuidora agropecuaria colombiana).
Herramientas de solo lectura sobre ventas, cartera (cuentas por cobrar), inventario,
comisiones de vendedores y sugerido de compra. Moneda: pesos colombianos (COP).
Zona horaria del negocio: America/Bogota. Empezar con resumen_ejecutivo para un panorama general.`;

/** Comparación en tiempo constante para no filtrar el token por timing */
function tokenValido(candidato) {
  if (typeof candidato !== "string") return false;
  const a = Buffer.from(candidato);
  const b = Buffer.from(MCP_ACCESS_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

function extraerToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return req.params.token || null;
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/mcp/health", (_req, res) => {
  res.json({ ok: true, server: SERVER_INFO.name, version: SERVER_INFO.version });
});

async function handleMcp(req, res) {
  if (!tokenValido(extraerToken(req))) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "No autorizado" },
      id: null,
    });
    return;
  }

  // Stateless: instancia nueva por request, sin session id
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });
  registerTools(server, supabase);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    const metodo = req.body?.method || req.method;
    const tool = req.body?.params?.name;
    console.log(`[mcp] ${metodo}${tool ? " → " + tool : ""}`);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[mcp] Error manejando request:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Error interno del servidor" },
        id: null,
      });
    }
  }
}

// Token en la ruta (conectores sin auth de ChatGPT/Claude) o Bearer en /mcp
app.post("/mcp/:token", handleMcp);
app.post("/mcp", handleMcp);

// El transporte stateless no mantiene stream de servidor ni sesiones
const metodoNoSoportado = (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed (servidor stateless)" },
    id: null,
  });
};
app.get(["/mcp", "/mcp/:token"], (req, res, next) => {
  if (req.path === "/mcp/health") return next();
  metodoNoSoportado(req, res);
});
app.delete(["/mcp", "/mcp/:token"], metodoNoSoportado);

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[mcp] DistriMM MCP Server escuchando en 127.0.0.1:${PORT}`);
});
