import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Activity, AlertTriangle } from "lucide-react";

const TYPE_ICONS = {
  POSITIVO: { icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
  NEGATIVO: { icon: TrendingDown, color: "text-rose-600", bg: "bg-rose-50" },
  NEUTRAL: { icon: Activity, color: "text-blue-600", bg: "bg-blue-50" },
  ALERTA: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
};

export default function InsightCard({ insight }) {
  const cfg = TYPE_ICONS[insight.tipo] || TYPE_ICONS.NEUTRAL;

  return (
    <div className="flex gap-3 items-start">
      <div className={cn("p-1.5 rounded-lg shrink-0", cfg.bg)}>
        <cfg.icon size={14} className={cfg.color} />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700">{insight.titulo || insight.insight}</p>
        {insight.detalle && (
          <p className="text-xs text-slate-500 mt-0.5">{insight.detalle}</p>
        )}
      </div>
    </div>
  );
}
