import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Brain,
  Zap,
  Users,
  MapPin,
  Loader2,
  BarChart3,
  Lightbulb,
  ListChecks,
  FileText,
  DollarSign,
} from "lucide-react";
import { Card } from "../components/dashboard/DashboardShared";
import { getCfoAnalyses, triggerCfoAnalysis } from "../services/cfoService";
import { getPeriodoOperativo } from "../utils/periodoOperativo";
import { sileo } from "sileo";
import HealthScoreRing from "../components/cfo/HealthScoreRing";
import CollapsibleSection from "../components/cfo/CollapsibleSection";
import KpiMini from "../components/cfo/KpiMini";
import AgingBar from "../components/cfo/AgingBar";
import ActionItem from "../components/cfo/ActionItem";
import DebtorTable from "../components/cfo/DebtorTable";
import InsightCard from "../components/cfo/InsightCard";
import CfoEmptyState from "../components/cfo/CfoEmptyState";
import {
  SEMAPHORE_CONFIG,
  getSemaphore,
  parseNumericValue,
  displayCurrency,
  displayPct,
  flattenPlanAccion,
  normalizeInsights,
} from "../components/cfo/cfoUtils";

export default function CfoAnalysisPage() {
  const context = useOutletContext();
  const { currentLoadId, availableLoads, periodoOperativo } = context || {};

  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingCached, setLoadingCached] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingCached(true);
        const { data, error: fetchErr } = await getCfoAnalyses(currentLoadId);
        if (cancelled) return;
        if (fetchErr) throw fetchErr;
        if (data && data.length > 0) setAnalysis(data[0].analysis);
      } catch (err) {
        if (!cancelled && import.meta.env.DEV)
          console.error("Error loading cached CFO analysis:", err);
      } finally {
        if (!cancelled) setLoadingCached(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentLoadId]);

  const handleRunAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      // Periodo de la carga seleccionada (o el operativo si no hay match)
      const selectedLoad = availableLoads?.find((l) => l.id === currentLoadId);
      const periodo = selectedLoad
        ? getPeriodoOperativo(selectedLoad.fecha_corte)
        : periodoOperativo || getPeriodoOperativo(null);
      const result = await triggerCfoAnalysis({
        carga_id: currentLoadId || null,
        mes: periodo.month,
        anio: periodo.year,
      });
      if (result.error) throw new Error(result.error);
      setAnalysis(result.data);
      sileo.success({ title: "Analisis CFO generado exitosamente" });
    } catch (err) {
      if (import.meta.env.DEV) console.error("CFO Analysis error:", err);
      setError(err.message || "Error al generar el analisis");
      sileo.error({ title: "Error al generar el analisis CFO" });
    } finally {
      setLoading(false);
    }
  };

  if (loadingCached) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-indigo-500" />
        <span className="ml-2 text-sm text-slate-500">
          Cargando analisis...
        </span>
      </div>
    );
  }

  if (!analysis && !loading) {
    return (
      <div className="space-y-6">
        <PageHeader onRun={handleRunAnalysis} loading={loading} />
        <CfoEmptyState onRun={handleRunAnalysis} error={error} />
      </div>
    );
  }

  if (loading) return <LoadingView onRun={handleRunAnalysis} />;

  const {
    titulo_dashboard,
    semaforo_general,
    health_score,
    kpis_cartera,
    analisis_aging,
    ranking_deudores,
    analisis_vendedores,
    analisis_territorial,
    salud_base_clientes,
    insights_clave,
    plan_accion,
    resumen_ejecutivo,
  } = analysis || {};

  const sem = getSemaphore(semaforo_general);
  const SemIcon = sem.icon;

  return (
    <div className="space-y-6">
      <PageHeader onRun={handleRunAnalysis} loading={loading} hasAnalysis />

      <Card
        className={cn(sem.bg, sem.border, "border-2", sem.glow, "shadow-lg")}
      >
        <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8">
          <HealthScoreRing
            score={health_score || 0}
            semaforo={semaforo_general}
          />
          <div className="flex-1 text-center md:text-left">
            <div className="flex items-center gap-2 justify-center md:justify-start mb-2">
              <SemIcon size={20} className={sem.text} />
              <span
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold",
                  sem.badge,
                )}
              >
                {sem.label}
              </span>
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2">
              {titulo_dashboard || "Analisis CFO"}
            </h2>
            {resumen_ejecutivo && (
              <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
                {resumen_ejecutivo}
              </p>
            )}
          </div>
        </div>
      </Card>

      <KpisGrid kpis={kpis_cartera} />
      <KpiExtras kpis={kpis_cartera} />

      {analisis_aging && (
        <CollapsibleSection title="Analisis de Antiguedad" icon={BarChart3}>
          {analisis_aging.distribucion && (
            <AgingBar buckets={analisis_aging.distribucion} />
          )}
          <AgingNote
            text={
              analisis_aging.resumen ||
              analisis_aging.observacion ||
              analisis_aging.concentracion_riesgo
            }
          />
        </CollapsibleSection>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {ranking_deudores && (
          <CollapsibleSection title="Top Deudores" icon={DollarSign}>
            <DebtorTable
              deudores={ranking_deudores.top_por_monto || ranking_deudores}
            />
            {ranking_deudores.observacion && (
              <p className="text-sm text-slate-500 mt-3 italic">
                {ranking_deudores.observacion}
              </p>
            )}
          </CollapsibleSection>
        )}
        {insights_clave?.length > 0 && (
          <CollapsibleSection title="Insights Clave" icon={Lightbulb}>
            <div className="space-y-3">
              {normalizeInsights(insights_clave).map((ins) => (
                <InsightCard key={ins.titulo || ins.insight} insight={ins} />
              ))}
            </div>
          </CollapsibleSection>
        )}
      </div>

      <VendedoresSection data={analisis_vendedores} />
      <TerritorialSection data={analisis_territorial} />
      <ClientHealthSection data={salud_base_clientes} />
      <ActionPlanSection plan={plan_accion} />

      <div className="text-center text-xs text-slate-400 py-4">
        <Brain size={12} className="inline mr-1" />
        Analisis generado por IA — Los datos son orientativos y deben validarse
        con el equipo financiero.
      </div>
    </div>
  );
}

