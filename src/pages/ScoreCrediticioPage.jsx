import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Search, ShieldCheck, AlertCircle, Settings2, RotateCcw } from "lucide-react";
import CreditScoreCard from "../components/dashboard/CreditScoreCard";
import { formatFullCurrency } from "../components/dashboard/DashboardShared";
import {
  getConfig,
  updateConfig,
  updateScoreConfig,
} from "../services/portfolioService";
import { useClientAnalytics } from "../hooks/useClientAnalytics";
import ConfirmDialog from "../components/ConfirmDialog";
import { useConfirm } from "../hooks/useConfirm";
import { sileo } from "sileo";

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_PESOS = {
  mora_prom: 20,
  tendencia: 15,
  cumplimiento: 15,
  concentracion: 15,
  mora_max: 10,
  volatilidad: 5,
  antiguedad: 10,
  volumen: 10,
};

const DEFAULT_UMBRALES = {
  excelente: 80,
  bueno: 60,
  regular: 40,
  riesgo: 20,
};

const DEFAULT_PLAZOS = {
  excelente: 90,
  bueno: 60,
  regular: 30,
  riesgo: 15,
  alto_riesgo: 0,
};

const DEFAULT_TECHO_MORA = 180;
const DEFAULT_PERIODO = 12;

const DIMENSION_DEFS = [
  {
    key: "comportamiento",
    label: "Comportamiento de Pago",
    color: "indigo",
    variables: [
      { key: "mora_prom", label: "Mora promedio ponderada" },
      { key: "tendencia", label: "Tendencia de mora" },
      { key: "cumplimiento", label: "Tasa de cumplimiento" },
    ],
  },
  {
    key: "exposicion",
    label: "Exposición y Riesgo",
    color: "amber",
    variables: [
      { key: "concentracion", label: "Concentración vencida" },
      { key: "mora_max", label: "Mora máxima" },
      { key: "volatilidad", label: "Volatilidad de pago" },
    ],
  },
  {
    key: "relacion",
    label: "Relación Comercial",
    color: "emerald",
    variables: [
      { key: "antiguedad", label: "Antigüedad" },
      { key: "volumen", label: "Volumen de negocio" },
    ],
  },
];

