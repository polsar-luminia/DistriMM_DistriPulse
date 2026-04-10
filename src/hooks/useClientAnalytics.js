import { useState, useEffect, useCallback, useMemo } from "react";
import { getClientes } from "../services/portfolioService";

export function useClientAnalytics() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchClientes = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await getClientes();
      if (fetchError) throw fetchError;
      setClientes(data || []);
    } catch (err) {
      if (import.meta.env.DEV) console.error("Error fetching clientes:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchClientes().then(() => {
      if (cancelled) return;
    });
    return () => { cancelled = true; };
  }, [fetchClientes]);

  // Build a lookup map: NIT -> Client Master Data
  const clienteMap = useMemo(() => {
    const map = {};
    clientes.forEach((c) => {
      map[c.no_identif] = c;
    });
    return map;
  }, [clientes]);

  // Stats
  const stats = useMemo(() => {
    const total = clientes.length;
    const juridicas = clientes.filter((c) => c.tipo_persona === "Juridica").length;
    const naturales = clientes.filter((c) => c.tipo_persona === "Natural").length;
    const conCorreo = clientes.filter((c) => c.correo_electronico).length;
    const conCelular = clientes.filter((c) => c.celular).length;

    // Group by municipio
    const municipioMap = {};
    clientes.forEach((c) => {
      const m = c.municipio || "Sin Municipio";
      municipioMap[m] = (municipioMap[m] || 0) + 1;
    });
    const topMunicipios = Object.entries(municipioMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Group by clasificacion IVA
    const ivaMap = {};
    clientes.forEach((c) => {
      const iva = c.clasificacion_iva || "Sin Clasificar";
      ivaMap[iva] = (ivaMap[iva] || 0) + 1;
    });
    const ivaDistribution = Object.entries(ivaMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Group by vendedor
    const vendedorMap = {};
    clientes.forEach((c) => {
      const v = c.vendedor_codigo || "Sin Vendedor";
      vendedorMap[v] = (vendedorMap[v] || 0) + 1;
    });
    const vendedorDistribution = Object.entries(vendedorMap)
      .map(([codigo, count]) => ({ codigo, count }))
      .sort((a, b) => b.count - a.count);

    return {
      total,
      juridicas,
      naturales,
      conCorreo,
      conCelular,
      coberturaCelular: total > 0 ? ((conCelular / total) * 100).toFixed(1) : 0,
      coberturaCorreo: total > 0 ? ((conCorreo / total) * 100).toFixed(1) : 0,
      topMunicipios,
      ivaDistribution,
      vendedorDistribution,
    };
  }, [clientes]);

  const enrichItemsWithMasterData = useCallback(
    (items) => {
      if (!items || clientes.length === 0) return items;

      return items.map((item) => {
        const masterData = item.tercero_nit
          ? clienteMap[item.tercero_nit]
          : null;

        return {
          ...item,
          _masterData: masterData || null,
          _celular: masterData?.celular || masterData?.telefono_1 || item.telefono,
          _correo: masterData?.correo_electronico || null,
          _municipio: masterData?.municipio || null,
          _direccion: masterData?.direccion || null,
          _tipoPersona: masterData?.tipo_persona || null,
          _clasificacionIva: masterData?.clasificacion_iva || null,
        };
      });
    },
    [clienteMap, clientes],
  );

  return {
    clientes,
    clienteMap,
    stats,
    loading,
    error,
    refresh: fetchClientes,
    enrichItemsWithMasterData,
  };
}
