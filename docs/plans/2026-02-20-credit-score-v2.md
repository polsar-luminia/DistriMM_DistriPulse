# Credit Score v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-carga credit score SQL function with a full historical model and add a dedicated `/score-crediticio` sidebar page.

**Architecture:** The SQL function is replaced in-place (same name, same RPC interface), so `portfolioService.js` needs no changes. The new page consumes `aggregatedClients` from outlet context for its client list, then lazily fetches the score on client selection. `CreditScoreCard` gets a new trend history section added at the bottom.

**Tech Stack:** PostgreSQL PL/pgSQL (Supabase MCP), React 19, Tailwind CSS 4, lucide-react, react-router-dom.

---

### Task 1: Replace SQL function with v2 (historical + decay weighting)

**Files:**
- Supabase MCP: `mcp__supabase-distrimm__apply_migration`

**Step 1: Apply migration via MCP**

Use `mcp__supabase-distrimm__apply_migration` with name `credit_score_v2` and the following SQL:

```sql
CREATE OR REPLACE FUNCTION fn_calcular_credit_score(p_nit TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_carga_id UUID;
  v_carga_fecha DATE;
  v_idx INTEGER := 0;
  v_weight NUMERIC;
  v_total_weight NUMERIC := 0;
  -- Per-period metrics
  v_period_mora_prom NUMERIC;
  v_period_max_mora NUMERIC;
  v_period_total_saldo NUMERIC;
  v_period_vencida_saldo NUMERIC;
  v_period_concentracion NUMERIC;
  v_period_has_90 INTEGER;
  v_period_num_facturas INTEGER;
  -- Weighted accumulators
  v_mora_prom_w NUMERIC := 0;
  v_max_mora_w NUMERIC := 0;
  v_concentracion_w NUMERIC := 0;
  -- Trend tracking
  v_mora_proms NUMERIC[] := '{}';
  v_has_90d_count INTEGER := 0;
  -- Score components
  v_score_mora_prom NUMERIC;
  v_score_max_mora NUMERIC;
  v_score_concentracion NUMERIC;
  v_score_num_facturas NUMERIC;
  v_score_antiguedad NUMERIC;
  v_score_base NUMERIC;
  v_bonus_pts NUMERIC := 0;
  v_penalty_pts NUMERIC := 0;
  v_score_final NUMERIC;
  v_tendencia TEXT := 'sin_historial';
  -- Dates
  v_primera_fecha DATE;
  -- JSON results
  v_historial JSONB := '[]'::JSONB;
  v_facturas_vencidas JSONB := '[]'::JSONB;
  v_num_cargas INTEGER := 0;
BEGIN
  -- Loop through all cargas for this client, most recent first
  FOR v_carga_id, v_carga_fecha IN (
    SELECT hc.id, hc.fecha_corte::DATE
    FROM historial_cargas hc
    WHERE EXISTS (
      SELECT 1 FROM cartera_items ci
      WHERE ci.carga_id = hc.id AND ci.tercero_nit = p_nit
    )
    ORDER BY hc.fecha_corte DESC
  )
  LOOP
    v_idx := v_idx + 1;
    v_weight := POWER(0.7, v_idx - 1);

    -- Calculate period metrics
    SELECT
      COALESCE(AVG(GREATEST(0, CURRENT_DATE - ci.fecha_vencimiento::date)), 0),
      COALESCE(MAX(GREATEST(0, CURRENT_DATE - ci.fecha_vencimiento::date)), 0),
      COALESCE(SUM(ci.valor_saldo), 0),
      COALESCE(SUM(CASE WHEN CURRENT_DATE > ci.fecha_vencimiento::date THEN ci.valor_saldo ELSE 0 END), 0),
      COALESCE(MAX(CASE WHEN GREATEST(0, CURRENT_DATE - ci.fecha_vencimiento::date) > 90 THEN 1 ELSE 0 END), 0),
      COUNT(*)
    INTO v_period_mora_prom, v_period_max_mora, v_period_total_saldo,
         v_period_vencida_saldo, v_period_has_90, v_period_num_facturas
    FROM cartera_items ci
    WHERE ci.carga_id = v_carga_id AND ci.tercero_nit = p_nit;

    v_period_concentracion := CASE
      WHEN v_period_total_saldo > 0
        THEN v_period_vencida_saldo / v_period_total_saldo * 100
      ELSE 0
    END;

    -- Accumulate weighted metrics
    v_mora_prom_w     := v_mora_prom_w     + v_period_mora_prom     * v_weight;
    v_max_mora_w      := v_max_mora_w      + v_period_max_mora      * v_weight;
    v_concentracion_w := v_concentracion_w + v_period_concentracion * v_weight;
    v_total_weight    := v_total_weight    + v_weight;

    -- Track trend data (1-based array: [1]=most recent)
    v_mora_proms := v_mora_proms || ARRAY[v_period_mora_prom];
    IF v_period_has_90 = 1 THEN
      v_has_90d_count := v_has_90d_count + 1;
    END IF;

    -- Historial periodos entry
    v_historial := v_historial || jsonb_build_array(jsonb_build_object(
      'fecha_corte', v_carga_fecha,
      'mora_promedio', ROUND(v_period_mora_prom::NUMERIC, 1),
      'peso', ROUND(v_weight::NUMERIC, 3)
    ));

    -- Overdue invoices from most recent carga only
    IF v_idx = 1 THEN
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'documento_id', ci.documento,
          'fecha_vencimiento', ci.fecha_vencimiento,
          'dias_mora', GREATEST(0, CURRENT_DATE - ci.fecha_vencimiento::date),
          'valor_saldo', ci.valor_saldo
        ) ORDER BY (CURRENT_DATE - ci.fecha_vencimiento::date) DESC
      ), '[]'::JSONB)
      INTO v_facturas_vencidas
      FROM cartera_items ci
      WHERE ci.carga_id = v_carga_id
        AND ci.tercero_nit = p_nit
        AND CURRENT_DATE > ci.fecha_vencimiento::date;
    END IF;

    -- Track earliest date
    IF v_primera_fecha IS NULL OR v_carga_fecha < v_primera_fecha THEN
      v_primera_fecha := v_carga_fecha;
    END IF;

    v_num_cargas := v_idx;
  END LOOP;

  -- No data found
  IF v_num_cargas = 0 THEN
    RETURN json_build_object(
      'score', 0, 'nivel', 'Sin datos', 'plazo_sugerido_dias', 0,
      'num_cargas_analizadas', 0, 'tendencia', 'sin_datos',
      'detalles', json_build_object(),
      'historial_periodos', '[]'::json,
      'facturas_vencidas', '[]'::json
    );
  END IF;

  -- Normalize weighted averages
  v_mora_prom_w     := v_mora_prom_w     / v_total_weight;
  v_max_mora_w      := v_max_mora_w      / v_total_weight;
  v_concentracion_w := v_concentracion_w / v_total_weight;

  -- Sub-score: mora promedio (0d=100 → 90d+=10)
  v_score_mora_prom := CASE
    WHEN v_mora_prom_w <=  0 THEN 100
    WHEN v_mora_prom_w <= 15 THEN 100 - (v_mora_prom_w / 15.0) * 15
    WHEN v_mora_prom_w <= 30 THEN  85 - ((v_mora_prom_w - 15) / 15.0) * 20
    WHEN v_mora_prom_w <= 60 THEN  65 - ((v_mora_prom_w - 30) / 30.0) * 30
    WHEN v_mora_prom_w <= 90 THEN  35 - ((v_mora_prom_w - 60) / 30.0) * 25
    ELSE 10
  END;

  -- Sub-score: max mora (0d=100 → 90d+=5)
  v_score_max_mora := CASE
    WHEN v_max_mora_w <=  0 THEN 100
    WHEN v_max_mora_w <= 30 THEN 100 - (v_max_mora_w / 30.0) * 30
    WHEN v_max_mora_w <= 60 THEN  70 - ((v_max_mora_w - 30) / 30.0) * 35
    WHEN v_max_mora_w <= 90 THEN  35 - ((v_max_mora_w - 60) / 30.0) * 30
    ELSE 5
  END;

  -- Sub-score: concentración vencida (linear: 0%→100pts, 100%→0pts)
  v_score_concentracion := GREATEST(0, 100 - v_concentracion_w);

  -- Sub-score: historial (number of cargas)
  v_score_num_facturas := CASE
    WHEN v_num_cargas >= 5 THEN 90
    WHEN v_num_cargas >= 3 THEN 70
    WHEN v_num_cargas =  2 THEN 50
    ELSE 30
  END;

  -- Sub-score: antigüedad (365 days = 100 pts)
  v_score_antiguedad := CASE
    WHEN v_primera_fecha IS NULL THEN 0
    ELSE LEAST(100, (CURRENT_DATE - v_primera_fecha) / 3.65)
  END;

  -- Weighted base score
  v_score_base :=
      v_score_mora_prom     * 0.35
    + v_score_max_mora      * 0.20
    + v_score_concentracion * 0.20
    + v_score_num_facturas  * 0.10
    + v_score_antiguedad    * 0.15;

  -- Bonus: últimas 3+ cargas con mora prom < 15d each (+10)
  IF v_num_cargas >= 3
    AND v_mora_proms[1] < 15
    AND v_mora_proms[2] < 15
    AND v_mora_proms[3] < 15
  THEN
    v_bonus_pts := v_bonus_pts + 10;
  END IF;

  -- Bonus/tendencia: mora bajando en últimas 3 cargas (most recent=[1]) (+5)
  IF v_num_cargas >= 3
    AND v_mora_proms[1] < v_mora_proms[2]
    AND v_mora_proms[2] < v_mora_proms[3]
  THEN
    v_bonus_pts := v_bonus_pts + 5;
    v_tendencia := 'mejorando';
  ELSIF v_num_cargas >= 3
    AND v_mora_proms[1] > v_mora_proms[2]
    AND v_mora_proms[2] > v_mora_proms[3]
  THEN
    v_tendencia := 'empeorando';
  ELSIF v_num_cargas >= 2 THEN
    v_tendencia := 'estable';
  END IF;

  -- Penalty: 2+ cargas with any 90d+ mora (-15)
  IF v_has_90d_count >= 2 THEN
    v_penalty_pts := v_penalty_pts + 15;
  END IF;

  v_score_final := GREATEST(0, LEAST(100,
    ROUND(v_score_base + v_bonus_pts - v_penalty_pts)
  ));

  RETURN json_build_object(
    'score', v_score_final,
    'nivel', CASE
      WHEN v_score_final >= 80 THEN 'Excelente'
      WHEN v_score_final >= 65 THEN 'Bueno'
      WHEN v_score_final >= 45 THEN 'Regular'
      WHEN v_score_final >= 25 THEN 'Riesgo'
      ELSE 'Alto riesgo'
    END,
    'plazo_sugerido_dias', CASE
      WHEN v_score_final >= 80 THEN 45
      WHEN v_score_final >= 65 THEN 30
      WHEN v_score_final >= 45 THEN 15
      WHEN v_score_final >= 25 THEN 8
      ELSE 0
    END,
    'num_cargas_analizadas', v_num_cargas,
    'tendencia', v_tendencia,
    'detalles', json_build_object(
      'mora_promedio_ponderada', ROUND(v_mora_prom_w::NUMERIC, 1),
      'max_mora_ponderada', ROUND(v_max_mora_w::NUMERIC, 1),
      'concentracion_vencida_pct', ROUND(v_concentracion_w::NUMERIC, 1),
      'num_cargas', v_num_cargas,
      'antiguedad_dias', COALESCE(CURRENT_DATE - v_primera_fecha, 0),
      'scores_parciales', json_build_object(
        'mora_prom',      ROUND(v_score_mora_prom::NUMERIC),
        'max_mora',       ROUND(v_score_max_mora::NUMERIC),
        'concentracion',  ROUND(v_score_concentracion::NUMERIC),
        'num_facturas',   ROUND(v_score_num_facturas::NUMERIC),
        'antiguedad',     ROUND(v_score_antiguedad::NUMERIC)
      ),
      'bonus_pts',   v_bonus_pts,
      'penalty_pts', v_penalty_pts
    ),
    'historial_periodos', v_historial,
    'facturas_vencidas',  v_facturas_vencidas
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_calcular_credit_score(TEXT) TO anon, authenticated;
```

