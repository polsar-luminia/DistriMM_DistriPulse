import React, { useState, useEffect } from "react";
import { ShieldCheck, X, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { getClientCreditScoreV2, getClientCreditScore } from "../../services/portfolioService";
import { HealthGauge, formatFullCurrency } from "./DashboardShared";
import { formatDateUTC } from "../../utils/formatters";

// ============================================================================
// CONSTANTS
// ============================================================================

const NIVEL_COLORS = {
  Excelente: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  Bueno: { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200" },
  Regular: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  Riesgo: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  "Alto riesgo": { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
  "Sin datos": { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" },
};

const DIMENSION_META = {
  comportamiento: { label: "Comportamiento de Pago", icon: "text-indigo-500" },
  exposicion: { label: "Exposición y Riesgo", icon: "text-amber-500" },
  relacion: { label: "Relación Comercial", icon: "text-emerald-500" },
};

const VARIABLE_LABELS = {
  mora_prom: "Mora promedio",
  tendencia: "Tendencia",
  cumplimiento: "Cumplimiento",
  concentracion: "Concentración",
  mora_max: "Mora máxima",
  volatilidad: "Volatilidad",
  antiguedad: "Antigüedad",
  volumen: "Volumen",
};

const OVERDUE_ROWS_LIMIT = 5;

// ============================================================================
// HELPERS
// ============================================================================

const getBarColor = (value) => {
  if (value >= 80) return "bg-emerald-400";
  if (value >= 60) return "bg-sky-400";
  if (value >= 40) return "bg-amber-400";
  return "bg-rose-400";
};

const getBarColorClass = (value) => {
  if (value >= 80) return "text-emerald-500";
  if (value >= 60) return "text-sky-500";
  if (value >= 40) return "text-amber-500";
  return "text-rose-500";
};

const getNivelColors = (nivel) => NIVEL_COLORS[nivel] || NIVEL_COLORS["Sin datos"];

const formatRawValue = (key, raw) => {
  if (raw == null) return "";
  switch (key) {
    case "mora_prom":
      return `${raw}d`;
    case "tendencia":
      return "";
    case "cumplimiento":
      return `${raw}%`;
    case "concentracion":
      return `${raw}%`;
    case "mora_max":
      return `${raw}d`;
    case "volatilidad": {
      const n = Number(raw);
      if (n <= 10) return "Baja";
      if (n <= 30) return "Media";
      return "Alta";
    }
    case "antiguedad":
      return `${raw}d`;
    case "volumen": {
      const map = {
        top_10: "Top 10%",
        top_25: "Top 25%",
        top_50: "Top 50%",
        top_75: "Top 75%",
        bottom_25: "Bottom 25%",
        sin_datos: "—",
      };
      return map[raw] || raw;
    }
    default:
      return String(raw);
  }
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const LoadingSkeleton = () => (
  <div className="animate-pulse space-y-3 py-2">
    <div className="mx-auto h-32 w-52 rounded-lg bg-navy-100/60" />
    <div className="mx-auto h-5 w-28 rounded-full bg-navy-100/60" />
    <div className="mx-auto h-4 w-40 rounded bg-navy-100/60" />
    <div className="mt-4 space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-20 rounded-lg bg-navy-100/60" />
      ))}
    </div>
  </div>
);

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
    <div className="p-2.5 rounded-lg bg-slate-50 text-slate-400 ring-1 ring-slate-200">
      <ShieldCheck size={20} strokeWidth={1.8} />
    </div>
    <p className="text-xs text-navy-400 max-w-[220px] leading-relaxed">
      No hay datos de cartera disponibles para calcular el score.
    </p>
  </div>
);

const MetricChip = ({ label }) => (
  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-navy-50 border border-navy-100 text-xs font-medium text-navy-600 font-mono">
    {label}
  </span>
);

const TendenciaBadge = ({ tendencia }) => {
  if (!tendencia || tendencia === "sin_historial") return null;
  const config = {
    mejorando: { icon: TrendingUp, cls: "bg-emerald-50 text-emerald-600 border-emerald-200", label: "Mejorando" },
    empeorando: { icon: TrendingDown, cls: "bg-rose-50 text-rose-600 border-rose-200", label: "Empeorando" },
    estable: { icon: Minus, cls: "bg-slate-50 text-slate-500 border-slate-200", label: "Estable" },
  };
  const c = config[tendencia] || config.estable;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${c.cls}`}>
      <Icon size={11} />
      {c.label}
    </span>
  );
};

const VariableBar = ({ label, score, peso, rawValue, varKey }) => (
  <div className="flex items-center gap-2 min-w-0">
    <div className="flex flex-col min-w-0 flex-1">
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="text-[11px] font-medium text-navy-500 truncate leading-tight">
          {label}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {varKey === "tendencia" && rawValue ? (
            <TendenciaBadge tendencia={rawValue} />
          ) : (
            rawValue !== "" && (
              <span className="text-[10px] text-navy-300 font-mono">{rawValue}</span>
            )
          )}
          <span className="text-[10px] text-navy-300 font-medium">({peso}%)</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-[7px] bg-navy-50 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${getBarColor(score)}`}
            style={{ width: `${Math.min(score, 100)}%` }}
          />
        </div>
        <span className={`text-[11px] font-mono font-bold w-7 text-right shrink-0 ${getBarColorClass(score)}`}>
          {score}
        </span>
      </div>
    </div>
  </div>
);

