/**
 * @fileoverview Hook del módulo Sugerido de Pedidos.
 * Orquesta cargas de inventario, parámetros de cálculo y resultado del RPC.
 * @module hooks/useSugeridoPedidos
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  getInventarioCargas,
  deleteInventarioCarga,
  getSugeridoPedidos,
  getSugeridoConfig,
  saveSugeridoConfig,
} from "../services/sugeridoService";
import { logAudit } from "../services/auditService";

export function useSugeridoPedidos() {
  const [cargas, setCargas] = useState([]);
  const [selectedCargaId, setSelectedCargaId] = useState(null);
  const [params, setParams] = useState(null); // null hasta leer config de DB
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState(null);
  // Evita que una respuesta lenta pise el resultado de un recálculo más nuevo
  const requestIdRef = useRef(0);

  const fetchCargas = useCallback(async ({ autoSelect = true } = {}) => {
    const { data, error: err } = await getInventarioCargas();
    if (err) {
      setError("No se pudieron cargar los archivos de inventario.");
      return [];
    }
    setCargas(data);
    if (autoSelect && data.length > 0) {
      setSelectedCargaId((prev) =>
        prev && data.some((c) => c.id === prev) ? prev : data[0].id,
      );
    }
    return data;
  }, []);

  // Carga inicial: config + cargas en paralelo
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: config }] = await Promise.all([
        getSugeridoConfig(),
        fetchCargas(),
      ]);
      if (cancelled) return;
      setParams({
        diasCobertura: config.dias_cobertura,
        pctCrecimiento: Number(config.pct_crecimiento),
        pctReserva: Number(config.pct_reserva),
        diasAnalisis: config.dias_analisis,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchCargas]);

  // Recalcular cuando cambia la carga seleccionada o los parámetros aplicados
  useEffect(() => {
    if (!selectedCargaId || !params) return;
    const requestId = ++requestIdRef.current;
    setCalculando(true);
    setError(null);
    getSugeridoPedidos(selectedCargaId, params).then(({ data, error: err }) => {
      if (requestId !== requestIdRef.current) return;
      if (err) {
        setError("Error calculando el sugerido: " + (err.message || err));
        setRows([]);
      } else {
        setRows(data);
      }
      setCalculando(false);
    });
  }, [selectedCargaId, params]);

  /** Aplica nuevos parámetros y dispara el recálculo */
  const recalcular = useCallback((newParams) => {
    setParams(newParams);
  }, []);

  /** Guarda los parámetros actuales como predeterminados de la organización */
  const guardarPredeterminado = useCallback(async (newParams) => {
    const { success, error: err } = await saveSugeridoConfig(newParams);
    if (success) {
      logAudit("SUGERIDO_CONFIG", "distrimm_sugerido_config", null, newParams);
    }
    return { success, error: err };
  }, []);

  const deleteCarga = useCallback(
    async (cargaId) => {
      const { success, error: err } = await deleteInventarioCarga(cargaId);
      if (success) {
        logAudit("ELIMINAR_CARGA_INVENTARIO", "distrimm_inventario_cargas", cargaId);
        setSelectedCargaId(null);
        await fetchCargas();
      }
      return { success, error: err };
    },
    [fetchCargas],
  );

  return {
    cargas,
    selectedCargaId,
    setSelectedCargaId,
    params,
    // Sin carga seleccionada no hay resultado (evita mostrar filas stale
    // tras eliminar la última carga)
    rows: selectedCargaId && params ? rows : [],
    loading,
    calculando,
    error,
    recalcular,
    guardarPredeterminado,
    deleteCarga,
    fetchCargas,
  };
}
