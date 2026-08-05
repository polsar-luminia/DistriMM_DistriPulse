import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsResponse, jsonResponse } from "../_shared/cors.ts";
import { callOpenAI, type OpenAIMessage, type OpenAITool } from "../_shared/openai.ts";

// System prompt de DistriBot — CFO/gerencia virtual con acceso a cartera,
// ventas, inventario y comisiones vía SQL de solo lectura.
const CHART_FENCE = "```";
const SYSTEM_PROMPT_CHATBOT = `Eres DistriBot, el analista virtual de gerencia de DistriMM, distribuidora de insumos agropecuarios en Caqueta, Colombia. Experto en cartera, ventas, márgenes, inventario y comisiones.

PERFIL:
- 25 anos de experiencia en finanzas y comercial de distribucion
- Lenguaje profesional pero accesible, siempre en espanol
- Brutalmente honesto con los datos, orientado a acciones concretas

HERRAMIENTA PRINCIPAL: consulta_datos
Ejecuta SQL SELECT de solo lectura sobre PostgreSQL. SIEMPRE usa esta herramienta para obtener cifras. NUNCA inventes, estimes o aproximes numeros. Envia la SQL como texto plano (sin backticks, comillas simples para strings).

=== RELACIONES DISPONIBLES (schema) ===

CARTERA (cuentas por cobrar):
- distrimm_cartera_ultima: solo la ultima carga. USAR POR DEFECTO.
- distrimm_cartera_historico: todas las cargas (para evolucion/comparar periodos).
- Columnas: cliente_nombre, tercero_nit, documento_id, fecha_emision, fecha_vencimiento, dias_mora, valor_saldo, valor_inicial, valor_abonos, estado, rango_mora, esta_vencida, fecha_corte, carga_id, vendedor_codigo, cuenta_contable, cuota
- Parciales: cliente_municipio, cliente_email, cliente_celular, cliente_telefono, vendedor_nombre (bajo % en cartera; para vendedor real cruza con ventas)
- dias_mora > 0 = vencida. Excluye cliente_nombre = 'MENORES CUANTIAS'.

VENTAS Y MARGENES:
- distrimm_ventas_vigentes: vista DEDUPLICADA. USAR SIEMPRE para agregados de ventas/margen.
- Columnas: fecha, factura, vendedor_codigo, vendedor_nombre, vendedor_nit, cliente_nit, cliente_nombre, municipio, producto_codigo, producto_descripcion, cantidad, valor_unidad, precio, descuento, valor_total, costo, tipo, margen_valor, margen_pct
- tipo: 'VE' = venta, 'DV' = devolucion. Las DV YA vienen con valor_total, costo y margen_valor NEGATIVOS (asi las sincroniza el ERP). Venta neta = SUM(valor_total) y margen neto = SUM(margen_valor), a secas. NUNCA les cambies el signo con CASE WHEN tipo='DV': eso las suma en vez de restarlas e infla las ventas ~8%.
- cantidad NO viene con signo: para unidades netas si hay que usar SUM(CASE WHEN tipo='DV' THEN -cantidad ELSE cantidad END).
- OJO: distrimm_comisiones_ventas es la tabla CRUDA con cargas solapadas (multiplica ~10x los totales). NO la uses para agregados globales; solo con un carga_id especifico.

INVENTARIO:
- distrimm_inventario_items: lineas producto/bodega. distrimm_inventario_cargas: cargas de saldos.
- Columnas items: producto_codigo, producto_nombre, bodega, cantidad (stock), valor, transito, categoria_nombre, marca, ult_compra, ult_val_compra, ult_val_venta, precio_medio, carga_id
- Stock confiable = bodegas 3, 5 y 6. Para stock actual filtra la ultima carga: WHERE carga_id = (SELECT id FROM distrimm_inventario_cargas ORDER BY fecha_saldos DESC LIMIT 1) AND bodega IN (3,5,6)

CATALOGO / COMISIONES:
- distrimm_productos_catalogo: codigo, nombre, categoria_nombre, marca, pct_iva
- distrimm_comisiones_exclusiones: marcas/productos excluidos de comision

SINTAXIS POSTGRESQL:
- Comillas dobles solo para identificadores con espacios; strings con comillas simples
- COALESCE() para nulls; ROUND(SUM(x)/NULLIF(SUM(total),0)*100,1) para porcentajes
- GROUP BY + SUM() + ORDER BY DESC para rankings; LIMIT en toda consulta (max 50)

EJEMPLOS:
-- Cartera: aging
SELECT rango_mora, SUM(valor_saldo) total, COUNT(*) facturas FROM distrimm_cartera_ultima WHERE cliente_nombre <> 'MENORES CUANTIAS' GROUP BY rango_mora ORDER BY MIN(dias_mora)
-- Ventas: top vendedores por venta neta y margen (90 dias)
SELECT vendedor_nombre, SUM(valor_total) venta_neta, SUM(margen_valor) margen FROM distrimm_ventas_vigentes WHERE fecha > CURRENT_DATE - 90 GROUP BY vendedor_nombre ORDER BY venta_neta DESC LIMIT 10
-- Ventas: productos con mejor margen %
SELECT producto_descripcion, ROUND(AVG(margen_pct),1) margen_pct, SUM(valor_total) venta FROM distrimm_ventas_vigentes WHERE tipo='VE' GROUP BY producto_descripcion HAVING SUM(valor_total) > 5000000 ORDER BY margen_pct DESC LIMIT 15
-- Inventario: stock valorizado por marca (bodegas confiables)
SELECT marca, SUM(cantidad) unidades, SUM(valor) valor_stock FROM distrimm_inventario_items WHERE carga_id = (SELECT id FROM distrimm_inventario_cargas ORDER BY fecha_saldos DESC LIMIT 1) AND bodega IN (3,5,6) GROUP BY marca ORDER BY valor_stock DESC LIMIT 15

REGLAS CRITICAS:
1. SIEMPRE usa consulta_datos para cifras. JAMAS inventes.
2. Para ventas/margen usa distrimm_ventas_vigentes (deduplicada).
3. Montos en COP: $1.234.567. Excluye MENORES CUANTIAS en cartera.
4. Si una consulta falla, lee el error, corrige la sintaxis y reintenta. No te rindas.
5. Usa think antes de consultas complejas o de varias tablas.
6. Si la pregunta es ambigua (periodo, si incluye devoluciones, que bodega), aclara brevemente o asume el criterio mas comun y dilo.
7. Indica el corte/periodo de los datos.

GRAFICAS:
Cuando presentes rankings, distribuciones o composiciones, INCLUYE un bloque de grafica DESPUES del texto, abriendo con ${CHART_FENCE}chart y cerrando con ${CHART_FENCE} en lineas separadas. Contenido del bloque (JSON en una linea):
{"type":"bar|line|pie","title":"Titulo","xKey":"campo_x","bars":[{"key":"campo","label":"Etiqueta","color":"#hex"}],"data":[...]}
Tipos: bar (rankings), pie (composiciones, keys pieKey/pieValue), line (evolucion, lines[]), composed (bars+lines).
Colores: #6366f1 #10b981 #f59e0b #ef4444 #8b5cf6 #06b6d4
Reglas: max 15 puntos, valores monetarios como enteros sin formato, etiquetas cortas (max 15 chars), minimo 3 datos, JSON valido en una linea, texto explicativo ANTES.

ESTILO: Emojis moderados, listas numeradas, montos exactos del SQL, termina con una recomendacion accionable.`;

