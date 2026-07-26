# Credit Score v3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add configurable global max credit term (plazo máximo) and harden mora scoring with steeper penalties for 60d+ late invoices and widespread overdue patterns.

**Architecture:** Two independent changes: (1) SQL function replaced in-place with v3 logic + new `distrimm_config` table for global config; (2) frontend scaling in `CreditScoreCard` using a `maxPlazo` prop fed from `ScoreCrediticioPage`. No changes to the RPC call signature.

**Tech Stack:** PostgreSQL PL/pgSQL (Supabase MCP `mcp__supabase-distrimm`), React 19, Tailwind CSS 4, lucide-react, sileo (toasts).

---

### Task 1: Create `distrimm_config` table and deploy SQL function v3

**Files:**
- Supabase MCP: `mcp__supabase-distrimm__apply_migration`

**Step 1: Apply migration `credit_score_v3`**

Use `mcp__supabase-distrimm__apply_migration` with name `credit_score_v3` and this SQL:

```sql
-- Config table (single-row pattern)
CREATE TABLE IF NOT EXISTS distrimm_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  max_plazo_dias INTEGER NOT NULL DEFAULT 45,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO distrimm_config (id, max_plazo_dias) VALUES (1, 45)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE distrimm_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_authenticated_select" ON distrimm_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "allow_authenticated_update" ON distrimm_config
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- SQL function v3 (replaces v2)
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
  v_period_mora_prom NUMERIC;
  v_period_max_mora NUMERIC;
  v_period_total_saldo NUMERIC;
  v_period_vencida_saldo NUMERIC;
  v_period_concentracion NUMERIC;
  v_period_has_90 INTEGER;
  v_period_facturas_vencidas_count INTEGER;
  v_period_facturas_60d_count INTEGER;
  v_period_mora_grave_pct NUMERIC;
  v_mora_prom_w NUMERIC := 0;
  v_max_mora_w NUMERIC := 0;
  v_concentracion_w NUMERIC := 0;
  v_mora_proms NUMERIC[] := '{}';
  v_has_90d_count INTEGER := 0;
  v_mora_grave_actual_pct NUMERIC := 0;
  v_mora_grave_cargas_count INTEGER := 0;
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
  v_primera_fecha DATE;
  v_historial JSONB := '[]'::JSONB;
  v_facturas_vencidas JSONB := '[]'::JSONB;
  v_num_cargas INTEGER := 0;
BEGIN
  FOR v_carga_id, v_carga_fecha IN (
    SELECT hc.id, hc.fecha_corte::DATE
    FROM historial_cargas hc
    WHERE hc.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM cartera_items ci
        WHERE ci.carga_id = hc.id
          AND ci.tercero_nit = p_nit
          AND ci.deleted_at IS NULL
      )
    ORDER BY hc.fecha_corte DESC
  )
  LOOP
    v_idx := v_idx + 1;
    v_weight := POWER(0.7, v_idx - 1);

    SELECT
      COALESCE(AVG(GREATEST(0, CURRENT_DATE - ci.fecha_vencimiento::date)), 0),
      COALESCE(MAX(GREATEST(0, CURRENT_DATE - ci.fecha_vencimiento::date)), 0),
      COALESCE(SUM(ci.valor_saldo), 0),
      COALESCE(SUM(CASE WHEN CURRENT_DATE > ci.fecha_vencimiento::date THEN ci.valor_saldo ELSE 0 END), 0),
      COALESCE(MAX(CASE WHEN GREATEST(0, CURRENT_DATE - ci.fecha_vencimiento::date) > 90 THEN 1 ELSE 0 END), 0),
      COUNT(*) FILTER (WHERE GREATEST(0, CURRENT_DATE - ci.fecha_vencimiento::date) > 0),
      COUNT(*) FILTER (WHERE GREATEST(0, CURRENT_DATE - ci.fecha_vencimiento::date) > 60)
    INTO v_period_mora_prom, v_period_max_mora, v_period_total_saldo,
         v_period_vencida_saldo, v_period_has_90,
         v_period_facturas_vencidas_count, v_period_facturas_60d_count
    FROM cartera_items ci
    WHERE ci.carga_id = v_carga_id
      AND ci.tercero_nit = p_nit
      AND ci.deleted_at IS NULL;

    v_period_concentracion := CASE
      WHEN v_period_total_saldo > 0
        THEN v_period_vencida_saldo / v_period_total_saldo * 100
      ELSE 0
    END;

    v_period_mora_grave_pct := CASE
      WHEN v_period_facturas_vencidas_count > 0
        THEN v_period_facturas_60d_count * 100.0 / v_period_facturas_vencidas_count
      ELSE 0
    END;

    v_mora_prom_w     := v_mora_prom_w     + v_period_mora_prom     * v_weight;
    v_max_mora_w      := v_max_mora_w      + v_period_max_mora      * v_weight;
    v_concentracion_w := v_concentracion_w + v_period_concentracion * v_weight;
    v_total_weight    := v_total_weight    + v_weight;

    v_mora_proms := v_mora_proms || ARRAY[v_period_mora_prom];
    IF v_period_has_90 = 1 THEN
      v_has_90d_count := v_has_90d_count + 1;
    END IF;

    IF v_idx = 1 THEN
      v_mora_grave_actual_pct := v_period_mora_grave_pct;
    END IF;
    IF v_period_mora_grave_pct > 30 THEN
      v_mora_grave_cargas_count := v_mora_grave_cargas_count + 1;
    END IF;

    v_historial := v_historial || jsonb_build_array(jsonb_build_object(
      'fecha_corte', v_carga_fecha,
      'mora_promedio', ROUND(v_period_mora_prom::NUMERIC, 1),
      'peso', ROUND(v_weight::NUMERIC, 3),
      'mora_grave_pct', ROUND(v_period_mora_grave_pct::NUMERIC, 1)
    ));

    IF v_idx = 1 THEN
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'documento_id', ci.documento_id,
          'fecha_vencimiento', ci.fecha_vencimiento,
          'dias_mora', GREATEST(0, CURRENT_DATE - ci.fecha_vencimiento::date),
          'valor_saldo', ci.valor_saldo
        ) ORDER BY (CURRENT_DATE - ci.fecha_vencimiento::date) DESC
      ), '[]'::JSONB)
      INTO v_facturas_vencidas
      FROM cartera_items ci
      WHERE ci.carga_id = v_carga_id
        AND ci.tercero_nit = p_nit
        AND ci.deleted_at IS NULL
        AND CURRENT_DATE > ci.fecha_vencimiento::date;
    END IF;

    IF v_primera_fecha IS NULL OR v_carga_fecha < v_primera_fecha THEN
      v_primera_fecha := v_carga_fecha;
    END IF;

    v_num_cargas := v_idx;
  END LOOP;

  IF v_num_cargas = 0 THEN
    RETURN json_build_object(
      'score', 0, 'nivel', 'Sin datos', 'plazo_sugerido_dias', 0,
      'num_cargas_analizadas', 0, 'tendencia', 'sin_datos',
      'detalles', json_build_object(),
      'historial_periodos', '[]'::json,
      'facturas_vencidas', '[]'::json
    );
  END IF;

  v_mora_prom_w     := v_mora_prom_w     / v_total_weight;
  v_max_mora_w      := v_max_mora_w      / v_total_weight;
  v_concentracion_w := v_concentracion_w / v_total_weight;

  -- Sub-score: mora promedio (unchanged from v2)
  v_score_mora_prom := CASE
    WHEN v_mora_prom_w <=  0 THEN 100
    WHEN v_mora_prom_w <= 15 THEN 100 - (v_mora_prom_w / 15.0) * 15
    WHEN v_mora_prom_w <= 30 THEN  85 - ((v_mora_prom_w - 15) / 15.0) * 20
    WHEN v_mora_prom_w <= 60 THEN  65 - ((v_mora_prom_w - 30) / 30.0) * 30
    WHEN v_mora_prom_w <= 90 THEN  35 - ((v_mora_prom_w - 60) / 30.0) * 25
    ELSE 10
  END;

  -- Sub-score: max mora (HARDER in v3: 60d=15, 90d=0)
  v_score_max_mora := CASE
    WHEN v_max_mora_w <=  0 THEN 100
    WHEN v_max_mora_w <= 15 THEN 100 - (v_max_mora_w / 15.0) * 10
    WHEN v_max_mora_w <= 30 THEN  90 - ((v_max_mora_w - 15) / 15.0) * 30
    WHEN v_max_mora_w <= 60 THEN  60 - ((v_max_mora_w - 30) / 30.0) * 45
    WHEN v_max_mora_w <= 90 THEN  15 - ((v_max_mora_w - 60) / 30.0) * 15
    ELSE 0
  END;

  v_score_concentracion := GREATEST(0, 100 - v_concentracion_w);

  v_score_num_facturas := CASE
    WHEN v_num_cargas >= 5 THEN 90
    WHEN v_num_cargas >= 3 THEN 70
    WHEN v_num_cargas =  2 THEN 50
    ELSE 30
  END;

  v_score_antiguedad := CASE
    WHEN v_primera_fecha IS NULL THEN 0
    ELSE LEAST(100, (CURRENT_DATE - v_primera_fecha) / 3.65::NUMERIC)
  END;

  v_score_base :=
      v_score_mora_prom     * 0.35
    + v_score_max_mora      * 0.20
    + v_score_concentracion * 0.20
    + v_score_num_facturas  * 0.10
    + v_score_antiguedad    * 0.15;

  -- Bonus: últimas 3+ cargas con mora prom < 15d
  IF v_num_cargas >= 3
    AND v_mora_proms[1] < 15
    AND v_mora_proms[2] < 15
    AND v_mora_proms[3] < 15
  THEN
    v_bonus_pts := v_bonus_pts + 10;
  END IF;

  -- Bonus/tendencia
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

  -- Penalty: 2+ cargas with 90d+ mora
  IF v_has_90d_count >= 2 THEN
    v_penalty_pts := v_penalty_pts + 15;
  END IF;

  -- NEW v3: mora grave generalizada actual (>30% facturas con 60d+) → −15
  IF v_mora_grave_actual_pct > 30 THEN
    v_penalty_pts := v_penalty_pts + 15;
  END IF;

  -- NEW v3: mora grave crónica (2+ cargas históricas con >30% 60d+) → −10
  IF v_mora_grave_cargas_count >= 2 THEN
    v_penalty_pts := v_penalty_pts + 10;
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
      'penalty_pts', v_penalty_pts,
      'mora_grave_actual_pct',       ROUND(v_mora_grave_actual_pct::NUMERIC, 1),
      'mora_grave_cargas_historicas', v_mora_grave_cargas_count
    ),
    'historial_periodos', v_historial,
    'facturas_vencidas',  v_facturas_vencidas
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_calcular_credit_score(TEXT) TO anon, authenticated;
```

