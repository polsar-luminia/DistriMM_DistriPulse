import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsResponse, jsonResponse } from "../_shared/cors.ts";
import { callOpenAI } from "../_shared/openai.ts";

// System prompt extraído 1:1 del workflow n8n "DistriMM CFO Analyst" (nodo "Analisis CFO IA")
const SYSTEM_PROMPT_CFO = `Eres el CFO Analista Senior de DistriMM, distribuidora de insumos agropecuarios y consumo en Caqueta, Colombia. 20 anos de experiencia en cartera y cobro.

Mision: Analizar datos de cartera y generar un DASHBOARD EJECUTIVO en JSON puro.

PERFIL: Brutalmente honesto, acciones concretas, lenguaje ejecutivo en espanol. Conoces la realidad del Caqueta.

IMPORTANTE - CALIDAD DE DATOS:
- Los datos incluyen una seccion CALIDAD DE DATOS con % de cobertura
- Los vendedores ahora se ATRIBUYEN cruzando sus ventas con cada cliente (cliente<->vendedor), con NOMBRE real. La cobertura esta en CALIDAD DE DATOS como "atribucion vendedor via ventas %"
- Si atribucion vendedor < 30%, incluye analisis_vendedores pero advierte que es parcial. Solo retorna null si es 0%.
- Usa los NOMBRES reales de los vendedores. Compara su % vencida entre si e identifica explicitamente al de PEOR gestion de cartera y al mejor. El bucket "Sin atribucion" son clientes sin ventas cruzables: menciona su monto pero no lo trates como un vendedor.
- Si cobertura municipio < 30%, advierte que el analisis territorial es parcial
- Los montos de "Sin Municipio" representan clientes sin match en directorio, NO una zona geografica
- Solo reporta datos que realmente existen. NUNCA inventes nombres de vendedores, zonas o cifras

ANALISIS DE TENDENCIA (OBLIGATORIO si hay datos):
- Los datos traen una seccion TENDENCIA comparando la cartera actual contra ~1 mes atras
- Dictamina la direccion: MEJORA, ESTABLE o DETERIORO. Regla: si el % vencida sube > 2 puntos o la vencida crece en pesos, es DETERIORO aunque la cartera total baje
- Se especifico con los deltas en pesos y puntos porcentuales. Ejemplo: "La cartera total bajo $X pero la vencida SUBIO $Y: el % vencida paso de A% a B%, deterioro claro"

ANALISIS DE VENTAS Y DSO (OBLIGATORIO):
- El DSO real (dias de venta que tarda en cobrarse la cartera) viene calculado sobre ventas reales, NO es una mora ponderada. Interpretalo: DSO < 30 sano, 30-45 aceptable, 45-60 elevado, > 60 critico
- Para los TOP DEUDORES tienes cuanto compro cada uno en 90d y hace cuantos dias fue su ultima compra. USA esto para diagnosticar:
  * Debe mucho pero compra mas y compro hace poco (mora baja) = cliente sano de alto volumen, NO es problema de cobro
  * Debe y dejo de comprar (ultima compra hace > 60d) o mora alta = foco de cobro urgente
  * Debe, sigue comprando a credito Y tiene mora alta = riesgo, evaluar cupo antes de despachar mas

SEMAFORO GENERAL DE CARTERA:
- SALUDABLE: Vencida < 25% y mora promedio < 20d
- ACEPTABLE: Vencida 25-40% y mora < 40d
- EN_RIESGO: Vencida 40-55% o mora 40-60d
- CRITICO: Vencida 55-70% o mora > 60d
- ALERTA_MAXIMA: Vencida > 70% o mora > 90d

SEMAFORO POR CLIENTE: AL_DIA (0d), RIESGO_BAJO (1-30d), RIESGO_MEDIO (31-60d), RIESGO_ALTO (61-90d), CRITICO (91-360d), INCOBRABLE (>360d)

Respuesta JSON (SIN markdown, sin texto extra):
{
  "titulo_dashboard": "string max 80 chars",
  "semaforo_general": "SALUDABLE|ACEPTABLE|EN_RIESGO|CRITICO|ALERTA_MAXIMA",
  "health_score": 0-100,
  "kpis_cartera": {
    "cartera_total": "$X.XXX.XXX", "cartera_vencida": "$X.XXX.XXX", "cartera_al_dia": "$X.XXX.XXX",
    "pct_vencida": "X.X%", "mora_promedio_dias": N, "dso_estimado": N,
    "clientes_activos": N, "clientes_en_mora": N, "facturas_total": N,
    "ticket_promedio": "$X.XXX.XXX", "riesgo_alto": "$X.XXX.XXX", "incobrables": "$X.XXX.XXX",
    "interpretacion": "4-5 oraciones"
  },
  "tendencia": {"direccion": "MEJORA|ESTABLE|DETERIORO", "resumen": "3-4 oraciones con deltas en $ y puntos", "detalle": [{"metrica": "str", "actual": "str", "anterior": "str", "variacion": "str (+/- $ o pts)", "lectura": "str"}]},
  "analisis_ventas": {"dso_real_dias": N, "lectura_dso": "1-2 oraciones interpretando el DSO", "ventas_netas_30d": "$X", "cartera_vs_ventas": "str (cuantos meses de venta equivale la cartera)", "observacion": "relacion cartera-ventas y calidad de la rotacion"},
  "analisis_aging": {
    "resumen": "3-4 oraciones",
    "distribucion": [{"rango": "str", "valor": "$X", "pct_del_total": "X%", "semaforo": "str", "accion": "str"}],
    "concentracion_riesgo": "observacion"
  },
  "ranking_deudores": [{"posicion": N, "cliente": "str", "deuda_total": "$X", "deuda_vencida": "$X", "max_mora_dias": N, "facturas": N, "compras_90d": "$X", "dias_ultima_compra": N, "vendedor": "str", "semaforo": "str", "diagnostico": "str (usa compras vs deuda: sano de alto volumen / foco de cobro / riesgo de cupo)", "accion_recomendada": "str"}],
  "analisis_vendedores": null | {"resumen": "str (nombra al de peor y mejor % vencida)", "detalle": [{"vendedor": "Nombre real", "cartera_total": "$X", "cartera_vencida": "$X", "pct_vencida": "X%", "clientes": N, "semaforo": "str", "diagnostico": "str"}]},
  "analisis_territorial": {"resumen": "str (incluye nota de cobertura)", "detalle": [{"municipio": "str", "cartera_total": "$X", "pct_vencida": "X%", "clientes": N}]},
  "salud_base_clientes": {"total_registrados": N, "cobertura_celular_pct": "X%", "cobertura_correo_pct": "X%", "interpretacion": "2-3 oraciones", "recomendacion_datos": "accion concreta"},
  "insights_clave": [5 strings con datos especificos],
  "plan_accion": {"urgente_48h": [3+ acciones con nombres y cifras], "esta_semana": [3+], "este_mes": [2+], "siguiente_mes": [2+]},
  "resumen_ejecutivo": "6-8 oraciones con cifras"
}

REGLAS: COP formato $1.234.567 | Se ESPECIFICO con nombres y cifras | SOLO JSON | No uses markdown | No inventes datos que no estan en el briefing`;