const DimensionCard = ({ dimKey, dimData }) => {
  const meta = DIMENSION_META[dimKey];
  if (!meta || !dimData) return null;

  const variables = dimData.variables || {};

  return (
    <div className="rounded-lg border border-navy-100 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-navy-600">
          {meta.label}{" "}
          <span className="text-navy-300 font-normal">({dimData.peso_total}%)</span>
        </p>
        <span className={`text-xs font-mono font-bold ${getBarColorClass(dimData.score)}`}>
          {dimData.score}/100
        </span>
      </div>
      {/* Dimension summary bar */}
      <div className="h-1.5 bg-navy-50 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${getBarColor(dimData.score)}`}
          style={{ width: `${Math.min(dimData.score, 100)}%` }}
        />
      </div>
      {/* Variable bars */}
      <div className="space-y-2 pt-1">
        {Object.entries(variables).map(([varKey, varData]) => (
          <VariableBar
            key={varKey}
            varKey={varKey}
            label={VARIABLE_LABELS[varKey] || varKey}
            score={varData.score ?? 0}
            peso={varData.peso ?? 0}
            rawValue={formatRawValue(varKey, varData.valor_raw)}
          />
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const CreditScoreCard = ({ nit, onClose, maxPlazo = 45, wide = false, refreshToken }) => {
  const [loading, setLoading] = useState(() => !!nit);
  const [scoreData, setScoreData] = useState(null);
  const [fetchError, setFetchError] = useState(() => !nit);
  const [showAllOverdue, setShowAllOverdue] = useState(false);

  useEffect(() => {
    if (!nit) return;

    let cancelled = false;

    const fetchScore = async () => {
      setLoading(true);
      setFetchError(false);
      setShowAllOverdue(false);

      // Try v2 first, fall back to v1
      let result = await getClientCreditScoreV2(nit);
      if (result.error) {
        result = await getClientCreditScore(nit);
      }

      if (cancelled) return;

      if (result.error || !result.data) {
        setFetchError(true);
      } else {
        setScoreData(result.data);
      }
      setLoading(false);
    };

    fetchScore();

    return () => {
      cancelled = true;
    };
  }, [nit, refreshToken]);

  const nivelColors = scoreData ? getNivelColors(scoreData.nivel) : getNivelColors("Sin datos");

  const facturas = scoreData?.facturas_vencidas ?? [];
  const visibleFacturas = showAllOverdue ? facturas : facturas.slice(0, OVERDUE_ROWS_LIMIT);
  const hasMore = facturas.length > OVERDUE_ROWS_LIMIT;

  const dimensiones = scoreData?.dimensiones;
  const detalles = scoreData?.detalles;
  const isV2 = !!dimensiones;

  return (
    <div className="bg-white rounded-xl border border-navy-100 shadow-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-navy-50 text-navy-500 ring-1 ring-navy-200/60">
            <ShieldCheck size={16} strokeWidth={1.8} />
          </div>
          <h4 className="text-xs font-semibold text-navy-600 uppercase tracking-[0.06em]">
            Score Crediticio Interno
          </h4>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-navy-50 text-navy-300 hover:text-navy-500 transition-colors"
            aria-label="Cerrar"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Body */}
      {loading && <LoadingSkeleton />}

      {!loading && (fetchError || !scoreData) && <EmptyState />}

      {!loading && !fetchError && scoreData && (() => {
        // ── Gauge ──
        const gaugeSection = (
          <div className={`flex flex-col items-center gap-2 ${wide ? "pt-1" : ""}`}>
            <HealthGauge value={scoreData.score ?? 0} />
            <span
              className={`inline-flex items-center px-3.5 py-1 rounded-full border text-sm font-semibold tracking-wide ${nivelColors.bg} ${nivelColors.text} ${nivelColors.border}`}
            >
              {scoreData.nivel ?? "Sin datos"}
            </span>
            <p className="text-sm text-navy-500 text-center">
              Plazo sugerido:{" "}
              <span className="font-semibold font-mono text-navy-800">
                {scoreData.plazo_sugerido_dias != null
                  ? Math.min(Math.round(scoreData.plazo_sugerido_dias * maxPlazo / 90), maxPlazo)
                  : "—"}{" "}
                días
              </span>
              {maxPlazo !== 45 && (
                <span className="text-[10px] text-navy-300 ml-1">(máx. {maxPlazo}d)</span>
              )}
            </p>
            {/* Metric chips */}
            {detalles && (
              <div className="flex flex-wrap gap-1.5 pt-0.5 justify-center">
                {detalles.tendencia && detalles.tendencia !== "sin_historial" && (
                  <TendenciaBadge tendencia={detalles.tendencia} />
                )}
                {detalles.tasa_cumplimiento_pct != null && (
                  <MetricChip label={`Cumpl: ${detalles.tasa_cumplimiento_pct}%`} />
                )}
                {detalles.num_cortes_evaluados != null && (
                  <MetricChip label={`${detalles.num_cortes_evaluados} cortes`} />
                )}
                <MetricChip label={`Facturas: ${detalles.num_facturas_actual ?? facturas.length}`} />
              </div>
            )}
          </div>
        );

        // ── Dimensions (v2) ──
        const dimensionsSection = isV2 && (
          <div className="space-y-3">
            {["comportamiento", "exposicion", "relacion"].map((dk) => (
              <DimensionCard key={dk} dimKey={dk} dimData={dimensiones[dk]} />
            ))}
          </div>
        );

        // ── Overdue table ──
        const overdueSection = facturas.length > 0 && (
          <div className="space-y-2 pt-1">
            <p className="text-xs font-semibold text-navy-400 uppercase tracking-[0.06em]">
              Facturas Vencidas ({facturas.length})
            </p>
            <div className="rounded-lg border border-navy-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-navy-50/60 text-navy-400 text-[10px] font-semibold uppercase tracking-wide">
                    <tr>
                      <th className="px-3 py-2">Documento</th>
                      <th className="px-3 py-2">Vencimiento</th>
                      <th className="px-3 py-2 text-right">Mora</th>
                      <th className="px-3 py-2 text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-50 bg-white">
                    {visibleFacturas.map((factura, idx) => (
                      <tr key={factura.documento_id ?? idx} className="hover:bg-navy-50/30">
                        <td className="px-3 py-2 font-mono text-navy-600 text-xs">
                          {factura.documento_id ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-navy-500 text-xs">
                          {formatDateUTC(factura.fecha_vencimiento)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-rose-500 text-xs">
                          {factura.dias_mora ?? 0}d
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-medium text-navy-700 text-xs">
                          {formatFullCurrency(factura.valor_saldo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasMore && (
                <button
                  onClick={() => setShowAllOverdue((prev) => !prev)}
                  className="w-full flex items-center justify-center gap-1 py-2 text-xs font-semibold text-navy-400 hover:text-navy-600 hover:bg-navy-50/40 transition-colors border-t border-navy-100"
                >
                  {showAllOverdue ? (
                    <>
                      <ChevronUp size={12} />
                      Mostrar menos
                    </>
                  ) : (
                    <>
                      <ChevronDown size={12} />
                      Ver más ({facturas.length - OVERDUE_ROWS_LIMIT} restantes)
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        );

        // ── Wide layout ──
        if (wide) {
          return (
            <div className="space-y-5">
              <div className="grid grid-cols-[260px_1fr] gap-8 items-start">
                {gaugeSection}
                <div className="space-y-4 pt-1 border-l border-navy-50 pl-8">
                  {dimensionsSection}
                </div>
              </div>
              {facturas.length > 0 && (
                <div className="border-t border-navy-50 pt-4">{overdueSection}</div>
              )}
            </div>
          );
        }

        // ── Compact layout ──
        return (
          <div className="space-y-3">
            {gaugeSection}
            {dimensionsSection}
            {overdueSection}
          </div>
        );
      })()}
    </div>
  );
};

export default CreditScoreCard;