**Step 2: Verify the function works**

Run via `mcp__supabase-distrimm__execute_sql`:
```sql
SELECT fn_calcular_credit_score('828000345');
```
Expected: JSON with `score`, `nivel`, `num_cargas_analizadas` > 0, `historial_periodos` array.

---

### Task 2: Add trend history section to CreditScoreCard

**Files:**
- Modify: `src/components/dashboard/CreditScoreCard.jsx`

**Step 1: Add TrendBars sub-component**

Add after the `MetricChip` component definition (around line 131):

```jsx
const getMoraBarColor = (mora) => {
  if (mora === 0)  return "bg-emerald-400";
  if (mora <= 15)  return "bg-sky-400";
  if (mora <= 30)  return "bg-amber-400";
  if (mora <= 60)  return "bg-orange-400";
  return "bg-rose-500";
};
```

**Step 2: Add Tendencia Histórica section**

In the main render, after the `{/* 4. Overdue invoices table */}` block (inside the `!loading && !fetchError && scoreData &&` block), add:

```jsx
{/* 5. Tendencia Histórica */}
{(scoreData.historial_periodos ?? []).length > 1 && (
  <div className="space-y-1.5 pt-1">
    <p className="text-[10px] font-semibold text-navy-400 uppercase tracking-[0.06em]">
      Tendencia Histórica ({scoreData.num_cargas_analizadas} cargas)
    </p>
    <div className="space-y-1">
      {scoreData.historial_periodos.map((periodo, idx) => {
        const mora = periodo.mora_promedio ?? 0;
        const barWidth = Math.min(100, mora > 0 ? (mora / 90) * 100 : 0);
        return (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-[9px] text-navy-300 w-16 shrink-0 font-mono">
              {typeof periodo.fecha_corte === "string"
                ? periodo.fecha_corte.slice(0, 7)
                : ""}
            </span>
            <div className="flex-1 h-2.5 bg-navy-50 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${getMoraBarColor(mora)}`}
                style={{ width: barWidth === 0 ? "4px" : `${barWidth}%` }}
              />
            </div>
            <span className="text-[9px] font-mono font-semibold text-navy-600 w-8 text-right shrink-0">
              {mora}d
            </span>
          </div>
        );
      })}
    </div>
    {scoreData.tendencia && scoreData.tendencia !== "sin_historial" && (
      <p className={`text-[10px] font-semibold mt-1 ${
        scoreData.tendencia === "mejorando"
          ? "text-emerald-600"
          : scoreData.tendencia === "empeorando"
          ? "text-rose-500"
          : "text-navy-400"
      }`}>
        {scoreData.tendencia === "mejorando" ? "↑ Mejorando" :
         scoreData.tendencia === "empeorando" ? "↓ Empeorando" : "→ Estable"}
        {scoreData.detalles?.bonus_pts > 0 && ` (+${scoreData.detalles.bonus_pts} pts)`}
        {scoreData.detalles?.penalty_pts > 0 && ` (−${scoreData.detalles.penalty_pts} pts)`}
      </p>
    )}
  </div>
)}
```

---

### Task 3: Create ScoreCrediticioPage

**Files:**
- Create: `src/pages/ScoreCrediticioPage.jsx`

**Step 1: Create the file**

```jsx
import React, { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { Search, ShieldCheck, AlertCircle } from "lucide-react";
import CreditScoreCard from "../components/dashboard/CreditScoreCard";
import { formatFullCurrency } from "../components/dashboard/DashboardShared";

// ─── Helpers ───────────────────────────────────────────────────────────────

const moraBadgeClass = (dias) => {
  if (dias === 0)  return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (dias <= 30)  return "bg-amber-50 text-amber-700 border-amber-200";
  if (dias <= 60)  return "bg-orange-50 text-orange-700 border-orange-200";
  return "bg-rose-50 text-rose-700 border-rose-200";
};

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ScoreCrediticioPage() {
  const context = useOutletContext();
  const { data = {} } = context || {};

  const [search, setSearch] = useState("");
  const [selectedNit, setSelectedNit] = useState(null);
  const [selectedName, setSelectedName] = useState(null);

  const clients = useMemo(() => {
    const agg = data.aggregatedClients ?? [];
    if (!search.trim()) return agg;
    const q = search.toLowerCase();
    return agg.filter((c) => (c.name ?? "").toLowerCase().includes(q));
  }, [data.aggregatedClients, search]);

  const handleSelect = (client) => {
    const nit = client.items?.[0]?.tercero_nit ?? null;
    if (!nit) return;
    setSelectedNit(nit);
    setSelectedName(client.name);
  };

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-128px)] overflow-hidden -mx-4 sm:-mx-6 lg:-mx-10 -my-6">
      {/* ── Left Panel: Client List ── */}
      <div className="flex flex-col w-full md:w-72 lg:w-80 border-r border-slate-200 bg-white shrink-0 overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={16} className="text-indigo-600" />
            <h1 className="text-sm font-bold text-slate-800">Score Crediticio</h1>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none bg-slate-50"
            />
          </div>
        </div>

        {/* Client list */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4 gap-2">
              <AlertCircle size={20} className="text-slate-300" />
              <p className="text-xs text-slate-400">
                {data.aggregatedClients?.length === 0
                  ? "Sin datos cargados"
                  : "Sin resultados"}
              </p>
            </div>
          ) : (
            clients.map((client) => {
              const nit = client.items?.[0]?.tercero_nit ?? null;
              const isSelected = nit && nit === selectedNit;
              const maxD = client.maxMora ?? 0;
              const badgeCls = moraBadgeClass(maxD);
              return (
                <button
                  key={client.name}
                  onClick={() => handleSelect(client)}
                  disabled={!nit}
                  className={`w-full text-left px-4 py-3 transition-colors border-l-2 ${
                    isSelected
                      ? "bg-indigo-50 border-indigo-500"
                      : "border-transparent hover:bg-slate-50"
                  } ${!nit ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={`text-[11px] font-semibold truncate ${
                        isSelected ? "text-indigo-700" : "text-slate-700"
                      }`}>
                        {client.name}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                        {formatFullCurrency(client.deuda ?? 0)}
                      </p>
                    </div>
                    {maxD > 0 && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${badgeCls}`}>
                        {maxD}d
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-100 shrink-0">
          <p className="text-[10px] text-slate-400 text-center">
            {clients.length} cliente{clients.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* ── Right Panel: Score Detail ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {selectedNit ? (
          <div className="max-w-xl mx-auto">
            <p className="text-[11px] font-semibold text-slate-500 mb-3 uppercase tracking-wide">
              {selectedName}
            </p>
            <CreditScoreCard nit={selectedNit} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="p-4 rounded-2xl bg-indigo-50 text-indigo-300 ring-1 ring-indigo-100">
              <ShieldCheck size={32} strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-600">Selecciona un cliente</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                Elige un cliente de la lista para ver su score crediticio basado en el historial completo de cargas
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

### Task 4: Add nav link to MainLayout

**Files:**
- Modify: `src/layouts/MainLayout.jsx`

**Step 1: Add ShieldCheck to lucide-react imports**

In the import block, add `ShieldCheck` alongside the existing icons (around line 9–26):

```jsx
import {
  LayoutDashboard,
  Users,
  Database,
  Clock,
  Menu,
  X,
  Upload,
  LogOut,
  Layers,
  Briefcase,
  Building2,
  Brain,
  ChevronLeft,
  User,
  MessageCircle,
  BotMessageSquare,
  ShieldCheck,   // ADD THIS
} from "lucide-react";
```

**Step 2: Add nav entry to ANALISIS section**

In `navSections`, find the ANALISIS section and add `score-crediticio` after `vendedores`:

```js
{
  label: "ANALISIS",
  links: [
    { to: "/clientes",          icon: Users,       text: "Cartera Clientes" },
    { to: "/directorio",        icon: Building2,   text: "Directorio" },
    { to: "/vendedores",        icon: Briefcase,   text: "Vendedores" },
    { to: "/score-crediticio",  icon: ShieldCheck, text: "Score Crediticio" },  // ADD
  ],
},
```

---

### Task 5: Register route in App.jsx

**Files:**
- Modify: `src/App.jsx`

**Step 1: Import ScoreCrediticioPage**

Add import alongside other page imports (after line 17):

```jsx
import ScoreCrediticioPage from "./pages/ScoreCrediticioPage";
```

**Step 2: Add route inside the DashboardManager route group**

After `<Route path="chatbot" element={<ChatbotPage />} />` (line 58), add:

```jsx
<Route path="score-crediticio" element={<ScoreCrediticioPage />} />
```

---

### Task 6: Smoke test

**Step 1: Start dev server**

```bash
pnpm dev
```

**Step 2: Manual verification checklist**

1. Sidebar shows "Score Crediticio" entry under ANALISIS with shield icon
2. Navigating to `/score-crediticio` shows the two-column layout
3. Client list populates with names and debt amounts
4. Searching by name filters the list in real time
5. Clicking a client loads the score card on the right
6. Score card shows: gauge, level badge, plazo, 5 sub-score bars, metric chips
7. If client has 2+ cargas: "Tendencia Histórica" section appears with colored bars per carga
8. Tendencia label (Mejorando/Empeorando/Estable) appears with bonus/penalty pts
9. Score reflects historical weighting (clients with good recent history score higher than v1)
10. `/clientes` still works — existing CreditScoreCard in ClientCard still shows the improved score
