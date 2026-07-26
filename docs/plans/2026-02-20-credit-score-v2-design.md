# Credit Score v2 — Design Doc
**Date:** 2026-02-20
**Status:** Approved

## Overview

Replace the existing single-carga credit score with a full historical model, and add a dedicated `/score-crediticio` page to the sidebar.

## Scoring Model v2

### Algorithm
- Fetch ALL cargas for the client from `historial_cargas` (ordered by `fecha_corte DESC`)
- For each carga, calculate per-period metrics from `cartera_items`
- Apply exponential decay weighting: carga N → weight = 0.7^(N-1)
  - Most recent carga = 1.0, previous = 0.7, next = 0.49, etc.

### Sub-scores (0–100 each, exponential penalties)
| Variable | Weight | Scoring |
|---|---|---|
| Mora promedio ponderada | 35% | 0d=100, 15d=85, 30d=65, 60d=35, 90d+=10 |
| Max mora actual | 20% | 0d=100, 30d=70, 60d=35, 90d+=5 |
| Concentración vencida | 20% | 0%=100, 100%=0 (linear) |
| Historial (nº cargas) | 10% | 1=30, 2=50, 3-4=70, 5+=90 |
| Antigüedad real | 15% | Days since first ever appearance across ALL cargas |

### Bonuses / Penalties (applied after weighted score)
| Condition | Adjustment |
|---|---|
| Últimas 3+ cargas con mora prom < 15d | +10 pts |
| Tendencia mejorando (mora bajando en últimas 3 cargas) | +5 pts |
| 2+ cargas con alguna factura mora > 90d | −15 pts |

Final score clamped to [0, 100].

### Levels & Credit Terms
| Score | Nivel | Plazo sugerido |
|---|---|---|
| 80–100 | Excelente | 45 días |
| 65–79 | Bueno | 30 días |
| 45–64 | Regular | 15 días |
| 25–44 | Riesgo | 8 días |
| 0–24 | Alto riesgo | 0 días |

### Return JSON (additions vs v1)
```json
{
  "score": 74,
  "nivel": "Bueno",
  "plazo_sugerido_dias": 30,
  "num_cargas_analizadas": 4,
  "tendencia": "mejorando",
  "detalles": { "...same as v1 plus bonus_pts, penalty_pts" },
  "historial_periodos": [
    { "fecha_corte": "2026-02-01", "mora_promedio": 8, "peso": 1.0 },
    { "fecha_corte": "2025-12-01", "mora_promedio": 22, "peso": 0.7 }
  ],
  "facturas_vencidas": [...]
}
```

## Database

- **Replace** `fn_calcular_credit_score(p_nit TEXT)` with updated v2 logic in-place (same function name, same RPC interface — no frontend service changes needed)
- Migration applied via `mcp__supabase-distrimm__apply_migration`

## New Page `/score-crediticio`

### Route & Navigation
- New `NavLink` in `MainLayout.jsx` under ANALISIS section
- Icon: `ShieldCheck` from lucide-react
- Text: "Score Crediticio"
- Route registered in `App.jsx` (or wherever routes are defined)

### Layout (desktop: two-column, mobile: master-detail)
```
┌─────────────────────┬──────────────────────────────────┐
│ 🔍 Buscar cliente   │  [Score del cliente seleccionado] │
│─────────────────────│                                   │
│ Client list         │  • Gauge + nivel badge + plazo    │
│ (name, deuda,       │  • 5 sub-score bars               │
│  max mora)          │  • Trend histórico (bar per carga)│
│                     │  • Facturas vencidas table        │
│ No pre-loaded scores│                                   │
│ (lazy fetch)        │  Empty state when none selected   │
└─────────────────────┴──────────────────────────────────┘
```

### Data Flow
- Left panel: consumes `data.aggregatedClients` from `useOutletContext()` — no extra fetches
- Right panel: calls `getClientCreditScore(nit)` on client selection (lazy)
- NIT sourced from `client.items[0]?.tercero_nit`

### New Component: `ScoreCrediticioPage.jsx`
Self-contained page component. Reuses `CreditScoreCard` for the right panel (add `historial_periodos` rendering to it).

### CreditScoreCard additions
- New section: **Tendencia Histórica** — horizontal bar per carga showing mora promedio, colored by severity. Renders only if `historial_periodos.length > 1`.

## Files to Create/Modify

| File | Action |
|---|---|
| Supabase: `fn_calcular_credit_score` | Replace with v2 SQL |
| `src/pages/ScoreCrediticioPage.jsx` | Create |
| `src/components/dashboard/CreditScoreCard.jsx` | Add trend history section |
| `src/layouts/MainLayout.jsx` | Add nav link |
| `src/App.jsx` | Register route |
