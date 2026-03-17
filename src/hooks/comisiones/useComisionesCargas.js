import { useState, useEffect, useCallback, useRef } from "react";
import {
  getComisionesCargas,
  deleteComisionesCarga,
} from "../../services/comisionesService";

export function useComisionesCargas() {
  const [cargas, setCargas] = useState([]);
  const [selectedCargaId, setSelectedCargaId] = useState(null);
  const [loadingCargas, setLoadingCargas] = useState(true);

  const currentCargaRef = useRef(null);

  const fetchCargas = useCallback(async () => {
    setLoadingCargas(true);
    try {
      const { data } = await getComisionesCargas();
      setCargas(data || []);
      if (data?.length > 0 && !currentCargaRef.current) {
        const firstId = data[0].id;
        setSelectedCargaId(firstId);
        currentCargaRef.current = firstId;
      }
    } catch (err) {
      if (import.meta.env.DEV)
        console.error("[useComisionesCargas] Error fetching cargas:", err);
      setCargas([]);
    }
    setLoadingCargas(false);
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    getComisionesCargas()
      .then(({ data }) => {
        if (cancelled) return;
        setCargas(data || []);
        if (data?.length > 0 && !currentCargaRef.current) {
          const firstId = data[0].id;
          setSelectedCargaId(firstId);
          currentCargaRef.current = firstId;
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (import.meta.env.DEV)
          console.error("[useComisionesCargas] Error fetching cargas:", err);
        setCargas([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCargas(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectCarga = useCallback((id) => {
    setSelectedCargaId(id);
    currentCargaRef.current = id;
  }, []);

  const deleteCarga = useCallback(
    async (id) => {
      const { success } = await deleteComisionesCarga(id);
      if (success) {
        // Limpiar selección ANTES de refetch para que fetchCargas auto-seleccione el primero
        if (id === currentCargaRef.current) {
          setSelectedCargaId(null);
          currentCargaRef.current = null;
        }
        await fetchCargas();
      }
      return success;
    },
    [fetchCargas],
  );

  const refreshAfterUpload = useCallback(async () => {
    await fetchCargas();
  }, [fetchCargas]);

  const selectedCarga = cargas.find((c) => c.id === selectedCargaId) || null;

  return {
    cargas,
    selectedCargaId,
    selectedCarga,
    loadingCargas,
    selectCarga,
    deleteCarga,
    refreshAfterUpload,
    fetchCargas,
  };
}
