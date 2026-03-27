import React from "react";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";

export default function DataFreshnessBadge({ lastLoadDate }) {
  if (!lastLoadDate) return null;

  const now = new Date();
  const loadDate = new Date(lastLoadDate);
  const diffMs = now - loadDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let label;
  if (diffDays <= 0) {
    label = "hoy";
  } else if (diffDays === 1) {
    label = "hace 1 día";
  } else {
    label = `hace ${diffDays} días`;
  }

  // Green <=3d, amber 4-7d, rose >7d
  let colorClasses;
  if (diffDays <= 3) {
    colorClasses = "bg-emerald-50 text-emerald-700 ring-emerald-200/60";
  } else if (diffDays <= 7) {
    colorClasses = "bg-amber-50 text-amber-700 ring-amber-200/60";
  } else {
    colorClasses = "bg-rose-50 text-rose-700 ring-rose-200/60";
  }

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ring-1", colorClasses)}
    >
      <Clock size={11} strokeWidth={2} />
      Última carga: {label}
    </span>
  );
}
