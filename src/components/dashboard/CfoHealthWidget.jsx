import React, { useState, useEffect } from "react";
import { Card } from "./DashboardShared";
import { getCfoAnalyses } from "../../services/cfoService";
import {
  getSemaphore,
  normalizeInsights,
  displayCurrency,
  displayPct,
  parseNumericValue,
  flattenPlanAccion,
} from "../cfo/cfoUtils";
import {
  Activity,
  TrendingDown,
  Clock,
  AlertTriangle,
  ChevronRight,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * Expanded CFO health widget for the dashboard.
 * Shows score, KPIs, insights, and top action items.
 * Self-contained: fetches latest analysis via cfoService.
 * @returns {JSX.Element}
 */
export default function CfoHealthWidget() {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function fetchLatest() {
      try {
        setLoading(true);
        setError(null);
        const { data, error: fetchErr } = await getCfoAnalyses();
        if (cancelled) return;
        if (fetchErr) throw fetchErr;
        if (data && data.length > 0) {
          setAnalysis(data[0].analysis);
        }
      } catch (err) {
        if (cancelled) return;
        if (import.meta.env.DEV) console.error("[CfoHealthWidget] Error fetching analysis:", err);
        setError(err.message || "Error cargando análisis");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchLatest();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <section className="animate-fade-up">
        <Card className="animate-pulse">
          <div className="h-3 w-24 bg-navy-100 rounded mb-3" />
          <div className="h-8 w-16 bg-navy-100 rounded mb-2" />
          <div className="h-2 w-full bg-navy-50 rounded mt-3" />
          <div className="h-2 w-3/4 bg-navy-50 rounded mt-2" />
        </Card>
      </section>
    );
  }

  if (error) {
    return (
      <section className="animate-fade-up">
        <Card className="text-center py-4">
          <p className="text-[11px] text-rose-500 font-medium">
            Error cargando análisis CFO
          </p>
        </Card>
      </section>
    );
  }

  if (!analysis) {
    return (
      <section className="animate-fade-up">
        <Card className="text-center py-6">
          <Activity size={24} className="mx-auto text-navy-200 mb-2" />
          <p className="text-[11px] text-navy-400 font-medium">
            Sin análisis CFO. Ejecuta un análisis desde la página CFO.
          </p>
        </Card>
      </section>
    );
  }

  const {
    health_score,
    semaforo_general,
    insights_clave,
    kpis_cartera,
    analisis_vendedores,
    plan_accion,
    resumen_ejecutivo,
  } = analysis;

  const sem = getSemaphore(semaforo_general);
  const SemIcon = sem.icon;
  const insights = normalizeInsights(insights_clave).slice(0, 4);

  // Extract KPIs with flexible field names (GPT response varies)
  const kpis = kpis_cartera || {};
  const pctVencida = kpis.pct_vencida || kpis.porcentaje_vencida;
  const moraDias = kpis.mora_promedio_dias || kpis.dias_mora_promedio;
  const dso = kpis.dso_estimado;
  const clientesMora = kpis.clientes_en_mora;
  const riesgoAlto = kpis.riesgo_alto;
  const incobrables = kpis.incobrables;

  // Top 3 action items
  const actions = flattenPlanAccion(plan_accion).slice(0, 3);

  // Top vendor alerts (those with semaphore EN_RIESGO or CRITICO)
  const vendorAlerts = (analisis_vendedores?.detalle || [])
    .filter((v) => {
      const s = v.semaforo || "";
      return s === "EN_RIESGO" || s === "CRITICO" || s === "ALERTA_MAXIMA";
    })
    .slice(0, 2);

  // Score ring color
  const scoreColor =
    (health_score ?? 0) >= 70
      ? "text-emerald-500"
      : (health_score ?? 0) >= 40
        ? "text-amber-500"
        : "text-rose-500";

  return (
    <section className="animate-fade-up">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-50 text-sky-500">
            <Activity size={16} strokeWidth={1.8} />
          </div>
          <h3 className="text-[11px] font-semibold text-navy-400 uppercase tracking-[0.08em]">
            Análisis CFO
          </h3>
        </div>
        <button
          onClick={() => navigate("/cfo")}
          className="flex items-center gap-1 text-[10px] font-semibold text-sky-500 hover:text-sky-600 transition-colors"
        >
          Ver completo
          <ChevronRight size={12} />
        </button>
      </div>

      <Card className="relative overflow-hidden">
        <div className={`absolute top-0 left-0 right-0 h-[2px] ${sem.bg.replace("bg-", "bg-")} opacity-80`} />

        {/* Row 1: Score + KPIs */}
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Score column */}
          <div className="flex flex-col items-center shrink-0 sm:pr-4 sm:border-r sm:border-navy-100">
            <p className={`text-4xl font-bold font-mono tracking-tight ${scoreColor}`}>
              {health_score ?? "N/A"}
            </p>
            <span
              className={`mt-1.5 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-semibold ring-1 ${sem.bg} ${sem.text}`}
            >
              <SemIcon size={10} />
              {sem.label || semaforo_general || "Sin datos"}
            </span>
            <p className="text-[9px] text-navy-300 mt-1">Puntaje de salud</p>
          </div>

          {/* KPIs grid */}
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
            {pctVencida != null && (
              <KpiMini
                icon={TrendingDown}
                label="% Vencida"
                value={displayPct(pctVencida)}
                danger={parseNumericValue(pctVencida) > 30}
              />
            )}
            {moraDias != null && (
              <KpiMini
                icon={Clock}
                label="Mora Promedio"
                value={`${parseNumericValue(moraDias).toFixed(0)}d`}
                danger={parseNumericValue(moraDias) > 30}
              />
            )}
            {dso != null && (
              <KpiMini
                icon={Clock}
                label="DSO Estimado"
                value={`${parseNumericValue(dso).toFixed(0)}d`}
              />
            )}
            {clientesMora != null && (
              <KpiMini
                icon={Users}
                label="Clientes en Mora"
                value={parseNumericValue(clientesMora)}
                danger
              />
            )}
            {riesgoAlto != null && (
              <KpiMini
                icon={AlertTriangle}
                label="Riesgo Alto (>90d)"
                value={displayCurrency(riesgoAlto)}
                danger
              />
            )}
            {incobrables != null && (
              <KpiMini
                icon={AlertTriangle}
                label="Incobrables (>360d)"
                value={displayCurrency(incobrables)}
                danger={parseNumericValue(incobrables) > 0}
              />
            )}
          </div>
        </div>

        {/* Row 2: Resumen ejecutivo */}
        {resumen_ejecutivo && (
          <div className="mt-4 pt-3 border-t border-navy-100">
            <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-[0.06em] mb-1.5">
              Resumen Ejecutivo
            </p>
            <p className="text-[11px] text-navy-600 leading-relaxed line-clamp-3">
              {resumen_ejecutivo}
            </p>
          </div>
        )}

        {/* Row 3: Insights + Actions side by side */}
        <div className="mt-4 pt-3 border-t border-navy-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Insights */}
          {insights.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-[0.06em] mb-2">
                Insights Clave
              </p>
              <ul className="space-y-1.5">
                {insights.map((ins) => (
                  <li
                    key={ins.titulo || ins.insight || String(ins)}
                    className="text-[11px] text-navy-600 leading-snug flex items-start gap-1.5"
                  >
                    <span className="w-1 h-1 rounded-full bg-sky-400 mt-1.5 shrink-0" />
                    <span className="line-clamp-2">
                      {ins.titulo || ins.insight || String(ins)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Plan de acción */}
          {actions.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-[0.06em] mb-2">
                Acciones Prioritarias
              </p>
              <ul className="space-y-1.5">
                {actions.map((a, i) => (
                  <li
                    key={a.accion || i}
                    className="text-[11px] text-navy-600 leading-snug flex items-start gap-1.5"
                  >
                    <PriorityDot priority={a.prioridad} />
                    <span className="line-clamp-2">{a.accion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Row 4: Vendor alerts */}
        {vendorAlerts.length > 0 && (
          <div className="mt-4 pt-3 border-t border-navy-100">
            <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-[0.06em] mb-2">
              Vendedores en Riesgo
            </p>
            <div className="flex flex-wrap gap-2">
              {vendorAlerts.map((v) => {
                const vSem = getSemaphore(v.semaforo);
                return (
                  <span
                    key={v.vendedor || v.codigo}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium ring-1 ${vSem.bg} ${vSem.text}`}
                  >
                    <Users size={10} />
                    {v.vendedor || v.codigo}
                    {v.porcentaje_vencida || v.pct_vencida
                      ? ` — ${displayPct(v.porcentaje_vencida || v.pct_vencida)} vencida`
                      : ""}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

/* ─── Internal sub-components ─── */

function KpiMini({ icon: Icon, label, value, danger }) {
  return (
    <div className="flex items-start gap-2">
      <Icon
        size={12}
        strokeWidth={1.8}
        className={danger ? "text-rose-400 mt-0.5" : "text-navy-300 mt-0.5"}
      />
      <div>
        <p className="text-[9px] text-navy-400 font-medium leading-none mb-0.5">
          {label}
        </p>
        <p
          className={`text-sm font-bold font-mono tracking-tight ${danger ? "text-rose-600" : "text-navy-800"}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

const PRIORITY_COLORS = {
  URGENTE: "bg-rose-400",
  ALTA: "bg-amber-400",
  MEDIA: "bg-sky-400",
  BAJA: "bg-navy-300",
};

function PriorityDot({ priority }) {
  const color = PRIORITY_COLORS[priority] || PRIORITY_COLORS.MEDIA;
  return <span className={`w-1.5 h-1.5 rounded-full ${color} mt-1.5 shrink-0`} />;
}