// ─── Lógica de periodo (portada del nodo "Calcular Periodo" de n8n) ─────────

const MESES = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function calcularPeriodo(mes: number, anio: number) {
  const daysInMonth = new Date(anio, mes, 0).getDate();
  let diasLab = 0;
  let diasTrans = 0;
  const now = new Date();
  const today = now.getDate();
  const cm = now.getMonth() + 1;
  const cy = now.getFullYear();

  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(anio, mes - 1, d).getDay() !== 0) { // excluye domingos
      diasLab++;
      if (anio === cy && mes === cm && d <= today) diasTrans++;
    }
  }
  // Mes pasado: todos los dias laborales transcurridos
  if (anio < cy || (anio === cy && mes < cm)) diasTrans = diasLab;
  // Mes futuro: ninguno transcurrido
  if (anio > cy || (anio === cy && mes > cm)) diasTrans = 0;

  return {
    mes,
    anio,
    mesNombre: MESES[mes],
    diasLaborales: diasLab,
    diasTranscurridos: diasTrans,
    diasFaltan: diasLab - diasTrans,
    pctAvance: diasLab > 0 ? Math.round((diasTrans / diasLab) * 1000) / 10 : 0,
  };
}

// ─── Construcción del briefing (portada del nodo "Construir Briefing CFO") ──

