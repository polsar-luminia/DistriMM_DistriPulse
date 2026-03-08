/**
 * @fileoverview Hook for commission calculation and monthly report generation.
 * Receives selectedCargaId, catalogo, and exclusiones as parameters to avoid stale closures.
 * @module hooks/comisiones/useComisionesCalculo
 */

import { useState, useEffect, useCallback } from "react";
import { calcularComisionesCompletas } from "../../utils/comisionesCalculator";
import {
  calcularComisiones,
  getComisionesVentas,
  getCargasByMonth,
  getVentasByCargas,
  getRecaudosByPeriodo,
  getPresupuestosMarca,
  getPresupuestosRecaudo,
} from "../../services/comisionesService";
import { buildExclusionLookups, getExclusionInfo } from "./utils";

/**
 * Gestiona el calculo de comisiones y el reporte mensual.
 * @param {string|null} selectedCargaId - ID de la carga seleccionada
 * @param {Array} catalogo - Catalogo de productos (para exclusiones en reporte)
 * @param {Array} exclusiones - Reglas de exclusion activas (para reporte)
 * @returns {{
 *   comisiones: Array,
 *   loadingComisiones: boolean,
 *   totals: Object,
 *   ventasDetail: Array,
 *   loadingVentas: boolean,
 *   fetchComisiones: (cargaId: string) => Promise<void>,
 *   reporteMensual: Object|null,
 *   loadingReporte: boolean,
 *   generarReporteMensual: (year: number, month: number) => Promise<void>
 * }}
 */
export function useComisionesCalculo(selectedCargaId, catalogo, exclusiones) {
  const [comisiones, setComisiones] = useState([]);
  const [loadingComisiones, setLoadingComisiones] = useState(false);
  const [ventasDetail, setVentasDetail] = useState([]);
  const [loadingVentas, setLoadingVentas] = useState(false);
  const [reporteMensual, setReporteMensual] = useState(null);
  const [loadingReporte, setLoadingReporte] = useState(false);

  const fetchComisiones = useCallback(async (cargaId) => {
    if (!cargaId) { setComisiones([]); return; }
    setLoadingComisiones(true);
    try {
      const { data } = await calcularComisiones(cargaId);
      setComisiones(data || []);
    } catch (err) {
      if (import.meta.env.DEV) console.error(`[useComisionesCalculo] Error calculating comisiones for carga ${cargaId}:`, err);
      setComisiones([]);
    } finally {
      setLoadingComisiones(false);
    }
  }, []);

  // When selectedCargaId changes, fetch comisiones + ventas
  useEffect(() => {
    if (!selectedCargaId) { setComisiones([]); setVentasDetail([]); return; }
    let cancelled = false;
    setLoadingComisiones(true);
    setLoadingVentas(true);
    Promise.all([
      calcularComisiones(selectedCargaId),
      getComisionesVentas(selectedCargaId),
    ])
      .then(([comRes, ventasRes]) => {
        if (cancelled) return;
        setComisiones(comRes.data || []);
        setVentasDetail(ventasRes.data || []);
      })
      .catch((err) => {
        if (cancelled) return;
        if (import.meta.env.DEV) console.error(
          `[useComisionesCalculo] Error loading data for carga ${selectedCargaId}:`,
          err,
        );
        setComisiones([]);
        setVentasDetail([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingComisiones(false);
          setLoadingVentas(false);
        }
      });

    return () => { cancelled = true; };
  }, [selectedCargaId]);

  // Generate monthly report
  const generarReporteMensual = useCallback(
    async (year, month) => {
      setLoadingReporte(true);
      setReporteMensual(null);
      const empty = { cargas: [], ventas: [], recaudos: [], presupuestosMarca: [],
        presupuestosRecaudo: [], liquidacion: [], year, month };
      try {
        const { data: cargasMes, error: cErr } = await getCargasByMonth(
          year,
          month,
        );
        if (cErr || !cargasMes?.length) {
          setReporteMensual(empty);
          setLoadingReporte(false);
          return;
        }

        const ids = cargasMes.map((c) => c.id);
        const [ventasRes, recaudosRes, presMarcaRes, presRecaudoRes] =
          await Promise.all([
            getVentasByCargas(ids),
            getRecaudosByPeriodo(year, month),
            getPresupuestosMarca(year, month),
            getPresupuestosRecaudo(year, month),
          ]);

        const ventasMes = ventasRes.data || [];
        const recaudosMes = recaudosRes.data || [];
        const presMarca = presMarcaRes.data || [];
        const presRecaudo = presRecaudoRes.data || [];

        const productBrandMap = {};
        (catalogo || []).forEach((p) => {
          if (p.marca) productBrandMap[p.codigo] = p.marca;
        });

        const lookups = buildExclusionLookups(exclusiones, catalogo);
        const classifiedVentas = ventasMes.map((v) => {
          const info = getExclusionInfo(
            v.producto_codigo,
            lookups.productExclusionSet,
            lookups.brandExclusionSet,
            lookups.productBrandMap,
          );
          return { ...v, excluded: info.excluded, reason: info.reason };
        });

        const liquidacion = calcularComisionesCompletas({
          ventas: classifiedVentas,
          recaudos: recaudosMes,
          presupuestosMarca: presMarca,
          presupuestosRecaudo: presRecaudo,
          productBrandMap,
        });

        setReporteMensual({
          cargas: cargasMes,
          ventas: classifiedVentas,
          recaudos: recaudosMes,
          presupuestosMarca: presMarca,
          presupuestosRecaudo: presRecaudo,
          liquidacion,
          year,
          month,
        });
      } catch (err) {
        if (import.meta.env.DEV) console.error(
          "[useComisionesCalculo] Error generating monthly report:",
          err,
        );
        setReporteMensual(empty);
      }
      setLoadingReporte(false);
    },
    [catalogo, exclusiones],
  );

  // Computed totals
  const init = { totalVentas: 0, ventasExcluidas: 0, ventasComisionables: 0, margenComisionable: 0, costoComisionable: 0 };
  const totals = comisiones.reduce((acc, v) => ({
    totalVentas: acc.totalVentas + Number(v.total_ventas || 0),
    ventasExcluidas: acc.ventasExcluidas + Number(v.ventas_excluidas || 0),
    ventasComisionables: acc.ventasComisionables + Number(v.ventas_comisionables || 0),
    margenComisionable: acc.margenComisionable + Number(v.margen_comisionable || 0),
    costoComisionable: acc.costoComisionable + Number(v.costo_comisionable || 0),
  }), init);
  totals.margenPct = totals.ventasComisionables > 0
    ? (totals.margenComisionable / totals.ventasComisionables) * 100 : 0;

  return {
    comisiones,
    loadingComisiones,
    totals,
    ventasDetail,
    loadingVentas,
    fetchComisiones,
    reporteMensual,
    loadingReporte,
    generarReporteMensual,
  };
}
