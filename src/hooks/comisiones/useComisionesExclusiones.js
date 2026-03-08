/**
 * @fileoverview Hook for managing commission exclusion rules (CRUD).
 * Receives selectedCargaId as a param to avoid stale closures.
 * Uses a ref for fetchComisiones to break circular dependency with calculo hook.
 * @module hooks/comisiones/useComisionesExclusiones
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getExclusiones,
  addExclusion as addExclusionSvc,
  removeExclusion as removeExclusionSvc,
  toggleExclusion as toggleExclusionSvc,
} from "../../services/comisionesService";

/**
 * Gestiona reglas de exclusion de comisiones (por producto o marca).
 * @param {string|null} selectedCargaId - ID de carga seleccionada (param, no closure)
 * @returns {{
 *   exclusiones: Array,
 *   loadingExclusiones: boolean,
 *   addExclusion: (exclusion: Object) => Promise<{data: any, error: any}>,
 *   removeExclusion: (id: string) => Promise<boolean>,
 *   toggleExclusion: (id: string, activa: boolean) => Promise<boolean>,
 *   setFetchComisionesRef: (fn: Function) => void
 * }}
 */
export function useComisionesExclusiones(selectedCargaId) {
  const [exclusiones, setExclusiones] = useState([]);
  const [loadingExclusiones, setLoadingExclusiones] = useState(true);

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
      if (import.meta.env.DEV) console.error(
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
          if (import.meta.env.DEV) console.error(
            "[useComisionesExclusiones] Error fetching exclusiones:",
            err,
          );
          setExclusiones([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingExclusiones(false);
      });
    return () => { cancelled = true; };
  }, []);

  const addExclusion = useCallback(
    async (exclusion) => {
      const { data, error } = await addExclusionSvc(exclusion);
      if (!error) {
        await fetchExclusiones();
        if (selectedCargaId && fetchComisionesRef.current) {
          fetchComisionesRef.current(selectedCargaId);
        }
      }
      return { data, error };
    },
    [fetchExclusiones, selectedCargaId],
  );

  const removeExclusion = useCallback(
    async (id) => {
      const { success } = await removeExclusionSvc(id);
      if (success) {
        await fetchExclusiones();
        if (selectedCargaId && fetchComisionesRef.current) {
          fetchComisionesRef.current(selectedCargaId);
        }
      }
      return success;
    },
    [fetchExclusiones, selectedCargaId],
  );

  const toggleExclusion = useCallback(
    async (id, activa) => {
      const { success } = await toggleExclusionSvc(id, activa);
      if (success) {
        await fetchExclusiones();
        if (selectedCargaId && fetchComisionesRef.current) {
          fetchComisionesRef.current(selectedCargaId);
        }
      }
      return success;
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
