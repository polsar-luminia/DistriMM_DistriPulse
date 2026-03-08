/**
 * @fileoverview Pure calculation functions extracted from usePortfolioAnalytics.
 * Each function is pure: no side effects, no React state access, no mutation of inputs.
 * @module utils/portfolioCalculations
 */

import { AGING_BUCKETS, THRESHOLDS } from "./constants";

// ============================================================================
// PREPROCESSING
// ============================================================================

/**
 * Enriches raw items with computed days_until_due.
 * @param {Array} items - Raw portfolio items from Supabase
 * @returns {Array} Items with days_until_due added
 */
export function preprocessItems(items) {
    const today = new Date();
    const tDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    return items.map(item => {
        let days_until_due = 0;
        if (item.fecha_vencimiento) {
            try {
                const vDate = new Date(item.fecha_vencimiento + "T00:00:00");
                if (isNaN(vDate.getTime())) {
                    days_until_due = 0;
                } else {
                    const diffTime = vDate - tDate;
                    days_until_due = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                }
            } catch {
                days_until_due = 0;
            }
        }
        const live_dias_mora = Math.max(0, -days_until_due);
        return { ...item, days_until_due, dias_mora: live_dias_mora };
    });
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Rounds a COP monetary value to the nearest whole peso.
 * Prevents floating-point accumulation errors in client-side aggregations.
 * @param {number} n
 * @returns {number}
 */
function roundCOP(n) {
    return Math.round(n || 0);
}

// ============================================================================
// KPIs
// ============================================================================

/**
 * Calculates main portfolio KPIs including unrecoverable debt.
 * @param {Array} items - Processed portfolio items
 * @returns {{ total: number, vencida: number, porVencer: number, porcentajeVencida: number, vencidaItems: Array, unrecoverableTotal: number }}
 */
export function calculateKPIs(items) {
    const total = roundCOP(items.reduce((sum, item) => sum + (item.valor_saldo || 0), 0));
    const vencidaItems = items.filter(i => (i.dias_mora || 0) > 0);
    const vencida = roundCOP(vencidaItems.reduce((sum, item) => sum + (item.valor_saldo || 0), 0));
    const porVencer = roundCOP(total - vencida);
    const porcentajeVencida = total > 0 ? (vencida / total) * 100 : 0;

    const unrecoverableTotal = roundCOP(
        items
            .filter(i => (Number(i.dias_mora) || 0) > THRESHOLDS.UNRECOVERABLE_DAYS)
            .reduce((sum, i) => sum + (Number(i.valor_saldo) || 0), 0)
    );

    return { total, vencida, porVencer, porcentajeVencida, vencidaItems, unrecoverableTotal };
}

// ============================================================================
// CLIENT MAP & PARETO
// ============================================================================

/**
 * Builds aggregated client map from portfolio items.
 * @param {Array} items - Processed portfolio items
 * @returns {{ clientMap: Object, sortedClients: Array, uniqueClientsCount: number }}
 */
export function buildClientMap(items) {
    const clientMap = {};
    items.forEach(item => {
        const clientName = item.cliente_nombre || "Cliente Desconocido";
        if (!clientMap[clientName]) {
            clientMap[clientName] = {
                name: clientName,
                shortName: clientName.split(" ").slice(0, 2).join(" "),
                deuda: 0,
                items: [],
                maxMora: -9999,
            };
        }
        clientMap[clientName].deuda += (item.valor_saldo || 0);
        clientMap[clientName].items.push(item);
        if ((item.dias_mora || 0) > clientMap[clientName].maxMora) {
            clientMap[clientName].maxMora = (item.dias_mora || 0);
        }
    });

    const sortedClients = Object.values(clientMap)
        .map(c => ({ ...c, deuda: roundCOP(c.deuda) }))
        .sort((a, b) => b.deuda - a.deuda);
    const uniqueClientsCount = Object.keys(clientMap).length;

    return { clientMap, sortedClients, uniqueClientsCount };
}

/**
 * Calculates Pareto (80/20) percentage from sorted clients.
 * @param {Array} sortedClients - Clients sorted by debt descending
 * @param {number} totalCartera - Total portfolio value
 * @param {number} uniqueClientsCount - Total unique clients
 * @returns {number} Percentage of clients representing 80% of debt
 */
export function calculatePareto(sortedClients, totalCartera, uniqueClientsCount) {
    let accumulatedDebt = 0;
    let paretoClientsCount = 0;
    for (const client of sortedClients) {
        accumulatedDebt += client.deuda;
        paretoClientsCount++;
        if (accumulatedDebt >= totalCartera * THRESHOLDS.PARETO_PERCENTAGE) break;
    }
    return uniqueClientsCount > 0 ? (paretoClientsCount / uniqueClientsCount) * 100 : 0;
}

// ============================================================================
// AGING
// ============================================================================

/**
 * Calculates aging distribution across standard buckets.
 * @param {Array} items - Processed portfolio items
 * @returns {Array<{ name: string, value: number, color: string, percent: string|number }>}
 */
export function calculateAging(items) {
    const buckets = {};
    AGING_BUCKETS.forEach(b => {
        buckets[b.key] = { val: 0, color: b.color };
    });

    items.forEach(item => {
        const mora = item.dias_mora || 0;
        const val = item.valor_saldo || 0;
        for (const bucket of AGING_BUCKETS) {
            if (mora >= bucket.min && mora <= bucket.max) {
                buckets[bucket.key].val += val;
                break;
            }
        }
    });

    const totalAging = Object.values(buckets).reduce((acc, b) => acc + b.val, 0);
    return Object.keys(buckets).map(key => ({
        name: key,
        value: buckets[key].val,
        color: buckets[key].color,
        percent: totalAging > 0 ? parseFloat(((buckets[key].val / totalAging) * 100).toFixed(1)) : 0,
    }));
}

// ============================================================================
// PROJECTION
// ============================================================================

/**
 * Calculates receivable projection for the next 30 days.
 * @param {Array} items - Processed portfolio items
 * @returns {Array<{ date: string, total: number }>}
 */
export function calculateProjection(items) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next30Days = new Date(today);
    next30Days.setDate(today.getDate() + 30);

    const projectionMap = {};

    items
        .filter(i => (i.dias_mora || 0) < 1 && i.fecha_vencimiento)
        .forEach(item => {
            try {
                if (typeof item.fecha_vencimiento === "string") {
                    const parts = item.fecha_vencimiento.split("-");
                    if (parts.length === 3) {
                        const [y, m, d] = parts.map(Number);
                        const itemDate = new Date(y, m - 1, d);
                        if (itemDate >= today && itemDate <= next30Days) {
                            const k = item.fecha_vencimiento;
                            projectionMap[k] = (projectionMap[k] || 0) + (item.valor_saldo || 0);
                        }
                    }
                }
            } catch {
                // Ignore parsing errors for individual items
            }
        });

    return Object.keys(projectionMap).sort().map(date => ({ date, total: projectionMap[date] }));
}

