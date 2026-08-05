/**
 * Fachada REST para GPT Actions (custom GPTs de ChatGPT).
 *
 * El builder de GPTs no habla MCP: espera un esquema OpenAPI. Estos
 * endpoints exponen las mismas RPCs fn_mcp_* como GET bajo /mcp/actions/*
 * (se monta bajo /mcp para reutilizar el proxy de nginx existente).
 *
 * Auth: Authorization: Bearer <MCP_ACCESS_TOKEN> — en el GPT se configura
 * como "API Key" tipo Bearer. El esquema en /mcp/actions/openapi.json es
 * público (solo describe la API, no expone datos).
 */

const BASE_URL = "https://distrimm.luminiatech.digital/mcp/actions";

const num = (v) => {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v) => (v === undefined || v === "" ? null : String(v));

/** Mapeo endpoint → RPC y traducción de query params */
const ACTIONS = {
  resumen: {
    fn: "fn_mcp_resumen",
    args: () => ({}),
  },
  ventas: {
    fn: "fn_mcp_ventas",
    args: (q) => ({
      p_desde: str(q.desde),
      p_hasta: str(q.hasta),
      p_agrupar: str(q.agrupar_por) || "mes",
      p_buscar: str(q.buscar),
      p_limite: num(q.limite) ?? 20,
    }),
  },
  cartera: {
    fn: "fn_mcp_cartera",
    args: (q) => ({
      p_agrupar: str(q.agrupar_por) || "aging",
      p_dias_mora_min: num(q.dias_mora_min),
      p_limite: num(q.limite) ?? 20,
    }),
  },
  inventario: {
    fn: "fn_mcp_inventario",
    args: (q) => ({
      p_agrupar: str(q.agrupar_por) || "bodega",
      p_buscar: str(q.buscar),
      p_solo_confiables: q.solo_bodegas_confiables !== "false",
      p_limite: num(q.limite) ?? 20,
    }),
  },
  sugerido: {
    fn: "fn_mcp_sugerido",
    args: (q) => ({
      p_clasificacion: str(q.clasificacion),
      p_dias_cobertura: num(q.dias_cobertura),
      p_pct_crecimiento: num(q.pct_crecimiento),
      p_pct_reserva: num(q.pct_reserva),
      p_limite: num(q.limite) ?? 25,
    }),
  },
  comisiones: {
    fn: "fn_mcp_comisiones",
    args: (q) => ({
      p_year: num(q.year),
      p_month: num(q.month),
      p_vendedor: str(q.vendedor),
    }),
  },
  buscar: {
    fn: "fn_mcp_buscar",
    args: (q) => ({ p_query: str(q.q) || "", p_limite: num(q.limite) ?? 10 }),
  },
  ficha: {
    fn: "fn_mcp_ficha",
    args: (q) => ({ p_id: str(q.id) || "" }),
  },
};

/* --- Esquema OpenAPI (para el botón "Importar desde URL" del builder) --- */

const p = (name, schema, description, required = false) => ({
  name,
  in: "query",
  required,
  description,
  schema,
});
const LIMITE = p("limite", { type: "integer", minimum: 1, maximum: 100 }, "Máximo de grupos/filas a devolver");
const RESP = {
  200: {
    description: "Resultado en JSON (valores en pesos colombianos COP)",
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Resultado" },
      },
    },
  },
};

