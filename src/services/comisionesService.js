import { supabase, fetchAllRows } from "../lib/supabase";

export const getComisionesCargas = async () => {
  try {
    const { data, error } = await supabase
      .from("distrimm_comisiones_cargas")
      .select("*")
      .order("fecha_ventas", { ascending: false })
      .limit(1000);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[comisionesService] Error fetching cargas:", error);
    return { data: null, error };
  }
};

export const deleteComisionesCarga = async (id) => {
  try {
    const { error } = await supabase
      .from("distrimm_comisiones_cargas")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[comisionesService] Error deleting carga:", error);
    return { success: false, error };
  }
};

export const getComisionesVentas = async (cargaId) => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("distrimm_comisiones_ventas")
        .select("*")
        .eq("carga_id", cargaId)
        .order("id")
        .range(from, to),
    );
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[comisionesService] Error fetching ventas:", error);
    return { data: null, error };
  }
};

export const getProductosCatalogo = async () => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("distrimm_productos_catalogo")
        .select("*")
        .order("nombre", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[comisionesService] Error fetching catálogo:", error);
    return { data: null, error };
  }
};

export const upsertProductosCatalogo = async (rows) => {
  try {
    const now = new Date().toISOString();
    const prepared = rows.map((r) => ({ ...r, updated_at: now }));
    const BATCH_SIZE = 100;
    for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
      const batch = prepared.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("distrimm_productos_catalogo")
        .upsert(batch, { onConflict: "codigo" });
      if (error) throw error;
    }
    return { data: null, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[comisionesService] Error upserting catálogo:", error);
    return { data: null, error };
  }
};

export const getMarcasUnicas = async () => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("distrimm_productos_catalogo")
        .select("marca")
        .not("marca", "is", null)
        .order("marca", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );

    // Deduplicate in JS since Supabase JS client doesn't support DISTINCT
    const unique = [...new Set(data.map((r) => r.marca))].filter(Boolean);
    return { data: unique, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[comisionesService] Error fetching marcas:", error);
    return { data: null, error };
  }
};

export const clearProductosCatalogo = async () => {
  try {
    const { error, count } = await supabase
      .from("distrimm_productos_catalogo")
      .delete({ count: "exact" })
      .not("codigo", "is", null);

    if (error) throw error;
    return { success: true, deletedCount: count };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[comisionesService] Error clearing catálogo:", error);
    return { success: false, error };
  }
};

export const getExclusiones = async () => {
  try {
    const { data, error } = await supabase
      .from("distrimm_comisiones_exclusiones")
      .select("*")
      .eq("activa", true)
      .order("tipo", { ascending: true })
      .limit(1000);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[comisionesService] Error fetching exclusiones:", error);
    return { data: null, error };
  }
};

export const addExclusion = async ({ tipo, valor, descripcion, motivo }) => {
  try {
    const { data, error } = await supabase
      .from("distrimm_comisiones_exclusiones")
      .insert({ tipo, valor, descripcion, motivo })
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[comisionesService] Error adding exclusion:", error);
    return { data: null, error };
  }
};

export const removeExclusion = async (id) => {
  try {
    const { error } = await supabase
      .from("distrimm_comisiones_exclusiones")
      .update({ activa: false })
      .eq("id", id);

    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[comisionesService] Error removing exclusion:", error);
    return { success: false, error };
  }
};

export const toggleExclusion = async (id, activa) => {
  try {
    const { error } = await supabase
      .from("distrimm_comisiones_exclusiones")
      .update({ activa })
      .eq("id", id);

    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[comisionesService] Error toggling exclusion:", error);
    return { success: false, error };
  }
};

/**
 * Días de mora máximos para que un recaudo comisione.
 *
 * Vive en la base (fila única `tipo='dias_mora'` de las exclusiones), no en
 * `thresholds.js`: el cálculo también corre en SQL y una constante de JS que el
 * servidor no puede leer se convierte en dos copias que divergen —el problema
 * que ya arrastra `normalize_brand`—.
 *
 * Llega dentro de `getExclusiones()`, así que normalmente se lee de ahí con
 * `leerDiasMoraLimite()` en vez de pedirlo aparte.
 */
