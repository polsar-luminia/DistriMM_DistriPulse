import { supabase, fetchAllRows } from "../lib/supabase";

export const getLoads = async () => {
  try {
    const { data, error } = await supabase
      .from("historial_cargas")
      .select("*")
      .order("fecha_corte", { ascending: false })
      .limit(1000);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[portfolioService] Error fetching loads:", error);
    return { data: null, error };
  }
};

export const deleteLoad = async (loadId) => {
  try {
    const { error } = await supabase
      .from("historial_cargas")
      .delete()
      .eq("id", loadId);

    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[portfolioService] Error deleting load:", error);
    return { success: false, error };
  }
};

export const getPortfolioItems = async (loadId) => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("cartera_items")
        .select("*")
        .eq("carga_id", loadId)
        .order("id")
        .range(from, to),
    );
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error(
        "[portfolioService] Error fetching portfolio items:",
        error,
      );
    return { data: null, error };
  }
};

export const getPortfolioSummary = async (loadId) => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("cartera_items")
        .select("valor_saldo")
        .eq("carga_id", loadId)
        .order("id")
        .range(from, to),
    );
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error(
        "[portfolioService] Error fetching portfolio summary:",
        error,
      );
    return { data: null, error };
  }
};

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
    if (import.meta.env.DEV)
      console.error(
        "[portfolioService] Error marking reminders as sent:",
        error,
      );
    return { success: false, timestamp: null, error };
  }
};

export const testConnection = async () => {
  try {
    const { error } = await supabase
      .from("historial_cargas")
      .select("count", { count: "exact", head: true });

    if (error) throw error;
    return { connected: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[portfolioService] Connection test failed:", error);
    return { connected: false, error };
  }
};

export const rollbackUpload = async (loadId) => {
  try {
    const { error } = await supabase
      .from("historial_cargas")
      .delete()
      .eq("id", loadId);
    if (error) {
      if (import.meta.env.DEV)
        console.error("[portfolioService] Rollback query error:", error);
      return { success: false, error };
    }
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[portfolioService] Error during rollback:", error);
    return { success: false, error };
  }
};

export const getClientes = async () => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("distrimm_clientes")
        .select("*")
        .order("nombre_completo", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[portfolioService] Error fetching clientes:", error);
    return { data: null, error };
  }
};

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
    if (import.meta.env.DEV)
      console.error("[portfolioService] Error fetching cliente by NIT:", error);
    return { data: null, error };
  }
};

export const getClientesCount = async () => {
  try {
    const { count, error } = await supabase
      .from("distrimm_clientes")
      .select("*", { count: "exact", head: true });

    if (error) throw error;
    return { count, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[portfolioService] Error counting clientes:", error);
    return { count: 0, error };
  }
};

export const getClientesByMunicipio = async () => {
  try {
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("distrimm_clientes")
        .select("municipio")
        .order("id")
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
    if (import.meta.env.DEV)
      console.error(
        "[portfolioService] Error fetching clientes by municipio:",
        error,
      );
    return { data: null, error };
  }
};

export const getVendedores = async () => {
  try {
    const { data, error } = await supabase
      .from("distrimm_vendedores")
      .select("*")
      .order("codigo", { ascending: true });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[portfolioService] Error fetching vendedores:", error);
    return { data: null, error };
  }
};

export const updateVendedorName = async (codigo, nombre) => {
  try {
    const { error } = await supabase
      .from("distrimm_vendedores")
      .update({ nombre })
      .eq("codigo", codigo);

    if (error) throw error;
    return { success: true, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[portfolioService] Error updating vendedor:", error);
    return { success: false, error };
  }
};

export const getClientCreditScore = async (nit) => {
  if (!nit) return { data: null, error: new Error("NIT is required") };
  try {
    const { data, error } = await supabase.rpc("fn_calcular_credit_score", {
      p_nit: nit,
    });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error(
        "[portfolioService] Error calculating credit score:",
        error,
      );
    return { data: null, error };
  }
};

// v2 credit score: 8 variables, 3 dimensions, configurable weights

export const getClientCreditScoreV2 = async (nit) => {
  if (!nit) return { data: null, error: new Error("NIT is required") };
  try {
    const { data: configRow, error: configError } = await supabase
      .from("distrimm_config")
      .select("score_config")
      .eq("id", 1)
      .single();

    if (configError && import.meta.env.DEV)
      console.warn(
        "[portfolioService] Config fetch failed, using defaults:",
        configError,
      );
    const scoreConfig = configRow?.score_config || null;

    const { data, error } = await supabase.rpc("fn_calcular_credit_score_v2", {
      p_nit: nit,
      p_config: scoreConfig,
    });

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    if (import.meta.env.DEV)
      console.error(
        "[portfolioService] Error calculating credit score v2:",
        err,
      );
    return { data: null, error: err };
  }
};

export const getInvoicesByIds = async (ids) => {
  if (!ids || ids.length === 0) return { data: [], error: null };
  try {
    const BATCH = 200;
    const allData = [];
    for (let i = 0; i < ids.length; i += BATCH) {
      const { data, error } = await supabase
        .from("cartera_items")
        .select("*")
        .in("id", ids.slice(i, i + BATCH));
      if (error) throw error;
      if (data) allData.push(...data);
    }
    return { data: allData, error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error(
        "[portfolioService] Error fetching invoices by IDs:",
        error,
      );
    return { data: null, error };
  }
};

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
    if (import.meta.env.DEV)
      console.error("[portfolioService] Error fetching config:", error);
    return { data: null, error };
  }
};

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
    if (import.meta.env.DEV)
      console.error("[portfolioService] Error updating config:", error);
    return { data: null, error };
  }
};

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
    if (import.meta.env.DEV)
      console.error("[portfolioService] Error fetching score config:", error);
    return { data: null, error };
  }
};

export const updateScoreConfig = async (scoreConfig) => {
  try {
    const { error } = await supabase
      .from("distrimm_config")
      .update({
        score_config: scoreConfig,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    if (import.meta.env.DEV)
      console.error("[portfolioService] Error updating score config:", error);
    return { error };
  }
};
