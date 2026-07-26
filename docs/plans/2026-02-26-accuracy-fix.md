# Accuracy Fix — dias_mora + COP Rounding

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the two critical accuracy issues: stale `dias_mora` (snapshot from upload vs. today) and floating-point accumulation in COP totals.

**Architecture:** Both fixes live entirely in `src/utils/portfolioCalculations.js`. Task 1 overrides `dias_mora` in `preprocessItems` using the already-computed `days_until_due`. Task 2 adds a `roundCOP` helper and applies it to all monetary aggregations. No new dependencies, no service-layer changes, no ETL changes.

**Tech Stack:** React 19, Vite 7, plain JS (no decimal library needed — `Math.round` is sufficient for whole-peso COP accounting).

---

## Task 1: Recalculate dias_mora live from fecha_vencimiento

**Files:**
- Modify: `src/utils/portfolioCalculations.js:18–35` (`preprocessItems` function)

### Background

`preprocessItems` already computes `days_until_due` from `fecha_vencimiento`:

```js
const diffTime = vDate - tDate;           // negative = past due
days_until_due = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
```

The relationship between the two fields:
- `days_until_due = -5` → invoice is 5 days overdue → `dias_mora = 5`
- `days_until_due = 0`  → due today → `dias_mora = 0`
- `days_until_due = 3`  → due in 3 days → `dias_mora = 0`

Formula: `dias_mora = Math.max(0, -days_until_due)`

The stored `item.dias_mora` is a snapshot from the day the Excel was uploaded. We override it with the live recalculation whenever `fecha_vencimiento` is present.

### Step 1: Modify `preprocessItems` in `src/utils/portfolioCalculations.js`

Find the current return statement inside the `map` callback (line ~33):

```js
// BEFORE (line ~33):
        return { ...item, days_until_due };
```

Replace with:

```js
// AFTER:
        const live_dias_mora = Math.max(0, -days_until_due);
        return { ...item, days_until_due, dias_mora: live_dias_mora };
```

The full updated `preprocessItems` should look like:

```js
export function preprocessItems(items) {
    const today = new Date();
    const tDate = new Date(today.toISOString().split("T")[0] + "T00:00:00");

    return items.map(item => {
        let days_until_due = 0;
        if (item.fecha_vencimiento) {
            try {
                const vDate = new Date(item.fecha_vencimiento + "T00:00:00");
                const diffTime = vDate - tDate;
                days_until_due = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            } catch {
                days_until_due = 0;
            }
        }
        const live_dias_mora = Math.max(0, -days_until_due);
        return { ...item, days_until_due, dias_mora: live_dias_mora };
    });
}
```

Note: When `fecha_vencimiento` is absent or fails to parse, `days_until_due` stays `0`, so `live_dias_mora = 0`. This is safe — an invoice with no due date is treated as not overdue, same as the stored value defaulting to 0.

### Step 2: Build

```bash
pnpm build
```

Expected: 0 errors.

### Step 3: Verify logic manually

After the build, open the browser dev server (`pnpm dev`) and check any invoice in the Dashboard that was uploaded more than a few days ago. The `dias_mora` in the UI should reflect today's date, not the upload date. Example: an invoice with `fecha_vencimiento = 2026-01-15` opened on 2026-02-26 should show `dias_mora = 42`, regardless of what was in the Excel column.

---

## Task 2: Round COP monetary totals to whole pesos

**Files:**
- Modify: `src/utils/portfolioCalculations.js` — `calculateKPIs`, `buildClientMap`, `buildVendedorStats`

### Background

JavaScript `reduce` with floats can accumulate sub-peso errors (e.g., `1500000.33 + 1500000.33 = 3000000.6600000003`). Colombian accounting works in whole pesos. The fix is to round at the aggregation point (never mid-accumulation).

`Math.round(n)` rounds to the nearest integer — correct for COP.

### Step 1: Add `roundCOP` helper at the top of the calculations section in `portfolioCalculations.js`

After the `preprocessItems` function (around line 36), before the `// === KPIs ===` comment, add:

```js
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
```

### Step 2: Apply `roundCOP` in `calculateKPIs`

Find the current return statement of `calculateKPIs` (line ~57):

```js
// BEFORE:
    return { total, vencida, porVencer, porcentajeVencida, vencidaItems, unrecoverableTotal };
```

Change the local variable declarations to use `roundCOP` at the END of each computation (not mid-accumulation):

```js
// AFTER — wrap final sums only:
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
```

### Step 3: Apply `roundCOP` in `buildClientMap`

Find the line inside `buildClientMap` where `deuda` is accumulated (line ~82):

```js
// BEFORE:
        clientMap[clientName].deuda += (item.valor_saldo || 0);
```

The accumulation loop is fine — round AFTER the loop, in the `sortedClients` mapping. Find:

```js
    const sortedClients = Object.values(clientMap).sort((a, b) => b.deuda - a.deuda);
```

Change to:

```js
    const sortedClients = Object.values(clientMap)
        .map(c => ({ ...c, deuda: roundCOP(c.deuda) }))
        .sort((a, b) => b.deuda - a.deuda);
```

### Step 4: Apply `roundCOP` in `buildVendedorStats`

Find in `buildVendedorStats` the mapping step (line ~306):

```js
    const vendedorStats = Object.values(vendedorMap)
        .map(v => ({
            ...v,
            clientesCount: v.clientes.size,
            pctVencida: v.totalCartera > 0 ? (v.totalVencida / v.totalCartera) * 100 : 0,
            clientes: undefined,
        }))
```

Change to:

```js
    const vendedorStats = Object.values(vendedorMap)
        .map(v => ({
            ...v,
            totalCartera: roundCOP(v.totalCartera),
            totalVencida: roundCOP(v.totalVencida),
            clientesCount: v.clientes.size,
            pctVencida: v.totalCartera > 0 ? (v.totalVencida / v.totalCartera) * 100 : 0,
            clientes: undefined,
        }))
```

### Step 5: Build

```bash
pnpm build
```

Expected: 0 errors.

---

## Final Verification

```bash
pnpm build
```

Then in the browser, verify:
1. KPI totals on the Dashboard are whole numbers (no `.05` or `.3` artifacts)
2. An invoice with a `fecha_vencimiento` in the past shows the correct dias_mora for **today**, not the upload date

```bash
# Verify no raw dias_mora reference survives in the KPI/aging path:
grep -n "item\.dias_mora" src/utils/portfolioCalculations.js
```

Expected: All remaining `item.dias_mora` references are in `calculateKPIs`, `calculateAging`, `buildClientMap`, `buildLists`, etc. — which now all receive the **live-recalculated** value from `preprocessItems`. The only place that reads the original stored value is `preprocessItems` itself (which immediately overrides it).