**Step 2: Verify**

Run via `mcp__supabase-distrimm__execute_sql`:
```sql
-- Verify config table
SELECT * FROM distrimm_config;

-- Verify function still works with enriched output
SELECT fn_calcular_credit_score('828000345');
```

Expected: config table has 1 row with `max_plazo_dias=45`. Function returns JSON with `detalles.mora_grave_actual_pct` and `detalles.mora_grave_cargas_historicas` fields present. `historial_periodos` entries now include `mora_grave_pct`.

---

### Task 2: Add `getConfig` / `updateConfig` to portfolioService.js

**Files:**
- Modify: `src/services/portfolioService.js`

**Step 1: Add config functions at the bottom of the file**

Append these two exports after the last existing export:

```js
// ============================================================================
// CONFIG
// ============================================================================

/**
 * Fetches global app config (single row, id=1).
 */
export const getConfig = async () => {
  try {
    const { data, error } = await supabase
      .from("distrimm_config")
      .select("*")
      .eq("id", 1)
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error("[portfolioService] Error fetching config:", error);
    return { data: null, error };
  }
};

/**
 * Updates global app config.
 * @param {{ max_plazo_dias: number }} updates
 */
export const updateConfig = async (updates) => {
  try {
    const { data, error } = await supabase
      .from("distrimm_config")
      .upsert({ id: 1, ...updates, updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error("[portfolioService] Error updating config:", error);
    return { data: null, error };
  }
};
```

