# Credit Score v3 Design: Plazo Configurable + Penalidades de Mora Graves

**Date:** 2026-02-20
**Status:** Approved

---

## Overview

Two enhancements to the credit score system:

1. **Plazo máximo configurable**: Un valor global (empresa-wide) que escala proporcionalmente todos los plazos sugeridos. Configurable desde la página de Score Crediticio.
2. **Penalidades de mora más duras**: Curva más agresiva para mora individual + nuevos penalties para mora generalizada (>30% de facturas vencidas con 60d+).

---

## Feature 1: Plazo Máximo Configurable

### Data Layer

**Nueva tabla Supabase** `distrimm_config` (single-row pattern):
```sql
CREATE TABLE IF NOT EXISTS distrimm_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  max_plazo_dias INTEGER NOT NULL DEFAULT 45,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO distrimm_config (id, max_plazo_dias) VALUES (1, 45)
  ON CONFLICT (id) DO NOTHING;
```
RLS: lectura pública (authenticated), escritura autenticada.

**`portfolioService.js`** — 2 nuevas funciones:
- `getConfig()` → `supabase.from('distrimm_config').select().single()`
- `updateConfig({ max_plazo_dias })` → `.upsert({ id: 1, max_plazo_dias, updated_at: new Date() })`

### ScoreCrediticioPage — Input de configuración

En el encabezado del panel izquierdo, debajo del título "Score Crediticio", añadir:

```
[Plazo máx.] [__45__d] ← input numérico, rango 1-90
```

- Se carga con `useEffect` al montar (llamada a `getConfig()`)
- Auto-guarda con debounce 800ms al cambiar el valor
- Toast "Plazo máximo guardado" al guardar exitosamente
- El valor se pasa como prop `maxPlazo` al `CreditScoreCard`

### CreditScoreCard — Escalado proporcional

Nueva prop opcional: `maxPlazo` (default: 45).

Fórmula de escalado aplicada al mostrar:
```js
const plazoEfectivo = Math.round((scoreData.plazo_sugerido_dias ?? 0) * maxPlazo / 45);
```

Tabla resultante con maxPlazo=30:
| Nivel | Base (45d max) | Escalado (30d max) |
|---|---|---|
| Excelente | 45d | 30d |
| Bueno | 30d | 20d |
| Regular | 15d | 10d |
| Riesgo | 8d | 5d |
| Alto riesgo | 0d | 0d |

**Retrocompatibilidad**: El `CreditScoreCard` en `DashboardShared.jsx` (dentro de ClientCard) no pasa `maxPlazo` → usa default 45, sin cambios.

---

## Feature 2: Penalidades de Mora Graves

### A) Curva max_mora más agresiva (sub-score, 20% del score base)

| Mora máx. | Score anterior | Score nuevo |
|---|---|---|
| 0d | 100 | 100 |
| 15d | ~93 | 90 |
| 30d | 70 | 60 |
| 60d | 35 | **15** |
| 90d+ | 5 | **0** |

SQL v3:
```sql
v_score_max_mora := CASE
  WHEN v_max_mora_w <=  0 THEN 100
  WHEN v_max_mora_w <= 15 THEN 100 - (v_max_mora_w / 15.0) * 10
  WHEN v_max_mora_w <= 30 THEN  90 - ((v_max_mora_w - 15) / 15.0) * 30
  WHEN v_max_mora_w <= 60 THEN  60 - ((v_max_mora_w - 30) / 30.0) * 45
  WHEN v_max_mora_w <= 90 THEN  15 - ((v_max_mora_w - 60) / 30.0) * 15
  ELSE 0
END;
```

### B) Nuevas variables por período

En el bucle de cargas, añadir:
```sql
v_period_facturas_vencidas_count  -- COUNT de facturas con dias_mora > 0
v_period_facturas_60d_count       -- COUNT de facturas con dias_mora > 60
v_period_mora_grave_pct           -- pct = 60d_count / NULLIF(vencidas_count,0) * 100
```

SQL:
```sql
SELECT
  COUNT(*) FILTER (WHERE GREATEST(0, CURRENT_DATE - ci.fecha_vencimiento::date) > 0),
  COUNT(*) FILTER (WHERE GREATEST(0, CURRENT_DATE - ci.fecha_vencimiento::date) > 60)
INTO v_period_facturas_vencidas_count, v_period_facturas_60d_count
FROM cartera_items ci
WHERE ci.carga_id = v_carga_id AND ci.tercero_nit = p_nit AND ci.deleted_at IS NULL;

v_period_mora_grave_pct := CASE
  WHEN v_period_facturas_vencidas_count > 0
    THEN v_period_facturas_60d_count * 100.0 / v_period_facturas_vencidas_count
  ELSE 0
END;
```

### C) Acumuladores de mora grave (fuera del bucle)

```sql
v_mora_grave_actual_pct   NUMERIC := 0;  -- del período más reciente
v_mora_grave_cargas_count INTEGER := 0;  -- cargas históricas con >30% grave
```

En el bucle:
```sql
IF v_idx = 1 THEN
  v_mora_grave_actual_pct := v_period_mora_grave_pct;
END IF;
IF v_period_mora_grave_pct > 30 THEN
  v_mora_grave_cargas_count := v_mora_grave_cargas_count + 1;
END IF;
```

### D) Nuevos penalties

```sql
-- Mora grave generalizada en carga actual (>30% facturas con 60d+)
IF v_mora_grave_actual_pct > 30 THEN
  v_penalty_pts := v_penalty_pts + 15;
END IF;

-- Mora grave crónica (aparece en 2+ cargas históricas)
IF v_mora_grave_cargas_count >= 2 THEN
  v_penalty_pts := v_penalty_pts + 10;
END IF;
```

Penalties totales posibles por mora grave: hasta −25 pts (ambas condiciones activas).

### E) Enriquecimiento del JSON de retorno

Añadir a `historial_periodos` entries:
```json
{ "fecha_corte": "2026-02-14", "mora_promedio": 8.5, "peso": 1.0, "mora_grave_pct": 42.3 }
```

Añadir a `detalles`:
```json
"mora_grave_actual_pct": 42.3,
"mora_grave_cargas_historicas": 2
```

---

## Files to Modify

| File | Change |
|---|---|
| Supabase (migration) | `distrimm_config_and_score_v3` — crea tabla config + reemplaza función |
| `src/services/portfolioService.js` | `getConfig()`, `updateConfig()` |
| `src/pages/ScoreCrediticioPage.jsx` | Header con input plazo máx., carga/guarda config, pasa prop a CreditScoreCard |
| `src/components/dashboard/CreditScoreCard.jsx` | Prop `maxPlazo`, muestra `plazoEfectivo` escalado |

---

## Penalty Summary (v3)

| Condición | Puntos |
|---|---|
| Últimas 3+ cargas mora prom < 15d | +10 |
| Tendencia mejorando (3 cargas) | +5 |
| 2+ cargas con alguna factura 90d+ | −15 |
| Mora grave generalizada actual (>30% con 60d+) | −15 |
| Mora grave crónica (2+ cargas con >30% 60d+) | −10 |

**Máximo bonus**: +15 pts
**Máximo penalty**: −40 pts
