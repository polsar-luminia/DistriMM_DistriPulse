/**
 * @fileoverview CFO Analysis Service
 * Handles communication with n8n webhook (via Supabase Edge Function proxy)
 * and Supabase cache for CFO analyses.
 * @module services/cfoService
 */

import { supabase } from "../lib/supabase";

// ============================================================================
// TRIGGER CFO ANALYSIS (via n8n webhook)
// ============================================================================

/**
 * Triggers a new CFO analysis via the n8n webhook.
 * @param {{ carga_id?: string, mes: number, anio: number }} payload
 * @returns {{ data: object|null, error: string|null }}
 */
export const triggerCfoAnalysis = async (payload) => {
  try {
    const { data: result, error } = await supabase.functions.invoke(
      "proxy-n8n-cfo",
      { body: payload },
    );

    if (error) throw error;

    // The n8n workflow returns { dashboard: {...}, success, periodo, ... }
    const analysisData = result?.dashboard || result?.analisis || result || {};

    return { data: analysisData, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[cfoService] Error triggering CFO analysis:", err);
    return { data: null, error: "No se pudo conectar con el servidor. Verifica tu conexión." };
  }
};

// ============================================================================
// GET CACHED CFO ANALYSES (from Supabase)
// ============================================================================

/**
 * Fetches cached CFO analyses from Supabase.
 * @param {string} [cargaId] - Optional load ID to filter by
 * @returns {{ data: object[]|null, error: object|null }}
 */
export const getCfoAnalyses = async (cargaId) => {
  try {
    let query = supabase
      .from("distrimm_cfo_analyses")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);

    if (cargaId) {
      query = query.eq("carga_id", cargaId);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Normalize: the table stores the full response in `dashboard` column
    // which contains { success, dashboard: { ...analysis }, periodo, ... }
    const normalized = (data || []).map((row) => {
      const rawDashboard = row.dashboard || {};
      // The actual analysis is nested: row.dashboard.dashboard
      const analysis = rawDashboard.dashboard || rawDashboard;
      return { ...row, analysis };
    });

    return { data: normalized, error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[cfoService] Error fetching CFO analyses:", err);
    return { data: null, error: err };
  }
};

// ============================================================================
// HISTORICAL KPI EVOLUTION (across all cargas)
// ============================================================================

/**
 * Fetches historical KPI data for all cargas, ordered by fecha_corte ASC.
 * Returns an array of snapshots with cartera, aging, mora metrics per carga.
 * @returns {{ data: object[]|null, error: string|null }}
 */
export const getHistoricoCartera = async () => {
  try {
    const { data, error } = await supabase.rpc("fn_cfo_historico_cartera");
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err) {
    if (import.meta.env.DEV) console.error("[cfoService] Error fetching historico:", err);
    return { data: null, error: err.message };
  }
};
