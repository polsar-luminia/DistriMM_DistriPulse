/**
 * @fileoverview Portfolio Service - Centralized Supabase operations for portfolio data.
 * Implements the Data Access Layer following Clean Architecture principles.
 * @module services/portfolioService
 */

import { supabase, fetchAllRows } from "../lib/supabase";

// ============================================================================
// LOAD OPERATIONS
// ============================================================================

/**
 * Fetches all available loads (time-travel options) ordered by cutoff date (most recent first).
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
export const getLoads = async () => {
  try {
    const { data, error } = await supabase
      .from("historial_cargas")
      .select("*")
      .order("fecha_corte", { ascending: false });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[portfolioService] Error fetching loads:", error);
    return { data: null, error };
  }
};

/**
 * Deletes a load and all its associated items (cascade delete configured in DB).
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
export const deleteLoad = async (loadId) => {
  try {
    const { error } = await supabase
      .from("historial_cargas")
      .delete()
      .eq("id", loadId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[portfolioService] Error deleting load:", error);
    return { success: false, error };
  }
};

// ============================================================================
// PORTFOLIO ITEM OPERATIONS
// ============================================================================

/**
 * Fetches all portfolio items for a specific load.
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
export const getPortfolioItems = async (loadId) => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("cartera_items")
        .select("*")
        .eq("carga_id", loadId)
        .range(from, to),
    );
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[portfolioService] Error fetching portfolio items:", error);
    return { data: null, error };
  }
};

/**
 * Fetches only the valor_saldo column for a load (used for trend calculations).
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
export const getPortfolioSummary = async (loadId) => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("cartera_items")
        .select("valor_saldo")
        .eq("carga_id", loadId)
        .range(from, to),
    );
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error(
      "[portfolioService] Error fetching portfolio summary:",
      error,
    );
    return { data: null, error };
  }
};

// ============================================================================
// REMINDER OPERATIONS
// ============================================================================

/**
 * Marks multiple invoices as having a reminder sent.
 * @returns {Promise<{success: boolean, timestamp: string|null, error: Error|null}>}
 */
