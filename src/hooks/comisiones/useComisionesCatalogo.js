/**
 * @fileoverview Hook for managing the product catalog (catalogo de productos).
 * Independent — does not depend on selectedCargaId or other sub-hooks.
 * @module hooks/comisiones/useComisionesCatalogo
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getProductosCatalogo,
  upsertProductosCatalogo,
  clearProductosCatalogo,
  getMarcasUnicas,
} from "../../services/comisionesService";

/**
 * Gestiona el catalogo de productos (marcas, categorias, codigos).
 * @returns {{
 *   catalogo: Array,
 *   loadingCatalogo: boolean,
 *   marcas: Array,
 *   uploadCatalogo: (rows: Array) => Promise<{error: any}>,
 *   clearCatalogo: () => Promise<boolean>,
 *   fetchCatalogo: () => Promise<void>
 * }}
 */
export function useComisionesCatalogo() {
  const [catalogo, setCatalogo] = useState([]);
  const [loadingCatalogo, setLoadingCatalogo] = useState(true);
  const [marcas, setMarcas] = useState([]);
  const fetchRequestIdRef = useRef(0);

  const fetchCatalogo = useCallback(async () => {
    const requestId = ++fetchRequestIdRef.current;
    setLoadingCatalogo(true);
    try {
      const [catRes, marcasRes] = await Promise.all([
        getProductosCatalogo(),
        getMarcasUnicas(),
      ]);
      if (requestId !== fetchRequestIdRef.current) return;
      setCatalogo(catRes.data || []);
      setMarcas(marcasRes.data || []);
    } catch (err) {
      if (requestId !== fetchRequestIdRef.current) return;
      if (import.meta.env.DEV) console.error("[useComisionesCatalogo] Error fetching catalogo:", err);
      setCatalogo([]);
      setMarcas([]);
    }
    if (requestId === fetchRequestIdRef.current) setLoadingCatalogo(false);
  }, []);

  // Initial load with cleanup
  useEffect(() => {
    let cancelled = false;
    const requestId = ++fetchRequestIdRef.current;
    Promise.all([getProductosCatalogo(), getMarcasUnicas()])
      .then(([catRes, marcasRes]) => {
        if (cancelled || requestId !== fetchRequestIdRef.current) return;
        setCatalogo(catRes.data || []);
        setMarcas(marcasRes.data || []);
      })
      .catch((err) => {
        if (cancelled || requestId !== fetchRequestIdRef.current) return;
        if (import.meta.env.DEV) console.error("[useComisionesCatalogo] Error fetching catalogo:", err);
        setCatalogo([]);
        setMarcas([]);
      })
      .finally(() => {
        if (!cancelled && requestId === fetchRequestIdRef.current) setLoadingCatalogo(false);
      });
    return () => { cancelled = true; };
  }, []);

  const uploadCatalogo = useCallback(
    async (rows) => {
      const { error } = await upsertProductosCatalogo(rows);
      if (!error) await fetchCatalogo();
      return { error };
    },
    [fetchCatalogo],
  );

  const clearCatalogo = useCallback(async () => {
    const { success } = await clearProductosCatalogo();
    if (success) await fetchCatalogo();
    return success;
  }, [fetchCatalogo]);

  return {
    catalogo,
    loadingCatalogo,
    marcas,
    uploadCatalogo,
    clearCatalogo,
    fetchCatalogo,
  };
}