export const OPENAPI_SCHEMA = {
  openapi: "3.1.0",
  info: {
    title: "DistriMM Analytics",
    version: "2.0.0",
    description:
      "Datos de negocio de DistriMM (distribuidora agropecuaria colombiana), solo lectura: ventas, cartera, inventario, comisiones y sugerido de compra. Moneda: COP. Zona horaria: America/Bogota.",
  },
  servers: [{ url: BASE_URL }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
    },
    schemas: {
      Resultado: {
        type: "object",
        description:
          "Resultado de la consulta. La estructura varía según el endpoint; las cifras monetarias vienen en pesos colombianos (COP) y las fechas en formato YYYY-MM-DD.",
        properties: {
          moneda: { type: "string", description: "Siempre 'COP' cuando hay cifras monetarias" },
          error: { type: "string", description: "Presente solo si la consulta no pudo resolverse" },
        },
        additionalProperties: true,
      },
    },
  },
  paths: {
    "/resumen": {
      get: {
        operationId: "resumenEjecutivo",
        summary: "Panorama general del negocio",
        description:
          "Ventas del mes actual vs mes anterior (total y a mismo corte de días), cartera (total, vencido, % mora), valor de inventario y última liquidación de comisiones. Usar primero cuando pregunten 'cómo vamos'.",
        parameters: [],
        responses: RESP,
      },
    },
    "/ventas": {
      get: {
        operationId: "consultarVentas",
        summary: "Ventas agregadas por dimensión y rango de fechas",
        description:
          "Venta neta (descuenta devoluciones), margen, unidades, facturas y clientes por grupo. Historial desde noviembre 2025. Sin fechas usa el mes actual.",
        parameters: [
          p("desde", { type: "string", format: "date" }, "Fecha inicial YYYY-MM-DD"),
          p("hasta", { type: "string", format: "date" }, "Fecha final YYYY-MM-DD"),
          p(
            "agrupar_por",
            { type: "string", enum: ["mes", "dia", "vendedor", "marca", "categoria", "producto", "cliente", "municipio"], default: "mes" },
            "Dimensión de agrupación",
          ),
          p("buscar", { type: "string" }, "Filtro por producto, cliente, marca o código exacto"),
          LIMITE,
        ],
        responses: RESP,
      },
    },
    "/cartera": {
      get: {
        operationId: "consultarCartera",
        summary: "Cartera (cuentas por cobrar) de la última carga",
        description:
          "Saldos agrupados por aging (rangos de mora), vendedor, cliente, zona o ciudad. dias_mora_min filtra lo vencido (1) o crítico (90).",
        parameters: [
          p(
            "agrupar_por",
            { type: "string", enum: ["aging", "vendedor", "cliente", "zona", "ciudad"], default: "aging" },
            "Dimensión de agrupación",
          ),
          p("dias_mora_min", { type: "integer" }, "Solo documentos con al menos estos días de mora"),
          LIMITE,
        ],
        responses: RESP,
      },
    },
    "/inventario": {
      get: {
        operationId: "consultarInventario",
        summary: "Existencias de la última carga de saldos",
        description:
          "Valor y unidades por bodega, marca, categoría o producto. Por defecto solo bodegas confiables (3, 5 y 6). Para stock muerto/lento/agotado y sugerido usar /sugerido.",
        parameters: [
          p(
            "agrupar_por",
            { type: "string", enum: ["bodega", "marca", "categoria", "producto"], default: "bodega" },
            "Dimensión de agrupación",
          ),
          p("buscar", { type: "string" }, "Filtro por producto, marca o código exacto"),
          p("solo_bodegas_confiables", { type: "boolean", default: true }, "true = solo bodegas 3, 5 y 6 (recomendado)"),
          LIMITE,
        ],
        responses: RESP,
      },
    },
    "/sugerido": {
      get: {
        operationId: "analisisStockYSugerido",
        summary: "Clasificación de stock y sugerido de compra",
        description:
          "Clasifica el inventario cruzado con la velocidad de venta: AGOTADO, CRITICO, NORMAL, LENTO y MUERTO (capital inmovilizado), y calcula el sugerido de compra por producto (venta diaria × cobertura × (1+crecimiento) × (1+reserva) − stock). POR_PEDIR devuelve la lista de compra.",
        parameters: [
          p(
            "clasificacion",
            { type: "string", enum: ["AGOTADO", "CRITICO", "NORMAL", "LENTO", "MUERTO", "POR_PEDIR"] },
            "Filtrar el listado de productos",
          ),
          p("dias_cobertura", { type: "integer", minimum: 1, maximum: 365 }, "Días de inventario a cubrir (default: el configurado, normalmente 30)"),
          p("pct_crecimiento", { type: "number", minimum: 0, maximum: 100 }, "% de crecimiento esperado"),
          p("pct_reserva", { type: "number", minimum: 0, maximum: 100 }, "% de stock de reserva"),
          LIMITE,
        ],
        responses: RESP,
      },
    },
    "/comisiones": {
      get: {
        operationId: "consultarComisiones",
        summary: "Liquidación mensual de comisiones por vendedor",
        description:
          "Resumen del periodo y comisión de cada vendedor (ventas + recaudo, metas, % cumplimiento). Con 'vendedor' (código o parte del nombre) devuelve su detalle por marcas. Sin year/month usa el periodo más reciente.",
        parameters: [
          p("year", { type: "integer" }, "Año del periodo"),
          p("month", { type: "integer", minimum: 1, maximum: 12 }, "Mes del periodo"),
          p("vendedor", { type: "string" }, "Código o parte del nombre del vendedor"),
        ],
        responses: RESP,
      },
    },
    "/buscar": {
      get: {
        operationId: "buscar",
        summary: "Buscar productos, clientes y vendedores",
        description: "Busca por nombre o código. Devuelve ids (producto:CODIGO, cliente:NIT, vendedor:CODIGO) para /ficha.",
        parameters: [p("q", { type: "string" }, "Texto a buscar", true)],
        responses: RESP,
      },
    },
    "/ficha": {
      get: {
        operationId: "ficha",
        summary: "Ficha completa de un producto, cliente o vendedor",
        description:
          "Producto: stock, ventas 90 días, top clientes. Cliente: cartera, compras, top productos. Vendedor: ventas del mes, cartera asignada, comisión.",
        parameters: [p("id", { type: "string" }, "Id de /buscar, ej: producto:92412", true)],
        responses: RESP,
      },
    },
  },
};

/**
 * Registra la fachada REST en la app Express.
 * @param {import('express').Express} app
 * @param {object} supabase - cliente con service_role
 * @param {(token: string) => boolean} tokenValido - validador en tiempo constante
 */
export function registerActions(app, supabase, tokenValido) {
  app.get("/mcp/actions/openapi.json", (_req, res) => {
    res.json(OPENAPI_SCHEMA);
  });

  app.get("/mcp/actions/:accion", async (req, res) => {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!tokenValido(token)) {
      res.status(401).json({ error: "No autorizado" });
      return;
    }

    const accion = ACTIONS[req.params.accion];
    if (!accion) {
      res.status(404).json({
        error: "Acción desconocida",
        disponibles: Object.keys(ACTIONS),
      });
      return;
    }

    try {
      console.log(`[actions] ${req.params.accion}`, req.query);
      const { data, error } = await supabase.rpc(accion.fn, accion.args(req.query));
      if (error) {
        console.error(`[actions] RPC error en ${accion.fn}:`, error.message);
        res.status(502).json({ error: "Error consultando la base de datos: " + error.message });
        return;
      }
      res.json(data);
    } catch (err) {
      console.error("[actions] Error inesperado:", err);
      res.status(500).json({ error: "Error interno" });
    }
  });
}