export const markRemindersAsSent = async (invoiceIds) => {
  if (!invoiceIds || invoiceIds.length === 0) {
    return {
      success: false,
      timestamp: null,
      error: new Error("No invoice IDs provided"),
    };
  }

  const timestamp = new Date().toISOString();

  try {
    const { error } = await supabase
      .from("cartera_items")
      .update({ ultimo_recordatorio: timestamp })
      .in("id", invoiceIds);

    if (error) throw error;
    return { success: true, timestamp, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[portfolioService] Error marking reminders as sent:", error);
    return { success: false, timestamp: null, error };
  }
};

// ============================================================================
// UPLOAD / CONNECTION OPERATIONS
// ============================================================================

/**
 * Tests the Supabase connection by performing a simple count query.
 * @returns {Promise<{connected: boolean, error: Error|null}>}
 */
export const testConnection = async () => {
  try {
    const { error } = await supabase
      .from("historial_cargas")
      .select("count", { count: "exact", head: true });

    if (error) throw error;
    return { connected: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[portfolioService] Connection test failed:", error);
    return { connected: false, error };
  }
};

/**
 * Rolls back a failed upload by deleting the created load record.
 * @returns {Promise<void>}
 */
export const rollbackUpload = async (loadId) => {
  try {
    await supabase.from("historial_cargas").delete().eq("id", loadId);
  } catch (error) {
    if (import.meta.env.DEV) console.error("[portfolioService] Error during rollback:", error);
  }
};

// ============================================================================
// CLIENTES (MASTER DATA) OPERATIONS
// ============================================================================

/**
 * Fetches all clients from distrimm_clientes.
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
export const getClientes = async () => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("distrimm_clientes")
        .select("*")
        .order("nombre_completo", { ascending: true })
        .range(from, to),
    );
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[portfolioService] Error fetching clientes:", error);
    return { data: null, error };
  }
};

/**
 * Fetches a single client by NIT.
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export const getClienteByNit = async (nit) => {
  try {
    const { data, error } = await supabase
      .from("distrimm_clientes")
      .select("*")
      .eq("no_identif", nit)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[portfolioService] Error fetching cliente by NIT:", error);
    return { data: null, error };
  }
};

/**
 * Gets client count.
 * @returns {Promise<{count: number, error: Error|null}>}
 */
export const getClientesCount = async () => {
  try {
    const { count, error } = await supabase
      .from("distrimm_clientes")
      .select("*", { count: "exact", head: true });

    if (error) throw error;
    return { count, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[portfolioService] Error counting clientes:", error);
    return { count: 0, error };
  }
};

/**
 * Gets clients grouped by municipio with counts.
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
export const getClientesByMunicipio = async () => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("distrimm_clientes")
        .select("municipio")
        .range(from, to),
    );

    // Aggregate in JS
    const counts = {};
    data.forEach((row) => {
      const muni = row.municipio || "Sin Municipio";
      counts[muni] = (counts[muni] || 0) + 1;
    });

    const result = Object.entries(counts)
      .map(([municipio, count]) => ({ municipio, count }))
      .sort((a, b) => b.count - a.count);

    return { data: result, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[portfolioService] Error fetching clientes by municipio:", error);
    return { data: null, error };
  }
};

// ============================================================================
// VENDEDORES OPERATIONS
// ============================================================================

/**
 * Fetches all vendedores.
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
export const getVendedores = async () => {
  try {
    const { data, error } = await supabase
      .from("distrimm_vendedores")
      .select("*")
      .order("codigo", { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[portfolioService] Error fetching vendedores:", error);
    return { data: null, error };
  }
};

/**
 * Updates a vendedor's name.
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
export const updateVendedorName = async (codigo, nombre) => {
  try {
    const { error } = await supabase
      .from("distrimm_vendedores")
      .update({ nombre })
      .eq("codigo", codigo);

    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[portfolioService] Error updating vendedor:", error);
    return { success: false, error };
  }
};

// ============================================================================
// CREDIT SCORE
// ============================================================================

/**
 * Calculates the internal credit score for a client by NIT.
 * Calls the fn_calcular_credit_score Supabase RPC function.
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export const getClientCreditScore = async (nit) => {
  if (!nit) return { data: null, error: new Error("NIT is required") };
  try {
    const { data, error } = await supabase
      .rpc("fn_calcular_credit_score", { p_nit: nit });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[portfolioService] Error calculating credit score:", error);
    return { data: null, error };
  }
};


/**
 * Calculates the v2 credit score (8 variables, 3 dimensions, configurable).
 * Falls back to v1 if the RPC doesn't exist yet.
 * @returns {Promise<{data: Object|null, error: Error|string|null}>}
 */
export const getClientCreditScoreV2 = async (nit) => {
  if (!nit) return { data: null, error: new Error("NIT is required") };
  try {
    const { data: configRow } = await supabase
      .from("distrimm_config")
      .select("score_config")
      .eq("id", 1)
      .single();

    const scoreConfig = configRow?.score_config || null;

    const { data, error } = await supabase.rpc("fn_calcular_credit_score_v2", {
      p_nit: nit,
      p_config: scoreConfig,
    });

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[portfolioService] Error calculating credit score v2:", err);
    return { data: null, error: err.message };
  }
};

/**
 * Fetches cartera items by an explicit list of IDs.
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
export const getInvoicesByIds = async (ids) => {
  if (!ids || ids.length === 0) return { data: [], error: null };
  try {
    const { data, error } = await supabase
      .from("cartera_items")
      .select("*")
      .in("id", ids);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[portfolioService] Error fetching invoices by IDs:", error);
    return { data: null, error };
  }
};

// ============================================================================
// CONFIG
// ============================================================================

/**
 * Fetches global app config (single row, id=1).
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export const getConfig = async () => {
  try {
    const { data, error } = await supabase
      .from("distrimm_config")
      .select("*")
      .eq("id", 1)
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[portfolioService] Error fetching config:", error);
    return { data: null, error };
  }
};

/**
 * Updates global app config.
 * @param {{ max_plazo_dias: number }} updates
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export const updateConfig = async (updates) => {
  try {
    const { data, error } = await supabase
      .from("distrimm_config")
      .upsert({ id: 1, ...updates, updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[portfolioService] Error updating config:", error);
    return { data: null, error };
  }
};

/**
 * Fetches the score_config JSONB from distrimm_config.
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export const getScoreConfig = async () => {
  try {
    const { data, error } = await supabase
      .from("distrimm_config")
      .select("score_config, max_plazo_dias")
      .eq("id", 1)
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[portfolioService] Error fetching score config:", error);
    return { data: null, error };
  }
};

/**
 * Updates only the score_config JSONB in distrimm_config.
 * @param {object} scoreConfig - Full score configuration object
 * @returns {Promise<{error: Error|null}>}
 */
export const updateScoreConfig = async (scoreConfig) => {
  try {
    const { error } = await supabase
      .from("distrimm_config")
      .update({ score_config: scoreConfig, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    if (import.meta.env.DEV) console.error("[portfolioService] Error updating score config:", error);
    return { error };
  }
};
