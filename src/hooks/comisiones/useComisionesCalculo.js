import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { calcularComisionesCompletas } from "../../utils/comisionesCalculator";
import {
  calcularComisiones,
  getComisionesVentas,
  getCargasByMonth,
  getVentasByCargas,
  getRecaudosByPeriodo,
  getPresupuestosMarca,
  getPresupuestosRecaudo,
  getSnapshot,
  saveSnapshot,
  buildInputHash,
} from "../../services/comisionesService";
import { buildExclusionLookups, getExclusionInfo } from "./utils";

export function useComisionesCalculo(selectedCargaId, catalogo, exclusiones) {
  const [comisiones, setComisiones] = useState([]);
  const [loadingComisiones, setLoadingComisiones] = useState(false);
  const [ventasDetail, setVentasDetail] = useState([]);
  const [loadingVentas, setLoadingVentas] = useState(false);
  const [reporteMensual, setReporteMensual] = useState(null);
  const [loadingReporte, setLoadingReporte] = useState(false);
  const generatingReporteRef = useRef(false);

  const fetchComisiones = useCallback(async (cargaId) => {
    if (!cargaId) {
      setComisiones([]);
      return;
    }
    setLoadingComisiones(true);
    try {
      const { data } = await calcularComisiones(cargaId);
      setComisiones(data || []);
    } catch (err) {
      if (import.meta.env.DEV)
        console.error(
          `[useComisionesCalculo] Error calculating comisiones for carga ${cargaId}:`,
          err,
        );
      setComisiones([]);
    } finally {
      setLoadingComisiones(false);
    }
  }, []);

  // When selectedCargaId changes, fetch comisiones + ventas
  useEffect(() => {
    if (!selectedCargaId) {
      setComisiones([]);
      setVentasDetail([]);
      return;
    }
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
        if (import.meta.env.DEV)
          console.error(
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

    return () => {
      cancelled = true;
    };
  }, [selectedCargaId]);

  // Generate monthly report — reads snapshot first, calculates live only if none exists.
  // forceRecalc=true bypasses snapshot and saves a new one.
  const generarReporteMensual = useCallback(
    async (year, month, { forceRecalc = false } = {}) => {
      if (generatingReporteRef.current) return;
      generatingReporteRef.current = true;
      setLoadingReporte(true);
      setReporteMensual(null);
      const empty = {
        cargas: [],
        ventas: [],
        recaudos: [],
        presupuestosMarca: [],
        presupuestosRecaudo: [],
        liquidacion: [],
        year,
        month,
        isSnapshot: false,
      };
      try {
        // Siempre necesitamos los datos base para determinar estado
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

        // Hash actual de inputs (incluye exclusiones y catálogo para detectar cambios de reglas)
        const currentHash = buildInputHash({
          cargaIds: ids,
          totalVentas: ventasMes.length,
          totalRecaudos: recaudosMes.length,
          presupuestosMarca: presMarca,
          presupuestosRecaudo: presRecaudo,
          exclusiones,
          catalogoCount: (catalogo || []).length,
        });

        // 1. Check for existing snapshot (unless forced recalc)
        if (!forceRecalc) {
          const { data: snap } = await getSnapshot(year, month);
          if (snap) {
            const isStale = snap.input_hash !== currentHash;

            // Clasificar ventas para display (referencia, no para liquidación)
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

            setReporteMensual({
              cargas: cargasMes,
              ventas: classifiedVentas,
              recaudos: recaudosMes,
              presupuestosMarca: presMarca,
              presupuestosRecaudo: presRecaudo,
              // Liquidación y totales congelados del snapshot
              liquidacion: snap.liquidacion,
              snapshotTotales: snap.totales_ventas,
              year,
              month,
              isSnapshot: true,
              isStale,
              snapshotDate: snap.updated_at,
            });
            setLoadingReporte(false);
            return;
          }
        }

        // 2. No snapshot o recalc forzado — calcular en vivo
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

        // Calcular totales de ventas para congelar en el snapshot
        const totalesVentas = {
          totalVentas: classifiedVentas.reduce(
            (s, v) => s + Number(v.valor_total || 0),
            0,
          ),
          ventasExcluidas: classifiedVentas
            .filter((v) => v.excluded)
            .reduce((s, v) => s + Number(v.valor_total || 0), 0),
          ventasComisionables: classifiedVentas
            .filter((v) => !v.excluded)
            .reduce((s, v) => s + Number(v.valor_total || 0), 0),
        };

        const resumen = {
          totalComision: liquidacion.reduce((s, l) => s + l.totalComision, 0),
          totalComisionVentas: liquidacion.reduce(
            (s, l) => s + l.comisionVentas.totalComisionVentas,
            0,
          ),
          totalComisionRecaudo: liquidacion.reduce(
            (s, l) => s + l.comisionRecaudo.comisionRecaudo,
            0,
          ),
          vendedoresCount: liquidacion.length,
        };

        // 3. Guardar snapshot con trazabilidad completa
        const { error: snapErr } = await saveSnapshot({
          year,
          month,
          cargaIds: ids,
          totalVentas: ventasMes.length,
          totalRecaudos: recaudosMes.length,
          liquidacion,
          resumen,
          presupuestosMarca: presMarca,
          presupuestosRecaudo: presRecaudo,
          totalesVentas,
          exclusiones,
          catalogoCount: (catalogo || []).length,
        });
        if (snapErr) throw snapErr;

        setReporteMensual({
          cargas: cargasMes,
          ventas: classifiedVentas,
          recaudos: recaudosMes,
          presupuestosMarca: presMarca,
          presupuestosRecaudo: presRecaudo,
          liquidacion,
          snapshotTotales: totalesVentas,
          year,
          month,
          isSnapshot: true,
          isStale: false,
          snapshotDate: new Date().toISOString(),
        });
      } catch (err) {
        if (import.meta.env.DEV)
          console.error(
            "[useComisionesCalculo] Error generating monthly report:",
            err,
          );
        setReporteMensual(empty);
      } finally {
        generatingReporteRef.current = false;
      }
      setLoadingReporte(false);
    },
    [catalogo, exclusiones],
  );

  // Computed totals
  const totals = useMemo(() => {
    const init = {
      totalVentas: 0,
      ventasExcluidas: 0,
      ventasComisionables: 0,
      margenComisionable: 0,
      costoComisionable: 0,
    };
    const t = comisiones.reduce(
      (acc, v) => ({
        totalVentas: acc.totalVentas + Number(v.total_ventas || 0),
        ventasExcluidas: acc.ventasExcluidas + Number(v.ventas_excluidas || 0),
        ventasComisionables:
          acc.ventasComisionables + Number(v.ventas_comisionables || 0),
        margenComisionable:
          acc.margenComisionable + Number(v.margen_comisionable || 0),
        costoComisionable:
          acc.costoComisionable + Number(v.costo_comisionable || 0),
      }),
      init,
    );
    t.margenPct =
      t.ventasComisionables > 0
        ? (t.margenComisionable / t.ventasComisionables) * 100
        : 0;
    return t;
  }, [comisiones]);

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
