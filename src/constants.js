/**
 * @fileoverview App-wide constants. Import from here instead of hardcoding.
 */

/** UTC offset for Colombia (America/Bogota, no DST) */
export const COLOMBIA_OFFSET = -5;

/** Maximum messages per day enforced server-side and client-side */
export const DAILY_LIMIT = 80;

/** Supabase upsert batch size for cartera_items inserts */
export const CARTERA_BATCH_SIZE = 100;

/** Supabase upsert batch size for distrimm_clientes upserts */
export const CLIENTES_BATCH_SIZE = 50;