// deno-lint-ignore no-explicit-any
function fmt(n: any): string {
  const num = Number(n);
  if (isNaN(num)) return "$0";
  return "$" + Math.round(num).toLocaleString("es-CO");
}

// deno-lint-ignore no-explicit-any
function construirBriefing(data: any, params: ReturnType<typeof calcularPeriodo>): string {
  const cartera = data.cartera || {};
  const aging = data.aging || {};
  const deudores = data.top_deudores || [];
  const antiguos = data.top_antiguos || [];
  const vendedores = data.por_vendedor || [];
  const municipios = data.por_municipio || [];
  const clientesInfo = data.clientes_info || {};
  const dataQuality = data.data_quality || {};
  const ventas = data.ventas || {};
  const tendencia = data.tendencia || {};

  let b = `DATOS FINANCIEROS DISTRIMM - ${params.mesNombre} ${params.anio}\n`;
  b += `Fecha de corte: ${cartera.fecha_corte || "N/A"}\n`;
  b += `Dia ${params.diasTranscurridos} de ${params.diasLaborales} laborales (${params.pctAvance}% del mes). Faltan ${params.diasFaltan} dias.\n\n`;

  b += `=== KPIs DE CARTERA ===\n`;
  b += `Cartera Total: ${fmt(cartera.total_cartera)}\n`;
  b += `Cartera Vencida: ${fmt(cartera.total_vencida)} (${cartera.pct_vencida}%)\n`;
  b += `Cartera Al Dia: ${fmt(cartera.total_al_dia)}\n`;
  b += `Mora Promedio: ${cartera.mora_promedio} dias | Mora Maxima: ${cartera.mora_maxima} dias\n`;
  b += `DSO Real: ${cartera.dso_estimado ?? "N/A"} dias (dias de venta que tarda en cobrarse la cartera)\n`;
  b += `Facturas: ${cartera.facturas_total} total | ${cartera.facturas_vencidas} vencidas | ${cartera.facturas_al_dia} al dia\n`;
  b += `Clientes Activos: ${cartera.clientes_activos} | En Mora: ${cartera.clientes_en_mora}\n`;
  b += `Ticket Promedio: ${fmt(cartera.ticket_promedio)}\n`;
  b += `Riesgo Alto (>90d): ${fmt(cartera.total_riesgo_alto)}\n`;
  b += `Incobrables (>360d): ${fmt(cartera.total_incobrables)}\n\n`;

  b += `=== VENTAS Y DSO ===\n`;
  b += `DSO Real: ${ventas.dso_real_dias ?? "N/A"} dias\n`;
  b += `Ventas netas ultimos 30d: ${fmt(ventas.ventas_netas_30d)} | 90d: ${fmt(ventas.ventas_netas_90d)}\n`;
  b += `Venta diaria promedio (90d): ${fmt(ventas.venta_diaria_promedio)}\n`;
  b += `Cartera equivale a ${ventas.meses_cartera_sobre_ventas ?? "N/A"} meses de venta\n\n`;

  b += `=== TENDENCIA (vs ~1 mes atras) ===\n`;
  if (tendencia.disponible && tendencia.anterior) {
    const ant = tendencia.anterior;
    b += `Comparacion: ${tendencia.fecha_comparacion} -> ${tendencia.fecha_actual} (${tendencia.dias_entre_cortes} dias)\n`;
    b += `Cartera total: ${fmt(ant.total_cartera)} -> ${fmt(cartera.total_cartera)} (${tendencia.delta_total >= 0 ? "+" : ""}${fmt(tendencia.delta_total)})\n`;
    b += `Cartera vencida: ${fmt(ant.total_vencida)} -> ${fmt(cartera.total_vencida)} (${tendencia.delta_vencida >= 0 ? "+" : ""}${fmt(tendencia.delta_vencida)})\n`;
    b += `% Vencida: ${ant.pct_vencida}% -> ${cartera.pct_vencida}% (${tendencia.delta_pct_vencida >= 0 ? "+" : ""}${tendencia.delta_pct_vencida} pts)\n`;
    b += `Mora promedio: ${ant.mora_promedio}d -> ${cartera.mora_promedio}d (${tendencia.delta_mora_promedio >= 0 ? "+" : ""}${tendencia.delta_mora_promedio}d)\n`;
    b += `Clientes en mora: ${ant.clientes_en_mora} -> ${cartera.clientes_en_mora} (${tendencia.delta_clientes_mora >= 0 ? "+" : ""}${tendencia.delta_clientes_mora})\n`;
    b += `Incobrables: ${fmt(ant.total_incobrables)} -> ${fmt(cartera.total_incobrables)} (${tendencia.delta_incobrables >= 0 ? "+" : ""}${fmt(tendencia.delta_incobrables)})\n\n`;
  } else {
    b += `SIN DATOS: no hay carga anterior (~30d) para comparar.\n\n`;
  }

  b += `=== AGING (Antiguedad) ===\n`;
  b += `Al Dia: ${fmt(aging.al_dia)}\n`;
  b += `1-30 dias: ${fmt(aging.mora_1_30)}\n`;
  b += `31-60 dias: ${fmt(aging.mora_31_60)}\n`;
  b += `61-90 dias: ${fmt(aging.mora_61_90)}\n`;
  b += `91-180 dias: ${fmt(aging.mora_91_180)}\n`;
  b += `181-360 dias: ${fmt(aging.mora_181_360)}\n`;
  b += `+360 dias: ${fmt(aging.mora_360_plus)}\n\n`;

  b += `=== CALIDAD DE DATOS ===\n`;
  b += `Atribucion vendedor via ventas: ${dataQuality.vendedor_atribucion_ventas_pct || 0}% de la cartera (el codigo de vendedor en cartera esta vacio, por eso se atribuye por ventas)\n`;
  b += `Cobertura municipio: ${dataQuality.municipio_coverage_pct || 0}%\n`;
  if (dataQuality.clientes_en_cartera_vs_directorio) {
    const cv = dataQuality.clientes_en_cartera_vs_directorio;
    b += `Clientes en cartera: ${cv.en_cartera} | En directorio: ${cv.en_directorio} | Match: ${cv.match_pct}%\n`;
  }
  b += `\n`;

  if (vendedores.length > 0) {
    b += `=== POR VENDEDOR (atribuido via ventas, cobertura ${dataQuality.vendedor_atribucion_ventas_pct || 0}% de la cartera) ===\n`;
    vendedores.forEach((v: any, i: number) => {
      b += `${i + 1}. ${v.vendedor}: Cartera ${fmt(v.cartera_total)} | Vencida ${fmt(v.cartera_vencida)} (${v.pct_vencida}%) | ${v.clientes} clientes | ${v.facturas} facturas | Mora prom ${v.mora_promedio}d | Mora max ${v.mora_maxima}d\n`;
    });
  } else {
    b += `=== POR VENDEDOR ===\nSIN DATOS: no se pudo atribuir cartera a vendedores via ventas.\n`;
  }

  b += `\n=== TOP 15 DEUDORES (con contexto de compras) ===\n`;
  deudores.forEach((d: any, i: number) => {
    const compra = d.compras_90d !== undefined
      ? ` | Compro 90d ${fmt(d.compras_90d)}${d.dias_ultima_compra != null ? ` (ult. hace ${d.dias_ultima_compra}d)` : " (sin compras)"}`
      : "";
    const vend = d.vendedor_nombre ? ` | Vend: ${d.vendedor_nombre}` : "";
    b += `${i + 1}. ${d.cliente_nombre}: Deuda ${fmt(d.deuda_total)} | Vencida ${fmt(d.deuda_vencida)} | ${d.facturas} fact | Mora max ${d.max_mora}d${compra}${vend}\n`;
  });

  b += `\n=== TOP 10 FACTURAS MAS ANTIGUAS ===\n`;
  antiguos.forEach((a: any, i: number) => {
    b += `${i + 1}. ${a.cliente_nombre} - Doc ${a.documento_id}: ${fmt(a.valor_saldo)} | ${a.dias_mora} dias mora | Vence: ${a.fecha_vencimiento}\n`;
  });

  b += `\n=== POR MUNICIPIO (cobertura ${dataQuality.municipio_coverage_pct || 0}%) ===\n`;
  municipios.forEach((m: any) => {
    b += `${m.municipio}: ${fmt(m.cartera_total)} | Vencida ${fmt(m.cartera_vencida)} (${m.pct_vencida}%) | ${m.clientes} clientes\n`;
  });

  b += `\n=== BASE DE CLIENTES ===\n`;
  b += `Total registrados: ${clientesInfo.total_registrados} | Con celular: ${clientesInfo.con_celular} (${clientesInfo.cobertura_celular_pct || 0}%) | Con correo: ${clientesInfo.con_correo} (${clientesInfo.cobertura_correo_pct || 0}%)\n`;
  b += `Juridicas: ${clientesInfo.juridicas} | Naturales: ${clientesInfo.naturales} | Municipios: ${clientesInfo.municipios_distintos}\n`;
  b += `Con municipio: ${clientesInfo.con_municipio || 0} (${clientesInfo.cobertura_municipio_pct || 0}%)\n`;

  return b;
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
    let body: { carga_id?: string; mes?: number; anio?: number };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Body JSON inválido" }, 400, req);
    }
    const { carga_id } = body;
    const now = new Date();
    const mes = parseInt(String(body.mes)) || (now.getMonth() + 1);
    const anio = parseInt(String(body.anio)) || now.getFullYear();

    if (!mes || !anio) return jsonResponse({ error: "Missing mes or anio" }, 400, req);

    // 3. Calcular periodo
    const params = calcularPeriodo(mes, anio);

    // 4. Llamar RPC fn_cfo_distrimm_dashboard (timeout 30s)
    const rpcController = new AbortController();
    const rpcTimeout = setTimeout(() => rpcController.abort(), 30_000);
    let dashboardData: unknown;
    try {
      const { data: rpcData, error: rpcError } = await supabase
        .rpc("fn_cfo_distrimm_dashboard", { p_carga_id: carga_id || null });
      if (rpcError) {
        console.error("[proxy-n8n-cfo] RPC error:", rpcError);
        return jsonResponse({ error: "Error obteniendo datos de cartera" }, 500, req);
      }
      dashboardData = rpcData;
    } finally {
      clearTimeout(rpcTimeout);
    }

    // 5. Construir briefing
    const briefing = construirBriefing(dashboardData, params);

    // 6. Llamar OpenAI (timeout 90s)
    const aiController = new AbortController();
    const aiTimeout = setTimeout(() => aiController.abort(), 90_000);
    let analysis: Record<string, unknown> = {};
    try {
      const aiResponse = await callOpenAI({
        model: "gpt-4.1",
        temperature: 0.3,
        max_tokens: 8192,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT_CFO },
          { role: "user", content: briefing },
        ],
      }, aiController.signal);

      // 7. Parsear respuesta (portado del nodo "Respuesta Final")
      const content = aiResponse.choices[0]?.message?.content || "";
      try {
        const f = content.indexOf("{");
        const l = content.lastIndexOf("}");
        if (f !== -1 && l !== -1) {
          analysis = JSON.parse(content.substring(f, l + 1));
        }
      } catch {
        analysis = { error: "No se pudo parsear la respuesta IA", raw: content.substring(0, 1000) };
      }
    } finally {
      clearTimeout(aiTimeout);
    }

    // Construir resultado final (mismo shape que el workflow n8n)
    const result = {
      success: true,
      carga_id: carga_id || null,
      periodo: `${params.mesNombre} ${params.anio}`,
      avance_mes: `Dia ${params.diasTranscurridos} de ${params.diasLaborales} (${params.pctAvance}%)`,
      dias_restantes: params.diasFaltan,
      dashboard: analysis,
      generado_en: new Date().toISOString(),
    };

    // 8. Persistir en distrimm_cfo_analyses (fire-and-forget — no bloquea la respuesta)
    supabase
      .from("distrimm_cfo_analyses")
      .upsert(
        {
          carga_id: carga_id || null,
          dashboard: result,
          status: "ready",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "carga_id" },
      )
      .then(({ error }) => {
        if (error) console.error("[proxy-n8n-cfo] Error guardando análisis:", error.message);
      });

    // 9. Responder
    return jsonResponse(result, 200, req);
  } catch (err) {
    console.error("[proxy-n8n-cfo] Error:", err);
    const isAbort = err instanceof DOMException && err.name === "AbortError";
    return jsonResponse(
      { error: isAbort ? "El análisis tardó demasiado (90s). Intenta de nuevo." : "Internal error" },
      isAbort ? 504 : 500,
      req,
    );
  }
});

// Servido por el router del VPS (Deno) o standalone en Supabase Edge Functions.
export default handler;
if (!Deno.env.get("DISTRIMM_ROUTER")) Deno.serve(handler);
