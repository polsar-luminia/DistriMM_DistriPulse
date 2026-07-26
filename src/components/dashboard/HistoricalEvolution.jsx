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

// Parse "$474.803.006" or "46.7%" or 474803006 into a number.
// Currency ($): dots are thousands separators. Non-currency: dot is decimal.
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

/** Eje Y de dinero: los millones completos no caben y no aportan. */
function compactCurrency(val) {
  const n = typeof val === "number" ? val : parseNumericValue(val);
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1).replace(".", ",")} MM`;
  if (Math.abs(n) >= 1e6) return `$${Math.round(n / 1e6)} M`;
  if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)} k`;
  return `$${n}`;
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun",
                      "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-06-30" -> "jun". Una carga por mes: el día no aporta al eje. */
function etiquetaMes(fechaCorte) {
  if (!fechaCorte) return "";
  const [, m] = String(fechaCorte).split("-");
  const idx = parseInt(m, 10) - 1;
  return MESES_CORTOS[idx] ?? String(fechaCorte);
}

/**
 * Tooltip con la unidad declarada por serie, no adivinada por el nombre.
 * (Antes "Mora Promedio" y "% Morosidad" caían en la misma rama por substring.)
 */
function HistTooltip({ active, payload, label, unidad = "moneda", total = false }) {
  if (!active || !payload || payload.length === 0) return null;
  const fmt = (v) =>
    unidad === "moneda" ? fullCurrency(v)
    : unidad === "pct"  ? `${v}%`
    : `${v} días`;
  const suma = payload.reduce((s, e) => s + (Number(e.value) || 0), 0);
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-bold text-slate-800 mb-1.5">{label}</p>
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-slate-500">{entry.name}</span>
            <span className="ml-auto font-bold text-slate-800 tabular-nums">
              {fmt(entry.value)}
            </span>
          </div>
        ))}
      </div>
      {total && payload.length > 1 && (
        <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-slate-100">
          <span className="text-slate-500">Total</span>
          <span className="ml-auto font-black text-slate-900 tabular-nums">{fmt(suma)}</span>
        </div>
      )}
    </div>
  );
}

/** Contenedor común de gráfica: título, subtítulo de unidad y lienzo. */
function ChartBox({ titulo, unidad, children, className = "" }) {
  return (
    <div className={cn("bg-white rounded-xl p-4 border border-slate-200", className)}>
      <div className="flex items-baseline justify-between mb-3">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          {titulo}
        </h4>
        <span className="text-[10px] font-medium text-slate-400">{unidad}</span>
      </div>
      {children}
    </div>
  );
}

// Ejes y grilla recesivos: la tinta la gastan los datos, no el andamiaje.
const EJE = { fontSize: 11, fill: "#94A3B8" };
const GRILLA = { stroke: "#E2E8F0", strokeDasharray: "3 3", vertical: false };
// #0891B2 (cian) en vez del lima original: contra el ámbar el lima daba
// ΔE 3.8 en deuteranopía (falla); el cian da 22.1 y pasa limpio.
const COLOR_DSO = "#0891B2";

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
    fecha: etiquetaMes(h.fecha_corte),
    fechaCompleta: h.fecha_corte,
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

      {/* Gráficas.
          Antes eran dos: una de barras y otra que metía en un mismo eje el
          % de morosidad (0-100) junto a mora promedio (~86 días) y DSO (~15).
          Eso aplastaba el DSO contra el suelo y hacía ilegible la comparación.
          Ahora son tres, y cada eje tiene UNA sola unidad. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cartera: apilada, porque al día + vencida ES el total. */}
        <ChartBox titulo="Evolución de Cartera" unidad="COP" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRILLA} />
              <XAxis dataKey="fecha" tick={EJE} tickLine={false} axisLine={false} />
              <YAxis
                tick={EJE}
                tickLine={false}
                axisLine={false}
                tickFormatter={compactCurrency}
                width={64}
              />
              <Tooltip
                content={<HistTooltip unidad="moneda" total />}
                cursor={{ fill: "#0F172A", fillOpacity: 0.04 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
              <Bar dataKey="Cartera Al Dia" stackId="c" fill={COLORS.CHART.PRIMARY} maxBarSize={44} />
              {/* El contorno blanco de 2px separa los dos segmentos apilados.
                  Contra el fondo blanco de la tarjeta solo se ve donde el rojo
                  toca al verde, que es justo donde hace falta: el par
                  verde/rojo queda en ΔE 6.5 para protanopía y necesita esa
                  codificación secundaria además de la leyenda. */}
              <Bar
                dataKey="Cartera Vencida"
                stackId="c"
                fill={COLORS.CHART.DANGER}
                maxBarSize={44}
                radius={[4, 4, 0, 0]}
                stroke="#FFFFFF"
                strokeWidth={2}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>

        {/* % Morosidad: serie única, sin leyenda — el título la nombra. */}
        <ChartBox titulo="% de Morosidad" unidad="% de la cartera">
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRILLA} />
              <XAxis dataKey="fecha" tick={EJE} tickLine={false} axisLine={false} />
              <YAxis
                tick={EJE}
                tickLine={false}
                axisLine={false}
                width={38}
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<HistTooltip unidad="pct" />} />
              <Line
                type="monotone"
                dataKey="% Morosidad"
                stroke={COLORS.CHART.DANGER}
                strokeWidth={2}
                dot={{ fill: COLORS.CHART.DANGER, r: 4, strokeWidth: 2, stroke: "#fff" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartBox>

        {/* Mora promedio y DSO comparten eje legítimamente: ambos son días. */}
        <ChartBox titulo="Mora Promedio y DSO" unidad="días">
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRILLA} />
              <XAxis dataKey="fecha" tick={EJE} tickLine={false} axisLine={false} />
              <YAxis
                tick={EJE}
                tickLine={false}
                axisLine={false}
                width={38}
                tickFormatter={(v) => `${v}d`}
              />
              <Tooltip content={<HistTooltip unidad="dias" />} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
              <Line
                type="monotone"
                dataKey="Mora Promedio"
                stroke={COLORS.CHART.WARNING}
                strokeWidth={2}
                dot={{ fill: COLORS.CHART.WARNING, r: 4, strokeWidth: 2, stroke: "#fff" }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="DSO"
                stroke={COLOR_DSO}
                strokeWidth={2}
                dot={{ fill: COLOR_DSO, r: 4, strokeWidth: 2, stroke: "#fff" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartBox>
      </div>
    </CollapsibleCard>
  );
}
