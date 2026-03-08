import React from "react";
import {
  Filter,
  ChevronRight,
  ChevronLeft,
  Search as SearchIcon,
  BarChart3,
} from "lucide-react";
import { formatDateUTC } from "../../utils/formatters";
import { formatFullCurrency } from "../../utils/formatters";
import { Card, SortableHeader } from "./DashboardShared";
import { SectionTitle } from "./DashboardWidgets";
import { useTableContext } from "./TableContext";

export default function DetailedTableSection() {
  const {
    filteredItems,
    paginatedItems,
    allItems,
    filters,
    setFilters,
    sortConfig,
    setSortConfig,
    currentPage,
    setCurrentPage,
    totalPages,
    handlePageChange,
    itemsPerPage,
    setItemsPerPage,
  } = useTableContext();

  return (
    <section id="detailed-table" className="animate-fade-up stagger-4">
      <SectionTitle icon={BarChart3} iconColor="bg-navy-100 text-navy-500">
        Gestión Detallada de Facturas
      </SectionTitle>

      <Card className="overflow-hidden !p-0">
        {/* Toolbar */}
        <div className="p-4 bg-white border-b border-navy-100 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div className="flex flex-col md:flex-row gap-2.5 w-full xl:w-auto">
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar por nombre o ID..."
                className="pl-8 pr-3 py-2 text-xs border border-navy-100 rounded-lg focus:ring-1 focus:ring-sky-300 focus:border-sky-300 w-full md:w-56 bg-navy-50/40 text-navy-800 placeholder:text-navy-300 transition-all outline-none"
                value={filters?.searchQuery || ""}
                onChange={(e) =>
                  setFilters?.((prev) => ({
                    ...prev,
                    searchQuery: e.target.value,
                  }))
                }
              />
              <SearchIcon
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-300"
                size={14}
              />
            </div>
            <div className="relative">
              <select
                className="py-2 pl-3 pr-7 text-xs border border-navy-100 rounded-lg focus:ring-1 focus:ring-sky-300 bg-navy-50/40 appearance-none cursor-pointer min-w-[140px] text-navy-700 outline-none"
                value={filters?.status || "all"}
                onChange={(e) =>
                  setFilters?.((prev) => ({
                    ...prev,
                    status: e.target.value,
                  }))
                }
              >
                <option value="all">Todos</option>
                <option value="vencida">Solo Vencidas</option>
                <option value="al_dia">Al Día</option>
              </select>
              <Filter
                size={12}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-navy-300 pointer-events-none"
              />
            </div>
            {/* Days overdue dropdown */}
            <div className="relative">
              <select
                className="py-2 pl-3 pr-7 text-xs border border-navy-100 rounded-lg focus:ring-1 focus:ring-sky-300 bg-navy-50/40 appearance-none cursor-pointer min-w-[120px] text-navy-700 outline-none"
                value={filters?.daysOverdue || "all"}
                onChange={(e) =>
                  setFilters?.((prev) => ({
                    ...prev,
                    daysOverdue: e.target.value,
                  }))
                }
              >
                <option value="all">Mora: Todos</option>
                <option value="0-30">0-30 días</option>
                <option value="30-60">30-60 días</option>
                <option value="60-90">60-90 días</option>
                <option value="90+">90+ días</option>
              </select>
              <Filter
                size={12}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-navy-300 pointer-events-none"
              />
            </div>
            {/* Mora min/max inputs */}
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                placeholder="Min"
                className="py-2 px-2.5 text-xs border border-navy-100 rounded-lg focus:ring-1 focus:ring-sky-300 bg-navy-50/40 w-[70px] text-navy-700 outline-none placeholder:text-navy-300 font-mono"
                value={filters?.moraMin ?? ""}
                onChange={(e) =>
                  setFilters?.((prev) => ({
                    ...prev,
                    moraMin: e.target.value,
                  }))
                }
              />
              <span className="text-[10px] text-navy-300 font-medium">-</span>
              <input
                type="number"
                placeholder="Max"
                className="py-2 px-2.5 text-xs border border-navy-100 rounded-lg focus:ring-1 focus:ring-sky-300 bg-navy-50/40 w-[70px] text-navy-700 outline-none placeholder:text-navy-300 font-mono"
                value={filters?.moraMax ?? ""}
                onChange={(e) =>
                  setFilters?.((prev) => ({
                    ...prev,
                    moraMax: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-navy-300 uppercase tracking-wide">
              Resultados
            </span>
            <span className="text-sm font-bold font-mono text-sky-600 bg-sky-50 px-2.5 py-0.5 rounded-md">
              {filteredItems.length}
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto min-h-[280px]">
          <table className="w-full min-w-[800px] text-sm text-left">
            <thead className="bg-navy-50/40 border-b border-navy-100">
              <tr>
                <SortableHeader
                  label="Cliente"
                  sortKey="cliente_nombre"
                  currentSort={sortConfig}
                  onSort={setSortConfig}
                />
                <SortableHeader
                  label="Emisión"
                  sortKey="fecha_emision"
                  currentSort={sortConfig}
                  onSort={setSortConfig}
                />
                <SortableHeader
                  label="Vencimiento"
                  sortKey="fecha_vencimiento"
                  currentSort={sortConfig}
                  onSort={setSortConfig}
                />
                <SortableHeader
                  label="Estado"
                  sortKey="estado"
                  currentSort={sortConfig}
                  onSort={setSortConfig}
                />
                <SortableHeader
                  label="Mora"
                  sortKey="dias_mora"
                  align="right"
                  currentSort={sortConfig}
                  onSort={setSortConfig}
                />
                <SortableHeader
                  label="Saldo"
                  sortKey="valor_saldo"
                  align="right"
                  currentSort={sortConfig}
                  onSort={setSortConfig}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-50 bg-white">
              {paginatedItems.map((item) => (
                <tr
                  key={item.documento_id || item.id || `${item.tercero_nit}-${item.documento}`}
                  className="hover:bg-navy-50/30 transition-colors"
                >
                  <td
                    className="px-4 py-3 font-medium text-navy-800 truncate max-w-[200px]"
                    title={item.cliente_nombre}
                  >
                    {item.cliente_nombre}
                    <div className="text-[9px] text-navy-300 font-mono mt-0.5">
                      {item.documento_id}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-navy-500">
                    {formatDateUTC(item.fecha_emision)}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-navy-500">
                    {formatDateUTC(item.fecha_vencimiento)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                        item.dias_mora > 0
                          ? "bg-rose-50 text-rose-500"
                          : "bg-emerald-50 text-emerald-600"
                      }`}
                    >
                      {item.dias_mora > 0 ? "VENCIDA" : "AL DÍA"}
                    </span>
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono text-xs font-semibold ${
                      item.dias_mora > 0 ? "text-rose-500" : "text-navy-300"
                    }`}
                  >
                    {item.dias_mora > 0 ? `${item.dias_mora}d` : "-"}
                  </td>
                  <td className="px-4 py-3 text-right font-bold font-mono text-navy-700 text-xs">
                    {formatFullCurrency(item.valor_saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {allItems.length > 0 && (
          <div className="p-3 bg-navy-50/40 border-t border-navy-100 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-navy-500">
            <div className="flex items-center gap-2">
              <span className="font-medium text-[10px] uppercase tracking-wide">
                Filas:
              </span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white border border-navy-100 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-sky-300 outline-none"
              >
                <option value={10}>10</option>
                <option value={50}>50</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <button
                disabled={currentPage === 1}
                onClick={() => handlePageChange(currentPage - 1)}
                className="p-1.5 bg-white border border-navy-100 rounded-md hover:bg-navy-50 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="font-mono text-[11px] font-medium">
                {currentPage} / {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
                className="p-1.5 bg-white border border-navy-100 rounded-md hover:bg-navy-50 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
