/* eslint-disable react-refresh/only-export-components */
/**
 * @fileoverview Shared small components for the Comisiones module.
 * @module components/comisiones/ComisionesShared
 */
import { cn } from "@/lib/utils";

export const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const Card = ({ children, className = "", ...props }) => (
  <div
    className={cn(
      "bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 p-4 md:p-5",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export const KpiCard = ({ title, value, icon: Icon, type = "neutral" }) => {
  const themes = {
    neutral: { icon: "bg-slate-50 text-slate-500 ring-1 ring-slate-200", bar: "bg-slate-200" },
    success: { icon: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200", bar: "bg-emerald-400" },
    danger: { icon: "bg-rose-50 text-rose-500 ring-1 ring-rose-200", bar: "bg-rose-400" },
    info: { icon: "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200", bar: "bg-indigo-400" },
    warning: { icon: "bg-amber-50 text-amber-600 ring-1 ring-amber-200", bar: "bg-amber-300" },
  };
  const t = themes[type] || themes.neutral;
  const len = String(value).length;
  const valueSize = len > 14 ? "text-xl" : len > 10 ? "text-2xl" : "text-3xl";

  return (
    <Card className="relative overflow-hidden">
      <div className={cn("absolute top-0 left-0 right-0 h-[2px] opacity-60", t.bar)} />
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
            {title}
          </p>
          <h3 className={cn("text-slate-900 font-black tabular-nums tracking-tight", valueSize)}>
            {value}
          </h3>
        </div>
        <div className={cn("p-2.5 rounded-xl", t.icon)}>
          <Icon size={20} strokeWidth={1.5} />
        </div>
      </div>
    </Card>
  );
};

export const TabButton = ({ active, onClick, icon: Icon, children }) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg transition-all",
      active
        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20"
        : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
    )}
  >
    <Icon size={16} />
    {children}
  </button>
);

export const EmptyState = ({ icon: Icon, title, subtitle }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="bg-slate-100 p-4 rounded-2xl mb-4">
      <Icon size={32} className="text-slate-400" />
    </div>
    <h3 className="text-lg font-bold text-slate-700 mb-1">{title}</h3>
    <p className="text-sm text-slate-500 max-w-sm">{subtitle}</p>
  </div>
);
