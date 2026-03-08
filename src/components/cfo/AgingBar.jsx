/**
 * Horizontal stacked bar chart for aging distribution buckets.
 * Each bucket represents a time range with proportional width and color.
 * @module components/cfo/AgingBar
 */

import { cn } from "@/lib/utils";
import { parseNumericValue, displayCurrency } from "./cfoUtils";

const BAR_COLORS = [
  "bg-emerald-500",
  "bg-blue-400",
  "bg-amber-400",
  "bg-orange-500",
  "bg-rose-500",
  "bg-red-600",
  "bg-red-900",
];

const MIN_VISIBLE_PCT = 0.5;

/**
 * @param {{ buckets: Array<{ rango?: string, label?: string, valor?: number|string, monto?: number|string }> }} props
 */
export default function AgingBar({ buckets }) {
  if (!buckets || buckets.length === 0) return null;

  const total = buckets.reduce((s, b) => s + parseNumericValue(b.valor || b.monto), 0);
  if (total === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex h-5 rounded-full overflow-hidden bg-slate-100">
        {buckets.map((b, i) => {
          const val = parseNumericValue(b.valor || b.monto);
          const pct = (val / total) * 100;
          if (pct < MIN_VISIBLE_PCT) return null;
          return (
            <div
              key={b.rango || b.label || i}
              className={cn(BAR_COLORS[i] || "bg-slate-400", "transition-all duration-500")}
              style={{ width: `${pct}%` }}
              title={`${b.rango || b.label}: ${displayCurrency(b.valor || b.monto)} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {buckets.map((b, i) => (
          <div key={b.rango || b.label || i} className="flex items-center gap-1.5 text-xs">
            <div
              className={cn("w-2.5 h-2.5 rounded-full", BAR_COLORS[i] || "bg-slate-400")}
            />
            <span className="text-slate-500 font-medium">
              {b.rango || b.label}
            </span>
            <span className="font-bold text-slate-700">
              {displayCurrency(b.valor || b.monto)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
