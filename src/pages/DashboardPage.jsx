import { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  DollarSign,
  AlertOctagon,
  ShieldAlert,
  TrendingUp,
  Users,
  Zap,
  Clock,
  FileText,
  Target,
  Scale,
} from "lucide-react";
import { formatDateUTC } from "../utils/formatters";
import {
  Card,
  StatCard,
  formatCurrency,
  formatFullCurrency,
} from "../components/dashboard/DashboardShared";
import HistoricalEvolution from "../components/dashboard/HistoricalEvolution";
import {
  SectionTitle,
  MetricCard,
  ParetoModal,
  UnrecoverableModal,
} from "../components/dashboard/DashboardWidgets";
import HealthRiskSection from "../components/dashboard/HealthRiskSection";
import DetailedTableSection from "../components/dashboard/DetailedTableSection";
import { TableProvider } from "../components/dashboard/TableContext";
import DataFreshnessBadge from "../components/dashboard/DataFreshnessBadge";
import VendedoresKpiCards from "../components/dashboard/VendedoresKpiCards";
import CfoHealthWidget from "../components/dashboard/CfoHealthWidget";

export default function DashboardPage() {
  const context = useOutletContext();
  const {
    data: dashboardData = {},
    loading,
    filters,
    setFilters,
    sortConfig,
    setSortConfig,
    upcomingDays,
    setUpcomingDays,
    showExactNumbers = false,
  } = context || {};

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [isParetoModalOpen, setIsParetoModalOpen] = useState(false);
  const [isUnrecoverableModalOpen, setIsUnrecoverableModalOpen] =
    useState(false);
  const formatMoney = (val) =>
    showExactNumbers ? formatFullCurrency(val) : formatCurrency(val);

  const data = dashboardData || {};
  const kpi = data.kpi || {
    total: 0,
    vencida: 0,
    porVencer: 0,
    porcentajeVencida: 0,
    uniqueClients: 0,
  };
  const isHighRisk = (kpi.porcentajeVencida || 0) > 20;

  const allItems = useMemo(() => data.items || [], [data.items]);
  const filteredItems = useMemo(() => data.items || [], [data.items]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredItems.length / itemsPerPage),
  );
  // Clamp page to valid range (auto-resets when data shrinks or page size changes)
  const effectivePage = Math.min(currentPage, totalPages);
  const paginatedItems = useMemo(() => {
    const start = (effectivePage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, effectivePage, itemsPerPage]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      const el = document.getElementById("detailed-table");
      if (el) {
        window.scrollTo({ top: el.offsetTop - 100, behavior: "smooth" });
      }
    }
  };

  const filteredUpcomingItems = useMemo(() => {
    const source =
      data.lists?.upcomingItems ||
      allItems.filter((i) => (i.dias_mora || 0) <= 0);
    return source.filter((item) => {
      const days = item.days_until_due !== undefined ? item.days_until_due : 0;
      if (upcomingDays === "0-5") return days >= 0 && days <= 5;
      if (upcomingDays === "5-10") return days > 5 && days <= 10;
      if (upcomingDays === "10-15") return days > 10 && days <= 15;
      if (upcomingDays === "15+") return days > 15;
      return true;
    });
  }, [data.lists?.upcomingItems, allItems, upcomingDays]);

  // MainLayout already renders the page loading overlay for dashboard data.
  if (loading) return null;

  return (
    <div className="space-y-8">
      {/* KPI Overview */}
      <section className="animate-fade-up">
        {/* Row 1: 5 existing KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          <StatCard
            title="Total Cartera"
            value={formatMoney(kpi.total)}
            subtext="Volumen Total"
            icon={DollarSign}
            type="neutral"
            trend={data.advanced?.trendPercentage}
          />
          <StatCard
            title="Total Vencido"
            value={formatMoney(kpi.vencida)}
            subtext="Capital en Mora"
            icon={AlertOctagon}
            type="danger"
          />
          <StatCard
            title="% Cartera Vencida"
            value={`${(kpi.porcentajeVencida || 0).toFixed(1)}%`}
            subtext={isHighRisk ? "Nivel Crítico (>20%)" : "Nivel Controlado"}
            icon={ShieldAlert}
            type={isHighRisk ? "danger" : "success"}
          />
          <StatCard
            title="% Cartera Al Día"
            value={`${(100 - (kpi.porcentajeVencida || 0)).toFixed(1)}%`}
            subtext="Capital Saludable"
            icon={TrendingUp}
            type="success"
          />
          <StatCard
            title="Clientes Activos"
            value={kpi.uniqueClients || 0}
            subtext="En esta carga"
            icon={Users}
            type="info"
          />
        </div>
        {/* Row 2: 3 new KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mt-3 md:mt-4">
          <StatCard
            title="Mora Ponderada"
            value={`${(data.advanced?.moraPonderada || 0).toFixed(0)}d`}
            subtext="Promedio ponderado por saldo"
            icon={Clock}
            type={
              data.advanced?.moraPonderada > 30
                ? "danger"
                : data.advanced?.moraPonderada > 15
                  ? "warning"
                  : "success"
            }
            tooltip="Promedio de días de mora ponderado por el valor de cada factura. Las facturas de mayor monto pesan más. >30d = riesgo alto."
          />
          <StatCard
            title="Concentración (HHI)"
            value={
              data.advanced?.hhi != null ? data.advanced.hhi.toFixed(0) : "N/A"
            }
            subtext={data.advanced?.hhiRiskLevel || "Sin datos"}
            icon={Scale}
            type={
              data.advanced?.hhiRiskLevel === "Alto"
                ? "danger"
                : data.advanced?.hhiRiskLevel === "Moderado"
                  ? "warning"
                  : "success"
            }
            tooltip="Índice Herfindahl-Hirschman: mide qué tan concentrada está la cartera en pocos clientes. <2500 = Bajo (diversificado), >2500 = Alto (dependencia de pocos clientes)."
          />
          <StatCard
            title="Cartera > 360d"
            value={formatMoney(data.advanced?.unrecoverableTotal || 0)}
            subtext={
              data.advanced?.unrecoverableTotal > 0
                ? "Cartera castigada"
                : "Sin cartera castigada"
            }
            icon={ShieldAlert}
            type={data.advanced?.unrecoverableTotal > 0 ? "danger" : "success"}
          />
        </div>
      </section>

      {/* Data Freshness + Advanced Metrics */}
      <section className="animate-fade-up stagger-1">
        <div className="mb-3">
          <DataFreshnessBadge lastLoadDate={data.advanced?.lastLoadDate} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <MetricCard
            icon={Zap}
            label="Flujo de Caja (7d)"
            value={formatMoney(data.advanced?.cashFlow7Days || 0)}
            accent="text-sky-500"
            hint="Recaudo proyectado"
          />
          <MetricCard
            icon={Target}
            label="Concentración Pareto"
            value={`${data.advanced?.paretoClientsCount || 0} clientes`}
            accent="text-amber-500"
            hint="Representan 80% de deuda"
            onClick={() => setIsParetoModalOpen(true)}
          />
          <MetricCard
            icon={FileText}
            label="Ticket Promedio"
            value={formatMoney(data.advanced?.avgTicket || 0)}
            accent="text-navy-400"
            hint="Valor promedio factura"
          />
          <MetricCard
            icon={Scale}
            label="Índice Concentración"
            value={
              data.advanced?.top3Pct
                ? `${data.advanced.top3Pct.toFixed(0)}% Top 3`
                : "N/A"
            }
            accent="text-amber-500"
            hint={data.advanced?.hhiRiskLevel || "Sin datos"}
            tooltip="Porcentaje de la cartera total que representan los 3 clientes más grandes. Un % alto indica riesgo de dependencia."
          />
        </div>
      </section>

      {/* Vendedores KPI */}
      <VendedoresKpiCards vendedores={data.vendedores} />

      {/* CFO Health Widget */}
      <CfoHealthWidget currentLoadId={context.currentLoadId} />

      {/* Historical */}
      <HistoricalEvolution />

      {/* Health & Risk */}
      <HealthRiskSection data={data} />

      {/* Upcoming Expirations */}
      <section className="animate-fade-up stagger-3">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-5 gap-3">
          <SectionTitle icon={Clock} iconColor="bg-amber-50 text-amber-500">
            Próximos Vencimientos
          </SectionTitle>
          <div className="flex bg-white rounded-lg border border-navy-100 p-0.5 shadow-sm">
            {["0-5", "5-10", "10-15", "15+"].map((days) => (
              <button
                key={days}
                onClick={() => setUpcomingDays?.(days)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-[10px] font-semibold transition-all",
                  upcomingDays === days
                    ? "bg-navy-800 text-white shadow-sm"
                    : "text-navy-400 hover:text-navy-600 hover:bg-navy-50",
                )}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>

        <Card className="overflow-hidden !p-0">
          <div className="overflow-x-auto max-h-[360px] overflow-y-auto custom-scrollbar">
            <table className="w-full min-w-[700px] text-sm text-left">
              <thead className="text-[10px] text-navy-400 uppercase tracking-[0.06em] font-semibold bg-navy-50/60 border-b border-navy-100 sticky top-0 backdrop-blur-sm z-10">
                <tr>
                  <th className="px-4 py-2.5">Cliente</th>
                  <th className="px-4 py-2.5">Vence</th>
                  <th className="px-4 py-2.5 text-right">Días Restantes</th>
                  <th className="px-4 py-2.5 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50 bg-white">
                {filteredUpcomingItems?.length > 0 ? (
                  filteredUpcomingItems.map((item) => (
                    <tr
                      key={
                        item.documento_id ||
                        item.id ||
                        `${item.tercero_nit}-${item.documento}`
                      }
                      className="hover:bg-navy-50/30 transition-colors"
                    >
                      <td className="px-4 py-2.5 font-medium text-navy-800">
                        <span className="block truncate max-w-[200px]">
                          {item.cliente_nombre}
                        </span>
                        <span className="text-[9px] text-navy-300 font-mono">
                          {item.documento_id}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-navy-500 text-xs font-mono">
                        {formatDateUTC(item.fecha_vencimiento)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span
                          className={cn(
                            "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold font-mono",
                            (item.days_until_due ?? 0) <= 5
                              ? "bg-rose-50 text-rose-500"
                              : "bg-emerald-50 text-emerald-600",
                          )}
                        >
                          {item.days_until_due ?? 0}d
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold font-mono text-navy-700 text-xs">
                        {formatFullCurrency(item.valor_saldo)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="4"
                      className="px-4 py-10 text-center text-navy-300 text-sm"
                    >
                      No hay registros próximamente
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* Detailed Table */}
      <TableProvider
        value={{
          filteredItems,
          paginatedItems,
          allItems,
          filters,
          setFilters,
          sortConfig,
          setSortConfig,
          currentPage: effectivePage,
          setCurrentPage,
          totalPages,
          handlePageChange,
          itemsPerPage,
          setItemsPerPage,
        }}
      >
        <DetailedTableSection />
      </TableProvider>

      {/* Modals */}
      {isParetoModalOpen && (
        <ParetoModal
          isOpen={isParetoModalOpen}
          onClose={() => setIsParetoModalOpen(false)}
          clients={data.lists?.aggregatedClients || []}
          totalDebt={data.kpi?.total || 1}
        />
      )}

      {isUnrecoverableModalOpen && (
        <UnrecoverableModal
          isOpen={isUnrecoverableModalOpen}
          onClose={() => setIsUnrecoverableModalOpen(false)}
          items={data.allItems || []}
        />
      )}
    </div>
  );
}
