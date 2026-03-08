/**
 * @fileoverview Comisiones Service - Supabase operations for the commissions module.
 * Handles sales loads, product catalog, exclusion rules, and commission calculations.
 * @module services/comisionesService
 */

import { supabase, fetchAllRows } from "../lib/supabase";

// ============================================================================
// CARGAS (SALES LOADS)
// ============================================================================

/**
 * Fetches all commission loads ordered by sales date (most recent first).
 */
export const getComisionesCargas = async () => {
  try {
    const { data, error } = await supabase
      .from("distrimm_comisiones_cargas")
      .select("*")
      .order("fecha_ventas", { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error fetching cargas:", error);
    return { data: null, error };
  }
};

/**
 * Deletes a commission load and all its sales items (CASCADE).
 */
export const deleteComisionesCarga = async (id) => {
  try {
    const { error } = await supabase
      .from("distrimm_comisiones_cargas")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error deleting carga:", error);
    return { success: false, error };
  }
};

// ============================================================================
// VENTAS (SALES ITEMS — read only)
// ============================================================================

/**
 * Fetches all sales items for a specific load.
 */
export const getComisionesVentas = async (cargaId) => {
  try {
    const { data, error } = await supabase
      .from("distrimm_comisiones_ventas")
      .select("*")
      .eq("carga_id", cargaId);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error fetching ventas:", error);
    return { data: null, error };
  }
};

// ============================================================================
// CATÁLOGO DE PRODUCTOS
// ============================================================================

/**
 * Fetches the full product catalog.
 */
export const getProductosCatalogo = async () => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("distrimm_productos_catalogo")
        .select("*")
        .order("nombre", { ascending: true })
        .range(from, to),
    );
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error fetching catálogo:", error);
    return { data: null, error };
  }
};

/**
 * Upserts product catalog rows (matched by codigo).
 * @param {Array<{codigo, nombre, categoria_codigo, categoria_nombre, marca}>} rows
 */
export const upsertProductosCatalogo = async (rows) => {
  try {
    const { data, error } = await supabase
      .from("distrimm_productos_catalogo")
      .upsert(
        rows.map((r) => ({
          ...r,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "codigo" },
      );

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error upserting catálogo:", error);
    return { data: null, error };
  }
};

/**
 * Fetches distinct brand names from the product catalog.
 */
export const getMarcasUnicas = async () => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("distrimm_productos_catalogo")
        .select("marca")
        .not("marca", "is", null)
        .order("marca", { ascending: true })
        .range(from, to),
    );

    // Deduplicate in JS since Supabase JS client doesn't support DISTINCT
    const unique = [...new Set(data.map((r) => r.marca))].filter(Boolean);
    return { data: unique, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error fetching marcas:", error);
    return { data: null, error };
  }
};

/**
 * Deletes all rows from the product catalog.
 */
export const clearProductosCatalogo = async () => {
  try {
    const { error } = await supabase
      .from("distrimm_productos_catalogo")
      .delete()
      .not("codigo", "is", null);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error clearing catálogo:", error);
    return { success: false, error };
  }
};

// ============================================================================
// EXCLUSIONES
// ============================================================================

/**
 * Fetches all active exclusion rules.
 */
export const getExclusiones = async () => {
  try {
    const { data, error } = await supabase
      .from("distrimm_comisiones_exclusiones")
      .select("*")
      .eq("activa", true)
      .order("tipo", { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error fetching exclusiones:", error);
    return { data: null, error };
  }
};

/**
 * Creates a new exclusion rule.
 * @param {{ tipo: 'marca'|'producto', valor: string, descripcion?: string, motivo?: string }} exclusion
 */
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
    if (import.meta.env.DEV) console.error("[comisionesService] Error adding exclusion:", error);
    return { data: null, error };
  }
};

/**
 * Soft-deletes an exclusion rule (sets activa = false).
 */
export const removeExclusion = async (id) => {
  try {
    const { error } = await supabase
      .from("distrimm_comisiones_exclusiones")
      .update({ activa: false })
      .eq("id", id);

    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error removing exclusion:", error);
    return { success: false, error };
  }
};

/**
 * Toggles an exclusion rule's active state.
 */
export const toggleExclusion = async (id, activa) => {
  try {
    const { error } = await supabase
      .from("distrimm_comisiones_exclusiones")
      .update({ activa })
      .eq("id", id);

    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error toggling exclusion:", error);
    return { success: false, error };
  }
};

