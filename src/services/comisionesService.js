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
    const { error } = await supabase
      .from("distrimm_productos_catalogo")
      .delete()
      .not("codigo", "is", null);

    if (error) throw error;
    return { success: true };
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

export const getCargasByMonth = async (year, month) => {
  try {
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    const { data, error } = await supabase
      .from("distrimm_comisiones_cargas")
      .select("id, fecha_ventas, nombre_archivo")
      .gte("fecha_ventas", startDate)
      .lt("fecha_ventas", endDate)
      .order("fecha_ventas", { ascending: true });

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

export const getRecaudosByPeriodo = async (year, month) => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("distrimm_comisiones_recaudos")
        .select("*")
        .eq("periodo_year", year)
        .eq("periodo_month", month)
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
        .from("distrimm_comisiones_recaudos")
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
    const { id, _id, _isNew, ...rest } = row;
    const payload = id
      ? { id, ...rest, updated_at: new Date().toISOString() }
      : { ...rest, updated_at: new Date().toISOString() };
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
  totalesVentas,
  exclusiones,
  catalogoCount,
}) => {
  // Usar buildInputHash para consistencia con useComisionesCalculo
  const inputHash = buildInputHash({
    cargaIds,
    totalVentas,
    totalRecaudos,
    presupuestosMarca,
    presupuestosRecaudo,
    exclusiones,
    catalogoCount,
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
  exclusiones,
  catalogoCount,
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
    .map((p) => `${p.id}:${p.meta_recaudo || 0}:${p.updated_at || ""}`)
    .sort()
    .join(",");

  return [
    ...(cargaIds || []).sort(),
    `v:${totalVentas}`,
    `r:${totalRecaudos}`,
    `pm:${presMarcaFp}`,
    `pr:${presRecaudoFp}`,
    `excl:${exclFingerprint}`,
    `cat:${catalogoCount || 0}`,
  ].join("|");
}