export const setDiasMoraLimite = async (dias) => {
  const n = Number(dias);
  if (!Number.isInteger(n) || n <= 0 || n > 9999) {
    return { success: false, error: new Error("Los días de mora deben ser un entero entre 1 y 9999") };
  }
  try {
    const { error } = await supabase
      .from("distrimm_comisiones_exclusiones")
      .update({ valor: String(n), activa: true })
      .eq("tipo", "dias_mora");

    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[comisionesService] Error setting dias_mora:", error);
    return { success: false, error };
  }
};

export const getCargasByMonth = async (year, month) => {
  try {
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    const { data, error } = await supabase
      .from("distrimm_comisiones_cargas")
      .select(
        "id, fecha_ventas, nombre_archivo, total_registros, total_ventas, created_at",
      )
      .gte("fecha_ventas", startDate)
      .lt("fecha_ventas", endDate)
      .order("fecha_ventas", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error(
        "[comisionesService] Error fetching cargas by month:",
        error,
      );
    return { data: null, error };
  }
};

export const getVentasByCargas = async (cargaIds) => {
  if (!cargaIds || cargaIds.length === 0) return { data: [], error: null };
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("distrimm_comisiones_ventas")
        .select("*")
        .in("carga_id", cargaIds)
        .order("fecha", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error(
        "[comisionesService] Error fetching ventas by cargas:",
        error,
      );
    return { data: null, error };
  }
};

export const getRecaudoCargas = async () => {
  try {
    const { data, error } = await supabase
      .from("distrimm_comisiones_cargas_recaudo")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error(
        "[comisionesService] Error fetching recaudo cargas:",
        error,
      );
    return { data: null, error };
  }
};

export const deleteRecaudoCarga = async (id) => {
  try {
    const { error } = await supabase
      .from("distrimm_comisiones_cargas_recaudo")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[comisionesService] Error deleting recaudo carga:", error);
    return { success: false, error };
  }
};

/**
 * Los recaudos se leen de `distrimm_recaudos_comisionables`, NO de la tabla.
 *
 * La vista deriva `aplica_comision` (mora) y `valor_excluido_marca` para las
 * filas del ERP; la sincronización no los escribe y la tabla los deja en
 * `true` y `0`, es decir, comisionando todo. Las filas manuales pasan intactas.
 * Ver sql/recaudos_comisionables.sql.
 *
 * **`fuente='erp'` NO es opcional.** Un mes de la época de convivencia tiene
 * carga manual Y carga sincronizada con los mismos abonos: julio 2026 sumaba
 * 1.139.043.169 (590.003.732 del ERP + 549.039.437 del Excel) cuando lo real
 * eran 590 millones. Sin este filtro se cuenta el mismo dinero dos veces, y
 * `dedupeRecaudosDentroDeCarga` no lo evita porque su llave incluye
 * `carga_id`. Marzo a julio de 2026 tienen las dos fuentes.
 */
export const getRecaudosByPeriodo = async (year, month) => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("distrimm_recaudos_comisionables")
        .select("*")
        .eq("periodo_year", year)
        .eq("periodo_month", month)
        .eq("fuente", "erp")
        .order("id")
        .range(from, to),
    );
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error(
        "[comisionesService] Error fetching recaudos by periodo:",
        error,
      );
    return { data: null, error };
  }
};

export const getRecaudosByCarga = async (cargaId) => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("distrimm_recaudos_comisionables")
        .select("*")
        .eq("carga_id", cargaId)
        .order("id")
        .range(from, to),
    );
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error(
        "[comisionesService] Error fetching recaudos by carga:",
        error,
      );
    return { data: null, error };
  }
};

export const getPresupuestosRecaudo = async (year, month) => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("distrimm_comisiones_presupuestos_recaudo")
        .select("*")
        .eq("periodo_year", year)
        .eq("periodo_month", month)
        .eq("activo", true)
        .order("vendedor_codigo")
        .range(from, to),
    );
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error(
        "[comisionesService] Error fetching presupuestos recaudo:",
        error,
      );
    return { data: null, error };
  }
};