---

### Task 3: Add plazo máximo config UI to ScoreCrediticioPage

**Files:**
- Modify: `src/pages/ScoreCrediticioPage.jsx`

**Step 1: Update imports**

Replace the current import line:
```jsx
import React, { useState, useMemo } from "react";
```
With:
```jsx
import React, { useState, useMemo, useEffect, useRef } from "react";
```

Add two more imports after the existing ones:
```jsx
import { getConfig, updateConfig } from "../services/portfolioService";
import { toast } from "sileo";
```

**Step 2: Add maxPlazo state and config loading**

Inside `ScoreCrediticioPage`, after the existing state declarations (`selectedName` on line 24), add:

```jsx
const [maxPlazo, setMaxPlazo] = useState(45);
const saveTimerRef = useRef(null);

// Load config on mount
useEffect(() => {
  getConfig().then(({ data }) => {
    if (data?.max_plazo_dias) setMaxPlazo(data.max_plazo_dias);
  });
}, []);

const handleMaxPlazoChange = (val) => {
  const n = Math.max(1, Math.min(90, Number(val) || 45));
  setMaxPlazo(n);
  clearTimeout(saveTimerRef.current);
  saveTimerRef.current = setTimeout(async () => {
    const { error } = await updateConfig({ max_plazo_dias: n });
    if (!error) toast.success("Plazo máximo guardado");
  }, 800);
};
```

