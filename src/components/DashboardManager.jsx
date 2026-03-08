/* eslint-disable react-refresh/only-export-components */
import React, { useState, useMemo, useCallback } from "react";
import MainLayout from "../layouts/MainLayout";
import { usePortfolioAnalytics } from "../hooks/usePortfolioAnalytics";
import UploadModal from "./UploadModal";

// Dashboard and Filter contexts for the page-based architecture
export const DashboardContext = React.createContext();
export const FilterContext = React.createContext();

export default function DashboardManager() {
  const {
    items,
    availableLoads,
    currentLoadId,
    stats,
    charts,
    lists,
    vendedores,
    healthScore,
    loading,
    error,
    changeLoad,
    refresh,
    markRemindersAsSent,
    deleteLoad
  } = usePortfolioAnalytics();

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // --- FILTERS STATE ---
  const [filters, setFilters] = useState({
    searchQuery: "",
    status: "all",
    municipio: "all",
    daysOverdue: "all", // "0-30", "30-60", "60-90", "90+"
    moraMin: "",
    moraMax: "",
  });

  const [sortConfig, setSortConfig] = useState({
    key: "valor_saldo",
    direction: "desc",
  });

  // Client-side filtering for "Upcoming" (0-5, 5-10, etc)
  const [upcomingDays, setUpcomingDays] = useState("0-5");

  // --- MEMOIZED FILTERED LISTS ---
  const filteredItems = useMemo(() => {
    if (!items) return [];

    return items.filter((item) => {
      // 1. Search Query
      if (
        filters.searchQuery &&
        !item.cliente_nombre
          .toLowerCase()
          .includes(filters.searchQuery.toLowerCase()) &&
        !String(item.documento_id).includes(filters.searchQuery)
      ) {
        return false;
      }

      // 2. Status
      if (filters.status !== "all") {
        const isVencida = (item.dias_mora || 0) > 0;
        if (filters.status === "vencida" && !isVencida) return false;
        if (filters.status === "al_dia" && isVencida) return false;
      }

      // 3. Dias Mora Interval (Dropdown)
      if (filters.daysOverdue !== "all") {
        const mora = item.dias_mora || 0;
        if (filters.daysOverdue === "0-30" && (mora <= 0 || mora > 30)) return false;
        if (filters.daysOverdue === "30-60" && (mora <= 30 || mora > 60)) return false;
        if (filters.daysOverdue === "60-90" && (mora <= 60 || mora > 90)) return false;
        if (filters.daysOverdue === "90+" && mora <= 90) return false;
      }

      // 4. Min/Max Mora Manual
      if (filters.moraMin !== "" && (item.dias_mora || 0) < Number(filters.moraMin)) return false;
      if (filters.moraMax !== "" && (item.dias_mora || 0) > Number(filters.moraMax)) return false;

      // 5. Municipio filter (items may not have municipio directly; skip if not present)
      if (filters.municipio !== "all") {
        if (item.municipio && item.municipio !== filters.municipio) return false;
      }

      return true;
    });
  }, [items, filters]);

  // --- SORTING ---
  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredItems, sortConfig]);


  // --- HANDLERS ---
  const handleSort = useCallback((key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  }, []);

  const handleRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  // --- CALCULATE MISSING METRICS ---
  const avgTicket = items && items.length > 0 ? (stats.total / items.length) : 0;

  // Calculate Cash Flow for next 7 days from projection
  const cashFlow7Days = (charts.projection || [])
    .filter(p => {
      const pDate = new Date(p.date);
      const today = new Date();
      const diffTime = Math.abs(pDate - today);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 7;
    })
    .reduce((sum, p) => sum + (p.total || 0), 0);

  // Stable callback for upload click
  const onUploadClick = useCallback(() => setIsUploadModalOpen(true), []);

  // --- MEMOIZED CONTEXT VALUES (prevents unnecessary consumer re-renders) ---
  const dashboardContextValue = useMemo(() => ({
    // Top-level properties for MainLayout & FilesPage
    availableLoads,
    currentLoadId,
    onUploadClick,
    onDeleteLoad: deleteLoad,

    // Data object for Pages (DashboardPage, ClientsPage)
    data: {
      // items: filtered + sorted via DashboardManager filters
      items: sortedItems,
      // allItems: raw unfiltered items from the analytics hook (used by VendedoresPage)
      allItems: items,

      // MAPPINGS for DashboardPage compatibility
      kpi: {
        ...stats,
        uniqueClients: stats.uniqueClients || (lists.aggregatedClients ? lists.aggregatedClients.length : 0)
      },
      advanced: {
        ...stats,
        uniqueClients: stats.uniqueClients || (lists.aggregatedClients ? lists.aggregatedClients.length : 0),
        healthScore,
        radarData: charts.radarData,
        avgTicket,
        cashFlow7Days,
        // Approximate Pareto count (usually 20% of clients) logic if not provided
        paretoClientsCount: Math.ceil((lists.aggregatedClients?.length || 0) * 0.2),
        clientsWithOverdue: (lists.aggregatedClients || []).filter(c => c.status === "Vencido").length,
        moraPonderada: stats.moraPonderada,
        hhi: stats.hhi,
        top3Pct: stats.top3Pct,
        hhiRiskLevel: stats.hhiRiskLevel,
        lastLoadDate: availableLoads?.[0]?.fecha_corte || availableLoads?.[0]?.created_at || null,
      },

      // FLATTEN CHARTS for DashboardPage (aging, projection, etc.)
      ...charts,

      // Raw data
      lists,
      aggregatedClients: lists.aggregatedClients,
      healthScore,
      upcomingItems: lists.upcomingItems,
      vendedores,
    },

    loading,
    error,
    onRefresh: handleRefresh,
    onLoadChange: changeLoad,
    markRemindersAsSent,

    // FILTERS & UI STATE
    filters,
    setFilters,
    upcomingDays,
    setUpcomingDays
  }), [availableLoads, currentLoadId, onUploadClick, deleteLoad, sortedItems, items, stats, lists, healthScore, charts, avgTicket, cashFlow7Days, vendedores, loading, error, handleRefresh, changeLoad, markRemindersAsSent, filters, upcomingDays]);

  const filterContextValue = useMemo(() => ({
    filters,
    setFilters,
    sortConfig,
    handleSort,
    upcomingDays,
    setUpcomingDays,
  }), [filters, sortConfig, handleSort, upcomingDays]);

  return (
    <DashboardContext.Provider value={dashboardContextValue}>
      <FilterContext.Provider value={filterContextValue}>
        <MainLayout dashboardContext={dashboardContextValue} />
        <UploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onUploadSuccess={() => {
            setIsUploadModalOpen(false);
            refresh();
          }}
        />
      </FilterContext.Provider>
    </DashboardContext.Provider>
  );
}
