import React, { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { Search, Filter, Users, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Card,
  ClientCard,
} from "../components/dashboard/DashboardShared";
import { PAGINATION } from "../utils/constants";

export default function ClientsPage() {
  const context = useOutletContext();
  const { data = {} } = context || {};

  const [expandedClient, setExpandedClient] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(PAGINATION.DEFAULT_PAGE_SIZE);

  const [filters, setFilters] = useState({
    search: "",
    status: "ALL",
    minDebt: "",
    maxDebt: "",
    minMora: "",
    maxMora: "",
  });

  // Filter clients
  const filteredClients = useMemo(() => {
    return (data.aggregatedClients || []).filter((client) => {
      // ... existing filter logic ...
      // Search by name
      if (
        filters.search &&
        !client.name?.toLowerCase().includes(filters.search.toLowerCase())
      )
        return false;

      // Filter by Status
      if (filters.status !== "ALL") {
        const isVencido = (client.maxMora || 0) > 0;
        if (filters.status === "VENCIDO" && !isVencido) return false;
        if (filters.status === "AL_DIA" && isVencido) return false;
      }

      // Filter by Debt
      const debt = client.deuda || 0;
      if (filters.minDebt && debt < Number(filters.minDebt)) return false;
      if (filters.maxDebt && debt > Number(filters.maxDebt)) return false;

      // Filter by Mora
      const mora = client.maxMora || 0;
      if (filters.minMora && mora < Number(filters.minMora)) return false;
      if (filters.maxMora && mora > Number(filters.maxMora)) return false;

      return true;
    });
  }, [data.aggregatedClients, filters]);

  // Reset pagination when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [filters, data.aggregatedClients]);

  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Users className="text-indigo-600" size={28} />
            Directorio de Clientes
          </h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">
            Administre su base de clientes y estados de cuenta individuales
          </p>
        </div>
        <div className="text-right flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Encontrados
          </span>
          <span className="text-lg font-black text-indigo-600 bg-indigo-50 px-3 py-0.5 rounded-lg border border-indigo-100">
            {filteredClients.length}
          </span>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 md:p-6 bg-white border-b border-slate-100 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative group">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              aria-label="Buscar cliente"
              className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50 transition-all"
            />
          </div>

          <div className="relative">
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, status: e.target.value }))
              }
              className="w-full py-2 pl-3 pr-10 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-slate-50 appearance-none cursor-pointer"
            >
              <option value="ALL">Todos los Estados</option>
              <option value="VENCIDO">Solo Vencidos</option>
              <option value="AL_DIA">Solo Al Día</option>
            </select>
            <Filter
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              size={14}
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 col-span-1 lg:col-span-2">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mr-2">
              Días Mora:
            </span>
            <input
              type="number"
              placeholder="Min"
              value={filters.minMora}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, minMora: e.target.value }))
              }
              aria-label="Dias mora minimo"
              className="w-full py-0 text-sm border-none bg-transparent focus:ring-0 text-slate-700 placeholder:text-slate-300 font-bold"
            />
            <span className="text-slate-300">—</span>
            <input
              type="number"
              placeholder="Max"
              value={filters.maxMora}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, maxMora: e.target.value }))
              }
              aria-label="Dias mora maximo"
              className="w-full py-0 text-sm border-none bg-transparent focus:ring-0 text-slate-700 placeholder:text-slate-300 font-bold"
            />
          </div>
        </div>
      </Card>

      {/* Client List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredClients.length > 0 ? (
          <>
            {filteredClients
              .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
              .map((client, idx) => (
                <ClientCard
                  key={`${client.name}-${client.items?.[0]?.tercero_nit || idx}`}
                  client={client}
                  isExpanded={expandedClient === client.name}
                  onExpand={() =>
                    setExpandedClient(
                      expandedClient === client.name ? null : client.name,
                    )
                  }
                />
              ))}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mt-8 pt-4 border-t border-slate-100 text-xs text-slate-500">
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
          </>
        ) : (
          <Card className="p-20 text-center bg-slate-50 border-dashed border-2 border-slate-200">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
              <Users size={32} />
            </div>
            <p className="text-slate-400 font-medium">
              No se encontraron clientes que coincidan con su búsqueda.
            </p>
            <button
              onClick={() =>
                setFilters({
                  search: "",
                  status: "ALL",
                  minDebt: "",
                  maxDebt: "",
                  minMora: "",
                  maxMora: "",
                })
              }
              className="mt-4 text-indigo-600 font-bold text-sm hover:underline"
            >
              Limpiar todos los filtros
            </button>
          </Card>
        )}
      </div>
    </div>
  );
}
