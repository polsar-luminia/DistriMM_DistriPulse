/**
 * Single action plan item with priority badge, detail, and impact info.
 * Used within the Plan de Accion section of the CFO dashboard.
 * @module components/cfo/ActionItem
 */

import { cn } from "@/lib/utils";
import { Target } from "lucide-react";

const PRIORITY_COLORS = {
  URGENTE: "bg-rose-100 text-rose-700 border-rose-200",
  ALTA: "bg-amber-100 text-amber-700 border-amber-200",
  MEDIA: "bg-blue-100 text-blue-700 border-blue-200",
  BAJA: "bg-slate-100 text-slate-600 border-slate-200",
};

/**
 * @param {{ item: { accion?: string, titulo?: string, prioridad?: string, detalle?: string, impacto_esperado?: string, responsable?: string }, index: number }} props
 */
export default function ActionItem({ item, index }) {
  const pColor = PRIORITY_COLORS[item.prioridad] || PRIORITY_COLORS.MEDIA;

  return (
    <div className="flex gap-3 p-3 bg-white rounded-xl border border-slate-100 hover:border-indigo-200 transition-colors">
      <div className="flex-shrink-0 w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center text-xs font-black text-indigo-600">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <h4 className="text-sm font-bold text-slate-800">{item.accion || item.titulo}</h4>
          {item.prioridad && (
            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", pColor)}>
              {item.prioridad}
            </span>
          )}
        </div>
        {item.detalle && (
          <p className="text-xs text-slate-500 leading-relaxed">{item.detalle}</p>
        )}
        {item.impacto_esperado && (
          <p className="text-xs text-emerald-600 font-semibold mt-1">
            <Target size={10} className="inline mr-1" />
            {item.impacto_esperado}
          </p>
        )}
        {item.responsable && (
          <p className="text-xs text-slate-400 mt-0.5">
            Responsable: {item.responsable}
          </p>
        )}
      </div>
    </div>
  );
}