export const upsertPresupuestoRecaudo = async (row) => {
  try {
    const { id, ...rest } = row;
    const payload = id
      ? { id, ...rest, updated_at: new Date().toISOString() }
      : { ...rest, updated_at: new Date().toISOString() };
    const { data, error } = await supabase
      .from("distrimm_comisiones_presupuestos_recaudo")
      .upsert(payload, {
        onConflict: "vendedor_codigo,periodo_year,periodo_month",
      })
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error(
        "[comisionesService] Error upserting presupuesto recaudo:",
        error,
      );
    return { data: null, error };
  }
};

export const deletePresupuestoRecaudo = async (id) => {
  try {
    const { error } = await supabase
      .from("distrimm_comisiones_presupuestos_recaudo")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error(
        "[comisionesService] Error deleting presupuesto recaudo:",
        error,
      );
    return { success: false, error };
  }
};

export const getPresupuestosMarca = async (year, month) => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("distrimm_comisiones_presupuestos_marca")
        .select("*")
        .eq("periodo_year", year)
        .eq("periodo_month", month)
        .eq("activo", true)
        .order("vendedor_codigo")
        .order("marca")
        .range(from, to),
    );
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error(
        "[comisionesService] Error fetching presupuestos marca:",
        error,
      );
    return { data: null, error };
  }
};

export const upsertPresupuestoMarca = async (row) => {
  try {
    const { id, _id, _isNew, _globalIdx, ...rest } = row;
    // No enviar id para que el upsert use onConflict de la clave natural
    // Enviar id solo causa conflictos de PK cuando la marca cambió
    const payload = { ...rest, updated_at: new Date().toISOString() };
    const { data, error } = await supabase
      .from("distrimm_comisiones_presupuestos_marca")
      .upsert(payload, {
        onConflict: "vendedor_codigo,marca,periodo_year,periodo_month",
      })
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error(
        "[comisionesService] Error upserting presupuesto marca:",
        error,
      );
    return { data: null, error };
  }
};

export const deletePresupuestoMarca = async (id) => {
  try {
    const { error } = await supabase
      .from("distrimm_comisiones_presupuestos_marca")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error(
        "[comisionesService] Error deleting presupuesto marca:",
        error,
      );
    return { success: false, error };
  }
};

export const copiarPresupuestosMes = async (
  fromYear,
  fromMonth,
  toYear,
  toMonth,
) => {
  try {
    const [recaudo, marcas] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase
          .from("distrimm_comisiones_presupuestos_recaudo")
          .select("*")
          .eq("periodo_year", fromYear)
          .eq("periodo_month", fromMonth)
          .eq("activo", true)
          .order("id")
          .range(from, to),
      ),
      fetchAllRows((from, to) =>
        supabase
          .from("distrimm_comisiones_presupuestos_marca")
          .select("*")
          .eq("periodo_year", fromYear)
          .eq("periodo_month", fromMonth)
          .eq("activo", true)
          .order("id")
          .range(from, to),
      ),
    ]);
    let copiedRecaudo = 0;
    let copiedMarcas = 0;
    const errors = [];

    if (recaudo?.length) {
      const copies = recaudo.map(({ id, created_at, updated_at, ...rest }) => ({
        ...rest,
        periodo_year: toYear,
        periodo_month: toMonth,
      }));
      const { error: recErr } = await supabase
        .from("distrimm_comisiones_presupuestos_recaudo")
        .upsert(copies, {
          onConflict: "vendedor_codigo,periodo_year,periodo_month",
        });
      if (recErr) {
        errors.push(`Recaudo: ${recErr.message}`);
      } else {
        copiedRecaudo = copies.length;
      }
    }
    if (marcas?.length) {
      const copies = marcas.map(({ id, created_at, updated_at, ...rest }) => ({
        ...rest,
        periodo_year: toYear,
        periodo_month: toMonth,
      }));
      const { error: marcErr } = await supabase
        .from("distrimm_comisiones_presupuestos_marca")
        .upsert(copies, {
          onConflict: "vendedor_codigo,marca,periodo_year,periodo_month",
        });
      if (marcErr) {
        errors.push(`Marcas: ${marcErr.message}`);
      } else {
        copiedMarcas = copies.length;
      }
    }

    if (errors.length > 0) {
      const partialError = new Error(`Copia parcial: ${errors.join("; ")}`);
      if (import.meta.env.DEV)
        console.error("[comisionesService] Partial copy failure:", errors);
      return {
        success: false,
        data: { copiedRecaudo, copiedMarcas },
        error: partialError,
      };
    }

    return {
      success: true,
      data: { copiedRecaudo, copiedMarcas },
      error: null,
    };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[comisionesService] Error copying presupuestos:", error);
    return { success: false, data: null, error };
  }
};

