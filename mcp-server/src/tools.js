/**
 * Herramientas MCP de DistriMM.
 * Cada tool delega la agregación a una RPC fn_mcp_* en Supabase
 * (SECURITY DEFINER, ejecutables solo con service_role).
 */
import { z } from "zod";

const APP_URL = "https://distrimm.luminiatech.digital";

/** Envuelve el resultado de una RPC como contenido de texto MCP */
function rpcResult(data, error) {
  if (error) {
    console.error("[mcp-tools] RPC error:", error.message || error);
    return {
      content: [
        {
          type: "text",
          text: `Error consultando la base de datos: ${error.message || error}`,
        },
      ],
      isError: true,
    };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 1) }],
  };
}

export function registerTools(server, supabase) {
  const rpc = async (fn, args = {}) => {
    const { data, error } = await supabase.rpc(fn, args);
    return rpcResult(data, error);
  };

  server.registerTool(
    "resumen_ejecutivo",
    {
      title: "Resumen ejecutivo",
      description:
        "Panorama general del negocio DistriMM en un solo llamado: ventas del mes actual vs mes anterior (total y a mismo corte), estado de la cartera (total, vencido, % de mora), valor del inventario y última liquidación de comisiones. Usar como primera consulta cuando pregunten 'cómo vamos' o 'cómo van las ventas'. Todos los valores en pesos colombianos (COP).",
      inputSchema: {},
    },
    async () => rpc("fn_mcp_resumen"),
  );

  server.registerTool(
    "consultar_ventas",
    {
      title: "Consultar ventas",
      description:
        "Ventas agregadas por mes, día, vendedor, marca, categoría, producto, cliente o municipio, en un rango de fechas. Devuelve venta neta (descuenta devoluciones), margen, unidades, facturas y clientes por grupo, en COP. Hay historial desde noviembre 2025. Si no se indican fechas, usa el mes actual.",
      inputSchema: {
        desde: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Fecha inicial YYYY-MM-DD (default: inicio del mes actual)"),
        hasta: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Fecha final YYYY-MM-DD (default: hoy)"),
        agrupar_por: z
          .enum(["mes", "dia", "vendedor", "marca", "categoria", "producto", "cliente", "municipio"])
          .default("mes")
          .describe("Dimensión de agrupación"),
        buscar: z
          .string()
          .optional()
          .describe("Filtro por nombre de producto, cliente, marca o código exacto de producto"),
        limite: z.number().int().min(1).max(100).default(20).describe("Máximo de grupos a devolver"),
      },
    },
    async ({ desde, hasta, agrupar_por, buscar, limite }) =>
      rpc("fn_mcp_ventas", {
        p_desde: desde ?? null,
        p_hasta: hasta ?? null,
        p_agrupar: agrupar_por ?? "mes",
        p_buscar: buscar ?? null,
        p_limite: limite ?? 20,
      }),
  );

  server.registerTool(
    "consultar_cartera",
    {
      title: "Consultar cartera",
      description:
        "Estado de la cartera (cuentas por cobrar) según la última carga: agrupada por aging (rangos de mora), vendedor, cliente, zona o ciudad. Devuelve saldo, saldo vencido, mora máxima y conteos, en COP. Usar dias_mora_min para ver solo lo vencido (ej: 1) o mora crítica (ej: 90).",
      inputSchema: {
        agrupar_por: z
          .enum(["aging", "vendedor", "cliente", "zona", "ciudad"])
          .default("aging")
          .describe("Dimensión de agrupación; 'aging' da los rangos de vencimiento"),
        dias_mora_min: z
          .number()
          .int()
          .optional()
          .describe("Solo documentos con al menos estos días de mora"),
        limite: z.number().int().min(1).max(100).default(20),
      },
    },
    async ({ agrupar_por, dias_mora_min, limite }) =>
      rpc("fn_mcp_cartera", {
        p_agrupar: agrupar_por ?? "aging",
        p_dias_mora_min: dias_mora_min ?? null,
        p_limite: limite ?? 20,
      }),
  );

  server.registerTool(
    "consultar_inventario",
    {
      title: "Consultar inventario",
      description:
        "Existencias según la última carga de saldos: valor y unidades agrupadas por bodega, marca, categoría o producto, en COP. Por defecto solo cuenta las bodegas confiables (1, 5 y 6). Para análisis de stock muerto/lento/agotado y sugerido de compra usar la herramienta analisis_stock_y_sugerido.",
      inputSchema: {
        agrupar_por: z.enum(["bodega", "marca", "categoria", "producto"]).default("bodega"),
        buscar: z
          .string()
          .optional()
          .describe("Filtro por nombre de producto, marca o código exacto"),
        solo_bodegas_confiables: z
          .boolean()
          .default(true)
          .describe("true = solo bodegas 1, 5 y 6 (recomendado)"),
        limite: z.number().int().min(1).max(100).default(20),
      },
    },
    async ({ agrupar_por, buscar, solo_bodegas_confiables, limite }) =>
      rpc("fn_mcp_inventario", {
        p_agrupar: agrupar_por ?? "bodega",
        p_buscar: buscar ?? null,
        p_solo_confiables: solo_bodegas_confiables ?? true,
        p_limite: limite ?? 20,
      }),
  );

  server.registerTool(
    "analisis_stock_y_sugerido",
    {
      title: "Análisis de stock y sugerido de compra",
      description:
        "Clasifica el inventario cruzándolo con la velocidad de venta: AGOTADO (con demanda y sin stock), CRITICO (cobertura muy baja), NORMAL, LENTO (sobre-stock) y MUERTO (con stock pero sin ventas — capital inmovilizado). Además calcula el sugerido de compra por producto: venta diaria × días de cobertura × (1+crecimiento) × (1+reserva) − stock. Devuelve el resumen por clasificación y el top de productos de la clasificación pedida (o POR_PEDIR para la lista de compra). Valores en COP.",
      inputSchema: {
        clasificacion: z
          .enum(["AGOTADO", "CRITICO", "NORMAL", "LENTO", "MUERTO", "POR_PEDIR"])
          .optional()
          .describe("Filtrar el listado de productos; POR_PEDIR = con sugerido de compra > 0"),
        dias_cobertura: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe("Días de inventario a cubrir (default: el configurado, normalmente 30)"),
        pct_crecimiento: z.number().min(0).max(100).optional().describe("% de crecimiento esperado"),
        pct_reserva: z.number().min(0).max(100).optional().describe("% de stock de reserva"),
        limite: z.number().int().min(1).max(100).default(25),
      },
    },
    async ({ clasificacion, dias_cobertura, pct_crecimiento, pct_reserva, limite }) =>
      rpc("fn_mcp_sugerido", {
        p_clasificacion: clasificacion ?? null,
        p_dias_cobertura: dias_cobertura ?? null,
        p_pct_crecimiento: pct_crecimiento ?? null,
        p_pct_reserva: pct_reserva ?? null,
        p_limite: limite ?? 25,
      }),
  );

  server.registerTool(
    "consultar_comisiones",
    {
      title: "Consultar comisiones",
      description:
        "Liquidación de comisiones de los vendedores por periodo mensual (desde los snapshots oficiales del sistema). Sin vendedor devuelve el resumen del periodo y la comisión de cada vendedor (ventas + recaudo, metas y % de cumplimiento). Con vendedor (código o parte del nombre) devuelve su detalle completo por marcas. Sin year/month usa el periodo más reciente. Valores en COP.",
      inputSchema: {
        year: z.number().int().min(2024).max(2100).optional().describe("Año del periodo"),
        month: z.number().int().min(1).max(12).optional().describe("Mes del periodo (1-12)"),
        vendedor: z
          .string()
          .optional()
          .describe("Código o parte del nombre del vendedor para el detalle por marcas"),
      },
    },
    async ({ year, month, vendedor }) =>
      rpc("fn_mcp_comisiones", {
        p_year: year ?? null,
        p_month: month ?? null,
        p_vendedor: vendedor ?? null,
      }),
  );

  // --- search / fetch: contrato que ChatGPT usa para conectores de investigación ---

  server.registerTool(
    "search",
    {
      title: "Buscar en DistriMM",
      description:
        "Busca productos, clientes y vendedores de DistriMM por nombre o código. Devuelve resultados con id para consultar la ficha completa con fetch.",
      inputSchema: {
        query: z.string().min(2).describe("Texto a buscar (nombre o código)"),
      },
    },
    async ({ query }) => {
      const { data, error } = await supabase.rpc("fn_mcp_buscar", {
        p_query: query,
        p_limite: 10,
      });
      if (error) return rpcResult(null, error);
      const results = (data?.resultados || []).map((r) => ({
        id: r.id,
        title: r.title,
        url: APP_URL,
      }));
      return { content: [{ type: "text", text: JSON.stringify({ results }) }] };
    },
  );

  server.registerTool(
    "fetch",
    {
      title: "Ficha completa",
      description:
        "Devuelve la ficha completa de un resultado de search: producto (stock, ventas 90 días, top clientes), cliente (cartera, compras, top productos) o vendedor (ventas del mes, cartera asignada, comisión). El id tiene formato producto:CODIGO, cliente:NIT o vendedor:CODIGO.",
      inputSchema: {
        id: z.string().describe("Id devuelto por search, ej: producto:92412"),
      },
    },
    async ({ id }) => {
      const { data, error } = await supabase.rpc("fn_mcp_ficha", { p_id: id });
      if (error) return rpcResult(null, error);
      const doc = {
        id,
        title: data?.nombre || id,
        text: JSON.stringify(data, null, 1),
        url: APP_URL,
        metadata: { tipo: data?.tipo || null, moneda: "COP" },
      };
      return { content: [{ type: "text", text: JSON.stringify(doc) }] };
    },
  );
}