// ============================================================================
// LISTS
// ============================================================================

/**
 * Builds urgent, aggregated, and upcoming lists.
 * @param {Array} items - Processed portfolio items
 * @param {Object} clientMap - Client aggregation map from buildClientMap
 * @returns {{ urgentItems: Array, aggregatedClients: Array, upcomingItems: Array }}
 */
export function buildLists(items, clientMap) {
    const urgentItems = Object.values(clientMap)
        .filter(c => c.maxMora > THRESHOLDS.HIGH_RISK_DAYS)
        .sort((a, b) => b.maxMora - a.maxMora)
        .slice(0, 3)
        .map((c, idx) => ({
            id: idx,
            name: c.name,
            amount: c.deuda,
            days: c.maxMora,
            reason: c.maxMora > THRESHOLDS.LEGAL_ACTION_DAYS ? "Cobro Jurídico" : "Riesgo Alto",
        }));

    const aggregatedClients = Object.values(clientMap)
        .map(client => ({
            ...client,
            vencidasCount: client.items.filter(i => (i.dias_mora || 0) > 0).length,
            status: client.maxMora > 0 ? "Vencido" : "Al día",
        }))
        .sort((a, b) => b.deuda - a.deuda);

    const upcomingItems = items
        .filter(i => (i.dias_mora || 0) <= 0)
        .sort((a, b) => (a.days_until_due || 0) - (b.days_until_due || 0));

    return { urgentItems, aggregatedClients, upcomingItems };
}

// ============================================================================
// RADAR
// ============================================================================

/**
 * Builds radar chart data from top overdue clients.
 * @param {Array} sortedClients - Clients sorted by debt descending
 * @returns {Array}
 */
export function buildRadarData(sortedClients) {
    const radarSubset = sortedClients
        .filter(c => c.maxMora > 0)
        .slice(0, 5);

    const localMaxDeuda = Math.max(...radarSubset.map(c => c.deuda), 1);
    const localMaxMora = Math.max(...radarSubset.map(c => c.maxMora), 1);

    return radarSubset.map(c => ({
        subject: c.shortName,
        Deuda: (c.deuda / localMaxDeuda) * 100,
        Mora: (c.maxMora / localMaxMora) * 100,
        fullMark: 100,
        fullName: c.name,
        rawMonto: c.deuda,
        rawMora: c.maxMora,
    }));
}

// ============================================================================
// TOP OLDEST
// ============================================================================

/**
 * Returns the 10 oldest overdue items.
 * @param {Array} items - Processed portfolio items
 * @returns {Array}
 */