// ─── Definición de tools (schema OpenAI tool-calling) ────────────────────────

const TOOLS: OpenAITool[] = [
  {
    type: "function",
    function: {
      name: "consulta_datos",
      description: "Ejecuta una consulta SQL SELECT de solo lectura sobre las vistas/tablas de cartera, ventas (distrimm_ventas_vigentes), inventario y comisiones. Envia la SQL como texto plano.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Consulta SQL SELECT a ejecutar (texto plano, sin backticks)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculator",
      description: "Evalua una expresion matematica simple (suma, resta, multiplicacion, division, porcentajes).",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "Expresion matematica a evaluar, e.g. '1500000 * 0.15'" },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "think",
      description: "Usa esta herramienta para razonar antes de ejecutar consultas SQL complejas. No retorna datos externos, solo registra el pensamiento.",
      parameters: {
        type: "object",
        properties: {
          thought: { type: "string", description: "Razonamiento o plan de consulta" },
        },
        required: ["thought"],
      },
    },
  },
];

// ─── Ejecución de tools ───────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function runTool(name: string, args: Record<string, string>, supabase: any): Promise<string> {
  if (name === "consulta_datos") {
    const { query } = args;
    try {
      const { data, error } = await supabase.rpc("fn_distribot_consulta", { consulta_sql: query });
      if (error) return `Error ejecutando consulta: ${error.message}`;
      if (!data || (Array.isArray(data) && data.length === 0)) return "La consulta no retorno resultados.";
      return JSON.stringify(data);
    } catch (err) {
      return `Error ejecutando consulta: ${(err as Error).message}`;
    }
  }

  if (name === "calculator") {
    const { expression } = args;
    if (!/^[\d+\-*/().\s%,]+$/.test(expression)) {
      return "Expresion no valida. Solo se permiten numeros y operadores matematicos basicos.";
    }
    try {
      // deno-lint-ignore no-new-func
      const result = new Function(`return ${expression}`)();
      return String(result);
    } catch {
      return "Error evaluando la expresion matematica.";
    }
  }

  if (name === "think") {
    return "Pensamiento registrado.";
  }

  return `Tool desconocida: ${name}`;
}

// ─── Limpieza del output ──────────────────────────────────────────────────────

function cleanOutput(raw: string): string {
  let cleaned = raw || "";
  cleaned = cleaned.replace(/\[Used tools:.*?\]\]\s*/gs, "");
  cleaned = cleaned.replace(/\[Tool:.*?\]\s*/gs, "");
  cleaned = cleaned.replace(/\[Consulta_SQL.*?\]\s*/gs, "");
  cleaned = cleaned.replace(/\[consulta_sql.*?\]\s*/gs, "");
  cleaned = cleaned.replace(/\[(?:Result|Input|Output|Error):.*?\]\s*/gs, "");
  cleaned = cleaned.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, content) => {
    if (lang === "chart") return _match;
    return content.trim();
  });
  cleaned = cleaned.replace(/\\n/g, "\n");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

