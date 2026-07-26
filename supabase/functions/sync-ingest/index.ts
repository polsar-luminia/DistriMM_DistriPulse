/**
 * Punto de entrada de la sincronización SAMIT → VPS.
 *
 * El agente corre en el servidor de la oficina (PowerShell, sin dependencias
 * instaladas), lee el ERP con Integrated Security y publica aquí por HTTPS.
 * Así el SQL Server nunca se expone a la red y el Postgres del VPS tampoco.
 *
 * El cliente NO decide a qué tabla escribe: solo nombra un dataset. El mapeo
 * (tabla, llave de conflicto, columnas permitidas) vive aquí, del lado servidor.
 *
 * Referencia: docs/plans/plan-sincronizacion-samit.md §4, §7, §8.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

interface DatasetSpec {
  /** Allowlist de columnas. Todo lo que no esté aquí se descarta en silencio. */
  columnas: string[];
  /** Tabla destino. Solo para datasets incrementales (modo upsert). */
  tabla?: string;
  /** Columnas de la llave de upsert, tal como las espera PostgREST en onConflict. */
  conflicto?: string;
  /**
   * Datasets FULL: en vez de upsert por lotes, se manda el payload entero a una
   * función de Postgres que hace borrado + inserción en UNA transacción. Así el
   * dashboard nunca ve un estado intermedio (plan §8).
   */
  rpc?: string;
  /** Clave del resultado del RPC que se compara contra la cifra del ERP. */
  rpcControl?: string;
  /** El RPC recibe además `p_periodo` (YYYY-MM): el dataset se sincroniza mes a mes. */
  porPeriodo?: boolean;
  /** El RPC recibe además `p_modalidad`. Valores admitidos. */
  modalidades?: string[];
  /** El RPC recibe además `p_corte` (fecha de corte del periodo). */
  pasaCorte?: boolean;
  /** Columna numérica que se suma para reconciliar contra la cifra del ERP. */
  controlColumna?: string;
}

