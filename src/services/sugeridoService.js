/**
 * @fileoverview Servicio del módulo Sugerido de Pedidos.
 * CRUD de cargas de inventario, parámetros predeterminados y RPC de cálculo.
 * @module services/sugeridoService
 */
import { supabase, fetchAllRows } from "../lib/supabase";
import { BODEGAS_CONFIABLES } from "../utils/inventarioUpload";

/**
 * Lista las cargas de inventario (más reciente primero).
 * @returns {Promise<{data: Object[]|null, error: Error|null}>}
 */
export async function getInventarioCargas() {
  try {
    const { data, error } = await supabase
      .from("distrimm_inventario_cargas")
      .select("id, nombre_archivo, fecha_saldos, total_registros, total_valor, created_at")
      .order("fecha_saldos", { ascending: false })
      .limit(100);
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[sugeridoService] Error obteniendo cargas:", error);
    return { data: null, error };
  }
}

/**
 * Sube el inventario de forma atómica (carga + items + reemplazo de la
 * misma fecha) vía RPC fn_upload_inventario.
 * @param {{nombre_archivo: string, fecha_saldos: string, total_registros: number, total_valor: number}} carga
 * @param {Object[]} items - Filas transformadas por transformSaldos
 * @returns {Promise<{data: string|null, error: Error|null}>} UUID de la carga creada
 */
export async function uploadInventario(carga, items) {
  try {
    const { data, error } = await supabase.rpc("fn_upload_inventario", {
      p_carga: carga,
      p_items: items,
    });
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[sugeridoService] Error subiendo inventario:", error);
    return { data: null, error };
  }
}

/**
 * Elimina una carga de inventario (los items caen por CASCADE).
 * @param {string} cargaId
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
export async function deleteInventarioCarga(cargaId) {
  try {
    const { error } = await supabase
      .from("distrimm_inventario_cargas")
      .delete()
      .eq("id", cargaId);
    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[sugeridoService] Error eliminando carga:", error);
    return { success: false, error };
  }
}

/**
 * Calcula el sugerido de pedidos para una carga de inventario.
 * Usa fetchAllRows porque el resultado puede exceder el límite de 1000
 * filas de PostgREST.
 * @param {string} cargaId
 * @param {{diasCobertura: number, pctCrecimiento: number, pctReserva: number, diasAnalisis: number}} params
 * @returns {Promise<{data: Object[]|null, error: Error|null}>}
 */
export async function getSugeridoPedidos(cargaId, params) {
  try {
    const rpcArgs = {
      p_carga_id: cargaId,
      p_dias_cobertura: params.diasCobertura,
      p_pct_crecimiento: params.pctCrecimiento,
      p_pct_reserva: params.pctReserva,
      p_dias_analisis: params.diasAnalisis,
      p_bodegas: BODEGAS_CONFIABLES,
    };
    const rows = await fetchAllRows((from, to) =>
      supabase.rpc("fn_sugerido_pedidos", rpcArgs).range(from, to),
    );
    return { data: rows, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[sugeridoService] Error calculando sugerido:", error);
    return { data: null, error };
  }
}

const CONFIG_DEFAULTS = {
  dias_cobertura: 30,
  pct_crecimiento: 0,
  pct_reserva: 0,
  dias_analisis: 90,
};

/**
 * Lee los parámetros predeterminados del sugerido (fila única global).
 * @returns {Promise<{data: Object, error: Error|null}>} Siempre retorna un
 * objeto de config (defaults si no hay fila o falla la lectura).
 */
export async function getSugeridoConfig() {
  try {
    const { data, error } = await supabase
      .from("distrimm_sugerido_config")
      .select("dias_cobertura, pct_crecimiento, pct_reserva, dias_analisis")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    return { data: { ...CONFIG_DEFAULTS, ...(data || {}) }, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[sugeridoService] Error leyendo config:", error);
    // Fail-safe: la página funciona con defaults aunque falle la lectura
    return { data: { ...CONFIG_DEFAULTS }, error };
  }
}

/**
 * Guarda los parámetros como predeterminados de la organización.
 * @param {{diasCobertura: number, pctCrecimiento: number, pctReserva: number, diasAnalisis: number}} params
 * @returns {Promise<{success: boolean, error: Error|null}>}
 */
export async function saveSugeridoConfig(params) {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("distrimm_sugerido_config").upsert({
      id: 1,
      dias_cobertura: params.diasCobertura,
      pct_crecimiento: params.pctCrecimiento,
      pct_reserva: params.pctReserva,
      dias_analisis: params.diasAnalisis,
      updated_at: new Date().toISOString(),
      updated_by: userData?.user?.id || null,
    });
    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[sugeridoService] Error guardando config:", error);
    return { success: false, error };
  }
}
