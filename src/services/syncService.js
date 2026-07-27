/**
 * @fileoverview Servicio de la bitácora de sincronización SAMIT → VPS.
 * Solo lectura: quien escribe `distrimm_sync_estado` es el agente de la
 * oficina vía la Edge Function `sync-ingest`.
 * @module services/syncService
 */
import { supabase } from "../lib/supabase";

/**
 * Una corrida del agente escribe una fila por dataset (hoy son 27) en cuestión
 * de segundos. Esta ventana agrupa esas filas como "la última corrida" sin
 * necesitar un id de corrida en la tabla.
 */
const VENTANA_CORRIDA_MS = 30 * 60 * 1000;

/** Suficiente para cubrir las dos últimas corridas completas. */
const FILAS_A_LEER = 60;

/**
 * Lee la última sincronización: cuándo terminó y si algún dataset de esa
 * corrida quedó fuera de `ok`.
 *
 * @returns {Promise<{data: {fecha: string, datasets: number, fallidos: string[]}|null, error: Error|null}>}
 * `data` es null cuando la bitácora está vacía (nunca se ha sincronizado).
 */
export async function getUltimaSincronizacion() {
  try {
    const { data, error } = await supabase
      .from("distrimm_sync_estado")
      .select("dataset, estado, inicio, fin")
      .order("inicio", { ascending: false })
      .limit(FILAS_A_LEER);
    if (error) throw error;
    if (!data?.length) return { data: null, error: null };

    // Las filas vienen ordenadas por inicio; la primera marca la corrida
    const inicioCorrida = new Date(data[0].inicio).getTime();
    const corrida = data.filter(
      (r) =>
        inicioCorrida - new Date(r.inicio).getTime() <= VENTANA_CORRIDA_MS,
    );

    // `fin` queda en null si la corrida se cortó a la mitad: en ese caso el
    // inicio es lo último que se sabe de ella
    const fecha = corrida.reduce((max, r) => {
      const t = r.fin || r.inicio;
      return !max || new Date(t) > new Date(max) ? t : max;
    }, null);

    const fallidos = corrida
      .filter((r) => r.estado !== "ok")
      .map((r) => r.dataset);

    return {
      data: { fecha, datasets: corrida.length, fallidos },
      error: null,
    };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[syncService] Error leyendo la bitácora:", error);
    return { data: null, error };
  }
}
