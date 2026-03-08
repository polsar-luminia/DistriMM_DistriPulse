import { useState, useEffect, useCallback, useRef } from "react";
import { getPortfolioItems, getLoads, markRemindersAsSent, deleteLoad } from "../services/portfolioService";
import {
    preprocessItems,
    calculateKPIs,
    buildClientMap,
    calculatePareto,
    calculateAging,
    calculateProjection,
    buildLists,
    buildRadarData,
    buildTopOldest,
    buildVendedorStats,
    calculateMoraPonderada,
    calculateHHI,
} from "../utils/portfolioCalculations";
import { COLORS } from "../utils/constants";

/**
 * Central hook for portfolio analytics state management.
 * Fetches load history, processes portfolio items, and computes KPIs, charts, and lists.
 *
 * @returns {{
 *   items: Array,
 *   availableLoads: Array,
 *   currentLoadId: string|null,
 *   stats: { total: number, vencida: number, porVencer: number, porcentajeVencida: number, uniqueClients: number, trendPercentage: number|null, paretoPercentage: number, unrecoverableTotal: number },
 *   charts: { aging: Array, projection: Array, invoicesByStatus: Array, radarData: Array, topOldest: Array },
 *   lists: { upcomingItems: Array, urgentItems: Array, aggregatedClients: Array },
 *   vendedores: { stats: Array, uniqueCodes: Array, count: number },
 *   healthScore: number,
 *   loading: boolean,
 *   error: string|null,
 *   changeLoad: (newLoadId: string) => void,
 *   markRemindersAsSent: (ids: string[]) => Promise<{success: boolean, error?: string}>,
 *   deleteLoad: (loadId: string) => Promise<{success: boolean, error?: string}>,
 *   refresh: () => void,
 * }}
 */
