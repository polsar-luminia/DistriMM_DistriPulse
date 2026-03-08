import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell,
} from "recharts";
import { Activity } from "lucide-react";
import {
  Card,
  CustomTooltip,
  HealthGauge,
  formatCurrency,
} from "./DashboardShared";
import { formatFullCurrency } from "../../utils/formatters";
import { SectionTitle, COLORS } from "./DashboardWidgets";

/** Risk color based on dias_mora */
function getRiskColor(diasMora) {
  if (diasMora <= 0) return COLORS.emerald;
  if (diasMora <= 60) return COLORS.amber;
  return COLORS.rose;
}

export default function HealthRiskSection({ data }) {
  const top10 = useMemo(() => {
    const clients = data.lists?.aggregatedClients || [];
    return [...clients]
      .sort((a, b) => b.deuda - a.deuda)
      .slice(0, 10)
      .map((c) => ({
        name: c.name?.length > 20 ? c.name.slice(0, 20) + "..." : c.name,
        fullName: c.name,
        deuda: c.deuda,
        diasMora: c.maxMora || 0,
        color: getRiskColor(c.maxMora || 0),
      }));
  }, [data.lists?.aggregatedClients]);

  const top10Total = useMemo(
    () => top10.reduce((sum, c) => sum + c.deuda, 0),
    [top10],
  );

  return (
    <section className="animate-fade-up stagger-2">
      <SectionTitle icon={Activity} iconColor="bg-sky-50 text-sky-500">
        Salud y Concentracion de Riesgo
      </SectionTitle>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Health Gauge */}
        <Card className="flex flex-col items-center justify-center py-6">
          <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-[0.08em] mb-1">
            Salud de Cartera
          </p>
          <p className="text-[10px] text-navy-300 mb-4 text-center leading-relaxed max-w-[200px]">
            Porcentaje de deuda vigente. {">"}80% indica gestion efectiva.
          </p>
          <HealthGauge value={data.advanced?.healthScore || 0} />
          <p className="text-[10px] text-navy-400 mt-2 text-center font-medium">
            {(data.advanced?.healthScore || 0) >= 80
              ? "Excelente estado corporativo"
              : (data.advanced?.healthScore || 0) >= 60
                ? "Requiere atencion preventiva"
                : "Estado critico"}
          </p>
        </Card>

        {/* Top 10 Horizontal Bar Chart */}
        <Card className="lg:col-span-2 flex flex-col">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-2">
            <div>
              <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-[0.08em]">
                Top 10 Clientes por Deuda
              </p>
              <p className="text-[10px] text-navy-300 mt-0.5">
                Clientes con mayor exposicion de cartera
              </p>
            </div>
            {top10.length > 0 && (
              <span className="text-[10px] font-mono font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                {formatCurrency(top10Total)}
              </span>
            )}
          </div>
          <div className="h-[300px] w-full">
            {top10.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={top10}
                  margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="#e2e8f0"
                    strokeOpacity={0.5}
                  />
                  <XAxis
                    type="number"
                    tickFormatter={(value) => formatFullCurrency(value)}
                    tick={{ fontSize: 9, fill: "#8493b1" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    tick={{ fontSize: 10, fill: "#5a6a8a", fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload?.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white/95 backdrop-blur-md p-3 border border-navy-100 shadow-lg rounded-lg text-xs">
                            <p className="font-semibold text-navy-800 mb-1.5">
                              {d.fullName}
                            </p>
                            <p className="text-emerald-600 font-mono font-semibold">
                              Saldo: {formatFullCurrency(d.deuda)}
                            </p>
                            <p className="text-rose-500 font-mono font-semibold">
                              Mora: {d.diasMora} dias
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                    cursor={{ fill: "#f0f2f7", radius: 4 }}
                  />
                  <Bar
                    dataKey="deuda"
                    radius={[0, 6, 6, 0]}
                    maxBarSize={28}
                    aria-label="Deuda por cliente"
                  >
                    {top10.map((entry) => (
                      <Cell key={entry.fullName} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-navy-300 text-sm">
                No hay datos de clientes
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Row 2: Aging + Projection */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Aging Chart */}
        <Card>
          <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-[0.08em] mb-1">
            Distribucion por Mora
          </p>
          <p className="text-[10px] text-navy-300 mb-4">
            Distribucion por rangos de mora
          </p>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.aging || []}
                margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e2e8f0"
                  strokeOpacity={0.5}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#5a6a8a", fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(value) => formatFullCurrency(value)}
                  tick={{ fontSize: 9, fill: "#8493b1" }}
                  width={100}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: "#f0f2f7", radius: 4 }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {(data.aging || []).map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Projection Chart */}
        <Card>
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-[0.08em]">
                Proyeccion Vencimiento (30d)
              </p>
              <p className="text-[10px] text-navy-300 mt-0.5">
                Vencimientos futuros para planificar flujo
              </p>
            </div>
            <span className="text-[10px] font-mono font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
              {formatCurrency(
                data.projection?.reduce(
                  (sum, i) => sum + (i.total || 0),
                  0,
                ) || 0,
              )}
            </span>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.projection || []}>
                <defs>
                  <linearGradient id="colorProj" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={COLORS.emerald}
                      stopOpacity={0.2}
                    />
                    <stop
                      offset="95%"
                      stopColor={COLORS.emerald}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e2e8f0"
                  strokeOpacity={0.5}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(val) => {
                    const date = new Date(val);
                    return `${date.getDate()}/${date.getMonth() + 1}`;
                  }}
                  tick={{ fontSize: 9, fill: "#8493b1" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(value) => formatFullCurrency(value)}
                  tick={{ fontSize: 9, fill: "#8493b1" }}
                  width={100}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload?.length) {
                      return (
                        <div className="bg-white/95 backdrop-blur-md p-2.5 border border-navy-100 shadow-lg rounded-lg text-xs">
                          <p className="font-medium text-navy-400 text-[10px]">
                            {payload[0].payload.date}
                          </p>
                          <p className="text-emerald-600 font-bold font-mono text-base">
                            {formatFullCurrency(payload[0].value)}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke={COLORS.emeraldDark}
                  strokeWidth={2}
                  fill="url(#colorProj)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </section>
  );
}
