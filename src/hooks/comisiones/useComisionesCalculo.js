import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { calcularComisionesCompletas } from "../../utils/comisionesCalculator";
import {
  getComisionesVentas,
  getCargasByMonth,
  getVentasByCargas,
  getRecaudosByCarga,
  getRecaudoCargas,
  getPresupuestosMarca,
  getPresupuestosRecaudo,
  getSnapshot,
  saveSnapshot,
  buildInputHash,
} from "../../services/comisionesService";
import { buildExclusionLookups, getExclusionInfo } from "./utils";
import { logAudit } from "../../services/auditService";
import { buildReporteMensualState } from "./reportingUtils";

export function useComisionesCalculo(selectedCargaId, catalogo, exclusiones) {
  const [ventasDetail, setVentasDetail] = useState([]);
  const [loadingVentas, setLoadingVentas] = useState(false);
  const [reporteMensual, setReporteMensual] = useState(null);
  const [loadingReporte, setLoadingReporte] = useState(false);
  const generatingReporteRef = useRef(false);

  // When selectedCargaId changes, fetch ventas detail
  useEffect(() => {
    if (!selectedCargaId) {
      setVentasDetail([]);
      return;
    }
    let cancelled = false;
    setLoadingVentas(true);
    getComisionesVentas(selectedCargaId)
      .then((ventasRes) => {
        if (cancelled) return;
        setVentasDetail(ventasRes.data || []);
      })
      .catch((err) => {
        if (cancelled) return;
        if (import.meta.env.DEV)
          console.error(
            `[useComisionesCalculo] Error loading ventas for carga ${selectedCargaId}:`,
            err,
          );
        setVentasDetail([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingVentas(false);
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
          generatingReporteRef.current = false;
          return;
        }

        // Usar solo la última carga del mes (la más reciente reemplaza las anteriores)
        const ultimaCarga = cargasMes[cargasMes.length - 1];
        const ids = [ultimaCarga.id];
        // Buscar última carga de recaudo del periodo
        const { data: recaudoCargas } = await getRecaudoCargas();
        const recaudoCargasMes = (recaudoCargas || []).filter((c) => {
          const d = new Date(c.fecha_periodo + "T12:00:00");
          return d.getFullYear() === year && d.getMonth() + 1 === month;
        });
        const ultimaCargaRecaudo =
          recaudoCargasMes.length > 0
            ? recaudoCargasMes[0] // getRecaudoCargas ordena DESC por created_at
            : null;

        const [ventasRes, recaudosRes, presMarcaRes, presRecaudoRes] =
          await Promise.all([
            getVentasByCargas(ids),
            ultimaCargaRecaudo
              ? getRecaudosByCarga(ultimaCargaRecaudo.id)
              : Promise.resolve({ data: [] }),
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
          catalogo,
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

            setReporteMensual(
              buildReporteMensualState({
                cargas: cargasMes,
                ventas: classifiedVentas,
                recaudos: recaudosMes,
                presupuestosMarca: presMarca,
                presupuestosRecaudo: presRecaudo,
                liquidacion: snap.liquidacion,
                snapshotTotales: snap.totales_ventas,
                year,
                month,
                isSnapshot: true,
                isStale,
                snapshotDate: snap.updated_at,
              }),
            );
            setLoadingReporte(false);
            generatingReporteRef.current = false;
            return;
          }
        }

        // 2. No snapshot o recalc forzado — calcular en vivo
        const productBrandMap = {};
        (catalogo || []).forEach((p) => {
          if (p.marca)
            productBrandMap[String(p.codigo).trim().toUpperCase()] = p.marca;
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
          catalogo,
        });

        if (snapErr && import.meta.env.DEV) {
          console.warn(
            "[useComisionesCalculo] No se pudo guardar snapshot:",
            snapErr,
          );
        }

        logAudit(
          forceRecalc ? "RECALCULAR_LIQUIDACION" : "GENERAR_LIQUIDACION",
          "distrimm_comisiones_snapshots",
          `${year}-${String(month).padStart(2, "0")}`,
          {
            periodo: `${year}-${String(month).padStart(2, "0")}`,
            vendedores: liquidacion.length,
            total_comision: resumen.totalComision,
            total_comision_ventas: resumen.totalComisionVentas,
            total_comision_recaudo: resumen.totalComisionRecaudo,
            cargas: ids.length,
            ventas: ventasMes.length,
            recaudos: recaudosMes.length,
          },
        );

        setReporteMensual(
          buildReporteMensualState({
            cargas: cargasMes,
            ventas: classifiedVentas,
            recaudos: recaudosMes,
            presupuestosMarca: presMarca,
            presupuestosRecaudo: presRecaudo,
            liquidacion,
            snapshotTotales: totalesVentas,
            year,
            month,
            isSnapshot: !snapErr,
            isStale: false,
            snapshotDate: !snapErr ? new Date().toISOString() : null,
          }),
        );
      } catch (err) {
        if (import.meta.env.DEV)
          console.error(
            "[useComisionesCalculo] Error generating monthly report:",
            err,
          );
        setReporteMensual(empty);
      } finally {
        generatingReporteRef.current = false;
        setLoadingReporte(false);
      }
    },
    [catalogo, exclusiones],
  );

  // Compute comisiones (resumen por vendedor) from ventasDetail + exclusiones (replaces RPC)
  const comisiones = useMemo(() => {
    if (!ventasDetail.length) return [];
    const lookups = buildExclusionLookups(exclusiones, catalogo);
    const map = {};
    ventasDetail.forEach((v) => {
      const cod = v.vendedor_codigo || "SIN";
      if (!map[cod]) {
        map[cod] = {
          vendedor_codigo: cod,
          vendedor_nombre: v.vendedor_nombre || "",
          total_ventas: 0,
          total_costo: 0,
          ventas_excluidas: 0,
          ventas_comisionables: 0,
          costo_comisionable: 0,
          margen_comisionable: 0,
          items_total: 0,
          items_excluidos: 0,
          items_comisionables: 0,
          ventas_ve: 0,
          ventas_dv: 0,
          items_dv: 0,
        };
      }
      const m = map[cod];
      const vt = Number(v.valor_total || 0);
      const co = Number(v.costo || 0);
      const info = getExclusionInfo(
        v.producto_codigo,
        lookups.productExclusionSet,
        lookups.brandExclusionSet,
        lookups.productBrandMap,
      );
      m.total_ventas += vt;
      m.total_costo += co;
      m.items_total += 1;
      if (v.tipo === "DV") {
        m.ventas_dv += Math.abs(vt);
        m.items_dv += 1;
      } else {
        m.ventas_ve += vt;
      }
      if (info.excluded) {
        m.ventas_excluidas += vt;
        m.items_excluidos += 1;
      } else {
        m.ventas_comisionables += vt;
        m.costo_comisionable += co;
        m.margen_comisionable += vt - co;
        m.items_comisionables += 1;
      }
    });
    return Object.values(map).sort(
      (a, b) => b.ventas_comisionables - a.ventas_comisionables,
    );
  }, [ventasDetail, exclusiones, catalogo]);

  // Computed totals (from JS-calculated comisiones)
  const totals = useMemo(() => {
    const t = {
      totalVentas: 0,
      totalCosto: 0,
      ventasExcluidas: 0,
      ventasComisionables: 0,
      margenComisionable: 0,
      costoComisionable: 0,
    };
    comisiones.forEach((v) => {
      t.totalVentas += v.total_ventas;
      t.totalCosto += v.total_costo;
      t.ventasExcluidas += v.ventas_excluidas;
      t.ventasComisionables += v.ventas_comisionables;
      t.margenComisionable += v.margen_comisionable;
      t.costoComisionable += v.costo_comisionable;
    });
    t.margenPct =
      t.ventasComisionables > 0
        ? (t.margenComisionable / t.ventasComisionables) * 100
        : 0;
    return t;
  }, [comisiones]);

  return {
    comisiones,
    loadingComisiones: loadingVentas,
    totals,
    ventasDetail,
    loadingVentas,
    reporteMensual,
    loadingReporte,
    generarReporteMensual,
  };
}
