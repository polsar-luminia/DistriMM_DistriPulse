import React from "react";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Card } from "./Card";

const StatCard = ({
  title,
  value,
  subtext,
  icon: Icon,
  type = "neutral",
  trend,
}) => {
  const colors = {
    neutral: "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
    warning: "bg-amber-50 text-amber-600 ring-1 ring-amber-200",
    danger: "bg-rose-50 text-rose-600 ring-1 ring-rose-200",
    success: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200",
    info: "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200",
  };

  return (
    <Card className="hover:shadow-lg transition-all duration-300 group">
      <div className="flex items-center gap-2 mb-2">
        <div
          className={cn("p-1.5 rounded-lg shrink-0 transition-colors duration-300", colors[type])}
        >
          <Icon size={16} strokeWidth={1.8} />
        </div>
        <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">
          {title}
        </p>
      </div>

      <h3 className="text-slate-900 text-3xl font-black tabular-nums tracking-tight truncate">
        {value}
      </h3>

      {trend !== undefined && trend !== null && (
        <div
          className={cn("text-xs font-bold flex items-center gap-1 mt-2 tabular-nums", trend > 0 ? "text-rose-600" : "text-emerald-600")}
        >
          {trend > 0 ? (
            <ArrowUp size={14} strokeWidth={2} />
          ) : (
            <ArrowDown size={14} strokeWidth={2} />
          )}
          <span>{Math.abs(trend).toFixed(1)}% vs anterior</span>
        </div>
      )}

      {subtext && !trend && (
        <p
          className={cn("text-xs mt-2 font-medium tracking-wide", type === "danger" ? "text-rose-600" : "text-emerald-600")}
        >
          {subtext}
        </p>
      )}
      {subtext && trend && (
        <p className="text-[11px] text-slate-400 font-medium mt-1 tracking-wide">
          {subtext}
        </p>
      )}
    </Card>
  );
};

export default StatCard;