export function usePortfolioAnalytics() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [data, setData] = useState({
        items: [],
        availableLoads: [],
        currentLoadId: null,
        stats: {
            total: 0,
            vencida: 0,
            porVencer: 0,
            porcentajeVencida: 0,
            trendPercentage: null,
            paretoPercentage: 0,
            unrecoverableTotal: 0,
        },
        charts: {
            aging: [],
            projection: [],
            invoicesByStatus: [],
            radarData: [],
            topOldest: [],
        },
        lists: {
            upcomingItems: [],
            urgentItems: [],
            aggregatedClients: [],
        },
        vendedores: {
            stats: [],
            uniqueCodes: [],
            count: 0,
        },
        healthScore: 100,
    });

    const [currentLoadId, setCurrentLoadId] = useState(null);

    // Ref to avoid stale closures in changeLoad/handleDeleteLoad
    const dataRef = useRef(data);
    dataRef.current = data;
    const currentLoadIdRef = useRef(currentLoadId);
    currentLoadIdRef.current = currentLoadId;

    // Initial Load of Headers
    const fetchLoads = useCallback(async () => {
        try {
            setLoading(true);
            const { data: loads, error } = await getLoads();
            if (error) throw error;

            if (loads && loads.length > 0) {
                // Update availableLoads IMMEDIATELY so the list appears
                setData(prev => ({ ...prev, availableLoads: loads }));

                const latest = loads[0];
                setCurrentLoadId(latest.id);

                return { loads, latestId: latest.id };
            }
            // Even if empty, update state
            setData(prev => ({ ...prev, availableLoads: [] }));
            return { loads: [], latestId: null };
        } catch (err) {
            if (import.meta.env.DEV) console.error("Error fetching loads:", err);
            setError(err.message);
            return { loads: [], latestId: null };
        }
    }, []);

    // Main Processing Logic — orchestrates pure calculation functions
    const processPortfolioData = useCallback((items, loadId, allLoads) => {
        const processedItems = preprocessItems(items);
        const kpis = calculateKPIs(processedItems);
        const { clientMap, sortedClients, uniqueClientsCount } = buildClientMap(processedItems);
        const paretoPercentage = calculatePareto(sortedClients, kpis.total, uniqueClientsCount);
        const agingData = calculateAging(processedItems);
        const projectionData = calculateProjection(processedItems);
        const { urgentItems, aggregatedClients, upcomingItems } = buildLists(processedItems, clientMap);
        const radarData = buildRadarData(sortedClients);
        const topOldest = buildTopOldest(processedItems);
        const { vendedorStats, uniqueVendedores } = buildVendedorStats(processedItems);
        const moraPonderada = calculateMoraPonderada(processedItems);
        const { hhi, top3Pct, riskLevel: hhiRiskLevel } = calculateHHI(sortedClients, kpis.total);

        setData({
            items: processedItems,
            availableLoads: allLoads,
            currentLoadId: loadId,
            stats: {
                total: kpis.total,
                vencida: kpis.vencida,
                porVencer: kpis.porVencer,
                porcentajeVencida: kpis.porcentajeVencida,
                uniqueClients: uniqueClientsCount,
                trendPercentage: null,
                paretoPercentage,
                unrecoverableTotal: kpis.unrecoverableTotal,
                moraPonderada,
                hhi,
                top3Pct,
                hhiRiskLevel,
            },
            charts: {
                aging: agingData,
                projection: projectionData,
                invoicesByStatus: [
                    { name: "Al Día", value: processedItems.length - kpis.vencidaItems.length, color: COLORS.CHART.PRIMARY },
                    { name: "Vencidas", value: kpis.vencidaItems.length, color: COLORS.CHART.DANGER },
                ],
                radarData,
                topOldest,
            },
            lists: {
                upcomingItems,
                urgentItems,
                aggregatedClients,
            },
            vendedores: {
                stats: vendedorStats,
                uniqueCodes: uniqueVendedores,
                count: uniqueVendedores.length,
            },
            healthScore: Math.max(0, Math.min(100, 100 - kpis.porcentajeVencida)),
        });
    }, []);

    // Fetch Data for specific Load
    const fetchData = useCallback(async (loadId, allLoads) => {
        if (!loadId) return;

        try {
            setLoading(true);
            // Using the service layer
            const { data: items, error } = await getPortfolioItems(loadId);
            if (error) throw error;

            processPortfolioData(items, loadId, allLoads);

        } catch (err) {
            if (import.meta.env.DEV) console.error("Error fetching portfolio items:", err);
            setError(err.message);
            // Ensure we at least show the empty state for items if fetch fails
            setData(prev => ({ ...prev, items: [] }));
        } finally {
            setLoading(false);
        }
    }, [processPortfolioData]);


    // Initialization Effect
    useEffect(() => {
        let cancelled = false;
        fetchLoads().then(({ loads, latestId }) => {
            if (cancelled) return;
            if (latestId) {
                fetchData(latestId, loads);
            } else {
                setLoading(false);
            }
        });
        return () => { cancelled = true; };
    }, [fetchLoads, fetchData]);

    // Handler for changing load — uses ref to avoid stale closure on availableLoads
    const changeLoad = useCallback((newLoadId) => {
        setCurrentLoadId(newLoadId);
        fetchData(newLoadId, dataRef.current.availableLoads);
    }, [fetchData]);

    // Handler for marking reminders as sent
    const handleMarkRemindersAsSent = async (ids) => {
        const { success, timestamp, error } = await markRemindersAsSent(ids);
        if (success && timestamp) {
            setData(prev => {
                const updatedItems = prev.items.map(item =>
                    ids.includes(item.id)
                        ? { ...item, ultimo_recordatorio: timestamp }
                        : item
                );
                return { ...prev, items: updatedItems };
            });
        }
        return { success, error };
    };

    // Handler for deleting a load — uses refs to avoid stale closures
    const handleDeleteLoad = useCallback(async (loadIdToDelete) => {
        const { success, error } = await deleteLoad(loadIdToDelete);

        if (success) {
            // Read latest values from refs to avoid stale closure
            const latestLoads = dataRef.current.availableLoads;
            const latestCurrentId = currentLoadIdRef.current;

            // Update available loads
            const updatedLoads = latestLoads.filter(load => load.id !== loadIdToDelete);

            // Determine new current load
            let newCurrentId = latestCurrentId;
            if (latestCurrentId === loadIdToDelete) {
                newCurrentId = updatedLoads.length > 0 ? updatedLoads[0].id : null;
            }

            setData(prev => ({
                ...prev,
                availableLoads: updatedLoads,
                currentLoadId: newCurrentId
            }));

            // Fetch data for the new current load if it changed and exists
            if (newCurrentId && newCurrentId !== latestCurrentId) {
                fetchData(newCurrentId, updatedLoads);
            } else if (!newCurrentId) {
                // No loads left, clear data
                setData(prev => ({
                    ...prev,
                    items: [],
                    availableLoads: [],
                    currentLoadId: null,
                    stats: { ...prev.stats, total: 0, vencida: 0 }, // Reset minimal stats
                    charts: { ...prev.charts, aging: [], projection: [] },
                    lists: { ...prev.lists, upcomingItems: [] }
                }));
            }
        }

        return { success, error };
    }, [fetchData]);

    const refresh = useCallback(() => {
        fetchLoads().then(({ loads, latestId }) => {
            if (latestId) {
                fetchData(latestId, loads);
            } else {
                setLoading(false);
            }
        });
    }, [fetchLoads, fetchData]);

    return {
        ...data,
        loading,
        error,
        changeLoad,
        markRemindersAsSent: handleMarkRemindersAsSent,
        deleteLoad: handleDeleteLoad,
        refresh,
    };
}
