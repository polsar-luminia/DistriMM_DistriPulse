import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  if (import.meta.env.DEV) console.warn("Supabase URL or Key is missing. Check your .env file.");
}

if (
  !supabaseUrl ||
  !supabaseAnonKey ||
  supabaseUrl === "https://placeholder.supabase.co"
) {
  if (import.meta.env.DEV)
    console.error(
      "ERROR CRÍTICO: Las variables de entorno VITE_SUPABASE_URL o VITE_SUPABASE_KEY no están configuradas correctamente.",
    );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder",
);

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
