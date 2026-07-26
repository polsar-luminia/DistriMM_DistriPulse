/**
 * @fileoverview App-wide constants. Import from here instead of hardcoding.
 */

/** UTC offset for Colombia (America/Bogota, no DST) */
export const COLOMBIA_OFFSET = -5;

/** Maximum messages per day enforced server-side and client-side.
 *  Tier 1 de Meta permite 1000 conversaciones únicas/24h. 500 deja margen. */
export const DAILY_LIMIT = 500;

/** Tamaño de cada sub-lote enviado al Edge Function en una sola invocación.
 *  Wall-clock límite de Edge Functions ~150s; con ~3.5s por mensaje, 25 chunk
 *  da margen (~90s) y deja headroom para spikes. */
export const CHUNK_SIZE_WHATSAPP = 25;

/** Delay entre chunks consecutivos para no saturar Meta y dejar respiro a la BD. */
export const CHUNK_DELAY_MS_WHATSAPP = 500;

/** Supabase upsert batch size for cartera_items inserts */
export const CARTERA_BATCH_SIZE = 100;

/** Supabase upsert batch size for distrimm_clientes upserts */
export const CLIENTES_BATCH_SIZE = 50;