export function buildTopOldest(items) {
    return [...items]
        .sort((a, b) => (b.dias_mora || 0) - (a.dias_mora || 0))
        .slice(0, 10)
        .map((item, idx) => {
            const name = item.cliente_nombre || "Cliente Desconocido";
            return {
                ...item,
                _id: `${idx}-${item.documento_id}`,
                shortName: name.length > 15 ? name.substring(0, 15) + "..." : name,
            };
        });
}

// ============================================================================
// ADVANCED ANALYTICS
// ============================================================================

/** HHI risk-level thresholds (US DOJ/FTC standard) */
const HHI_THRESHOLDS = { HIGH: 2500, MODERATE: 1500 };

/**
 * Calculates weighted average days overdue (mora ponderada).
 * Only considers items with dias_mora > 0; weight = valor_saldo.
 *
 * Formula: SUM(dias_mora * valor_saldo) / SUM(valor_saldo)
 *
 * @param {Array<{ dias_mora?: number, valor_saldo?: number }>} items - Processed portfolio items
 * @returns {number} Weighted average days overdue (0 if no overdue items or zero balance)
 */
export function calculateMoraPonderada(items) {
    let weightedSum = 0;
    let totalBalance = 0;

    for (const item of items) {
        const mora = item.dias_mora || 0;
        const saldo = item.valor_saldo || 0;
        if (mora > 0 && saldo > 0) {
            weightedSum += mora * saldo;
            totalBalance += saldo;
        }
    }

    return totalBalance > 0 ? Math.round(weightedSum / totalBalance * 100) / 100 : 0;
}

/**
 * Calculates Herfindahl-Hirschman Index (HHI) for client concentration risk.
 * Also returns the top-3 clients' combined share as a percentage.
 *
 * Formula: SUM((client.deuda / totalCartera * 100)^2) for each client
 *
 * @param {Array<{ deuda: number }>} sortedClients - Clients sorted by debt descending (from buildClientMap)
 * @param {number} totalCartera - Total portfolio value
 * @returns {{ hhi: number, top3Pct: number, riskLevel: 'Bajo'|'Moderado'|'Alto' }}
 */
export function calculateHHI(sortedClients, totalCartera) {
    if (!sortedClients.length || totalCartera <= 0) {
        return { hhi: 0, top3Pct: 0, riskLevel: "Bajo" };
    }

    let hhi = 0;
    let top3Sum = 0;

    for (let i = 0; i < sortedClients.length; i++) {
        const share = (sortedClients[i].deuda / totalCartera) * 100;
        hhi += share * share;
        if (i < 3) top3Sum += sortedClients[i].deuda;
    }

    hhi = Math.round(hhi * 100) / 100;
    const top3Pct = Math.round((top3Sum / totalCartera) * 10000) / 100;

    let riskLevel;
    if (hhi > HHI_THRESHOLDS.HIGH) {
        riskLevel = "Alto";
    } else if (hhi > HHI_THRESHOLDS.MODERATE) {
        riskLevel = "Moderado";
    } else {
        riskLevel = "Bajo";
    }

    return { hhi, top3Pct, riskLevel };
}

// ============================================================================
// VENDEDOR ANALYTICS
// ============================================================================

/**
 * Builds vendor performance statistics.
 * @param {Array} items - Processed portfolio items
 * @returns {{ vendedorStats: Array, uniqueVendedores: Array }}
 */
export function buildVendedorStats(items) {
    const vendedorMap = {};
    items.forEach(item => {
        const codigo = item.vendedor_codigo || "Sin Asignar";
        if (!vendedorMap[codigo]) {
            vendedorMap[codigo] = {
                codigo,
                totalCartera: 0,
                totalVencida: 0,
                facturas: 0,
                clientes: new Set(),
                maxMora: 0,
            };
        }
        const v = vendedorMap[codigo];
        v.totalCartera += (item.valor_saldo || 0);
        v.facturas += 1;
        v.clientes.add(item.cliente_nombre);
        if ((item.dias_mora || 0) > 0) v.totalVencida += (item.valor_saldo || 0);
        if ((item.dias_mora || 0) > v.maxMora) v.maxMora = (item.dias_mora || 0);
    });

    const vendedorStats = Object.values(vendedorMap)
        .map(v => ({
            ...v,
            totalCartera: roundCOP(v.totalCartera),
            totalVencida: roundCOP(v.totalVencida),
            clientesCount: v.clientes.size,
            pctVencida: v.totalCartera > 0 ? (v.totalVencida / v.totalCartera) * 100 : 0,
            clientes: undefined,
        }))
        .sort((a, b) => b.totalCartera - a.totalCartera);

    const uniqueVendedores = [...new Set(items.map(i => i.vendedor_codigo).filter(Boolean))];

    return { vendedorStats, uniqueVendedores };
}