// ─── Persistencia (la Edge Function es dueña única del guardado) ──────────────

// deno-lint-ignore no-explicit-any
async function saveMessage(supabase: any, chatSessionId: string, role: string, content: string, isError = false) {
  const { error } = await supabase.from("distrimm_chat_messages").insert({
    chat_session_id: chatSessionId,
    role,
    content,
    is_error: isError,
  });
  if (error) console.error("[proxy-n8n-chatbot] Error guardando mensaje:", error.message);
}

// ─── Handler principal ────────────────────────────────────────────────────────

const handler = (async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse(req);

  try {
    // 1. Auth JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "No authorization header" }, 401, req);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return jsonResponse({ error: "Invalid token" }, 401, req);

    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 2. Parse body
    let body: { action?: string; sessionId?: string; chatInput?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Body JSON inválido" }, 400, req);
    }
    const { sessionId, chatInput } = body;
    if (!sessionId || !chatInput) {
      return jsonResponse({ error: "Missing sessionId or chatInput" }, 400, req);
    }

    // 3. Resolver (o crear) la sesión. sessionId del frontend = session_id (texto).
    let sessRow: { id: string } | null = null;
    {
      const { data } = await supabase
        .from("distrimm_chat_sessions")
        .select("id")
        .eq("session_id", sessionId)
        .maybeSingle();
      sessRow = data;
      if (!sessRow) {
        const { data: created } = await supabase
          .from("distrimm_chat_sessions")
          .insert({
            user_id: user.id,
            session_id: sessionId,
            title: chatInput.substring(0, 80).trim() || "Nueva conversacion",
          })
          .select("id")
          .single();
        sessRow = created;
      }
    }
    const chatSessionId = sessRow?.id;

    // 4. Cargar historial PREVIO (antes de guardar el mensaje actual, para no duplicarlo)
    let history: { role: string; content: string }[] = [];
    if (chatSessionId) {
      const { data: msgs } = await supabase
        .from("distrimm_chat_messages")
        .select("role, content")
        .eq("chat_session_id", chatSessionId)
        .eq("is_error", false)
        .order("created_at", { ascending: true })
        .limit(30); // 15 turnos de contexto
      history = msgs || [];
    }

    // 5. Guardar el mensaje del usuario (persiste aunque el agente falle luego)
    if (chatSessionId) await saveMessage(supabase, chatSessionId, "user", chatInput, false);

    // 6. Construir messages[] de OpenAI
    const messages: OpenAIMessage[] = [
      { role: "system", content: SYSTEM_PROMPT_CHATBOT },
      ...history.map((m) => ({
        role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
        content: m.content,
      })),
      { role: "user", content: chatInput },
    ];

    // 7. Loop de tool-calling (máx 25 iteraciones)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 100_000);

    try {
      for (let i = 0; i < 25; i++) {
        const aiResponse = await callOpenAI(
          {
            model: "gpt-4.1",
            temperature: 0.3,
            max_tokens: 4096,
            messages,
            tools: TOOLS,
            tool_choice: "auto",
          },
          controller.signal,
        );

        const msg = aiResponse.choices[0]?.message;
        if (!msg) break;
        messages.push(msg);

        // Sin tool calls: respuesta final
        if (!msg.tool_calls || msg.tool_calls.length === 0) {
          const output = cleanOutput(msg.content || "");
          if (chatSessionId) await saveMessage(supabase, chatSessionId, "assistant", output, false);
          return jsonResponse({ output }, 200, req);
        }

        // Ejecutar tool calls en paralelo
        const toolResults = await Promise.all(
          msg.tool_calls.map(async (tc) => {
            let args: Record<string, string> = {};
            try {
              args = JSON.parse(tc.function.arguments);
            } catch {
              args = {};
            }
            const result = await runTool(tc.function.name, args, supabase);
            return {
              role: "tool" as const,
              tool_call_id: tc.id,
              content: result,
            };
          }),
        );
        messages.push(...toolResults);
      }

      // Máximo de iteraciones alcanzado
      const fallback = "No pude completar el análisis en 25 pasos. Por favor reformula tu pregunta.";
      if (chatSessionId) await saveMessage(supabase, chatSessionId, "assistant", fallback, true);
      return jsonResponse({ output: fallback }, 200, req);
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error("[proxy-n8n-chatbot] Error:", err);
    const isAbort = err instanceof DOMException && err.name === "AbortError";
    return jsonResponse(
      { error: isAbort ? "La consulta tardó demasiado (100s). Intenta de nuevo." : "Internal error" },
      isAbort ? 504 : 500,
      req,
    );
  }
});

// Servido por el router del VPS (Deno) o standalone en Supabase Edge Functions.
export default handler;
if (!Deno.env.get("DISTRIMM_ROUTER")) Deno.serve(handler);
