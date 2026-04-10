import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "VITE_SUPABASE_URL y VITE_SUPABASE_KEY son requeridas. Revisa tu archivo .env.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Fetches all rows from a Supabase query, paginating past the 1000-row default limit.
 * @param {function} queryBuilder - Receives (from, to) and returns a Supabase query with .range()
 * @param {number} [pageSize=1000]
 * @returns {Promise<Array>}
 */
export async function fetchAllRows(queryBuilder, pageSize = 1000) {
  const allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryBuilder(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allRows;
}