const DATASETS: Record<string, DatasetSpec> = {
  vendedores: {
    tabla: "distrimm_vendedores",
    conflicto: "codigo",
    columnas: ["codigo", "nombre", "nit", "zona", "estado"],
  },
  catalogo: {
    tabla: "distrimm_productos_catalogo",
    conflicto: "codigo",
    // `pct_iva` queda deliberadamente FUERA: el mapeo (§10) no resolvió su
    // fuente — 2.263 productos tienen TablaIva vacío y la tasa realmente
    // aplicada vive en IN_Movimiento.TipoIva, no en el maestro. Sincronizarlo
    // pisaría el valor actual con uno peor.
    //
    // `marca` sí se sincroniza cruda desde el ERP: fn_calcular_comisiones
    // compara con normalize_brand() en ambos lados, y se verificó que las 238
    // diferencias de nombre (CONTEGRAL MASCOTAS vs CONTEGRAL, PREMIER vs
    // GOLDEN & PREMIER, BOEHRINGER vs BOHERINGER…) colapsan al mismo valor
    // normalizado. Las exclusiones de comisiones no se rompen.
    columnas: [
      "codigo",
      "nombre",
      "categoria_codigo",
      "categoria_nombre",
      "marca",
    ],
  },
  tasas_iva: {
    // "Informe Diario de Ventas tipo de IVA" del ERP, que se cargaba a mano.
    // La tasa real aplicada vive en IN_Movimiento.TipoIva (0/5/19), NO en
    // IN_Producto.TablaIva (2.263 productos lo tienen vacío) — ver mapeo §10.
    //
    // Va aparte del dataset `catalogo` a propósito: solo 1.429 de los 4.374
    // productos se han vendido, así que solo esos tienen tasa observada. Si
    // fuera parte de `catalogo` habría que mandar null para el resto y se
    // borrarían las tasas existentes.
    tabla: "distrimm_productos_catalogo",
    conflicto: "codigo",
    columnas: ["codigo", "pct_iva"],
  },
  clientes: {
    // Upsert sin borrados a propósito: cartera_items.tercero_nit cruza contra
    // esta tabla, y un cliente que saliera del ERP con deuda viva perdería su
    // nombre en el dashboard.
    tabla: "distrimm_clientes",
    conflicto: "no_identif",
    columnas: [
      "no_identif",
      "tipo_ident",
      "tipo_persona",
      "primer_nombre",
      "segundo_nombre",
      "primer_apellido",
      "segundo_apellido",
      // `nombre_completo` NO se envía: es GENERATED ALWAYS en el destino, se
      // calcula concatenando los cuatro campos de nombre. Postgres rechaza
      // cualquier escritura sobre ella.
      "fecha_nacimiento",
      "genero",
      "estado_civil",
      "direccion",
      "barrio",
      "municipio",
      "telefono_1",
      "telefono_2",
      "celular",
      "correo_electronico",
      "pagina_web",
      "clasificacion_iva",
      "profesion",
      "actividad",
      "cupo_venta",
      "cupo_compra",
      "comentario",
      "vendedor_codigo",
      "cobrador_codigo",
    ],
  },
  recaudos: {
    // Por mes Y por modalidad: crédito (recibos de caja RC) y contado (ventas
    // que no generaron cuenta por cobrar) son cargas independientes que se
    // concatenan para la liquidación.
    //
    // OJO: `origen` en estas tablas es la MODALIDAD, no la procedencia. La
    // procedencia va en `fuente`, que pone la propia función de Postgres.
    rpc: "fn_sync_recaudos",
    rpcControl: "total_valor",
    porPeriodo: true,
    modalidades: ["credito", "contado"],
    columnas: [
      "erp_documento",
      "erp_item",
      "comprobante",
      "factura",
      "fecha_abono",
      "fecha_vence",
      "fecha_cxc",
      "valor_recaudo",
      "dias_mora",
      "cliente_nit",
      "cliente_nombre",
      "vendedor_codigo",
      // `valor_iva` SÍ se sincroniza: el cálculo hace
      // valor_recaudo - valor_excluido_marca - valor_iva, y el Excel lo dejaba
      // en cero, comisionando sobre el IVA. Se llena con la regla del propio ERP.
      "valor_iva",
      // (nota histórica) antes quedaba FUERA: hoy se estima prorrateando y el ERP tiene
      // Mov_IvaCuota en 0. Sincronizarlo cambiaría bases de comisión sin
      // que se sepa cuál método es el bueno.
    ],
  },
  ventas: {
    // Se sincroniza MES A MES: fn_calcular_comisiones trabaja sobre una carga_id
    // y las comisiones se liquidan por mes. Cada mes es su propia carga 'erp'.
    rpc: "fn_sync_ventas",
    rpcControl: "total_valor",
    porPeriodo: true,
    columnas: [
      "erp_documento",
      "erp_item",
      "factura",
      "tipo",
      "fecha",
      "vendedor_codigo",
      "vendedor_nit",
      "vendedor_nombre",
      "cliente_nit",
      "cliente_nombre",
      "municipio",
      "producto_codigo",
      "producto_descripcion",
      "cantidad",
      "valor_total",
      "costo",
      "descuento",
    ],
  },
  cartera: {
    // Dataset FULL: una factura que se paga deja de tener saldo y debe
    // desaparecer. fn_sync_cartera reemplaza una sola carga 'erp' en una
    // transacción; las 83 cargas manuales quedan intactas.
    // UNA CARGA POR MES: el mes en curso se refresca en sitio; los meses
    // cerrados quedan congelados y consultables.
    rpc: "fn_sync_cartera",
    rpcControl: "total_valor",
    porPeriodo: true,
    pasaCorte: true,
    columnas: [
      "documento_id",
      "cuota",
      "tercero_nit",
      "cliente_nombre",
      "fecha_emision",
      "fecha_vencimiento",
      "dias_mora",
      "valor_saldo",
      "estado",
      "valor_inicial",
      "valor_abonos",
      "vendedor_codigo",
      "asesor",
      "telefono",
      "ciudad",
      "cuenta_contable",
    ],
  },
  inventario: {
    // Dataset FULL: lo que desaparece del ERP debe desaparecer del destino.
    // fn_sync_inventario mantiene UNA sola carga de origen 'erp' y la reemplaza
    // atómicamente; la carga manual queda intacta para poder comparar.
    // UNA CARGA POR MES: los meses cerrados se reconstruyen con los acumulados
    // mensuales de IN_ProdBodega (CantD01..12 / CantC01..12).
    rpc: "fn_sync_inventario",
    rpcControl: "total_valor",
    porPeriodo: true,
    pasaCorte: true,
    columnas: [
      "producto_codigo",
      "producto_nombre",
      "bodega",
      "cantidad",
      "valor",
      "transito",
      "categoria_codigo",
      "categoria_nombre",
      "marca",
      "ult_compra",
      "ult_val_compra",
      "ult_val_venta",
      "precio_medio",
    ],
  },
};

/** Tolerancia de reconciliación: por debajo de esto la diferencia es redondeo. */
const TOLERANCIA_COP = 1000;
const LOTE = 500;

