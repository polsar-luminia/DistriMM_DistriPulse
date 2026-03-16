import { useState, useEffect, useCallback, useRef } from "react";
import {
  getRecaudoCargas,
  deleteRecaudoCarga as deleteRecaudoCargaSvc,
  getRecaudosByCarga,
  getPresupuestosRecaudo,
  upsertPresupuestoRecaudo,
  deletePresupuestoRecaudo as deletePresupuestoRecaudoSvc,
  getPresupuestosMarca,
  upsertPresupuestoMarca,
  deletePresupuestoMarca as deletePresupuestoMarcaSvc,
  copiarPresupuestosMes,
} from "../../services/comisionesService";

export function useComisionesRecaudos() {
  const [recaudoCargas, setRecaudoCargas] = useState([]);
  const [selectedRecaudoCargaId, setSelectedRecaudoCargaId] = useState(null);
  const [loadingRecaudoCargas, setLoadingRecaudoCargas] = useState(true);
  const [recaudos, setRecaudos] = useState([]);
  const [loadingRecaudos, setLoadingRecaudos] = useState(false);
  const [presupuestosRecaudo, setPresupuestosRecaudo] = useState([]);
  const [presupuestosMarca, setPresupuestosMarca] = useState([]);
  const [loadingPresupuestos, setLoadingPresupuestos] = useState(false);

  const autoSelectedRef = useRef(false);

  // ── Fetch recaudo cargas (stable, no deps — uses requestId to prevent race condition) ──
  const fetchRequestIdRef = useRef(0);
  const fetchRecaudoCargas = useCallback(async () => {
    const requestId = ++fetchRequestIdRef.current;
    setLoadingRecaudoCargas(true);
    try {
      const { data } = await getRecaudoCargas();
      // Ignore stale responses from earlier calls
      if (requestId !== fetchRequestIdRef.current) return;
      setRecaudoCargas(data || []);
      if (data?.length > 0 && !autoSelectedRef.current) {
        setSelectedRecaudoCargaId(data[0].id);
        autoSelectedRef.current = true;
      }
    } catch (err) {
      if (requestId !== fetchRequestIdRef.current) return;
      if (import.meta.env.DEV) console.error("[useComisionesRecaudos] Error fetching recaudo cargas:", err);
      setRecaudoCargas([]);
    } finally {
      if (requestId === fetchRequestIdRef.current) setLoadingRecaudoCargas(false);
    }
  }, []);

  // Initial load with AbortController-style cleanup
  useEffect(() => {
    let cancelled = false;
    getRecaudoCargas()
      .then(({ data }) => {
        if (cancelled) return;
        setRecaudoCargas(data || []);
        if (data?.length > 0 && !autoSelectedRef.current) {
          setSelectedRecaudoCargaId(data[0].id);
          autoSelectedRef.current = true;
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (import.meta.env.DEV) console.error("[useComisionesRecaudos] Error fetching recaudo cargas:", err);
          setRecaudoCargas([]);
        }
      })
      .finally(() => { if (!cancelled) setLoadingRecaudoCargas(false); });
    return () => { cancelled = true; };
  }, []);

  // Fetch recaudos when selection changes
  useEffect(() => {
    if (!selectedRecaudoCargaId) { setRecaudos([]); return; }
    let cancelled = false;
    setLoadingRecaudos(true);
    getRecaudosByCarga(selectedRecaudoCargaId)
      .then(({ data }) => { if (!cancelled) setRecaudos(data || []); })
      .catch((err) => {
        if (!cancelled) {
          if (import.meta.env.DEV) console.error(`[useComisionesRecaudos] Error fetching recaudos for ${selectedRecaudoCargaId}:`, err);
          setRecaudos([]);
        }
      })
      .finally(() => { if (!cancelled) setLoadingRecaudos(false); });
    return () => { cancelled = true; };
  }, [selectedRecaudoCargaId]);

  const selectRecaudoCarga = useCallback((id) => setSelectedRecaudoCargaId(id), []);

  const deleteRecaudoCarga = useCallback(async (id) => {
    const { success } = await deleteRecaudoCargaSvc(id);
    if (success) {
      await fetchRecaudoCargas();
      setSelectedRecaudoCargaId((prev) => {
        if (prev === id) {
          setRecaudos([]);
          return null;
        }
        return prev;
      });
    }
    return success;
  }, [fetchRecaudoCargas]);

  const refreshRecaudos = useCallback(() => fetchRecaudoCargas(), [fetchRecaudoCargas]);

  // ── Presupuesto callbacks (lazy — NOT called on mount) ──
  const fetchPresupuestos = useCallback(async (year, month) => {
    setLoadingPresupuestos(true);
    try {
      const [recRes, marcaRes] = await Promise.all([
        getPresupuestosRecaudo(year, month),
        getPresupuestosMarca(year, month),
      ]);
      setPresupuestosRecaudo(recRes.data || []);
      setPresupuestosMarca(marcaRes.data || []);
    } catch (err) {
      if (import.meta.env.DEV) console.error("[useComisionesRecaudos] Error fetching presupuestos:", err);
      setPresupuestosRecaudo([]);
      setPresupuestosMarca([]);
    }
    setLoadingPresupuestos(false);
  }, []);

  const savePresupuestoRecaudo = useCallback(async (row) => {
    return upsertPresupuestoRecaudo(row);
  }, []);

  const savePresupuestoMarca = useCallback(async (row) => {
    return upsertPresupuestoMarca(row);
  }, []);

  const removePresupuestoRecaudo = useCallback(async (id) => {
    const { success } = await deletePresupuestoRecaudoSvc(id);
    return success;
  }, []);

  const removePresupuestoMarca = useCallback(async (id) => {
    const { success } = await deletePresupuestoMarcaSvc(id);
    return success;
  }, []);

  const copiarPresupuestos = useCallback(
    (fromYear, fromMonth, toYear, toMonth) =>
      copiarPresupuestosMes(fromYear, fromMonth, toYear, toMonth),
    [],
  );

  return {
    recaudoCargas,
    selectedRecaudoCargaId,
    selectedRecaudoCarga: recaudoCargas.find((c) => c.id === selectedRecaudoCargaId) || null,
    loadingRecaudoCargas,
    recaudos,
    loadingRecaudos,
    selectRecaudoCarga,
    deleteRecaudoCarga,
    refreshRecaudos,
    presupuestosRecaudo,
    presupuestosMarca,
    loadingPresupuestos,
    fetchPresupuestos,
    savePresupuestoRecaudo,
    savePresupuestoMarca,
    removePresupuestoRecaudo,
    removePresupuestoMarca,
    copiarPresupuestos,
  };
}