export const getReglasExtra = async (year, month) => {
  try {
    const { data, error } = await supabase
      .from("distrimm_comisiones_reglas_extra")
      .select("*")
      .eq("periodo_year", year)
      .eq("periodo_month", month)
      .order("vendedor_codigo");
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[comisionesService] Error fetching reglas extra:", error);
    return { data: null, error };
  }
};

export const upsertReglaExtra = async (row) => {
  try {
    const { id, _isNew, _globalIdx, ...rest } = row;
    const payload = { ...rest, updated_at: new Date().toISOString() };
    const { data, error } = await supabase
      .from("distrimm_comisiones_reglas_extra")
      .upsert(payload, {
        onConflict: "periodo_year,periodo_month,vendedor_codigo",
      })
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[comisionesService] Error upserting regla extra:", error);
    return { data: null, error };
  }
};

export const deleteReglaExtra = async (id) => {
  try {
    const { error } = await supabase
      .from("distrimm_comisiones_reglas_extra")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[comisionesService] Error deleting regla extra:", error);
    return { success: false, error };
  }
};

export const calcularComisiones = async (cargaId) => {
  try {
    const { data, error } = await supabase.rpc("fn_calcular_comisiones", {
      p_carga_id: cargaId,
    });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[comisionesService] Error calculating comisiones:", error);
    return { data: null, error };
  }
};

// ── Snapshots de liquidación mensual ──

/**
 * Obtiene el snapshot congelado de un periodo, si existe.
 * @param {number} year
 * @param {number} month
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 */
export const getSnapshot = async (year, month) => {
  try {
    const { data, error } = await supabase
      .from("distrimm_comisiones_snapshots")
      .select("*")
      .eq("periodo_year", year)
      .eq("periodo_month", month)
      .maybeSingle();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[comisionesService] Error fetching snapshot:", error);
    return { data: null, error };
  }
};

/**
 * Guarda (o reemplaza) el snapshot de liquidación de un periodo.
 * Idempotente: upsert por (periodo_year, periodo_month).
 * Incluye hash de inputs para detectar invalidación.
 */
