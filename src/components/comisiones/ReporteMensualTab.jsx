import React, { useState, useContext, useMemo, useCallback } from "react";
import {
  ChevronDown,
  ChevronUp,
  CalendarRange,
  Loader2,
  Filter,
  Download,
  FileText,
  FileDown,
  DollarSign,
  TrendingUp,
  Wallet,
  Tag,
  CheckCircle,
  XCircle,
  RefreshCw,
  Lock,
} from "lucide-react";
import { sileo } from "sileo";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatFullCurrency,
  formatPercentage,
} from "../../utils/formatters";
import { generarReportePDF } from "../../utils/reportePDF";
import { generarReporteExcelMensual } from "../../utils/reporteExcelMensual";
import { Card, KpiCard, EmptyState, MESES } from "./ComisionesShared";
import { DashboardContext } from "../DashboardManager";
import { getPeriodoOperativo } from "../../utils/periodoOperativo";
import ReporteVendedorDetail from "./ReporteVendedorDetail";

export default function ReporteMensualTab({ hook }) {
  const { reporteMensual, loadingReporte, generarReporteMensual } = hook;

  // Periodo operativo derivado de la última carga
  const dashCtx = useContext(DashboardContext);
  const periodo = getPeriodoOperativo(
    dashCtx?.availableLoads?.[0]?.fecha_corte,
  );

  const [selectedMonth, setSelectedMonth] = useState(periodo.month);
  const [selectedYear, setSelectedYear] = useState(periodo.year);
  const [expandedVendedor, setExpandedVendedor] = useState(null);
  const [filtroVendedorId, setFiltroVendedorId] = useState("todos");

  const years = useMemo(
    () => [periodo.year - 1, periodo.year, periodo.year + 1],
    [periodo.year],
  );

  const handleGenerar = () => {
    generarReporteMensual(selectedYear, selectedMonth);
    setExpandedVendedor(null);
    setFiltroVendedorId("todos");
  };

  const handleRecalcular = () => {
    generarReporteMensual(selectedYear, selectedMonth, { forceRecalc: true });
    setExpandedVendedor(null);
    setFiltroVendedorId("todos");
  };

  const isSnapshot = reporteMensual?.isSnapshot || false;
  const isStale = reporteMensual?.isStale || false;
  const snapshotDate = reporteMensual?.snapshotDate;
  const snapshotTotales = reporteMensual?.snapshotTotales;

  // Ventas ya vienen clasificadas (con .excluded y .reason) desde el hook
  const classifiedVentas = useMemo(
    () => reporteMensual?.ventas || [],
    [reporteMensual],
  );

  // Liquidación (resultados del cálculo de comisiones)
  const liquidacion = useMemo(
    () => reporteMensual?.liquidacion || [],
    [reporteMensual],
  );

  // Group ventas by vendedor
  const vendedorData = useMemo(() => {
    if (!classifiedVentas.length) return [];
    const map = {};
    classifiedVentas.forEach((v) => {
      const key = v.vendedor_codigo || "SIN_CODIGO";
      if (!map[key]) {
        map[key] = {
          vendedor_codigo: v.vendedor_codigo,
          vendedor_nombre: v.vendedor_nombre,
          ventas: [],
          totalVentas: 0,
          ventasExcluidas: 0,
          ventasComisionables: 0,
          costoComisionable: 0,
          margenComisionable: 0,
          diasUnicos: new Set(),
          facturasComisionables: new Set(),
        };
      }
      const g = map[key];
      g.ventas.push(v);
      const val = Number(v.valor_total || 0);
      const costo = Number(v.costo || 0);
      g.totalVentas += val;
      if (v.excluded) {
        g.ventasExcluidas += val;
      } else {
        g.ventasComisionables += val;
        g.costoComisionable += costo;
        g.margenComisionable += val - costo;
        if (v.factura) g.facturasComisionables.add(v.factura);
      }
      if (v.fecha) g.diasUnicos.add(v.fecha);
    });

    return Object.values(map)
      .map((g) => ({
        ...g,
        margenPct:
          g.ventasComisionables > 0
            ? (g.margenComisionable / g.ventasComisionables) * 100
            : 0,
        diasTrabajados: g.diasUnicos.size,
        numFacturas: g.facturasComisionables.size,
      }))
      .sort((a, b) => b.ventasComisionables - a.ventasComisionables);
  }, [classifiedVentas]);

  const filteredVendedorData = useMemo(() => {
    if (filtroVendedorId === "todos") return vendedorData;
    return vendedorData.filter((v) => v.vendedor_codigo === filtroVendedorId);
  }, [vendedorData, filtroVendedorId]);

  const filteredLiquidacion = useMemo(() => {
    if (filtroVendedorId === "todos") return liquidacion;
    return liquidacion.filter((l) => l.vendedor_codigo === filtroVendedorId);
  }, [liquidacion, filtroVendedorId]);

  const grandTotals = useMemo(() => {
    const t = {
      totalVentas: 0,
      ventasExcluidas: 0,
      ventasComisionables: 0,
      costoComisionable: 0,
      margenComisionable: 0,
    };
    vendedorData.forEach((v) => {
      t.totalVentas += v.totalVentas;
      t.ventasExcluidas += v.ventasExcluidas;
      t.ventasComisionables += v.ventasComisionables;
      t.costoComisionable += v.costoComisionable;
      t.margenComisionable += v.margenComisionable;
    });
    t.margenPct =
      t.ventasComisionables > 0
        ? (t.margenComisionable / t.ventasComisionables) * 100
        : 0;
    return t;
  }, [vendedorData]);

  const displayTotals = useMemo(() => {
    if (filtroVendedorId === "todos") return grandTotals;
    const t = {
      totalVentas: 0,
      ventasExcluidas: 0,
      ventasComisionables: 0,
      costoComisionable: 0,
      margenComisionable: 0,
    };
    filteredVendedorData.forEach((v) => {
      t.totalVentas += v.totalVentas;
      t.ventasExcluidas += v.ventasExcluidas;
      t.ventasComisionables += v.ventasComisionables;
      t.costoComisionable += v.costoComisionable;
      t.margenComisionable += v.margenComisionable;
    });
    t.margenPct =
      t.ventasComisionables > 0
        ? (t.margenComisionable / t.ventasComisionables) * 100
        : 0;
    return t;
  }, [filtroVendedorId, grandTotals, filteredVendedorData]);

  const comisionTotals = useMemo(() => {
    const t = {
      totalComisionVentas: 0,
      totalComisionRecaudo: 0,
      totalComision: 0,
    };
    filteredLiquidacion.forEach((l) => {
      t.totalComisionVentas += l.comisionVentas.totalComisionVentas;
      t.totalComisionRecaudo += l.comisionRecaudo.comisionRecaudo;
      t.totalComision += l.totalComision;
    });
    return t;
  }, [filteredLiquidacion]);

  const periodoLabel = `${MESES[selectedMonth - 1]} ${selectedYear}`;
  const cargas = useMemo(() => reporteMensual?.cargas || [], [reporteMensual]);
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const hasData = reporteMensual && classifiedVentas.length > 0;

  // Días únicos con datos de ventas (no cargas/uploads)
  const uniqueDays = useMemo(() => {
    const dateSet = new Set();
    classifiedVentas.forEach((v) => {
      if (v.fecha) dateSet.add(v.fecha);
    });
    return dateSet.size;
  }, [classifiedVentas]);

  // ── PDF Export ──
  const handleExportPDF = useCallback(async () => {
    if (!hasData) return;
    try {
      await generarReportePDF({
        vendedores: filteredVendedorData,
        periodo: { year: selectedYear, month: selectedMonth },
        cargas,
        filtroVendedor:
          filtroVendedorId !== "todos" && filteredVendedorData.length === 1
            ? filteredVendedorData[0]
            : null,
        totals: displayTotals,
        daysInMonth,
        liquidacion: filteredLiquidacion,
      });
      sileo.success("PDF exportado");
    } catch (err) {
      sileo.error("Error al generar PDF");
      if (import.meta.env.DEV)
        console.error("[ReporteMensualTab] Error generando PDF:", err);
    }
  }, [
    hasData,
    filteredVendedorData,
    selectedYear,
    selectedMonth,
    cargas,
    filtroVendedorId,
    displayTotals,
    daysInMonth,
    filteredLiquidacion,
  ]);

  // ── Excel Export ──
  const handleExport = useCallback(async () => {
    if (!hasData) return;
    await generarReporteExcelMensual({
      vendedorData,
      classifiedVentas,
      cargas,
      grandTotals,
      selectedMonth,
      selectedYear,
    });
    sileo.success("Reporte mensual exportado");
  }, [
    hasData,
    vendedorData,
    classifiedVentas,
    cargas,
    grandTotals,
    selectedMonth,
    selectedYear,
  ]);

  return (
    <div>
      {/* ── Header: selectors + buttons ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 border border-slate-200">
          <CalendarRange size={14} className="text-indigo-600 shrink-0" />
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer outline-none text-slate-700"
          >
            {MESES.map((m, i) => (
              <option key={i} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 border border-slate-200">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer outline-none text-slate-700"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 border border-slate-200">
          <Filter size={14} className="text-indigo-600 shrink-0" />
          <select
            value={filtroVendedorId}
            onChange={(e) => {
              setFiltroVendedorId(e.target.value);
              setExpandedVendedor(null);
            }}
            disabled={!hasData}
            className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer outline-none text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed min-w-[160px]"
          >
            <option value="todos">Todos los vendedores</option>
            {vendedorData.map((v) => (
              <option key={v.vendedor_codigo} value={v.vendedor_codigo}>
                {v.vendedor_nombre || "Sin nombre"} (#{v.vendedor_codigo})
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleGenerar}
          disabled={loadingReporte}
          className="px-4 py-2 bg-indigo-600 rounded-lg text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
        >
          {loadingReporte ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <FileText size={14} />
          )}
          Generar Reporte
        </button>

        {hasData && isSnapshot && (
          <button
            onClick={handleRecalcular}
            disabled={loadingReporte}
            className="px-3 py-2 bg-amber-500 rounded-lg text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
            title="Recalcular con catálogo y exclusiones actuales. Reemplaza el snapshot guardado."
          >
            <RefreshCw size={14} /> Recalcular
          </button>
        )}

        <div className="flex-1" />

        {hasData && isSnapshot && (
          <span
            className={cn(
              "flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border",
              isStale
                ? "text-amber-700 bg-amber-50 border-amber-200"
                : "text-emerald-700 bg-emerald-50 border-emerald-200",
            )}
          >
            {isStale ? <RefreshCw size={10} /> : <Lock size={10} />}
            {isStale
              ? "Snapshot desactualizado"
              : `Guardado ${snapshotDate ? new Date(snapshotDate).toLocaleDateString("es-CO") : ""}`}
          </span>
        )}

        {hasData && (
          <>
            <button
              onClick={handleExportPDF}
              className="px-3 py-2 bg-emerald-600 rounded-lg text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-1.5"
            >
              <FileDown size={14} /> PDF
            </button>
            <button
              onClick={handleExport}
              className="px-3 py-2 bg-slate-700 rounded-lg text-xs font-bold text-white hover:bg-slate-800 transition-colors shadow-sm flex items-center gap-1.5"
            >
              <Download size={14} /> Excel
            </button>
          </>
        )}
      </div>

      {/* Loading */}
      {loadingReporte && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="text-indigo-600 animate-spin" />
          <span className="ml-3 text-sm text-slate-500">
            Generando reporte de {periodoLabel}...
          </span>
        </div>
      )}

      {/* No data */}
      {!loadingReporte && reporteMensual && !hasData && (
        <EmptyState
          icon={CalendarRange}
          title="Sin datos para este periodo"
          subtitle={`No se encontraron cargas de ventas en ${periodoLabel}. Sube archivos de ventas diarias primero.`}
        />
      )}

      {/* Initial state */}
      {!loadingReporte && !reporteMensual && (
        <EmptyState
          icon={CalendarRange}
          title="Reporte Mensual"
          subtitle="Selecciona un mes y haz clic en Generar Reporte para consolidar ventas y calcular comisiones."
        />
      )}

      {/* Alerta de snapshot desactualizado */}
      {!loadingReporte && hasData && isSnapshot && isStale && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3 text-sm text-amber-800">
          <RefreshCw size={16} className="shrink-0 text-amber-600" />
          <span>
            Los datos del periodo cambiaron desde la ultima liquidacion. Haz
            clic en <strong>Recalcular</strong> para actualizar el snapshot.
          </span>
        </div>
      )}

      {/* ══════════ REPORT CONTENT ══════════ */}
      {!loadingReporte && hasData && (
        <>
          {/* ── KPI Cards (ventas) — usa totales del snapshot cuando existe ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <KpiCard
              title="Periodo"
              value={periodoLabel}
              icon={CalendarRange}
              type="info"
            />
            <KpiCard
              title="Dias con Datos"
              value={`${uniqueDays}/${daysInMonth}`}
              icon={CalendarRange}
              type="neutral"
            />
            <KpiCard
              title="Total Ventas"
              value={formatCurrency(
                isSnapshot &&
                  snapshotTotales?.totalVentas != null &&
                  filtroVendedorId === "todos"
                  ? snapshotTotales.totalVentas
                  : displayTotals.totalVentas,
              )}
              icon={TrendingUp}
              type="neutral"
            />
            <KpiCard
              title="Comisionable"
              value={formatCurrency(
                isSnapshot &&
                  snapshotTotales?.ventasComisionables != null &&
                  filtroVendedorId === "todos"
                  ? snapshotTotales.ventasComisionables
                  : displayTotals.ventasComisionables,
              )}
              icon={CheckCircle}
              type="success"
            />
            <KpiCard
              title="Excluido"
              value={formatCurrency(
                isSnapshot &&
                  snapshotTotales?.ventasExcluidas != null &&
                  filtroVendedorId === "todos"
                  ? snapshotTotales.ventasExcluidas
                  : displayTotals.ventasExcluidas,
              )}
              icon={XCircle}
              type="danger"
            />
            <KpiCard
              title="Margen %"
              value={formatPercentage(displayTotals.margenPct)}
              icon={TrendingUp}
              type="warning"
            />
          </div>

          {/* ══════════ LIQUIDACIÓN DE COMISIONES ══════════ */}
          {filteredLiquidacion.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-amber-50 rounded-lg">
                  <DollarSign size={18} className="text-amber-600" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                    Liquidación de Comisiones
                  </h2>
                  <p className="text-xs text-slate-500">{periodoLabel}</p>
                </div>
              </div>

              {/* KPI comisiones */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <KpiCard
                  title="Comisión Ventas (Marca)"
                  value={formatFullCurrency(comisionTotals.totalComisionVentas)}
                  icon={Tag}
                  type="info"
                />
                <KpiCard
                  title="Comisión Recaudo"
                  value={formatFullCurrency(
                    comisionTotals.totalComisionRecaudo,
                  )}
                  icon={Wallet}
                  type="success"
                />
                <KpiCard
                  title="TOTAL COMISIONES"
                  value={formatFullCurrency(comisionTotals.totalComision)}
                  icon={DollarSign}
                  type="warning"
                />
              </div>

              {/* Tabla de liquidación por vendedor */}
              <Card className="overflow-hidden !p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Vendedor</th>
                        <th className="px-4 py-3 text-right">Com. Ventas</th>
                        <th className="px-4 py-3 text-right">Com. Recaudo</th>
                        <th className="px-4 py-3 text-right font-black">
                          Total
                        </th>
                        <th className="px-4 py-3 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredLiquidacion.map((liq) => {
                        const isExpanded =
                          expandedVendedor === `liq-${liq.vendedor_codigo}`;
                        return (
                          <React.Fragment key={liq.vendedor_codigo}>
                            <tr
                              className="hover:bg-slate-50 cursor-pointer transition-colors"
                              onClick={() =>
                                setExpandedVendedor(
                                  isExpanded
                                    ? null
                                    : `liq-${liq.vendedor_codigo}`,
                                )
                              }
                            >
                              <td className="px-4 py-3">
                                <span className="font-bold text-slate-900">
                                  {liq.vendedor_nombre || "Sin nombre"}
                                </span>
                                <span className="text-xs text-slate-400 ml-2">
                                  #{liq.vendedor_codigo}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-indigo-700 font-bold">
                                {formatFullCurrency(
                                  liq.comisionVentas.totalComisionVentas,
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-emerald-700 font-bold">
                                {formatFullCurrency(
                                  liq.comisionRecaudo.comisionRecaudo,
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-amber-700 font-black text-base">
                                {formatFullCurrency(liq.totalComision)}
                              </td>
                              <td className="px-4 py-3">
                                {isExpanded ? (
                                  <ChevronUp
                                    size={16}
                                    className="text-slate-400"
                                  />
                                ) : (
                                  <ChevronDown
                                    size={16}
                                    className="text-slate-400"
                                  />
                                )}
                              </td>
                            </tr>

                            {/* ── Detalle expandido ── */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={5} className="p-0 bg-slate-50">
                                  <div className="p-4 space-y-4">
                                    {/* Detalle Comisión por Marca */}
                                    <div>
                                      <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                        <Tag size={12} /> Comisión por Marca
                                        (Ventas)
                                      </h4>
                                      {liq.comisionVentas.detalleMarcas
                                        .length === 0 ? (
                                        <p className="text-xs text-slate-400">
                                          Sin ventas en este periodo
                                        </p>
                                      ) : (
                                        <div className="overflow-x-auto">
                                          <table className="w-full text-xs">
                                            <thead className="text-slate-400 uppercase font-bold">
                                              <tr>
                                                <th className="px-3 py-1.5 text-left">
                                                  Marca
                                                </th>
                                                <th className="px-3 py-1.5 text-right">
                                                  Costo Vendido
                                                </th>
                                                <th className="px-3 py-1.5 text-right">
                                                  Meta
                                                </th>
                                                <th className="px-3 py-1.5 text-center">
                                                  Cumple
                                                </th>
                                                <th className="px-3 py-1.5 text-right">
                                                  %
                                                </th>
                                                <th className="px-3 py-1.5 text-right">
                                                  Bono
                                                </th>
                                                <th className="px-3 py-1.5 text-right font-bold">
                                                  Comisión
                                                </th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200">
                                              {liq.comisionVentas.detalleMarcas.map(
                                                (dm) => (
                                                  <tr
                                                    key={dm.marca}
                                                    className={
                                                      !dm.tienePresupuesto
                                                        ? "text-slate-400"
                                                        : "hover:bg-white"
                                                    }
                                                  >
                                                    <td className="px-3 py-1.5 font-medium">
                                                      {dm.marca}
                                                      {!dm.tienePresupuesto && (
                                                        <span className="ml-1 text-[9px] bg-slate-200 text-slate-500 px-1 py-0.5 rounded">
                                                          Sin config
                                                        </span>
                                                      )}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-right font-mono">
                                                      {formatFullCurrency(
                                                        dm.totalCosto,
                                                      )}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-right font-mono">
                                                      {dm.metaVentas > 0 ? (
                                                        formatFullCurrency(
                                                          dm.metaVentas,
                                                        )
                                                      ) : (
                                                        <span className="text-slate-400">
                                                          —
                                                        </span>
                                                      )}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-center">
                                                      {dm.tienePresupuesto && (
                                                        <span
                                                          className={cn(
                                                            "text-[10px] font-bold px-2 py-0.5 rounded-full",
                                                            dm.cumpleMeta
                                                              ? "bg-emerald-100 text-emerald-700"
                                                              : "bg-rose-100 text-rose-700",
                                                          )}
                                                        >
                                                          {dm.cumpleMeta
                                                            ? "Sí"
                                                            : "No"}
                                                        </span>
                                                      )}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-right font-mono">
                                                      {dm.pctComision > 0
                                                        ? `${(dm.pctComision * 100).toFixed(1)}%`
                                                        : "—"}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-right font-mono">
                                                      {dm.bonoFijo > 0
                                                        ? formatFullCurrency(
                                                            dm.bonoFijo,
                                                          )
                                                        : "—"}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-right font-mono font-bold text-indigo-700">
                                                      {dm.comision > 0
                                                        ? formatFullCurrency(
                                                            dm.comision,
                                                          )
                                                        : "—"}
                                                    </td>
                                                  </tr>
                                                ),
                                              )}
                                              <tr className="bg-indigo-50/50 font-bold border-t-2 border-indigo-200">
                                                <td
                                                  colSpan={6}
                                                  className="px-3 py-2 text-right text-indigo-700 uppercase text-[10px] tracking-wide"
                                                >
                                                  Subtotal Ventas
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono text-indigo-700">
                                                  {formatFullCurrency(
                                                    liq.comisionVentas
                                                      .totalComisionVentas,
                                                  )}
                                                </td>
                                              </tr>
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </div>

                                    {/* Detalle Comisión por Recaudo */}
                                    <div>
                                      <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                        <Wallet size={12} /> Comisión por
                                        Recaudo (Cobranza)
                                      </h4>
                                      {liq.comisionRecaudo.metaRecaudo === 0 ? (
                                        <p className="text-xs text-slate-400">
                                          Sin presupuesto de recaudo configurado
                                          para este vendedor
                                        </p>
                                      ) : (
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                          <div className="bg-white rounded-lg border border-slate-200 p-3">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase">
                                              Meta Recaudo
                                            </p>
                                            <p className="text-sm font-black text-slate-900 tabular-nums">
                                              {formatFullCurrency(
                                                liq.comisionRecaudo.metaRecaudo,
                                              )}
                                            </p>
                                          </div>
                                          <div className="bg-white rounded-lg border border-slate-200 p-3">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase">
                                              Recaudo Comisionable
                                            </p>
                                            <p className="text-sm font-black text-emerald-700 tabular-nums">
                                              {formatFullCurrency(
                                                liq.comisionRecaudo
                                                  .totalComisionable,
                                              )}
                                            </p>
                                          </div>
                                          <div className="bg-white rounded-lg border border-slate-200 p-3">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase">
                                              % Cumplimiento
                                            </p>
                                            <p className="text-sm font-black text-slate-900 tabular-nums">
                                              {formatPercentage(
                                                liq.comisionRecaudo
                                                  .pctCumplimiento,
                                              )}
                                            </p>
                                            {liq.comisionRecaudo
                                              .tramoAplicado && (
                                              <span className="text-[9px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded-full">
                                                {
                                                  liq.comisionRecaudo
                                                    .tramoAplicado
                                                }{" "}
                                                (
                                                {(
                                                  liq.comisionRecaudo
                                                    .pctComision * 100
                                                ).toFixed(2)}
                                                %)
                                              </span>
                                            )}
                                          </div>
                                          <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3">
                                            <p className="text-[10px] text-emerald-600 font-bold uppercase">
                                              Comisión Recaudo
                                            </p>
                                            <p className="text-sm font-black text-emerald-700 tabular-nums">
                                              {formatFullCurrency(
                                                liq.comisionRecaudo
                                                  .comisionRecaudo,
                                              )}
                                            </p>
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    {/* Total del vendedor */}
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex justify-between items-center">
                                      <span className="text-sm font-bold text-amber-800 uppercase">
                                        Total Comisión{" "}
                                        {liq.vendedor_nombre ||
                                          liq.vendedor_codigo}
                                      </span>
                                      <span className="text-lg font-black text-amber-700 tabular-nums">
                                        {formatFullCurrency(liq.totalComision)}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}

                      {/* Totals row */}
                      <tr className="bg-slate-50 border-t-2 border-slate-300 font-bold">
                        <td className="px-4 py-3 text-slate-900">TOTALES</td>
                        <td className="px-4 py-3 text-right font-mono text-indigo-700">
                          {formatFullCurrency(
                            comisionTotals.totalComisionVentas,
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-700">
                          {formatFullCurrency(
                            comisionTotals.totalComisionRecaudo,
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-amber-700 text-base">
                          {formatFullCurrency(comisionTotals.totalComision)}
                        </td>
                        <td className="px-4 py-3"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* ══════════ DETALLE DE VENTAS POR VENDEDOR ══════════ */}
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-indigo-50 rounded-lg">
              <TrendingUp size={18} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                Detalle de Ventas
              </h2>
              <p className="text-xs text-slate-500">
                Desglose por vendedor con facturas comisionables y excluidas
              </p>
            </div>
          </div>

          <Card className="overflow-hidden !p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Vendedor</th>
                    <th className="px-4 py-3 text-center">Dias</th>
                    <th className="px-4 py-3 text-right">Total Ventas</th>
                    <th className="px-4 py-3 text-right">Excluidas</th>
                    <th className="px-4 py-3 text-right">Comisionables</th>
                    <th className="px-4 py-3 text-right">Costo</th>
                    <th className="px-4 py-3 text-right">Margen %</th>
                    <th className="px-4 py-3 text-center">Facturas</th>
                    <th className="px-4 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVendedorData.map((v) => {
                    const isExp =
                      expandedVendedor === `det-${v.vendedor_codigo}`;
                    return (
                      <React.Fragment key={v.vendedor_codigo}>
                        <tr
                          className="hover:bg-slate-50 cursor-pointer transition-colors"
                          onClick={() =>
                            setExpandedVendedor(
                              isExp ? null : `det-${v.vendedor_codigo}`,
                            )
                          }
                        >
                          <td className="px-4 py-3">
                            <span className="font-bold text-slate-900">
                              {v.vendedor_nombre || "Sin nombre"}
                            </span>
                            <span className="text-xs text-slate-400 ml-2">
                              #{v.vendedor_codigo}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-xs font-bold text-slate-600">
                            {v.diasTrabajados}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-slate-700">
                            {formatFullCurrency(v.totalVentas)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-rose-500">
                            {formatFullCurrency(v.ventasExcluidas)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                            {formatFullCurrency(v.ventasComisionables)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-slate-700">
                            {formatFullCurrency(v.costoComisionable)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-xs font-bold tabular-nums">
                              {formatPercentage(v.margenPct)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-xs font-bold text-slate-600">
                            {v.numFacturas}
                          </td>
                          <td className="px-4 py-3">
                            {isExp ? (
                              <ChevronUp size={16} className="text-slate-400" />
                            ) : (
                              <ChevronDown
                                size={16}
                                className="text-slate-400"
                              />
                            )}
                          </td>
                        </tr>
                        {isExp && (
                          <tr>
                            <td colSpan={9} className="p-0">
                              <ReporteVendedorDetail vendedor={v} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Totals row */}
                  <tr className="bg-slate-50 border-t-2 border-slate-300 font-bold">
                    <td className="px-4 py-3 text-slate-900">TOTALES</td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 text-right font-mono text-slate-900">
                      {formatFullCurrency(displayTotals.totalVentas)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-rose-600">
                      {formatFullCurrency(displayTotals.ventasExcluidas)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-700">
                      {formatFullCurrency(displayTotals.ventasComisionables)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-900">
                      {formatFullCurrency(displayTotals.costoComisionable)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-bold">
                      {formatPercentage(displayTotals.margenPct)}
                    </td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
