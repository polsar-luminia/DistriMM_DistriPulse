/**
 * Compact KPI display card for the CFO dashboard.
 * Shows a label, value, optional subtitle, and optional semaphore color.
 * @module components/cfo/KpiMini
 */

const SEMAPHORE_TEXT = {
  SALUDABLE: "text-emerald-700",
  ACEPTABLE: "text-blue-700",
  EN_RIESGO: "text-amber-700",
  CRITICO: "text-rose-700",
  ALERTA_MAXIMA: "text-red-800",
};

/**
 * @param {{ label: string, value: string|number, sub?: string, semaforo?: string }} props
 */
export default function KpiMini({ label, value, sub, semaforo }) {
  const textColor = semaforo ? (SEMAPHORE_TEXT[semaforo] || "text-slate-500") : null;

  return (
    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
        {label}
      </p>
      <p className="text-lg font-black text-slate-900">{value}</p>
      {sub && (
        <p className={`text-xs font-semibold mt-0.5 ${textColor || "text-slate-500"}`}>
          {sub}
        </p>
      )}
    </div>
  );
}
