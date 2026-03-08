/**
 * @fileoverview Historical Evolution Component
 * Shared between Dashboard and CFO Analysis pages.
 * Shows KPI comparison across cargas, charts, and aging tables.
 * @module components/dashboard/HistoricalEvolution
 */

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  Calendar,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  History,
} from "lucide-react";
import { Card } from "./DashboardShared";
import { getHistoricoCartera } from "../../services/cfoService";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { COLORS } from "../../utils/constants";
import { formatFullCurrency } from "../../utils/formatters";

// ============================================================================
// HELPERS
// ============================================================================

/** Parse "$474.803.006" or "46.7%" or 474803006 into a number.
 *  Currency ($): dots are thousands separators. Non-currency: dot is decimal. */
function parseNumericValue(val) {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  const str = String(val);
  let cleaned = str.replace(/[$%\s]/g, "");
  if (str.includes("$") || cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function fullCurrency(val) {
  const n = typeof val === "number" ? val : parseNumericValue(val);
  return formatFullCurrency(n);
}

/** Custom tooltip for Recharts */
function HistTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-bold text-slate-800 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-500">{entry.name}:</span>
          <span className="font-bold text-slate-800">
            {entry.name.includes("%") || entry.name.includes("Mora") || entry.name.includes("DSO")
              ? `${entry.value}`
              : fullCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Delta badge: shows +/- change between two values */
function DeltaBadge({ current, previous, suffix = "", inverse = false, format = "number" }) {
  if (previous == null || current == null) return null;
  const diff = current - previous;
  if (diff === 0) return null;
  const isPositive = diff > 0;
  const isGood = inverse ? !isPositive : isPositive;
  const arrow = isPositive ? "\u2191" : "\u2193";
  let displayDiff;
  if (format === "currency") {
    displayDiff = fullCurrency(Math.abs(diff));
  } else if (format === "pct") {
    displayDiff = `${Math.abs(diff).toFixed(1)}%`;
  } else {
    displayDiff = Math.abs(diff).toLocaleString("es-CO");
  }
  return (
    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
      isGood ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
    )}>
      {arrow} {displayDiff}{suffix}
    </span>
  );
}

// ============================================================================
// COLLAPSIBLE WRAPPER
// ============================================================================

function CollapsibleCard({ title, icon: Icon, children, defaultOpen = true }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-1"
      >
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-50 rounded-lg">
            <Icon size={16} className="text-indigo-600" />
          </div>
          <h3 className="font-bold text-sm text-slate-800">{title}</h3>
        </div>
        {isOpen ? (
          <ChevronUp size={16} className="text-slate-400" />
        ) : (
          <ChevronDown size={16} className="text-slate-400" />
        )}
      </button>
      {isOpen && <div className="mt-3 pt-3 border-t border-slate-100">{children}</div>}
    </Card>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * HistoricalEvolution - standalone component that fetches & displays
 * historical KPI comparison between cargas.
 *
 * Can be used self-contained (it fetches its own data) or you can pass
 * `historico` prop to provide pre-fetched data.
 */
export default function HistoricalEvolution({ historico: externalHistorico }) {
  const hasExternal = !!(externalHistorico && externalHistorico.length > 0);
  const [fetchedHistorico, setFetchedHistorico] = useState([]);
  const [fetchLoading, setFetchLoading] = useState(!hasExternal);

  const historico = hasExternal ? externalHistorico : fetchedHistorico;
  const loading = hasExternal ? false : fetchLoading;

  useEffect(() => {
    if (hasExternal) return;
    // Fetch autonomously
    let cancelled = false;
    (async () => {
      setFetchLoading(true);
      const { data } = await getHistoricoCartera();
      if (!cancelled) {
        setFetchedHistorico(data || []);
        setFetchLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalHistorico]);

  if (loading) {
    return (
      <Card className="py-8 flex items-center justify-center gap-3 text-slate-400">
        <History size={18} className="animate-spin" />
        <span className="text-sm font-medium">Cargando datos historicos...</span>
      </Card>
    );
  }

  if (!historico || historico.length < 2) {
    return (
      <Card className="py-10 flex flex-col items-center justify-center text-center gap-3">
        <div className="p-3 bg-indigo-50 rounded-full">
          <History size={24} className="text-indigo-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-700">
            Datos historicos insuficientes
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            Se necesitan al menos 2 cargas de cartera para mostrar la evolucion historica. Actualmente hay {historico?.length ?? 0}.
          </p>
        </div>
      </Card>
    );
  }

  const latest = historico[historico.length - 1];
  const previous = historico[historico.length - 2];

  // Prepare chart data with readable date labels
  const chartData = historico.map((h) => ({
    fecha: h.fecha_corte,
    "Cartera Total": h.cartera_total,
    "Cartera Vencida": h.cartera_vencida,
    "Cartera Al Dia": h.cartera_al_dia,
    "% Morosidad": h.pct_vencida,
    "Mora Promedio": h.mora_promedio,
    "DSO": h.dso_estimado,
    facturas: h.facturas_total,
    clientes: h.clientes_activos,
  }));

  // KPI comparison cards
  const comparisons = [
    { label: "Cartera Total", key: "cartera_total", format: "currency" },
    { label: "Cartera Vencida", key: "cartera_vencida", format: "currency", inverse: true },
    { label: "% Morosidad", key: "pct_vencida", format: "pct", inverse: true, suffix: "%" },
    { label: "Mora Promedio", key: "mora_promedio", format: "number", inverse: true, suffix: "d" },
    { label: "DSO Estimado", key: "dso_estimado", format: "number", inverse: true, suffix: "d" },
    { label: "Facturas", key: "facturas_total", format: "number" },
    { label: "Clientes", key: "clientes_activos", format: "number" },
    { label: "Riesgo Alto", key: "riesgo_alto", format: "currency", inverse: true },
  ];

  return (
    <CollapsibleCard title="Evolucion Historica" icon={TrendingUp} defaultOpen={true}>
      {/* Period comparison header */}
      <div className="flex items-center gap-2 mb-4 text-xs">
        <span className="px-2 py-1 bg-slate-100 rounded-lg font-bold text-slate-600">
          <Calendar size={12} className="inline mr-1" />
          {previous.fecha_corte}
        </span>
        <ArrowRight size={14} className="text-slate-400" />
        <span className="px-2 py-1 bg-indigo-100 rounded-lg font-bold text-indigo-700">
          <Calendar size={12} className="inline mr-1" />
          {latest.fecha_corte}
        </span>
      </div>

      {/* KPI Comparison Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        {comparisons.map((comp) => {
          const cur = latest[comp.key];
          const prev = previous[comp.key];
          const displayVal = comp.format === "currency"
            ? fullCurrency(cur)
            : comp.format === "pct"
              ? `${cur}%`
              : `${cur}${comp.suffix || ""}`;
          return (
            <div key={comp.key} className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                {comp.label}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-black text-slate-900">{displayVal}</span>
                <DeltaBadge
                  current={cur}
                  previous={prev}
                  suffix={comp.suffix}
                  inverse={comp.inverse}
                  format={comp.format}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Antes: {comp.format === "currency" ? fullCurrency(prev) : `${prev}${comp.suffix || ""}`}
              </p>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cartera Evolution Chart */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
          <h4 className="text-xs font-bold text-slate-600 mb-3 uppercase tracking-wider">
            Evolucion de Cartera
          </h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: "#94A3B8" }} />
              <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickFormatter={fullCurrency} width={100} />
              <Tooltip content={<HistTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Cartera Al Dia" fill={COLORS.CHART.PRIMARY} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Cartera Vencida" fill={COLORS.CHART.DANGER} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Morosidad Trend Chart */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
          <h4 className="text-xs font-bold text-slate-600 mb-3 uppercase tracking-wider">
            Indicadores de Mora
          </h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: "#94A3B8" }} />
              <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} width={35} />
              <Tooltip content={<HistTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="% Morosidad" stroke={COLORS.CHART.DANGER} strokeWidth={2.5} dot={{ fill: COLORS.CHART.DANGER, r: 5 }} />
              <Line type="monotone" dataKey="Mora Promedio" stroke={COLORS.CHART.WARNING} strokeWidth={2.5} dot={{ fill: COLORS.CHART.WARNING, r: 5 }} />
              <Line type="monotone" dataKey="DSO" stroke={COLORS.CHART.SECONDARY} strokeWidth={2.5} dot={{ fill: COLORS.CHART.SECONDARY, r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

    </CollapsibleCard>
  );
}
