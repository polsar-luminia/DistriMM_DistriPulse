import { useState, useEffect, useCallback, useRef } from "react";
import {
  getExclusiones,
  addExclusion as addExclusionSvc,
  removeExclusion as removeExclusionSvc,
  toggleExclusion as toggleExclusionSvc,
} from "../../services/comisionesService";

export function useComisionesExclusiones(selectedCargaId) {
  const [exclusiones, setExclusiones] = useState([]);
  const [loadingExclusiones, setLoadingExclusiones] = useState(true);

  // Guard against concurrent mutation calls (double-click protection)
  const operationInFlightRef = useRef(false);

  // Ref for fetchComisiones — set by the barrel hook after calculo is ready.
  // Avoids circular dependency: exclusiones <-> calculo.
  const fetchComisionesRef = useRef(null);

  const setFetchComisionesRef = useCallback((fn) => {
    fetchComisionesRef.current = fn;
  }, []);

  const fetchExclusiones = useCallback(async () => {
    setLoadingExclusiones(true);
    try {
      const { data } = await getExclusiones();
      setExclusiones(data || []);
    } catch (err) {
      if (import.meta.env.DEV)
        console.error(
          "[useComisionesExclusiones] Error fetching exclusiones:",
          err,
        );
      setExclusiones([]);
    }
    setLoadingExclusiones(false);
  }, []);

  // Initial load with cleanup
  useEffect(() => {
    let cancelled = false;
    getExclusiones()
      .then(({ data }) => {
        if (!cancelled) setExclusiones(data || []);
      })
      .catch((err) => {
        if (!cancelled) {
          if (import.meta.env.DEV)
            console.error(
              "[useComisionesExclusiones] Error fetching exclusiones:",
              err,
            );
          setExclusiones([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingExclusiones(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addExclusion = useCallback(
    async (exclusion) => {
      if (operationInFlightRef.current) return { data: null, error: null };
      operationInFlightRef.current = true;
      try {
        const { data, error } = await addExclusionSvc(exclusion);
        if (!error) {
          await fetchExclusiones();
          if (selectedCargaId && fetchComisionesRef.current) {
            fetchComisionesRef.current(selectedCargaId);
          }
        }
        return { data, error };
      } finally {
        operationInFlightRef.current = false;
      }
    },
    [fetchExclusiones, selectedCargaId],
  );

  const removeExclusion = useCallback(
    async (id) => {
      if (operationInFlightRef.current) return false;
      operationInFlightRef.current = true;
      try {
        const { success } = await removeExclusionSvc(id);
        if (success) {
          await fetchExclusiones();
          if (selectedCargaId && fetchComisionesRef.current) {
            fetchComisionesRef.current(selectedCargaId);
          }
        }
        return success;
      } finally {
        operationInFlightRef.current = false;
      }
    },
    [fetchExclusiones, selectedCargaId],
  );

  const toggleExclusion = useCallback(
    async (id, activa) => {
      if (operationInFlightRef.current) return false;
      operationInFlightRef.current = true;
      try {
        const { success } = await toggleExclusionSvc(id, activa);
        if (success) {
          await fetchExclusiones();
          if (selectedCargaId && fetchComisionesRef.current) {
            fetchComisionesRef.current(selectedCargaId);
          }
        }
        return success;
      } finally {
        operationInFlightRef.current = false;
      }
    },
    [fetchExclusiones, selectedCargaId],
  );

  return {
    exclusiones,
    loadingExclusiones,
    addExclusion,
    removeExclusion,
    toggleExclusion,
    setFetchComisionesRef,
  };
}