// ============================================================================
// MONTHLY REPORT QUERIES
// ============================================================================

/**
 * Fetches all loads whose fecha_ventas falls within a given month.
 * @param {number} year - Full year (e.g. 2026)
 * @param {number} month - 1-12
 */
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
    if (import.meta.env.DEV) console.error("[comisionesService] Error fetching cargas by month:", error);
    return { data: null, error };
  }
};

/**
 * Fetches all sales items for multiple loads at once.
 * @param {string[]} cargaIds - Array of carga UUIDs
 */
export const getVentasByCargas = async (cargaIds) => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("distrimm_comisiones_ventas")
        .select("*")
        .in("carga_id", cargaIds)
        .order("fecha", { ascending: true })
        .range(from, to),
    );
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error fetching ventas by cargas:", error);
    return { data: null, error };
  }
};

// ============================================================================
// RECAUDOS
// ============================================================================

/**
 * Fetches all recaudo loads ordered by creation date (most recent first).
 * @returns {{ data: Array, error: null } | { data: null, error: Error }}
 */
export const getRecaudoCargas = async () => {
  try {
    const { data, error } = await supabase
      .from("distrimm_comisiones_cargas_recaudo")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error fetching recaudo cargas:", error);
    return { data: null, error };
  }
};

/**
 * Deletes a recaudo load and all its items (CASCADE).
 * @param {string} id - UUID of the load
 * @returns {{ success: boolean, error: null } | { success: false, error: Error }}
 */
export const deleteRecaudoCarga = async (id) => {
  try {
    const { error } = await supabase
      .from("distrimm_comisiones_cargas_recaudo")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error deleting recaudo carga:", error);
    return { success: false, error };
  }
};

/**
 * Fetches all recaudo items for a given year/month period.
 * @param {number} year
 * @param {number} month - 1-12
 * @returns {{ data: Array, error: null } | { data: null, error: Error }}
 */
export const getRecaudosByPeriodo = async (year, month) => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("distrimm_comisiones_recaudos")
        .select("*")
        .eq("periodo_year", year)
        .eq("periodo_month", month)
        .range(from, to),
    );
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error fetching recaudos by periodo:", error);
    return { data: null, error };
  }
};

/**
 * Fetches all recaudo items for a specific load.
 * @param {string} cargaId - UUID of the recaudo load
 * @returns {{ data: Array, error: null } | { data: null, error: Error }}
 */
export const getRecaudosByCarga = async (cargaId) => {
  try {
    const { data, error } = await supabase
      .from("distrimm_comisiones_recaudos")
      .select("*")
      .eq("carga_id", cargaId);
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error fetching recaudos by carga:", error);
    return { data: null, error };
  }
};

// ============================================================================
// PRESUPUESTOS
// ============================================================================

/**
 * Fetches active recaudo budget rows for a given month.
 * @param {number} year
 * @param {number} month - 1-12
 */
export const getPresupuestosRecaudo = async (year, month) => {
  try {
    const { data, error } = await supabase
      .from("distrimm_comisiones_presupuestos_recaudo")
      .select("*")
      .eq("periodo_year", year)
      .eq("periodo_month", month)
      .eq("activo", true)
      .order("vendedor_codigo");
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error fetching presupuestos recaudo:", error);
    return { data: null, error };
  }
};

/**
 * Upserts a recaudo budget row (matched by vendedor_codigo + year + month).
 */
export const upsertPresupuestoRecaudo = async (row) => {
  try {
    const { id, ...rest } = row;
    const payload = id ? { id, ...rest, updated_at: new Date().toISOString() } : { ...rest, updated_at: new Date().toISOString() };
    const { data, error } = await supabase
      .from("distrimm_comisiones_presupuestos_recaudo")
      .upsert(payload, { onConflict: "vendedor_codigo,periodo_year,periodo_month" })
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error upserting presupuesto recaudo:", error);
    return { data: null, error };
  }
};

/**
 * Deletes a recaudo budget row by id.
 */
export const deletePresupuestoRecaudo = async (id) => {
  try {
    const { error } = await supabase
      .from("distrimm_comisiones_presupuestos_recaudo")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error deleting presupuesto recaudo:", error);
    return { success: false, error };
  }
};

