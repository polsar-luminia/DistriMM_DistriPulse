import React from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, X, Target, ShieldAlert, Info } from "lucide-react";
import { Card } from "./DashboardShared";
import { formatFullCurrency } from "../../utils/formatters";

/* Widget-specific colors with light/dark pairs for fills+strokes.
   Not in global COLORS.CHART because these are component-internal UI shades. */
const COLORS = {
  emerald: "#34d399",
  emeraldDark: "#10b981",
  rose: "#fb7185",
  roseDark: "#f43f5e",
  sky: "#38bdf8",
  amber: "#fbbf24",
  navy: "#1e2746",
  navyLight: "#3d4a6b",
  slate: "#94a3b8",
};

/* ─── Section heading component ─── */
const SectionTitle = ({ icon: Icon, iconColor, children }) => (
  <div className="flex items-center gap-2.5 mb-5">
    <div className={cn("p-1.5 rounded-lg", iconColor)}>
      <Icon size={18} strokeWidth={1.8} />
    </div>
    <h2 className="text-lg font-bold text-navy-800 tracking-tight">{children}</h2>
  </div>
);

/* ─── Mini metric for advanced strip ─── */
const MetricCard = ({ icon: Icon, label, value, accent, hint, onClick, tooltip }) => (
  <Card
    className={cn("relative group", !tooltip && "overflow-hidden", onClick && "cursor-pointer")}
    onClick={onClick}
  >
    {onClick && (
      <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight size={14} className={accent.replace("text-", "text-")} />
      </div>
    )}
    <div className="flex items-center gap-2 mb-1.5">
      <Icon size={14} strokeWidth={1.8} className={accent} />
      <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-[0.06em]">
        {label}
      </p>
      {tooltip && (
        <div className="relative group/tip ml-auto shrink-0">
          <Info size={12} className="text-navy-300 hover:text-navy-500 cursor-help transition-colors" />
          <div className="absolute top-full right-0 mt-2 w-56 p-2.5 bg-navy-800 text-white text-[10px] leading-relaxed rounded-lg shadow-lg opacity-0 pointer-events-none group-hover/tip:opacity-100 group-hover/tip:pointer-events-auto transition-opacity duration-200 z-50">
            {tooltip}
            <div className="absolute bottom-full right-2 border-4 border-transparent border-b-navy-800" />
          </div>
        </div>
      )}
    </div>
    <p className="text-2xl font-bold font-mono text-navy-900 tracking-tight">
      {value}
    </p>
    {hint && (
      <p className={cn("text-[10px] font-medium mt-1 opacity-80", accent)}>{hint}</p>
    )}
  </Card>
);

function ParetoModal({ isOpen, onClose, clients, totalDebt }) {
  if (!isOpen) return null;

  const sorted = [...clients].sort((a, b) => b.deuda - a.deuda);
  let accumulated = 0;
  const paretoClients = [];

  for (const c of sorted) {
    accumulated += c.deuda;
    paretoClients.push({ ...c, accumPct: (accumulated / totalDebt) * 100 });
    if (accumulated >= totalDebt * 0.8) break;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="bg-amber-50 px-5 py-4 border-b border-amber-100 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-bold text-amber-900 flex items-center gap-2 text-sm">
              <Target size={16} className="text-amber-600" />
              Concentración Pareto (80/20)
            </h3>
            <p className="text-[10px] text-amber-700 mt-0.5">
              {paretoClients.length} clientes representan el 80% de la deuda
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-amber-100 rounded-md text-amber-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-y-auto custom-scrollbar">
          <table className="w-full text-sm text-left">
            <thead className="bg-amber-50/50 text-[10px] text-amber-800 uppercase font-semibold tracking-wide sticky top-0 backdrop-blur-sm">
              <tr>
                <th className="px-5 py-2.5">Cliente</th>
                <th className="px-5 py-2.5 text-right">Deuda Total</th>
                <th className="px-5 py-2.5 text-right">Mora Máxima</th>
                <th className="px-5 py-2.5 text-right">% Acumulado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {paretoClients.map((c, i) => (
                <tr key={i} className="hover:bg-amber-50/20 transition-colors">
                  <td className="px-5 py-2.5 font-medium text-navy-800 text-xs">
                    {c.name}
                  </td>
                  <td className="px-5 py-2.5 text-right font-semibold font-mono text-xs">
                    {formatFullCurrency(c.deuda)}
                  </td>
                  <td className="px-5 py-2.5 text-right text-rose-500 font-semibold font-mono text-xs">
                    {c.maxMora}d
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1 bg-navy-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full"
                          style={{ width: `${Math.min(c.accumPct, 100)}%` }}
                        />
                      </div>
                      <span className="text-navy-500 font-mono text-[10px]">
                        {c.accumPct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-3 bg-navy-50/40 border-t border-navy-100 text-right shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white border border-navy-200 rounded-lg text-xs font-semibold hover:bg-navy-50 transition-colors text-navy-600"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function UnrecoverableModal({ isOpen, onClose, items }) {
  if (!isOpen) return null;

  const unrecoverableItems = items
    .filter((i) => (i.dias_mora || 0) > 360)
    .sort((a, b) => b.dias_mora - a.dias_mora);

  const total = unrecoverableItems.reduce(
    (sum, i) => sum + (i.valor_saldo || 0),
    0,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="bg-rose-50 px-5 py-4 border-b border-rose-100 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-bold text-rose-900 flex items-center gap-2 text-sm">
              <ShieldAlert size={16} className="text-rose-500" />
              Cartera Castigada ({">"}360 Días)
            </h3>
            <p className="text-[10px] text-rose-700 mt-0.5">
              Total: {formatFullCurrency(total)} | {unrecoverableItems.length}{" "}
              facturas
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-rose-100 rounded-md text-rose-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-y-auto custom-scrollbar">
          <table className="w-full text-sm text-left">
            <thead className="bg-rose-50/50 text-[10px] text-rose-800 uppercase font-semibold tracking-wide sticky top-0 backdrop-blur-sm">
              <tr>
                <th className="px-5 py-2.5">Cliente</th>
                <th className="px-5 py-2.5">Documento</th>
                <th className="px-5 py-2.5 text-right">Vencimiento</th>
                <th className="px-5 py-2.5 text-right">Días Mora</th>
                <th className="px-5 py-2.5 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {unrecoverableItems.map((item, i) => (
                <tr key={i} className="hover:bg-rose-50/20 transition-colors">
                  <td
                    className="px-5 py-2.5 font-medium text-navy-800 truncate max-w-[200px] text-xs"
                    title={item.cliente_nombre}
                  >
                    {item.cliente_nombre}
                  </td>
                  <td className="px-5 py-2.5 font-mono text-navy-400 text-[10px]">
                    {item.documento_id}
                  </td>
                  <td className="px-5 py-2.5 text-right text-navy-500 text-[10px] font-mono">
                    {item.fecha_vencimiento
                      ? new Date(
                          item.fecha_vencimiento + "T00:00:00",
                        ).toLocaleDateString("es-CO")
                      : "-"}
                  </td>
                  <td className="px-5 py-2.5 text-right font-bold font-mono text-rose-500 text-xs">
                    {item.dias_mora}d
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono font-semibold text-navy-700 text-xs">
                    {formatFullCurrency(item.valor_saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="p-3 bg-navy-50/40 border-t border-navy-100 text-right shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white border border-navy-200 rounded-lg text-xs font-semibold hover:bg-navy-50 transition-colors text-navy-600"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export { COLORS, SectionTitle, MetricCard, ParetoModal, UnrecoverableModal };