const handler = async (req: Request): Promise<Response> => {
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  // ── Auth: token dedicado, distinto del service_role ───────────────────────
  const esperado = Deno.env.get("SYNC_INGEST_TOKEN");
  if (!esperado) {
    console.error("[sync-ingest] SYNC_INGEST_TOKEN no configurado");
    return json({ error: "Servicio no configurado" }, 500);
  }
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${esperado}`) return json({ error: "No autorizado" }, 401);

  let cuerpo: {
    dataset?: string;
    filas?: Record<string, unknown>[];
    control_erp?: number;
    periodo?: string;
    modalidad?: string;
    corte?: string;
  };
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: "Body JSON inválido" }, 400);
  }

  const spec = cuerpo.dataset ? DATASETS[cuerpo.dataset] : undefined;
  if (!spec) {
    return json(
      { error: `Dataset desconocido: ${cuerpo.dataset}`, validos: Object.keys(DATASETS) },
      400,
    );
  }
  if (!Array.isArray(cuerpo.filas)) return json({ error: "Falta `filas`" }, 400);
  if (spec.porPeriodo && !/^\d{4}-\d{2}$/.test(cuerpo.periodo ?? "")) {
    return json({ error: "`periodo` (YYYY-MM) es obligatorio para este dataset" }, 400);
  }
  if (spec.modalidades && !spec.modalidades.includes(cuerpo.modalidad ?? "")) {
    return json(
      { error: "`modalidad` inválida", validas: spec.modalidades },
      400,
    );
  }

  const inicio = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Allowlist: se descarta toda columna no declarada ──────────────────────
  const esFull = Boolean(spec.rpc);
  const filas = cuerpo.filas.map((f) => {
    const limpia: Record<string, unknown> = esFull ? {} : { origen: "erp" };
    for (const c of spec.columnas) if (c in f) limpia[c] = f[c];
    return limpia;
  });

  let escritas = 0;
  let error: string | null = null;
  let controlDestino: number | null = null;

  if (esFull) {
    // ── Dataset FULL: una sola llamada transaccional ────────────────────────
    let ultimo: string | null = null;
    for (let intento = 1; intento <= 3; intento++) {
      const args: Record<string, unknown> = { p_filas: filas };
      if (spec.porPeriodo) args.p_periodo = cuerpo.periodo;
      if (spec.modalidades) args.p_modalidad = cuerpo.modalidad;
      if (spec.pasaCorte) args.p_corte = cuerpo.corte;
      const { data, error: e } = await supabase.rpc(spec.rpc!, args);
      if (!e) {
        const r = (data ?? {}) as Record<string, unknown>;
        escritas = Number(r.filas_escritas ?? 0);
        controlDestino = spec.rpcControl ? Number(r[spec.rpcControl] ?? 0) : null;
        ultimo = null;
        break;
      }
      ultimo = e.message;
      console.error(`[sync-ingest] ${spec.rpc} intento ${intento}: ${e.message}`);
      if (intento < 3) await new Promise((r) => setTimeout(r, intento * 2000));
    }
    if (ultimo) error = ultimo;
  } else {
    // ── Incremental: upsert por lotes, reintentable sin duplicar ────────────
    for (let i = 0; i < filas.length && !error; i += LOTE) {
      const lote = filas.slice(i, i + LOTE);
      let ultimo: string | null = null;
      for (let intento = 1; intento <= 3; intento++) {
        const { error: e } = await supabase
          .from(spec.tabla!)
          .upsert(lote, { onConflict: spec.conflicto! });
        if (!e) {
          escritas += lote.length;
          ultimo = null;
          break;
        }
        ultimo = e.message;
        console.error(`[sync-ingest] ${spec.tabla} lote ${i} intento ${intento}: ${e.message}`);
        if (intento < 3) await new Promise((r) => setTimeout(r, intento * 2000));
      }
      if (ultimo) error = ultimo;
    }

    // ── Reconciliación contra la cifra de control del ERP ───────────────────
    if (!error && spec.controlColumna) {
      const { data } = await supabase
        .from(spec.tabla!)
        .select(spec.controlColumna)
        .eq("origen", "erp");
      if (data) {
        controlDestino = data.reduce(
          (s: number, r: Record<string, unknown>) =>
            s + Number(r[spec.controlColumna!] ?? 0),
          0,
        );
      }
    } else if (!error) {
      const { count } = await supabase
        .from(spec.tabla!)
        .select("*", { count: "exact", head: true })
        .eq("origen", "erp");
      controlDestino = count ?? null;
    }
  }

  const controlErp = cuerpo.control_erp ?? null;
  const cuadra =
    controlErp === null || controlDestino === null
      ? true
      : Math.abs(controlDestino - controlErp) <= TOLERANCIA_COP;

  const estado = error ? "parcial" : cuadra ? "ok" : "sospechoso";

  // Los datasets por periodo se registran como "ventas 2026-06" para poder
  // distinguir la corrida de cada mes en la bitácora.
  const etiqueta = [cuerpo.dataset, cuerpo.periodo, cuerpo.modalidad]
    .filter(Boolean)
    .join(" ");

  await supabase.from("distrimm_sync_estado").insert({
    dataset: etiqueta,
    inicio: new Date(inicio).toISOString(),
    fin: new Date().toISOString(),
    estado,
    filas_leidas: cuerpo.filas.length,
    filas_escritas: escritas,
    control_erp: controlErp,
    control_destino: controlDestino,
    mensaje_error: error,
    duracion_ms: Date.now() - inicio,
  });

  return json(
    {
      dataset: cuerpo.dataset,
      estado,
      filas_leidas: cuerpo.filas.length,
      filas_escritas: escritas,
      control_erp: controlErp,
      control_destino: controlDestino,
      duracion_ms: Date.now() - inicio,
      ...(error ? { error } : {}),
    },
    error ? 500 : 200,
  );
};

// Servido por el router del VPS (Deno) o standalone en Supabase Edge Functions.
export default handler;
if (!Deno.env.get("DISTRIMM_ROUTER")) Deno.serve(handler);
