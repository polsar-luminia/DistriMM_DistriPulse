/**
 * @fileoverview Directorio de Clientes Page - Master data view.
 * Shows all imported client data with contact info, classification, geography.
 * Separate from the portfolio-based ClientsPage.
 * @module pages/DirectorioClientesPage
 */

import { useState, useMemo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  Users,
  Search,
  MapPin,
  Phone,
  Mail,
  Building2,
  User,
  Filter,
  BarChart3,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Globe,
  Briefcase,
} from "lucide-react";
import { Card, StatCard } from "../components/dashboard/DashboardShared";
import { useClientAnalytics } from "../hooks/useClientAnalytics";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { COLORS, PAGINATION } from "../utils/constants";
import { getVendedores } from "../services/portfolioService";

export default function DirectorioClientesPage() {
  const { clientes, stats, loading } = useClientAnalytics();

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTipo, setFilterTipo] = useState("ALL");
  const [filterMunicipio, setFilterMunicipio] = useState("ALL");
  const [expandedClient, setExpandedClient] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(PAGINATION.DEFAULT_PAGE_SIZE);
  const [filterTelefono, setFilterTelefono] = useState("ALL");
  const [filterVendedor, setFilterVendedor] = useState("ALL");
  const [vendedoresDB, setVendedoresDB] = useState([]);

  // Fetch vendedores for name resolution
  useEffect(() => {
    getVendedores().then(({ data }) => {
      if (data) setVendedoresDB(data);
    });
  }, []);

  const vendedorNombreMap = useMemo(() => {
    const map = {};
    vendedoresDB.forEach((v) => { map[v.codigo] = v.nombre; });
    return map;
  }, [vendedoresDB]);

  // Debounce search input by 300ms
  const debounceRef = useRef(null);
  useEffect(() => {
    debounceRef.current = setTimeout(() => setSearchQuery(searchInput), 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  // Get unique municipios for filter
  const municipios = useMemo(() => {
    const set = new Set(clientes.map((c) => c.municipio).filter(Boolean));
    return [...set].sort();
  }, [clientes]);

  // Filter
  const filtered = useMemo(() => {
    return clientes.filter((c) => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matches =
          (c.nombre_completo || "").toLowerCase().includes(q) ||
          (c.no_identif || "").includes(q) ||
          (c.celular || "").includes(q) ||
          (c.correo_electronico || "").toLowerCase().includes(q);
        if (!matches) return false;
      }

      // Tipo persona
      if (filterTipo !== "ALL") {
        if (filterTipo === "Juridica" && c.tipo_persona !== "Juridica") return false;
        if (filterTipo === "Natural" && c.tipo_persona !== "Natural") return false;
      }

      // Municipio
      if (filterMunicipio !== "ALL" && c.municipio !== filterMunicipio) return false;

      // Telefono/Celular
      if (filterTelefono === "SIN_CELULAR") {
        if (c.celular) return false;
      } else if (filterTelefono === "CON_CELULAR") {
        if (!c.celular) return false;
      } else if (filterTelefono === "SIN_NINGUNO") {
        if (c.celular || c.telefono_1 || c.telefono_2) return false;
      }

      // Vendedor
      if (filterVendedor !== "ALL") {
        if (filterVendedor === "SIN" && c.vendedor_codigo) return false;
        if (filterVendedor !== "SIN" && c.vendedor_codigo !== filterVendedor) return false;
      }

      return true;
    });
  }, [clientes, searchQuery, filterTipo, filterMunicipio, filterTelefono, filterVendedor]);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterTipo, filterMunicipio, filterTelefono, filterVendedor]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedClients = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  // Chart data
  const tipoPersonaData = [
    { name: "Juridica", value: stats.juridicas, color: COLORS.CHART.SECONDARY },
    { name: "Natural", value: stats.naturales, color: COLORS.CHART.PRIMARY },
  ].filter((d) => d.value > 0);

  const topMunicipiosChart = stats.topMunicipios.slice(0, 8).map((m, i) => ({
    ...m,
    color: COLORS.CHART.PALETTE[i % COLORS.CHART.PALETTE.length],
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Building2 className="text-indigo-600" size={28} />
            Directorio de Clientes
          </h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">
            Maestro de terceros - datos de contacto, clasificacion y geografia
          </p>
        </div>
        <div className="text-right flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Total
          </span>
          <span className="text-lg font-black text-indigo-600 bg-indigo-50 px-3 py-0.5 rounded-lg border border-indigo-100">
            {stats.total}
          </span>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Clientes"
          value={stats.total}
          icon={Users}
          type="info"
        />
        <StatCard
          title="Personas Juridicas"
          value={stats.juridicas}
          icon={Building2}
          type="neutral"
          subtext={`${stats.total > 0 ? ((stats.juridicas / stats.total) * 100).toFixed(0) : 0}% del total`}
        />
        <StatCard
          title="Con Celular"
          value={`${stats.coberturaCelular}%`}
          icon={Phone}
          type={Number(stats.coberturaCelular) > 70 ? "success" : "warning"}
          subtext={`${stats.conCelular} de ${stats.total}`}
        />
        <StatCard
          title="Con Correo"
          value={`${stats.coberturaCorreo}%`}
          icon={Mail}
          type={Number(stats.coberturaCorreo) > 50 ? "success" : "warning"}
          subtext={`${stats.conCorreo} de ${stats.total}`}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tipo Persona Pie */}
        <Card className="p-4 md:p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Users size={16} className="text-indigo-600" />
            Tipo de Persona
          </h3>
          {tipoPersonaData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={tipoPersonaData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  paddingAngle={3}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {tipoPersonaData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-slate-400">
              Sin datos
            </div>
          )}
        </Card>

        {/* Top Municipios Bar */}
        <Card className="p-4 md:p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <MapPin size={16} className="text-indigo-600" />
            Top Municipios
          </h3>
          {topMunicipiosChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topMunicipiosChart} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#94A3B8" }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 10, fontWeight: 600, fill: COLORS.CHART.NEUTRAL }}
                />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {topMunicipiosChart.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-slate-400">
              Sin datos
            </div>
          )}
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="relative md:col-span-2 lg:col-span-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              type="text"
              placeholder="Buscar por nombre, NIT, celular, correo..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Buscar cliente en directorio"
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-slate-50"
            />
          </div>

          <select
            value={filterTipo}
            onChange={(e) => setFilterTipo(e.target.value)}
            className="py-2 pl-3 pr-10 text-sm border border-slate-200 rounded-lg bg-slate-50 cursor-pointer"
          >
            <option value="ALL">Todos los Tipos</option>
            <option value="Juridica">Persona Juridica</option>
            <option value="Natural">Persona Natural</option>
          </select>

          <select
            value={filterMunicipio}
            onChange={(e) => setFilterMunicipio(e.target.value)}
            className="py-2 pl-3 pr-10 text-sm border border-slate-200 rounded-lg bg-slate-50 cursor-pointer"
          >
            <option value="ALL">Todos los Municipios</option>
            {municipios.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={filterVendedor}
            onChange={(e) => setFilterVendedor(e.target.value)}
            className="py-2 pl-3 pr-10 text-sm border border-slate-200 rounded-lg bg-slate-50 cursor-pointer"
          >
            <option value="ALL">Todos los Vendedores</option>
            <option value="SIN">Sin Vendedor Asignado</option>
            {vendedoresDB.map((v) => (
              <option key={v.codigo} value={v.codigo}>
                {v.nombre} ({v.codigo})
              </option>
            ))}
          </select>

          <select
            value={filterTelefono}
            onChange={(e) => setFilterTelefono(e.target.value)}
            className="py-2 pl-3 pr-10 text-sm border border-slate-200 rounded-lg bg-slate-50 cursor-pointer"
          >
            <option value="ALL">Todos (contacto)</option>
            <option value="SIN_CELULAR">Sin celular</option>
            <option value="CON_CELULAR">Con celular</option>
            <option value="SIN_NINGUNO">Sin ningun telefono</option>
          </select>
        </div>
      </Card>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400 font-bold">
          Mostrando {paginatedClients.length} de {filtered.length} clientes
        </span>
      </div>

      {/* Client List */}
      <div className="space-y-3">
        {paginatedClients.length > 0 ? (
          paginatedClients.map((client) => (
            <ClientMasterCard
              key={client.id}
              client={client}
              isExpanded={expandedClient === client.id}
              onExpand={() =>
                setExpandedClient(
                  expandedClient === client.id ? null : client.id,
                )
              }
              vendedorNombre={vendedorNombreMap[client.vendedor_codigo]}
            />
          ))
        ) : (
          <Card className="p-20 text-center bg-slate-50 border-dashed border-2 border-slate-200">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
              <Users size={32} />
            </div>
            <p className="text-slate-400 font-medium">
              {clientes.length === 0
                ? "No hay clientes cargados. Sube un archivo de Clientes desde el boton Cargar."
                : "No se encontraron clientes con esos filtros."}
            </p>
          </Card>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-medium text-[10px] uppercase tracking-wide">Filas:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="bg-white border border-slate-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-300 outline-none"
            >
              {PAGINATION.PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="font-mono text-[11px] font-medium">
              {currentPage} / {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- CLIENT MASTER CARD ---
function ClientMasterCard({ client: c, isExpanded, onExpand, vendedorNombre }) {
  const isJuridica = c.tipo_persona === "Juridica";

  return (
    <Card
      className={cn("overflow-hidden transition-all", isExpanded && "ring-2 ring-indigo-100")}
    >
      <div
        className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 cursor-pointer"
        onClick={onExpand}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn("p-2.5 rounded-full", isJuridica ? "bg-indigo-50 text-indigo-600" : "bg-emerald-50 text-emerald-600")}
          >
            {isJuridica ? <Building2 size={20} /> : <User size={20} />}
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm leading-tight">
              {c.nombre_completo || "Sin Nombre"}
            </h3>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[10px] font-mono text-slate-400">
                NIT: {c.no_identif}
              </span>
              <span
                className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", isJuridica ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700")}
              >
                {c.tipo_persona || "N/A"}
              </span>
              {c.municipio && (
                <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                  <MapPin size={10} /> {c.municipio}
                </span>
              )}
              {vendedorNombre ? (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 flex items-center gap-0.5">
                  <Briefcase size={10} /> {vendedorNombre}
                </span>
              ) : (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">
                  Sin vendedor
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {c.celular && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Phone size={12} className="text-emerald-500" /> {c.celular}
            </span>
          )}
          {c.correo_electronico && (
            <span className="text-xs text-slate-500 flex items-center gap-1 truncate max-w-[200px]">
              <Mail size={12} className="text-blue-500" /> {c.correo_electronico}
            </span>
          )}
          <div className="p-1 text-slate-300">
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <InfoRow label="Identificacion" value={`${c.tipo_ident}: ${c.no_identif}`} />
            <InfoRow label="Direccion" value={c.direccion} />
            <InfoRow label="Barrio" value={c.barrio} />
            <InfoRow label="Municipio" value={c.municipio} />
            <InfoRow label="Telefono 1" value={c.telefono_1} />
            <InfoRow label="Telefono 2" value={c.telefono_2} />
            <InfoRow label="Celular" value={c.celular} />
            <InfoRow label="Correo" value={c.correo_electronico} />
            <InfoRow label="Pagina Web" value={c.pagina_web} />
            <InfoRow label="Clasificacion IVA" value={c.clasificacion_iva} />
            <InfoRow label="Profesion" value={c.profesion} />
            <InfoRow label="Actividad" value={c.actividad} />
            <InfoRow label="Estado Civil" value={c.estado_civil} />
            <InfoRow label="Genero" value={c.genero} />
            <InfoRow
              label="Fecha Nacimiento"
              value={c.fecha_nacimiento ? new Date(c.fecha_nacimiento).toLocaleDateString("es-CO") : null}
            />
            <InfoRow label="Cupo Venta" value={c.cupo_venta > 0 ? `$${Number(c.cupo_venta).toLocaleString("es-CO")}` : null} />
            <InfoRow label="Cupo Compra" value={c.cupo_compra > 0 ? `$${Number(c.cupo_compra).toLocaleString("es-CO")}` : null} />
            <InfoRow label="Vendedor" value={vendedorNombre ? `${vendedorNombre} (${c.vendedor_codigo})` : c.vendedor_codigo ? `Cod. ${c.vendedor_codigo}` : null} />
            <InfoRow label="Cobrador" value={c.cobrador_codigo ? `Cod. ${c.cobrador_codigo}` : null} />
            {c.comentario && (
              <div className="col-span-full">
                <InfoRow label="Comentario" value={c.comentario} />
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
        {label}
      </p>
      <p className="text-sm text-slate-700 font-medium mt-0.5">{value}</p>
    </div>
  );
}