const NIVEL_ROWS = [
  { key: "excelente", label: "Excelente", dot: "bg-emerald-400", text: "text-emerald-600" },
  { key: "bueno", label: "Bueno", dot: "bg-sky-400", text: "text-sky-600" },
  { key: "regular", label: "Regular", dot: "bg-amber-400", text: "text-amber-600" },
  { key: "riesgo", label: "Riesgo", dot: "bg-orange-400", text: "text-orange-600" },
  { key: "alto_riesgo", label: "Alto riesgo", dot: "bg-rose-500", text: "text-rose-600" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const moraBadgeClass = (dias) => {
  if (dias === 0) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (dias <= 30) return "bg-amber-50 text-amber-700 border-amber-200";
  if (dias <= 60) return "bg-orange-50 text-orange-700 border-orange-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
};

const sumPesos = (p) => Object.values(p).reduce((a, b) => a + b, 0);

// ─── Sub-components ──────────────────────────────────────────────────────────

function WeightSlider({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-600 flex-1 min-w-0 truncate">{label}</span>
      <input
        type="range"
        min={0}
        max={35}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28 h-1.5 accent-indigo-500 cursor-pointer"
      />
      <span className="text-xs font-mono font-bold text-slate-700 w-8 text-right tabular-nums">
        {value}%
      </span>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ScoreCrediticioPage() {
  const context = useOutletContext();
  const { data = {} } = context || {};

  const [search, setSearch] = useState("");
  const [selectedNit, setSelectedNit] = useState(null);
  const [selectedName, setSelectedName] = useState(null);
  const [activeTab, setActiveTab] = useState("score");
  const [maxPlazo, setMaxPlazo] = useState(45);
  const saveTimerRef = useRef(null);

  // Score config state
  const [pesos, setPesos] = useState({ ...DEFAULT_PESOS });
  const [umbrales, setUmbrales] = useState({ ...DEFAULT_UMBRALES });
  const [plazos, setPlazos] = useState({ ...DEFAULT_PLAZOS });
  const [techoMora, setTechoMora] = useState(DEFAULT_TECHO_MORA);
  const [periodoMeses, setPeriodoMeses] = useState(DEFAULT_PERIODO);
  const [configLoaded, setConfigLoaded] = useState(false);
  const configSaveRef = useRef(null);

  const [confirmProps, confirm] = useConfirm();
  const { clientes, loading: clientesLoading } = useClientAnalytics();

  // ── Load config on mount ──
  useEffect(() => {
    (async () => {
      try {
        const { data: cfg } = await getConfig();
        if (cfg?.max_plazo_dias) setMaxPlazo(cfg.max_plazo_dias);

        const sc = cfg?.score_config;
        if (sc) {
          if (sc.pesos) setPesos((prev) => ({ ...prev, ...sc.pesos }));
          if (sc.umbrales_nivel) setUmbrales((prev) => ({ ...prev, ...sc.umbrales_nivel }));
          if (sc.plazos_por_nivel) setPlazos((prev) => ({ ...prev, ...sc.plazos_por_nivel }));
          if (sc.techo_mora_dias != null) setTechoMora(sc.techo_mora_dias);
          if (sc.periodo_evaluacion_meses != null) setPeriodoMeses(sc.periodo_evaluacion_meses);
        }
      } catch {
        /* ignore */
      } finally {
        setConfigLoaded(true);
      }
    })();
  }, []);

  // Cleanup timers
  useEffect(() => () => {
    clearTimeout(saveTimerRef.current);
    clearTimeout(configSaveRef.current);
  }, []);

  // ── Auto-save score config (debounced 800ms) ──
  const saveScoreConfig = useCallback(
    (newPesos, newUmbrales, newPlazos, newTecho, newPeriodo) => {
      clearTimeout(configSaveRef.current);
      const total = sumPesos(newPesos);
      if (total !== 100) return; // only save when valid

      configSaveRef.current = setTimeout(async () => {
        const payload = {
          pesos: newPesos,
          techo_mora_dias: newTecho,
          periodo_evaluacion_meses: newPeriodo,
          umbrales_nivel: newUmbrales,
          plazos_por_nivel: newPlazos,
        };
        const { error } = await updateScoreConfig(payload);
        if (!error) sileo.success("Configuración guardada");
      }, 800);
    },
    [],
  );

  const handlePesoChange = (key, val) => {
    const next = { ...pesos, [key]: val };
    setPesos(next);
    saveScoreConfig(next, umbrales, plazos, techoMora, periodoMeses);
  };

  const handleUmbralChange = (key, val) => {
    const next = { ...umbrales, [key]: Math.max(0, Math.min(100, Number(val) || 0)) };
    setUmbrales(next);
    saveScoreConfig(pesos, next, plazos, techoMora, periodoMeses);
  };

  const handlePlazoChange = (key, val) => {
    const next = { ...plazos, [key]: Math.max(0, Number(val) || 0) };
    setPlazos(next);
    saveScoreConfig(pesos, umbrales, next, techoMora, periodoMeses);
  };

  const handleTechoChange = (val) => {
    const n = Math.max(1, Number(val) || 180);
    setTechoMora(n);
    saveScoreConfig(pesos, umbrales, plazos, n, periodoMeses);
  };

  const handlePeriodoChange = (val) => {
    const n = Math.max(1, Math.min(60, Number(val) || 12));
    setPeriodoMeses(n);
    saveScoreConfig(pesos, umbrales, plazos, techoMora, n);
  };

  const handleMaxPlazoChange = (val) => {
    const n = Math.max(1, Math.min(90, Number(val) || 45));
    setMaxPlazo(n);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const { error } = await updateConfig({ max_plazo_dias: n });
      if (!error) sileo.success("Plazo máximo guardado");
    }, 800);
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: "Restaurar valores por defecto",
      message:
        "Se restablecerán todos los pesos, umbrales y parámetros a sus valores por defecto. Esta acción no se puede deshacer.",
      confirmText: "Restaurar",
      cancelText: "Cancelar",
      variant: "warning",
    });
    if (!ok) return;

    setPesos({ ...DEFAULT_PESOS });
    setUmbrales({ ...DEFAULT_UMBRALES });
    setPlazos({ ...DEFAULT_PLAZOS });
    setTechoMora(DEFAULT_TECHO_MORA);
    setPeriodoMeses(DEFAULT_PERIODO);

    const { error } = await updateScoreConfig({
      pesos: DEFAULT_PESOS,
      techo_mora_dias: DEFAULT_TECHO_MORA,
      periodo_evaluacion_meses: DEFAULT_PERIODO,
      umbrales_nivel: DEFAULT_UMBRALES,
      plazos_por_nivel: DEFAULT_PLAZOS,
    });
    if (!error) sileo.success("Configuración restaurada");
  };

  // ── Cartera lookup ──
  const carteraMap = useMemo(() => {
    const map = {};
    (data.aggregatedClients ?? []).forEach((c) => {
      const nit = c.items?.[0]?.tercero_nit;
      if (nit) map[nit] = c;
    });
    return map;
  }, [data.aggregatedClients]);

  const refreshToken = data.items?.length ?? 0;

  const filteredClientes = useMemo(() => {
    if (!search.trim()) return clientes;
    const q = search.toLowerCase();
    return clientes.filter(
      (c) =>
        (c.nombre_completo ?? "").toLowerCase().includes(q) ||
        (c.no_identif ?? "").toLowerCase().includes(q),
    );
  }, [clientes, search]);

  const pesoTotal = sumPesos(pesos);
  const pesosValid = pesoTotal === 100;

  // Umbral validation: each level must be strictly less than the one above
  const umbralesValid =
    umbrales.excelente > umbrales.bueno &&
    umbrales.bueno > umbrales.regular &&
    umbrales.regular > umbrales.riesgo &&
    umbrales.riesgo > 0;

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-128px)] overflow-hidden -mx-4 sm:-mx-6 lg:-mx-10 -my-6">
      {/* ── Left Panel: Client List ── */}
      <div className="flex flex-col w-full md:w-72 lg:w-80 border-r border-slate-200 bg-white shrink-0 overflow-hidden">
        <div className="px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={16} className="text-indigo-600" />
            <h1 className="text-sm font-bold text-slate-800">Score Crediticio</h1>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar cliente o NIT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none bg-slate-50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {clientesLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <div className="w-5 h-5 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
              <p className="text-xs text-slate-400">Cargando directorio...</p>
            </div>
          ) : filteredClientes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4 gap-2">
              <AlertCircle size={20} className="text-slate-300" />
              <p className="text-xs text-slate-400">
                {clientes.length === 0 ? "Sin clientes en el directorio" : "Sin resultados"}
              </p>
            </div>
          ) : (
            filteredClientes.map((cliente) => {
              const nit = cliente.no_identif;
              const cartera = carteraMap[nit];
              const isSelected = nit === selectedNit;
              const maxD = Math.max(0, cartera?.maxMora ?? 0);
              const badgeCls = moraBadgeClass(maxD);
              const hasCartera = !!cartera;

              return (
                <button
                  key={nit}
                  onClick={() => {
                    setSelectedNit(nit);
                    setSelectedName(cliente.nombre_completo ?? nit);
                  }}
                  className={cn("w-full text-left px-4 py-3 transition-colors border-l-2",
                    isSelected
                      ? "bg-indigo-50 border-indigo-500"
                      : "border-transparent hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn("text-[11px] font-semibold truncate",
                          isSelected ? "text-indigo-700" : "text-slate-700"
                        )}
                      >
                        {cliente.nombre_completo ?? nit}
                      </p>
                      {hasCartera ? (
                        <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                          {formatFullCurrency(cartera.deuda ?? 0)}
                        </p>
                      ) : (
                        <p className="text-[10px] text-slate-300 mt-0.5 italic">Sin historial</p>
                      )}
                    </div>
                    {hasCartera && maxD > 0 && (
                      <span
                        className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0", badgeCls)}
                      >
                        {maxD}d
                      </span>
                    )}
                    {!hasCartera && (
                      <span className="text-[9px] text-slate-300 font-mono shrink-0">—</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-100 shrink-0">
          <p className="text-[10px] text-slate-400 text-center">
            {filteredClientes.length} cliente{filteredClientes.length !== 1 ? "s" : ""}
            {Object.keys(carteraMap).length > 0 && (
              <span className="ml-1 text-slate-300">
                · {Object.keys(carteraMap).length} con cartera
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab strip */}
        <div className="flex shrink-0 border-b border-slate-200 bg-white px-4 sm:px-6 gap-0">
          <button
            onClick={() => setActiveTab("score")}
            className={cn("flex items-center gap-1.5 px-1 py-3 mr-5 text-xs font-semibold border-b-2 transition-colors",
              activeTab === "score"
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            <ShieldCheck size={13} />
            Score Crediticio
          </button>
          <button
            onClick={() => setActiveTab("config")}
            className={cn("flex items-center gap-1.5 px-1 py-3 text-xs font-semibold border-b-2 transition-colors",
              activeTab === "config"
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-slate-400 hover:text-slate-600"
            )}
          >
            <Settings2 size={13} />
            Configuración
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* ── SCORE TAB ── */}
          {activeTab === "score" && (
            <>
              {selectedNit ? (
                <div className="max-w-4xl mx-auto">
                  <p className="text-[11px] font-semibold text-slate-500 mb-3 uppercase tracking-wide">
                    {selectedName}
                  </p>
                  <CreditScoreCard
                    nit={selectedNit}
                    maxPlazo={maxPlazo}
                    refreshToken={refreshToken}
                    wide
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                  <div className="p-4 rounded-2xl bg-indigo-50 text-indigo-300 ring-1 ring-indigo-100">
                    <ShieldCheck size={32} strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-600">Selecciona un cliente</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                      Elige un cliente de la lista para ver su score crediticio basado en el
                      historial completo de cargas
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── CONFIG TAB ── */}
          {activeTab === "config" && configLoaded && (
            <div className="max-w-4xl mx-auto space-y-5">
              {/* ─── Section 1: Plazo máximo ─── */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.06em] mb-4">
                  Plazo máximo de crédito
                </p>
                <div className="flex items-end justify-between mb-3">
                  <p className="text-xs text-slate-500 max-w-[260px] leading-relaxed">
                    Techo de días que puede otorgarse a cualquier cliente, sin importar su nivel.
                  </p>
                  <span className="text-3xl font-black font-mono text-indigo-600 tabular-nums leading-none">
                    {maxPlazo}
                    <span className="text-base font-semibold text-indigo-300 ml-1">d</span>
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={90}
                  step={1}
                  value={maxPlazo}
                  onChange={(e) => handleMaxPlazoChange(e.target.value)}
                  className="w-full h-2 accent-indigo-500 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-slate-300 font-mono select-none mt-1 mb-3">
                  <span>1d</span>
                  <span>30d</span>
                  <span>45d</span>
                  <span>60d</span>
                  <span>90d</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[15, 30, 45, 60, 90].map((d) => (
                    <button
                      key={d}
                      onClick={() => handleMaxPlazoChange(d)}
                      className={cn("px-4 py-1.5 rounded-full text-xs font-semibold border transition-all",
                        maxPlazo === d
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-200"
                          : "bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
                      )}
                    >
                      {d} días
                    </button>
                  ))}
                </div>
              </div>

              {/* ─── Section 2: Pesos de evaluación ─── */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.06em]">
                    Pesos de evaluación
                  </p>
                  <span
                    className={cn("text-xs font-mono font-bold px-2.5 py-1 rounded-full",
                      pesosValid
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-rose-50 text-rose-600"
                    )}
                  >
                    Total: {pesoTotal}%
                  </span>
                </div>

                {!pesosValid && (
                  <p className="text-xs text-rose-500 font-semibold">
                    Los pesos deben sumar 100% (actual: {pesoTotal}%). Los cambios no se guardarán
                    hasta que sumen 100.
                  </p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {DIMENSION_DEFS.map((dim) => {
                    const dimTotal = dim.variables.reduce((s, v) => s + (pesos[v.key] || 0), 0);
                    return (
                      <div key={dim.key} className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-bold text-slate-600">{dim.label}</p>
                          <span className="text-[10px] font-mono font-semibold text-slate-400">
                            {dimTotal}%
                          </span>
                        </div>
                        <div className="space-y-2.5">
                          {dim.variables.map((v) => (
                            <WeightSlider
                              key={v.key}
                              label={v.label}
                              value={pesos[v.key] || 0}
                              onChange={(val) => handlePesoChange(v.key, val)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ─── Section 3: Umbrales de nivel ─── */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.06em]">
                  Umbrales de nivel y plazos sugeridos
                </p>

                {!umbralesValid && (
                  <p className="text-xs text-rose-500 font-semibold">
                    Cada nivel debe tener un score mínimo menor que el nivel superior.
                  </p>
                )}

                <div className="rounded-lg border border-slate-100 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-50/80">
                      <tr>
                        <th className="px-4 py-2 text-left text-[9px] font-semibold text-slate-400 uppercase tracking-wide">
                          Nivel
                        </th>
                        <th className="px-4 py-2 text-center text-[9px] font-semibold text-slate-400 uppercase tracking-wide">
                          Score mínimo
                        </th>
                        <th className="px-4 py-2 text-center text-[9px] font-semibold text-slate-400 uppercase tracking-wide">
                          Plazo (días)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {NIVEL_ROWS.map(({ key, label, dot, text }) => (
                        <tr key={key} className="bg-white hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
                              <span className={cn("text-xs font-semibold", text)}>{label}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {key === "alto_riesgo" ? (
                              <span className="text-[10px] font-mono text-slate-400">
                                &lt; {umbrales.riesgo}
                              </span>
                            ) : (
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={umbrales[key]}
                                onChange={(e) => handleUmbralChange(key, e.target.value)}
                                className="w-16 text-center text-xs font-mono border border-slate-200 rounded-md py-1 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                              />
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <input
                              type="number"
                              min={0}
                              value={plazos[key]}
                              onChange={(e) => handlePlazoChange(key, e.target.value)}
                              className="w-16 text-center text-xs font-mono border border-slate-200 rounded-md py-1 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ─── Section 4: Parámetros avanzados ─── */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.06em]">
                  Parámetros avanzados
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600">
                      Techo de mora (días)
                    </label>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Días de mora a partir de los cuales el sub-score vale 0.
                    </p>
                    <input
                      type="number"
                      min={1}
                      value={techoMora}
                      onChange={(e) => handleTechoChange(e.target.value)}
                      className="w-24 text-xs font-mono border border-slate-200 rounded-md py-1.5 px-2.5 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600">
                      Período de evaluación (meses)
                    </label>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Cuántos meses de historial se consideran para el cálculo.
                    </p>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={periodoMeses}
                      onChange={(e) => handlePeriodoChange(e.target.value)}
                      className="w-24 text-xs font-mono border border-slate-200 rounded-md py-1.5 px-2.5 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* ─── Section 5: Reset ─── */}
              <div className="flex justify-end">
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-700 transition-colors"
                >
                  <RotateCcw size={13} />
                  Restaurar valores por defecto
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}