**Step 3: Add the config input to the left panel header**

In the header section (after the search input `</div>` closing tag, around line 59), add:

```jsx
{/* Plazo máximo */}
<div className="flex items-center justify-between mt-2 px-0.5">
  <label className="text-[10px] text-slate-500 font-medium">Plazo máx.</label>
  <div className="flex items-center gap-1">
    <input
      type="number"
      min={1}
      max={90}
      value={maxPlazo}
      onChange={(e) => handleMaxPlazoChange(e.target.value)}
      className="w-12 text-center text-xs font-mono font-semibold rounded border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none py-0.5"
    />
    <span className="text-[10px] text-slate-400">días</span>
  </div>
</div>
```

**Step 4: Pass maxPlazo to CreditScoreCard**

Find the line:
```jsx
<CreditScoreCard nit={selectedNit} />
```

Replace with:
```jsx
<CreditScoreCard nit={selectedNit} maxPlazo={maxPlazo} />
```

---

### Task 4: Update CreditScoreCard to display scaled plazo

**Files:**
- Modify: `src/components/dashboard/CreditScoreCard.jsx`

**Step 1: Accept maxPlazo prop**

Find the component signature:
```jsx
const CreditScoreCard = ({ nit, onClose }) => {
```

Replace with:
```jsx
const CreditScoreCard = ({ nit, onClose, maxPlazo = 45 }) => {
```

**Step 2: Compute plazoEfectivo**

Find this block (inside the `scoreData` render section, around where `plazo_sugerido_dias` is displayed):
```jsx
<p className="text-[11px] text-navy-500">
  Plazo de crédito sugerido:{" "}
  <span className="font-semibold font-mono text-navy-800">
    {scoreData.plazo_sugerido_dias ?? "—"} días
  </span>
</p>
```

Replace with:
```jsx
<p className="text-[11px] text-navy-500">
  Plazo de crédito sugerido:{" "}
  <span className="font-semibold font-mono text-navy-800">
    {scoreData.plazo_sugerido_dias != null
      ? Math.round(scoreData.plazo_sugerido_dias * maxPlazo / 45)
      : "—"}{" "}
    días
  </span>
  {maxPlazo !== 45 && (
    <span className="text-[9px] text-navy-300 ml-1">(máx. {maxPlazo}d)</span>
  )}
</p>
```

---

### Task 5: Smoke test

**Step 1: Build**
```bash
cd c:/Users/Santi/OneDrive/Desktop/Desarrollo/DistriMM && npx vite build
```
Expected: No errors. Chunk size warning is normal.

**Step 2: Manual checklist (run `pnpm dev` and verify in browser)**

1. Navigate to `/score-crediticio` — left panel shows "Plazo máx." input below the search box with value 45
2. Change input to 30 — wait ~1s — toast "Plazo máximo guardado" appears
3. Select a client — score card shows "Plazo de crédito sugerido: X días (máx. 30d)"
   - If client was Excelente (base 45d): shows 30d
   - If client was Bueno (base 30d): shows 20d
4. Reload page — input shows 30 (loaded from Supabase)
5. Change back to 45 — plazo label removes "(máx. 45d)" hint (maxPlazo === 45 hides the note)
6. Score for any client with many 60d+ overdue invoices should be noticeably lower than before (v3 penalties active)
7. `detalles.mora_grave_actual_pct` visible in browser devtools network response (raw JSON from RPC)
