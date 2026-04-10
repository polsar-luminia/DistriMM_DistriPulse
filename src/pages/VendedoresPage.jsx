import { useState, useMemo, useEffect, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Briefcase,
  Search,
  TrendingUp,
  AlertTriangle,
  Users,
  DollarSign,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Edit3,
  Check,
  X,
  FileText,
  Loader2,
} from "lucide-react";
import {
  Card,
  StatCard,
  formatCurrency,
  formatFullCurrency,
} from "../components/dashboard/DashboardShared";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { COLORS } from "../utils/constants";
import { HEALTH_SCORE_TIERS, AGING_BUCKETS } from "../constants/thresholds";
import {
  getVendedores,
  updateVendedorName,
} from "../services/portfolioService";
import { supabase, fetchAllRows } from "../lib/supabase";
import { sileo } from "sileo";
import ReportCarteraModal from "../components/cartera/ReportCarteraModal";

export default function VendedoresPage() {
  const context = useOutletContext();
  const { data = {}, showExactNumbers = false } = context || {};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = data.allItems || data.items || [];

  const [searchQuery, setSearchQuery] = useState("");
  const [expandedVendedor, setExpandedVendedor] = useState(null);
  const [sortBy, setSortBy] = useState("totalCartera"); // totalCartera | totalVencida | clientesCount | pctVencida
  const [vendedoresDB, setVendedoresDB] = useState([]);
  const [nitVendedorMap, setNitVendedorMap] = useState({});
  const [showReportModal, setShowReportModal] = useState(false);
  const [clientesDataMap, setClientesDataMap] = useState({});
  const [loadingVendedores, setLoadingVendedores] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingVendedores(true);
    getVendedores()
      .then(({ data }) => {
        if (!cancelled && data) setVendedoresDB(data);
      })
      .catch(() => {});
    // Build NIT→vendedor map from clientes + ventas (paginado para >1000 rows)
    Promise.all([
      fetchAllRows((from, to) =>
        supabase
          .from("distrimm_clientes")
          .select("no_identif, vendedor_codigo")
          .not("vendedor_codigo", "is", null)
          .range(from, to),
      ),
      fetchAllRows((from, to) =>
        supabase
          .from("distrimm_comisiones_ventas")
          .select("cliente_nit, vendedor_codigo")
          .not("vendedor_codigo", "is", null)
          .range(from, to),
      ),
    ])
      .then(([clientesData, ventasData]) => {
        if (cancelled) return;
        const map = {};
        // Ventas first (lower priority), clientes overwrites (higher priority)
        ventasData.forEach((v) => {
          map[v.cliente_nit] = v.vendedor_codigo;
        });
        clientesData.forEach((c) => {
          map[c.no_identif] = c.vendedor_codigo;
        });
        setNitVendedorMap(map);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingVendedores(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAllRows((from, to) =>
      supabase
        .from("distrimm_clientes")
        .select(
          "no_identif, nombre_completo, celular, telefono_1, direccion, barrio, municipio, vendedor_codigo",
        )
        .range(from, to),
    )
      .then((data) => {
        if (!cancelled && data) {
          const map = {};
          data.forEach((c) => {
            map[c.no_identif] = c;
          });
          setClientesDataMap(map);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const nombreMap = useMemo(() => {
    const map = {};
    vendedoresDB.forEach((v) => {
      map[v.codigo] = v.nombre;
    });
    return map;
  }, [vendedoresDB]);

  const handleNameSave = useCallback(async (codigo, newName) => {
    const { error } = await updateVendedorName(codigo, newName);
    if (error) {
      sileo.error("No se pudo guardar el nombre");
      return false;
    }
    setVendedoresDB((prev) =>
      prev.map((v) => (v.codigo === codigo ? { ...v, nombre: newName } : v)),
    );
    sileo.success("Nombre actualizado");
    return true;
  }, []);

  // Aggregate data by vendedor
  const vendedoresData = useMemo(() => {
    const map = {};

    items.forEach((item) => {
      const codigo =
        item.vendedor_codigo ||
        nitVendedorMap[item.tercero_nit] ||
        "Sin Asignar";

      if (!map[codigo]) {
        map[codigo] = {
          codigo,
          nombre: nombreMap[codigo] || `Vendedor ${codigo}`,
          totalCartera: 0,
          totalVencida: 0,
          totalAlDia: 0,
          facturas: 0,
          facturasVencidas: 0,
          clientes: new Set(),
          clientesVencidos: new Set(),
          maxMora: 0,
          items: [],
          // Aging buckets
          alDia: 0,
          dias1_30: 0,
          dias31_60: 0,
          dias61_90: 0,
          dias90plus: 0,
        };
      }

      const v = map[codigo];
      const saldo = Number(item.valor_saldo) || 0;
      const mora = Number(item.dias_mora) || 0;

      v.totalCartera += saldo;
      v.facturas += 1;
      v.clientes.add(item.cliente_nombre);
      v.items.push(item);

      if (mora > 0) {
        v.totalVencida += saldo;
        v.facturasVencidas += 1;
        v.clientesVencidos.add(item.cliente_nombre);
      } else {
        v.totalAlDia += saldo;
      }

      if (mora > v.maxMora) v.maxMora = mora;

      // Aging
      if (mora <= 0) v.alDia += saldo;
      else if (mora <= AGING_BUCKETS.BUCKET_30) v.dias1_30 += saldo;
      else if (mora <= AGING_BUCKETS.BUCKET_60) v.dias31_60 += saldo;
      else if (mora <= AGING_BUCKETS.BUCKET_90) v.dias61_90 += saldo;
      else v.dias90plus += saldo;
    });

    return Object.values(map)
      .map((v) => {
        // A vendor has a "real name" if it comes from DB and isn't just "Vendedor X"
        const hasRealName =
          v.codigo !== "Sin Asignar" &&
          nombreMap[v.codigo] &&
          !/^Vendedor\s+\d+$/i.test(nombreMap[v.codigo]);
        return {
          ...v,
          hasRealName,
          clientesCount: v.clientes.size,
          clientesVencidosCount: v.clientesVencidos.size,
          pctVencida:
            v.totalCartera > 0 ? (v.totalVencida / v.totalCartera) * 100 : 0,
          healthScore:
            v.totalCartera > 0
              ? 100 - (v.totalVencida / v.totalCartera) * 100
              : 100,
          clientes: undefined,
          clientesVencidos: undefined,
        };
      })
      .sort((a, b) => {
        // Real names first, then unnamed/sin asignar at the bottom
        if (a.hasRealName !== b.hasRealName) return a.hasRealName ? -1 : 1;
        return b[sortBy] - a[sortBy];
      });
  }, [items, sortBy, nombreMap, nitVendedorMap]);

  // Filter
  const filtered = useMemo(() => {
    if (!searchQuery) return vendedoresData;
    const q = searchQuery.toLowerCase();
    return vendedoresData.filter(
      (v) =>
        v.codigo.toLowerCase().includes(q) ||
        v.nombre.toLowerCase().includes(q),
    );
  }, [vendedoresData, searchQuery]);

  // Chart data for top vendedores
  const chartData = useMemo(() => {
    return vendedoresData.slice(0, 8).map((v) => ({
      name: v.nombre.length > 12 ? v.nombre.slice(0, 10) + "…" : v.nombre,
      "Al Dia": v.totalAlDia,
      Vencida: v.totalVencida,
      fullName: v.nombre,
    }));
  }, [vendedoresData]);

  // Pie chart data for distribution
  const pieData = useMemo(() => {
    return vendedoresData.slice(0, 6).map((v, i) => ({
      name: v.nombre.length > 12 ? v.nombre.slice(0, 10) + "…" : v.nombre,
      value: v.totalCartera,
      color: COLORS.CHART.PALETTE[i % COLORS.CHART.PALETTE.length],
    }));
  }, [vendedoresData]);

  // Global KPIs
  const totalCartera = vendedoresData.reduce((s, v) => s + v.totalCartera, 0);
  const totalVencida = vendedoresData.reduce((s, v) => s + v.totalVencida, 0);
  const vendedoresActivos = vendedoresData.filter(
    (v) => v.codigo !== "Sin Asignar",
  ).length;
  const vendedorConMasRiesgo = vendedoresData.reduce(
    (max, v) =>
      v.pctVencida > (max?.pctVencida || 0) && v.codigo !== "Sin Asignar"
        ? v
        : max,
    null,
  );

  const fmt = showExactNumbers ? formatFullCurrency : formatCurrency;

  if (loadingVendedores) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="text-indigo-600 animate-spin" />
        <span className="ml-3 text-sm text-slate-500 font-medium">
          Cargando vendedores...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Briefcase className="text-indigo-600" size={28} />
            Vendedores
          </h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">
            Desempeno de la fuerza de ventas y distribucion de cartera
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowReportModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <FileText size={16} />
            Generar Informe
          </button>
          <div className="text-right flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Vendedores
            </span>
            <span className="text-lg font-black text-indigo-600 bg-indigo-50 px-3 py-0.5 rounded-lg border border-indigo-100">
              {vendedoresActivos}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Cartera Total"
          value={fmt(totalCartera)}
          icon={DollarSign}
          type="info"
        />
        <StatCard
          title="Total Vencida"
          value={fmt(totalVencida)}
          icon={AlertTriangle}
          type="danger"
          subtext={`${totalCartera > 0 ? ((totalVencida / totalCartera) * 100).toFixed(1) : 0}% del total`}
        />
        <StatCard
          title="Vendedores Activos"
          value={vendedoresActivos}
          icon={Users}
          type="success"
        />
        <StatCard
          title="Mayor Riesgo"
          value={vendedorConMasRiesgo ? vendedorConMasRiesgo.nombre : "-"}
          icon={TrendingUp}
          type="warning"
          subtext={
            vendedorConMasRiesgo
              ? `${vendedorConMasRiesgo.pctVencida.toFixed(1)}% vencida`
              : ""
          }
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart: Cartera por Vendedor */}
        <Card className="p-4 md:p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <BarChart3 size={16} className="text-indigo-600" />
            Cartera por Vendedor
          </h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis
                  dataKey="name"
                  tick={{
                    fontSize: 11,
                    fontWeight: 700,
                    fill: COLORS.CHART.NEUTRAL,
                  }}
                />
                <YAxis
                  tickFormatter={(v) => formatCurrency(v)}
                  tick={{ fontSize: 10, fill: "#94A3B8" }}
                  width={100}
                />
                <Tooltip
                  formatter={(value) => formatFullCurrency(value)}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid #E2E8F0",
                  }}
                />
                <Bar
                  dataKey="Al Dia"
                  fill={COLORS.CHART.PRIMARY}
                  radius={[4, 4, 0, 0]}
                  stackId="stack"
                />
                <Bar
                  dataKey="Vencida"
                  fill={COLORS.CHART.DANGER}
                  radius={[4, 4, 0, 0]}
                  stackId="stack"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-slate-400">
              Sin datos
            </div>
          )}
        </Card>

        {/* Pie Chart: Distribucion */}
        <Card className="p-4 md:p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <DollarSign size={16} className="text-indigo-600" />
            Distribucion de Cartera
          </h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={50}
                  paddingAngle={2}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {pieData.map((entry) => (
                    <Cell key={`cell-${entry.name}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatFullCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-slate-400">
              Sin datos
            </div>
          )}
        </Card>
      </div>

      {/* Search & Sort */}
      <Card className="p-4 bg-white">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              type="text"
              placeholder="Buscar vendedor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Buscar vendedor"
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-bold">Ordenar:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="py-2 pl-3 pr-8 text-xs font-bold border border-slate-200 rounded-lg bg-slate-50 cursor-pointer"
            >
              <option value="totalCartera">Mayor Cartera</option>
              <option value="totalVencida">Mayor Vencida</option>
              <option value="pctVencida">% Vencida</option>
              <option value="clientesCount">Mas Clientes</option>
              <option value="maxMora">Mayor Mora</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Vendedor Cards */}
      <div className="space-y-4">
        {filtered.length > 0 ? (
          filtered.map((v) => (
            <VendedorCard
              key={v.codigo}
              vendedor={v}
              isExpanded={expandedVendedor === v.codigo}
              onExpand={() =>
                setExpandedVendedor(
                  expandedVendedor === v.codigo ? null : v.codigo,
                )
              }
              fmt={fmt}
              onNameSave={handleNameSave}
            />
          ))
        ) : (
          <Card className="p-20 text-center bg-slate-50 border-dashed border-2 border-slate-200">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
              <Briefcase size={32} />
            </div>
            <p className="text-slate-400 font-medium">
              No se encontraron vendedores.
            </p>
          </Card>
        )}
      </div>

      <ReportCarteraModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        items={items}
        vendedorNombreMap={nombreMap}
        nitVendedorMap={nitVendedorMap}
        clientesDataMap={clientesDataMap}
      />
    </div>
  );
}

function VendedorCard({ vendedor: v, isExpanded, onExpand, fmt, onNameSave }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");

  const startEdit = (e) => {
    e.stopPropagation();
    setEditName(v.nombre);
    setEditing(true);
  };

  const cancelEdit = (e) => {
    e.stopPropagation();
    setEditing(false);
  };

  const saveEdit = async (e) => {
    e.stopPropagation();
    const trimmed = editName.trim();
    if (!trimmed || trimmed === v.nombre) {
      setEditing(false);
      return;
    }
    const ok = await onNameSave(v.codigo, trimmed);
    if (ok) setEditing(false);
  };

  // Aggregate items by client for the top clients table
  const topClients = useMemo(() => {
    const clientMap = {};
    v.items.forEach((item) => {
      const name = item.cliente_nombre;
      if (!clientMap[name]) {
        clientMap[name] = { name, saldo: 0, count: 0, maxMora: 0 };
      }
      clientMap[name].saldo += Number(item.valor_saldo) || 0;
      clientMap[name].count += 1;
      const m = Number(item.dias_mora) || 0;
      if (m > clientMap[name].maxMora) clientMap[name].maxMora = m;
    });
    return Object.values(clientMap)
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, 10);
  }, [v.items]);
  const healthColor =
    v.healthScore >= HEALTH_SCORE_TIERS.GOOD
      ? "emerald"
      : v.healthScore >= HEALTH_SCORE_TIERS.WARNING
        ? "amber"
        : "rose";
  const healthIconClass =
    healthColor === "emerald"
      ? "bg-emerald-50 text-emerald-600"
      : healthColor === "amber"
        ? "bg-amber-50 text-amber-600"
        : "bg-rose-50 text-rose-600";
  const healthBadgeClass =
    healthColor === "emerald"
      ? "bg-emerald-100 text-emerald-700"
      : healthColor === "amber"
        ? "bg-amber-100 text-amber-700"
        : "bg-rose-100 text-rose-700";

  const agingData = [
    { label: "Al Dia", value: v.alDia, color: "bg-emerald-500" },
    { label: "1-30d", value: v.dias1_30, color: "bg-yellow-400" },
    { label: "31-60d", value: v.dias31_60, color: "bg-amber-500" },
    { label: "61-90d", value: v.dias61_90, color: "bg-red-500" },
    { label: "+90d", value: v.dias90plus, color: "bg-red-900" },
  ];

  return (
    <Card
      className={cn(
        "overflow-hidden transition-all",
        isExpanded && "ring-2 ring-indigo-100",
      )}
    >
      {/* Header */}
      <div
        className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 cursor-pointer"
        onClick={onExpand}
      >
        <div className="flex items-center gap-4">
          <div className={cn("p-3 rounded-full", healthIconClass)}>
            <Briefcase size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(e);
                      if (e.key === "Escape") cancelEdit(e);
                    }}
                    className="text-lg font-bold text-slate-900 border border-indigo-300 rounded px-2 py-0.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                    autoFocus
                  />
                  <button
                    onClick={saveEdit}
                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                    title="Guardar"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                    title="Cancelar"
                  >
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <h3 className="font-bold text-slate-900 text-lg">
                    {v.nombre}
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    ({v.codigo})
                  </span>
                  <button
                    onClick={startEdit}
                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                    title="Editar nombre"
                  >
                    <Edit3 size={14} />
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-slate-500">
                {v.clientesCount} clientes
              </span>
              <span className="text-xs text-slate-500">
                {v.facturas} facturas
              </span>
              <span
                className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full",
                  healthBadgeClass,
                )}
              >
                Salud: {v.healthScore.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-end md:items-center gap-3 md:gap-8">
          <div className="text-right">
            <p className="text-xs text-slate-400 font-bold uppercase">
              Cartera
            </p>
            <p className="text-xl font-black text-slate-800">
              {fmt(v.totalCartera)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400 font-bold uppercase">
              Vencida
            </p>
            <p className="text-lg font-bold text-rose-600">
              {fmt(v.totalVencida)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400 font-bold uppercase">
              % Vencida
            </p>
            <p
              className={cn(
                "text-lg font-bold",
                v.pctVencida > 30
                  ? "text-rose-600"
                  : v.pctVencida > 15
                    ? "text-amber-600"
                    : "text-emerald-600",
              )}
            >
              {v.pctVencida.toFixed(1)}%
            </p>
          </div>
          <div className="p-1 text-slate-300">
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
          {/* Aging Bar */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">
              Distribucion por Antiguedad
            </p>
            <div className="flex rounded-lg overflow-hidden h-5">
              {agingData
                .filter((b) => b.value > 0)
                .map((b) => (
                  <div
                    key={b.label}
                    className={cn(b.color, "relative group")}
                    style={{
                      width: `${v.totalCartera > 0 ? (b.value / v.totalCartera) * 100 : 0}%`,
                    }}
                    title={`${b.label}: ${formatFullCurrency(b.value)}`}
                  >
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      {b.label}
                    </span>
                  </div>
                ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {agingData.map((b) => (
                <div key={b.label} className="flex items-center gap-1">
                  <div className={cn("w-2 h-2 rounded-full", b.color)} />
                  <span className="text-[10px] text-slate-500">
                    {b.label}: {formatCurrency(b.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Clients for this vendedor */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">
              Top Clientes
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2">Cliente</th>
                    <th className="px-4 py-2 text-right">Saldo</th>
                    <th className="px-4 py-2 text-right">Facturas</th>
                    <th className="px-4 py-2 text-right">Max Mora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topClients.map((c) => (
                    <tr key={c.name} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-medium text-slate-800 truncate max-w-[200px]">
                        {c.name}
                      </td>
                      <td className="px-4 py-2 text-right font-bold">
                        {formatFullCurrency(c.saldo)}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-500">
                        {c.count}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2 text-right font-bold",
                          c.maxMora > 30
                            ? "text-rose-600"
                            : c.maxMora > 0
                              ? "text-amber-600"
                              : "text-emerald-600",
                        )}
                      >
                        {c.maxMora > 0 ? `${c.maxMora}d` : "Al dia"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