/**
 * Fetches active brand commission budget rows for a given month.
 * @param {number} year
 * @param {number} month - 1-12
 */
export const getPresupuestosMarca = async (year, month) => {
  try {
    const { data, error } = await supabase
      .from("distrimm_comisiones_presupuestos_marca")
      .select("*")
      .eq("periodo_year", year)
      .eq("periodo_month", month)
      .eq("activo", true)
      .order("vendedor_codigo")
      .order("marca");
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error fetching presupuestos marca:", error);
    return { data: null, error };
  }
};

/**
 * Upserts a brand commission budget row (matched by vendedor_codigo + marca + year + month).
 */
export const upsertPresupuestoMarca = async (row) => {
  try {
    const { id, _id, _isNew, ...rest } = row;
    const payload = id ? { id, ...rest, updated_at: new Date().toISOString() } : { ...rest, updated_at: new Date().toISOString() };
    const { data, error } = await supabase
      .from("distrimm_comisiones_presupuestos_marca")
      .upsert(payload, { onConflict: "vendedor_codigo,marca,periodo_year,periodo_month" })
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error upserting presupuesto marca:", error);
    return { data: null, error };
  }
};

/**
 * Deletes a brand commission budget row by id.
 */
export const deletePresupuestoMarca = async (id) => {
  try {
    const { error } = await supabase
      .from("distrimm_comisiones_presupuestos_marca")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error deleting presupuesto marca:", error);
    return { success: false, error };
  }
};

/**
 * Copies all active budget rows (recaudo + marcas) from one month to another.
 */
export const copiarPresupuestosMes = async (fromYear, fromMonth, toYear, toMonth) => {
  try {
    const [recaudoResult, marcasResult] = await Promise.all([
      supabase.from("distrimm_comisiones_presupuestos_recaudo").select("*").eq("periodo_year", fromYear).eq("periodo_month", fromMonth).eq("activo", true),
      supabase.from("distrimm_comisiones_presupuestos_marca").select("*").eq("periodo_year", fromYear).eq("periodo_month", fromMonth).eq("activo", true),
    ]);

    if (recaudoResult.error) throw recaudoResult.error;
    if (marcasResult.error) throw marcasResult.error;

    const recaudo = recaudoResult.data;
    const marcas = marcasResult.data;
    let copiedRecaudo = 0;
    let copiedMarcas = 0;
    const errors = [];

    if (recaudo?.length) {
      const copies = recaudo.map(({ id, created_at, updated_at, ...rest }) => ({ ...rest, periodo_year: toYear, periodo_month: toMonth }));
      const { error: recErr } = await supabase.from("distrimm_comisiones_presupuestos_recaudo").upsert(copies, { onConflict: "vendedor_codigo,periodo_year,periodo_month" });
      if (recErr) {
        errors.push(`Recaudo: ${recErr.message}`);
      } else {
        copiedRecaudo = copies.length;
      }
    }
    if (marcas?.length) {
      const copies = marcas.map(({ id, created_at, updated_at, ...rest }) => ({ ...rest, periodo_year: toYear, periodo_month: toMonth }));
      const { error: marcErr } = await supabase.from("distrimm_comisiones_presupuestos_marca").upsert(copies, { onConflict: "vendedor_codigo,marca,periodo_year,periodo_month" });
      if (marcErr) {
        errors.push(`Marcas: ${marcErr.message}`);
      } else {
        copiedMarcas = copies.length;
      }
    }

    if (errors.length > 0) {
      const partialError = new Error(`Copia parcial: ${errors.join("; ")}`);
      if (import.meta.env.DEV) console.error("[comisionesService] Partial copy failure:", errors);
      return { success: false, data: { copiedRecaudo, copiedMarcas }, error: partialError };
    }

    return { success: true, data: { copiedRecaudo, copiedMarcas }, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error copying presupuestos:", error);
    return { success: false, data: null, error };
  }
};

// ============================================================================
// CÁLCULO DE COMISIONES (RPC)
// ============================================================================

/**
 * Calculates net commissions per salesperson for a given load,
 * applying active exclusion rules.
 */
export const calcularComisiones = async (cargaId) => {
  try {
    const { data, error } = await supabase.rpc("fn_calcular_comisiones", {
      p_carga_id: cargaId,
    });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[comisionesService] Error calculating comisiones:", error);
    return { data: null, error };
  }
};