function PageHeader({ onRun, loading, hasAnalysis }) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <Brain size={22} className="text-indigo-600" /> Analista CFO
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Diagnostico inteligente de cartera con IA
        </p>
      </div>
      <button
        onClick={onRun}
        disabled={loading}
        className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
      >
        {loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Zap size={16} />
        )}
        {hasAnalysis ? "Regenerar Analisis" : "Generar Analisis"}
      </button>
    </div>
  );
}

function LoadingView({ onRun }) {
  const steps = [
    "Recopilando datos",
    "Calculando KPIs",
    "Analisis IA",
    "Generando reporte",
  ];
  return (
    <div className="space-y-6">
      <PageHeader onRun={onRun} loading />
      <Card className="py-16">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-indigo-100 flex items-center justify-center">
              <Brain size={32} className="text-indigo-500 animate-pulse" />
            </div>
            <div className="absolute -top-1 -right-1">
              <Loader2 size={20} className="animate-spin text-indigo-600" />
            </div>
          </div>
          <div className="text-center">
            <h3 className="font-bold text-slate-800">
              Analizando cartera con IA...
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Esto puede tomar 15-30 segundos
            </p>
          </div>
          <div className="flex gap-2 mt-2">
            {steps.map((step, i) => (
              <span
                key={step}
                className="px-2 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-500 animate-pulse"
                style={{ animationDelay: `${i * 0.3}s` }}
              >
                {step}
              </span>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function AgingNote({ text }) {
  if (!text) return null;
  return (
    <p className="text-sm text-slate-600 mt-3 bg-slate-50 p-3 rounded-lg">
      <Lightbulb size={14} className="inline mr-1.5 text-amber-500" />
      {text}
    </p>
  );
}

function KpisGrid({ kpis }) {
  if (!kpis) return null;
  const pctV = parseNumericValue(kpis.pct_vencida || kpis.porcentaje_vencida);
  const mora = parseNumericValue(
    kpis.mora_promedio_dias || kpis.dias_mora_promedio,
  );
  const dso = parseNumericValue(kpis.dso_estimado);
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <KpiMini
        label="Cartera Total"
        value={displayCurrency(kpis.cartera_total)}
        sub={`${kpis.facturas_total || kpis.total_facturas || 0} facturas`}
      />
      <KpiMini
        label="Cartera Vencida"
        value={displayCurrency(kpis.cartera_vencida)}
        sub={`${displayPct(kpis.pct_vencida || kpis.porcentaje_vencida)} del total`}
        semaforo={pctV > 50 ? "CRITICO" : pctV > 30 ? "EN_RIESGO" : "SALUDABLE"}
      />
      <KpiMini
        label="Dias Mora Promedio"
        value={`${mora}d`}
        sub={mora > 60 ? "Elevado" : "Normal"}
        semaforo={mora > 60 ? "CRITICO" : mora > 30 ? "EN_RIESGO" : "SALUDABLE"}
      />
      <KpiMini
        label="DSO Estimado"
        value={dso > 0 ? `${dso}d` : "N/A"}
        sub={dso > 45 ? "Elevado" : dso > 0 ? "Aceptable" : ""}
        semaforo={dso > 45 ? "EN_RIESGO" : dso > 30 ? "ACEPTABLE" : "SALUDABLE"}
      />
      <KpiMini
        label="Clientes Activos"
        value={kpis.clientes_activos || kpis.total_clientes || 0}
        sub={`${kpis.clientes_en_mora || 0} en mora`}
      />
    </div>
  );
}

function KpiExtras({ kpis }) {
  if (!kpis || !(kpis.interpretacion || kpis.riesgo_alto || kpis.incobrables))
    return null;
  return (
    <div className="space-y-3">
      {(kpis.riesgo_alto || kpis.incobrables) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpis.riesgo_alto && parseNumericValue(kpis.riesgo_alto) > 0 && (
            <KpiMini
              label="Riesgo Alto (>90d)"
              value={displayCurrency(kpis.riesgo_alto)}
              semaforo="EN_RIESGO"
            />
          )}
          {kpis.incobrables && parseNumericValue(kpis.incobrables) > 0 && (
            <KpiMini
              label="Incobrables (>360d)"
              value={displayCurrency(kpis.incobrables)}
              semaforo="CRITICO"
            />
          )}
          {kpis.ticket_promedio && (
            <KpiMini
              label="Ticket Promedio"
              value={displayCurrency(kpis.ticket_promedio)}
            />
          )}
        </div>
      )}
      {kpis.interpretacion && (
        <Card className="bg-slate-50 border-slate-100">
          <p className="text-sm text-slate-600 leading-relaxed">
            <FileText size={14} className="inline mr-1.5 text-indigo-500" />
            {kpis.interpretacion}
          </p>
        </Card>
      )}
    </div>
  );
}

function VendedoresSection({ data }) {
  if (!data?.detalle?.length) return null;
  return (
    <CollapsibleSection title="Analisis por Vendedor" icon={Users}>
      {data.resumen && <AgingNote text={data.resumen} />}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {data.detalle.map((v) => {
          const vSem = v.semaforo ? getSemaphore(v.semaforo) : null;
          return (
            <div
              key={v.vendedor || v.codigo || v.nombre}
              className={cn(
                "p-3 rounded-xl border",
                vSem ? [vSem.bg, vSem.border] : "bg-slate-50 border-slate-100",
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-slate-800">
                  {v.vendedor || v.codigo}
                </span>
                {vSem && (
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-bold",
                      vSem.badge,
                    )}
                  >
                    {vSem.label}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400">Cartera</span>
                  <p className="font-bold text-slate-700">
                    {displayCurrency(v.cartera_total || v.total)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Vencida</span>
                  <p className="font-bold text-slate-700">
                    {displayCurrency(v.cartera_vencida || v.vencida)}
                  </p>
                </div>
                {v.clientes !== undefined && (
                  <div>
                    <span className="text-slate-400">Clientes</span>
                    <p className="font-bold text-slate-700">{v.clientes}</p>
                  </div>
                )}
                {(v.porcentaje_vencida ?? v.pct_vencida) !== undefined && (
                  <div>
                    <span className="text-slate-400">% Vencida</span>
                    <p className="font-bold text-slate-700">
                      {displayPct(v.porcentaje_vencida || v.pct_vencida)}
                    </p>
                  </div>
                )}
              </div>
              {(v.diagnostico || v.observacion) && (
                <p className="text-xs text-slate-500 mt-2 italic">
                  {v.diagnostico || v.observacion}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}

function TerritorialSection({ data }) {
  if (!data) return null;
  return (
    <CollapsibleSection title="Analisis Territorial" icon={MapPin}>
      {data.resumen && <AgingNote text={data.resumen} />}
      {data.detalle?.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.detalle
            .filter(
              (z) =>
                !["sin municipio", "sin dato"].includes(
                  (z.municipio || z.zona || z.region || "").toLowerCase(),
                ),
            )
            .map((z) => (
              <div
                key={z.municipio || z.zona || z.region}
                className="bg-slate-50 rounded-xl p-3 border border-slate-100"
              >
                <p className="text-sm font-bold text-slate-800 mb-1">
                  {z.municipio || z.zona || z.region}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400">Cartera</span>
                    <p className="font-bold">
                      {displayCurrency(z.cartera_total || z.total)}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Clientes</span>
                    <p className="font-bold">{z.clientes || z.cantidad || 0}</p>
                  </div>
                  {(z.pct_vencida ?? z.porcentaje_vencida) !== undefined && (
                    <div>
                      <span className="text-slate-400">% Vencida</span>
                      <p className="font-bold">
                        {displayPct(z.pct_vencida || z.porcentaje_vencida)}
                      </p>
                    </div>
                  )}
                </div>
                {z.observacion && (
                  <p className="text-xs text-slate-500 mt-1.5 italic">
                    {z.observacion}
                  </p>
                )}
              </div>
            ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          {data.observacion || "Sin datos territoriales disponibles."}
        </p>
      )}
    </CollapsibleSection>
  );
}

function ClientHealthSection({ data }) {
  if (!data) return null;
  const totalCli = data.total_clientes || data.total_registrados;
  const cobCel = data.cobertura_celular || data.cobertura_celular_pct;
  const cobCorr = data.cobertura_correo || data.cobertura_correo_pct;
  const obs =
    data.interpretacion || data.observacion || data.recomendacion_datos;
  return (
    <CollapsibleSection title="Salud de la Base de Clientes" icon={Users}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        {totalCli != null && (
          <KpiMini label="Total Clientes" value={totalCli} />
        )}
        {cobCel != null && (
          <KpiMini
            label="Cobertura Celular"
            value={displayPct(cobCel)}
            semaforo={
              parseNumericValue(cobCel) >= 70 ? "SALUDABLE" : "EN_RIESGO"
            }
          />
        )}
        {cobCorr != null && (
          <KpiMini
            label="Cobertura Email"
            value={displayPct(cobCorr)}
            semaforo={
              parseNumericValue(cobCorr) >= 50 ? "SALUDABLE" : "EN_RIESGO"
            }
          />
        )}
        {data.juridicas != null && (
          <KpiMini
            label="Juridicas"
            value={data.juridicas}
            sub={`${data.naturales || 0} naturales`}
          />
        )}
      </div>
      {obs && <AgingNote text={obs} />}
    </CollapsibleSection>
  );
}

function ActionPlanSection({ plan }) {
  if (!plan) return null;
  const flatPlan = flattenPlanAccion(plan);
  if (flatPlan.length === 0) return null;
  return (
    <CollapsibleSection title="Plan de Accion" icon={ListChecks}>
      <div className="space-y-2">
        {flatPlan.map((item, i) => (
          <ActionItem
            key={item.titulo || item.accion || i}
            item={item}
            index={i}
          />
        ))}
      </div>
    </CollapsibleSection>
  );
}
