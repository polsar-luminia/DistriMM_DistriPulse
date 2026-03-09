/* eslint-disable react-refresh/only-export-components */
import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { formatDateUTC, formatCurrency, formatFullCurrency } from "../../utils/formatters";
import CreditScoreCard from "./CreditScoreCard";
import {
  Users,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  User,
  ShieldCheck,
  Info,
} from "lucide-react";

// Re-export formatters for backward compatibility
export { formatCurrency, formatFullCurrency };

export const Card = ({ children, className = "", ...props }) => (
  <div
    className={cn(
      "bg-white rounded-xl border border-navy-100 shadow-[0_1px_3px_rgba(15,22,41,0.04),0_1px_2px_rgba(15,22,41,0.02)] hover:shadow-[0_4px_12px_rgba(15,22,41,0.06),0_1px_3px_rgba(15,22,41,0.04)] transition-all duration-300 p-4 md:p-5",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export const StatCard = ({
  title,
  value,
  subtext,
  icon: Icon,
  type = "neutral",
  trend,
  tooltip,
}) => {
  const themes = {
    neutral: {
      icon: "bg-navy-50 text-navy-500 ring-1 ring-navy-200/60",
      accent: "text-navy-400",
      bar: "bg-navy-200",
    },
    warning: {
      icon: "bg-amber-50 text-amber-600 ring-1 ring-amber-200/60",
      accent: "text-amber-500",
      bar: "bg-amber-300",
    },
    danger: {
      icon: "bg-rose-50 text-rose-500 ring-1 ring-rose-200/60",
      accent: "text-rose-500",
      bar: "bg-rose-400",
    },
    success: {
      icon: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/60",
      accent: "text-emerald-500",
      bar: "bg-emerald-400",
    },
    info: {
      icon: "bg-sky-50 text-sky-600 ring-1 ring-sky-200/60",
      accent: "text-sky-500",
      bar: "bg-sky-400",
    },
  };

  const t = themes[type] || themes.neutral;

  const len = String(value).length;
  const valueSize =
    len > 14 ? "text-xl" : len > 10 ? "text-2xl" : len > 7 ? "text-3xl" : "text-4xl";

  return (
    <Card className={cn("relative group hover:translate-y-[-1px]", !tooltip && "overflow-hidden")}>
      {/* Top accent bar */}
      <div className={cn("absolute top-0 left-0 right-0 h-[2px] opacity-60", t.bar)} />

      <div className="flex items-center gap-2 mb-2">
        <div className={cn("p-1.5 rounded-lg shrink-0", t.icon)}>
          <Icon size={14} strokeWidth={1.8} />
        </div>
        <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-[0.08em]">
          {title}
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

      <h3
        className={cn(valueSize, "font-bold text-navy-900 tracking-tight leading-tight font-mono truncate")}
      >
        {value}
      </h3>

      {trend !== undefined && trend !== null && (
        <div
          className={cn("text-[10px] font-semibold flex items-center gap-1 mt-2", trend > 0 ? "text-rose-500" : "text-emerald-500")}
        >
          {trend > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
          <span>{Math.abs(trend).toFixed(1)}% vs anterior</span>
        </div>
      )}

      {subtext && (
        <p className={cn("text-[10px] mt-1.5 font-medium", t.accent)}>
          {subtext}
        </p>
      )}
    </Card>
  );
};

export const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const dataItem = payload[0].payload;
    const fullName = dataItem.name || dataItem.cliente_nombre || label;
    const val = payload[0].value;
    const dataKey = payload[0].dataKey;

    const isDays =
      dataKey === "dias_mora" ||
      dataKey === "maxMora" ||
      (val > 0 && val < 10000 && !dataKey);

    return (
      <div className="bg-white/95 backdrop-blur-md p-3 border border-navy-100 shadow-[0_8px_24px_rgba(15,22,41,0.12)] rounded-lg text-sm">
        <p className="font-semibold text-navy-800 text-xs mb-1.5">{fullName}</p>
        <div className="flex items-center gap-2">
          <span
            className={cn("w-1.5 h-1.5 rounded-full", isDays ? "bg-rose-400" : "bg-emerald-400")}
          />
          <p
            className={cn("font-mono font-semibold text-xs", isDays ? "text-rose-600" : "text-navy-700")}
          >
            {isDays ? `${val} días` : formatFullCurrency(val)}
          </p>
        </div>

        {dataItem.count !== undefined && (
          <div className="flex items-center gap-2 mt-1.5 border-t border-navy-50 pt-1.5">
            <Users size={10} className="text-navy-400" />
            <p className="text-navy-500 font-medium text-[10px]">
              {dataItem.count} {dataItem.count === 1 ? "Cliente" : "Clientes"}
            </p>
          </div>
        )}

        {isDays &&
          (dataItem.amount ||
            dataItem.deuda ||
            dataItem.saldo ||
            dataItem.valor_saldo) && (
            <div className="flex items-center gap-2 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <p className="text-navy-600 font-mono font-semibold text-[11px]">
                {formatFullCurrency(
                  dataItem.amount ||
                    dataItem.deuda ||
                    dataItem.saldo ||
                    dataItem.valor_saldo,
                )}
              </p>
            </div>
          )}

        {!isDays &&
          (dataItem.dias_mora || dataItem.days || dataItem.maxMora) && (
            <div className="flex items-center gap-2 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              <p className="text-rose-600 font-mono font-semibold text-[11px]">
                {dataItem.dias_mora || dataItem.days || dataItem.maxMora} días
                mora
              </p>
            </div>
          )}
      </div>
    );
  }
  return null;
};

export const HealthGauge = ({ value = 0 }) => {
  const width = 280;
  const height = 160;
  const centerX = width / 2;
  const centerY = height - 20;
  const radius = 100;
  const strokeWidth = 14;
  const circumference = Math.PI * radius;
  const progress = (value / 100) * circumference;

  const getColor = (val) => {
    if (val >= 80) return "#34d399";
    if (val >= 60) return "#fbbf24";
    if (val >= 40) return "#f59e0b";
    return "#f87171";
  };

  const getBgRing = () => "#e2e8f0";

  const getStatus = (val) => {
    if (val >= 80) return { text: "Excelente", color: "#34d399" };
    if (val >= 60) return { text: "Bueno", color: "#fbbf24" };
    if (val >= 40) return { text: "Regular", color: "#f59e0b" };
    return { text: "Crítico", color: "#f87171" };
  };

  const status = getStatus(value);

  return (
    <div className="w-full flex flex-col items-center justify-center">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full max-w-[240px] h-auto"
      >
        {/* Background ring */}
        <path
          d={`M ${20} ${centerY} A ${radius} ${radius} 0 0 1 ${width - 20} ${centerY}`}
          fill="none"
          stroke={getBgRing()}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          opacity="0.4"
        />
        {/* Progress ring */}
        <path
          d={`M ${20} ${centerY} A ${radius} ${radius} 0 0 1 ${width - 20} ${centerY}`}
          fill="none"
          stroke={getColor(value)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          style={{
            transition: "stroke-dashoffset 1s cubic-bezier(0.22, 1, 0.36, 1)",
            filter: `drop-shadow(0 0 6px ${getColor(value)}40)`,
          }}
        />
        {/* Value */}
        <text
          x={centerX}
          y={centerY - 28}
          textAnchor="middle"
          style={{
            fontSize: "38px",
            fontWeight: 700,
            fill: getColor(value),
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {value.toFixed(0)}%
        </text>
        {/* Label */}
        <text
          x={centerX}
          y={centerY + 2}
          textAnchor="middle"
          style={{
            fontSize: "12px",
            fontWeight: 600,
            fill: "#5a6a8a",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {status.text}
        </text>
      </svg>
    </div>
  );
};

export const SortableHeader = ({
  label,
  sortKey,
  align = "left",
  currentSort,
  onSort,
}) => {
  const isActive = currentSort?.key === sortKey;
  const isAsc = currentSort?.direction === "asc";

  const handleClick = () => {
    let direction = "desc";
    if (isActive && !isAsc) direction = "asc";
    onSort({ key: sortKey, direction });
  };

  return (
    <th
      className={cn("px-4 py-3 cursor-pointer hover:bg-navy-50/50 transition-colors group select-none", align === "right" ? "text-right" : "text-left")}
      onClick={handleClick}
    >
      <div
        className={cn("flex items-center gap-1", align === "right" ? "justify-end" : "justify-start")}
      >
        <span className="text-[10px] font-semibold text-navy-400 uppercase tracking-[0.06em]">
          {label}
        </span>
        <span className="text-navy-300">
          {isActive ? (
            isAsc ? (
              <ArrowUp size={11} className="text-sky-500" />
            ) : (
              <ArrowDown size={11} className="text-sky-500" />
            )
          ) : (
            <ArrowUpDown
              size={11}
              className="opacity-0 group-hover:opacity-40"
            />
          )}
        </span>
      </div>
    </th>
  );
};

export const ClientCard = ({ client, onExpand, isExpanded }) => {
  const isVencido = client.maxMora > 0;
  const [showScore, setShowScore] = useState(false);
  const clientNit = client.items?.[0]?.tercero_nit ?? null;
  return (
    <div
      className={cn("bg-white rounded-xl border overflow-hidden transition-all duration-200", isVencido ? "border-l-[3px] border-l-rose-400 border-navy-100" : "border-l-[3px] border-l-emerald-400 border-navy-100", isExpanded ? "ring-1 ring-sky-200 shadow-md" : "shadow-sm")}
    >
      <div
        className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 cursor-pointer hover:bg-navy-50/30 transition-colors"
        onClick={onExpand}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn("p-2.5 rounded-lg", isVencido ? "bg-rose-50 text-rose-500" : "bg-emerald-50 text-emerald-500")}
          >
            <User size={20} strokeWidth={1.8} />
          </div>
          <div>
            <h3 className="font-semibold text-navy-900 leading-tight">
              {client.name}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide", isVencido ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600")}
              >
                {isVencido ? "Vencido" : "Al Día"}
              </span>
              <span className="text-[10px] text-navy-400 font-medium">
                {client.items.length} facturas
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col md:flex-row items-end md:items-center gap-2 md:gap-6 text-right w-full md:w-auto">
          <div>
            <p className="text-[9px] text-navy-400 font-semibold uppercase tracking-wide">
              Deuda Total
            </p>
            <p className="text-lg font-bold font-mono text-navy-800">
              {formatFullCurrency(client.deuda)}
            </p>
          </div>
          {client.maxMora > 0 && (
            <div>
              <p className="text-[9px] text-navy-400 font-semibold uppercase tracking-wide">
                Max Mora
              </p>
              <p className="text-sm font-semibold font-mono text-rose-500">
                {client.maxMora}d
              </p>
            </div>
          )}
          <div className="p-1 text-navy-300">
            {isExpanded ? (
              <ChevronUp size={18} />
            ) : (
              <ChevronDown size={18} />
            )}
          </div>
        </div>
      </div>
      {isExpanded && (
        <div className="bg-navy-50/30 p-4 border-t border-navy-100 space-y-3">
          <div className="overflow-x-auto rounded-lg border border-navy-100 bg-white">
            <table className="w-full text-xs text-left">
              <thead className="bg-navy-50/50 text-navy-400 uppercase text-[10px] font-semibold tracking-wide">
                <tr>
                  <th className="px-3 py-2">Documento</th>
                  <th className="px-3 py-2">Emisión</th>
                  <th className="px-3 py-2">Vencimiento</th>
                  <th className="px-3 py-2 text-right">Mora</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {client.items?.map((item, idx) => (
                  <tr key={idx} className="hover:bg-navy-50/30">
                    <td className="px-3 py-2 font-mono text-navy-600">
                      {item.documento_id}
                    </td>
                    <td className="px-3 py-2 text-navy-500">
                      {formatDateUTC(item.fecha_emision)}
                    </td>
                    <td className="px-3 py-2 text-navy-500">
                      {formatDateUTC(item.fecha_vencimiento)}
                    </td>
                    <td
                      className={cn("px-3 py-2 text-right font-mono font-semibold", item.dias_mora > 0 ? "text-rose-500" : "text-emerald-500")}
                    >
                      {item.dias_mora}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-medium text-navy-700">
                      {formatFullCurrency(item.valor_saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Credit Score section */}
          {clientNit && (
            showScore ? (
              <CreditScoreCard
                nit={clientNit}
                onClose={() => setShowScore(false)}
              />
            ) : (
              <button
                onClick={() => setShowScore(true)}
                className="w-full flex items-center justify-center gap-2 py-2 text-[11px] font-semibold text-navy-500 hover:text-navy-700 bg-white border border-navy-100 rounded-lg hover:bg-navy-50/50 transition-colors"
              >
                <ShieldCheck size={13} strokeWidth={1.8} />
                Ver Score Crediticio Interno
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
};