export const saveSnapshot = async ({
  year,
  month,
  cargaIds,
  totalVentas,
  totalRecaudos,
  liquidacion,
  resumen,
  presupuestosMarca,
  presupuestosRecaudo,
  reglasExtra,
  totalesVentas,
  exclusiones,
  catalogoCount,
  catalogo,
  cargaCreditoId = null,
  cargaContadoId = null,
  totalRecaudosCredito = 0,
  totalRecaudosContado = 0,
}) => {
  // Usar buildInputHash para consistencia con useComisionesCalculo
  const inputHash = buildInputHash({
    cargaIds,
    totalVentas,
    totalRecaudos,
    presupuestosMarca,
    presupuestosRecaudo,
    reglasExtra,
    exclusiones,
    catalogoCount,
    catalogo,
    cargaCreditoId,
    cargaContadoId,
    totalRecaudosCredito,
    totalRecaudosContado,
  });

  try {
    const { data, error } = await supabase
      .from("distrimm_comisiones_snapshots")
      .upsert(
        {
          periodo_year: year,
          periodo_month: month,
          carga_ids: cargaIds,
          total_ventas_count: totalVentas,
          total_recaudos_count: totalRecaudos,
          liquidacion,
          resumen,
          presupuestos_marca_ids: (presupuestosMarca || []).map((p) => p.id),
          presupuestos_recaudo_ids: (presupuestosRecaudo || []).map(
            (p) => p.id,
          ),
          reglas_extra_ids: (reglasExtra || [])
            .filter((r) => r.activa)
            .map((r) => r.id),
          input_hash: inputHash,
          totales_ventas: totalesVentas || {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: "periodo_year,periodo_month" },
      )
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[comisionesService] Error saving snapshot:", error);
    return { data: null, error };
  }
};

/**
 * Genera el hash de inputs actual para comparar con el snapshot guardado.
 * Acepta objetos completos de presupuestos para incluir valores clave en el fingerprint,
 * de modo que editar un presupuesto existente (sin cambiar su ID) invalide el snapshot.
 */
export function buildInputHash({
  cargaIds,
  totalVentas,
  totalRecaudos,
  presupuestosMarca,
  presupuestosRecaudo,
  reglasExtra,
  exclusiones,
  catalogoCount,
  catalogo,
  cargaCreditoId = null,
  cargaContadoId = null,
  totalRecaudosCredito = null,
  totalRecaudosContado = null,
}) {
  // Fingerprint de exclusiones: ids + tipo + valor para detectar cambios de reglas
  const exclFingerprint = (exclusiones || [])
    .map((e) => `${e.id}:${e.tipo}:${e.valor}`)
    .sort()
    .join(",");

  // Fingerprint de presupuestos marca: incluye valores clave para detectar ediciones
  const presMarcaFp = (presupuestosMarca || [])
    .map(
      (p) =>
        `${p.id}:${p.meta_ventas || 0}:${p.pct_comision || 0}:${p.updated_at || ""}`,
    )
    .sort()
    .join(",");

  // Fingerprint de presupuestos recaudo: incluye valores clave
  const presRecaudoFp = (presupuestosRecaudo || [])
    .map(
      (p) =>
        `${p.id}:${p.meta_recaudo || 0}:${p.tramo1_min || 0}:${p.tramo1_max || 0}:${p.tramo1_pct || 0}:${p.tramo2_min || 0}:${p.tramo2_max || 0}:${p.tramo2_pct || 0}:${p.tramo3_min || 0}:${p.tramo3_max || 0}:${p.tramo3_pct || 0}:${p.tramo4_min || 0}:${p.tramo4_max || 0}:${p.tramo4_pct || 0}:${p.tramo5_min || 0}:${p.tramo5_max || 0}:${p.tramo5_pct || 0}:${p.updated_at || ""}`,
    )
    .sort()
    .join(",");

  // Fingerprint de reglas extra — solo activas (inactivas no afectan el cálculo)
  const reglasExtraFp = (reglasExtra || [])
    .filter((r) => r.activa)
    .map(
      (r) =>
        `${r.id}:${r.vendedor_codigo}:${r.umbral || 0}:${r.pct_comision || 0}:${r.updated_at || ""}`,
    )
    .sort()
    .join(",");

  // Bump CALC_VERSION cuando cambie la lógica de cálculo para invalidar snapshots
  const CALC_VERSION = 5; // v5: umbral de no listadas sobre la sumatoria del grupo (no por marca)

  // Tokens nuevos por desglose de origen. Solo se incluyen si HAY información de
  // contado (para no invalidar snapshots históricos creados antes de este campo).
  const tieneContado =
    !!cargaContadoId ||
    (totalRecaudosContado != null && totalRecaudosContado > 0);
  const tieneDesglose = tieneContado || cargaCreditoId != null;
  const tokensOrigen = tieneDesglose
    ? [
        `rc_cred:${totalRecaudosCredito ?? totalRecaudos ?? 0}`,
        `rc_cont:${totalRecaudosContado ?? 0}`,
        `cgCred:${cargaCreditoId || ""}`,
        `cgCont:${cargaContadoId || ""}`,
      ]
    : [];

  return [
    `calcV:${CALC_VERSION}`,
    ...(cargaIds || []).sort(),
    `v:${totalVentas}`,
    `r:${totalRecaudos}`,
    ...tokensOrigen,
    `pm:${presMarcaFp}`,
    `pr:${presRecaudoFp}`,
    `rx:${reglasExtraFp}`,
    `excl:${exclFingerprint}`,
    `cat:${
      catalogo?.length
        ? (catalogo || [])
            .map((p) => `${p.codigo}:${p.marca || ""}:${p.pct_iva || 0}`)
            .sort()
            .join(",")
        : catalogoCount || 0
    }`,
  ].join("|");
}
