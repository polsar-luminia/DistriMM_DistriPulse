import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const DEFAULT_COLORS = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
];

function formatCOP(value) {
  if (typeof value !== "number") return value;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString("es-CO")}`;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
          <span className="text-slate-600">{entry.name}:</span>
          <span className="font-semibold text-slate-800">
            {typeof entry.value === "number" ? entry.value.toLocaleString("es-CO") : entry.value}
          </span>
        </p>
      ))}
    </div>
  );
}

function RenderBarChart({ data, xKey, bars = [] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: "#64748b" }} interval={0} angle={-25} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={formatCOP} width={55} />
        <Tooltip content={<CustomTooltip />} />
        {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {bars.map((bar, i) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.label || bar.key}
            fill={bar.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
            radius={[3, 3, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function RenderLineChart({ data, xKey, lines = [] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: "#64748b" }} />
        <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={formatCOP} width={55} />
        <Tooltip content={<CustomTooltip />} />
        {lines.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {lines.map((line, i) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.label || line.key}
            stroke={line.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function RenderPieChart({ data, pieKey, pieValue }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey={pieValue}
          nameKey={pieKey}
          cx="50%"
          cy="50%"
          outerRadius={100}
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          labelLine={{ strokeWidth: 1 }}
          fontSize={10}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={DEFAULT_COLORS[i % DEFAULT_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function RenderComposedChart({ data, xKey, bars = [], lines = [] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: "#64748b" }} interval={0} angle={-25} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={formatCOP} width={55} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {bars.map((bar, i) => (
          <Bar
            key={bar.key}
            dataKey={bar.key}
            name={bar.label || bar.key}
            fill={bar.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
            radius={[3, 3, 0, 0]}
          />
        ))}
        {lines.map((line, i) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.label || line.key}
            stroke={line.color || DEFAULT_COLORS[(bars.length + i) % DEFAULT_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const CHART_RENDERERS = {
  bar: RenderBarChart,
  line: RenderLineChart,
  pie: RenderPieChart,
  composed: RenderComposedChart,
};

export default function ChatChart({ type, title, ...rest }) {
  const Renderer = CHART_RENDERERS[type];
  if (!Renderer || !rest.data?.length) return null;

  return (
    <div className="my-3 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
      {title && (
        <h4 className="text-xs font-bold text-slate-700 mb-2 px-1">{title}</h4>
      )}
      <Renderer {...rest} />
    </div>
  );
}
