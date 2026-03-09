# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start development server (Vite, localhost:5173)
pnpm build        # Production build
pnpm preview      # Preview production build locally
pnpm lint         # ESLint check
pnpm format       # Prettier format (auto-fix)
pnpm test         # Run Vitest unit tests
```

Unit tests exist in `src/utils/__tests__/` (Vitest). Cover business logic: portfolio calculations, brand normalization, commissions calculator. Run with `pnpm test`.

## Architecture

### State Container Pattern
`DashboardManager` (`src/components/DashboardManager.jsx`) is the root of the authenticated app. It owns all portfolio state via `usePortfolioAnalytics`, exports `DashboardContext` and `FilterContext`, and renders `<Outlet>`. All child pages receive data through `useOutletContext()` — they never fetch their own portfolio data.

### Data Flow
```
Excel file → UploadModal (ETL) → Supabase
                                     ↓
             usePortfolioAnalytics (hook) ← portfolioService (Supabase queries)
                                     ↓
             DashboardManager (context provider)
                                     ↓
             Pages via useOutletContext()
```

`UploadModal` auto-detects file type (Cartera vs Clientes) by inspecting column headers and routes to the correct ETL pipeline. Cartera goes to `historial_cargas` + `cartera_items`; Clientes goes to `distrimm_clientes`.

### Services Layer (`src/services/`)
Each service has a single responsibility and communicates with exactly one backend:
- `portfolioService.js` — Supabase CRUD for cartera data
- `comisionesService.js` — Supabase CRUD for commissions module (cargas, ventas, catálogo, exclusiones, RPC)
- `messagingService.js` — WhatsApp bulk sends (via Edge Function proxy) + Supabase logging
- `chatbotService.js` — AI agent chat (via Edge Function proxy)
- `cfoService.js` — CFO analysis (via Edge Function proxy)

Hybrid n8n architecture:
- **All n8n calls** (WhatsApp, CFO, Chatbot) are proxied through Supabase Edge Functions (`proxy-n8n-whatsapp`, `proxy-n8n-cfo`, `proxy-n8n-chatbot`). Frontend uses `supabase.functions.invoke()`. Secrets (`N8N_WHATSAPP_URL`, `N8N_WEBHOOK_URL`, `N8N_CHAT_URL`, `N8N_AUTH_KEY`) live in Supabase Edge Function secrets.
- **Chatbot**: The AI Agent workflow can take 40-70s. The Edge Function has a 100s timeout to accommodate this. Client-side keeps a 90s AbortController as safety net.

### Supabase Tables
Legacy tables (no prefix): `historial_cargas`, `cartera_items`
New tables (`distrimm_` prefix): `distrimm_clientes`, `distrimm_vendedores`, `distrimm_mensajes_log`, `distrimm_recordatorios_lote`, `distrimm_recordatorios_detalle`, `distrimm_plantillas_mensajes`, `distrimm_historial_cargas_clientes`, `distrimm_cfo_analyses`, `distrimm_chat_sessions`, `distrimm_chat_messages`, `distrimm_whatsapp_instances`
Comisiones tables: `distrimm_comisiones_cargas` (upload history), `distrimm_comisiones_ventas` (sale line items, CASCADE on carga), `distrimm_productos_catalogo` (product master with marca/categoría), `distrimm_comisiones_exclusiones` (brand/product exclusion rules)
RPC: `fn_calcular_comisiones(p_carga_id UUID)` — returns per-salesperson totals with exclusions applied

`distrimm_whatsapp_instances` is managed exclusively via n8n workflows — the frontend never accesses it directly.

Link key between datasets: `cartera_items.tercero_nit` ↔ `distrimm_clientes.no_identif`

RLS is enabled on all tables with permissive policies (authenticated user access).

### Notifications
Use `sileo` (not `sonner`). Import: `import { toast } from "sileo"`. The `<Toaster>` is mounted in `App.jsx`.

### Colombian Context
- Currency: COP, formatted as Colombian pesos
- Dates: `dd/MM/yyyy` format, `date-fns` with `es` locale
- WhatsApp send restriction: 7am–9pm Colombia time (`COLOMBIA_OFFSET = -5`)
- Phone format for Meta Cloud API: `57XXXXXXXXXX` (country code + 10 digits, no `+`)

## WhatsApp: Meta Cloud API (completed migration)

**Status:** Conexión directa con Meta Cloud API. Sin intermediarios. WhatsApp tab muestra status de la API y estadísticas de envío.

### n8n Workflows
| ID | Name | Status |
|---|---|---|
| `nRnNxKPGcCeHzWCy` | DistriMM - WhatsApp Mensajes | ✅ Active (Meta Cloud API) |
| `2HcZs2TTuqIwRP1e` | DistriBot CFO - Chat Cartera | ✅ Active (chatbot con gráficas) |
| `5mCEZIKSECOF4qoT` | DistriMM CFO Analyst | ✅ Active |

### Mensajes Workflow: What's Configured
- `META_PHONE_NUMBER_ID` is set to the real value in the `Buscar Instancia DB` Code node
- `Meta Cloud API` credential (id: `eB4lNUs2oRbMh5BV`) is configured with the Bearer token
- Currently in **sandbox mode**: `Preparar Mensaje` node has `SANDBOX_OVERRIDE_PHONE` that redirects all messages to a test number. Remove this override for production.

## n8n Code Node Constraints

- `fetch` is NOT available in n8n Code nodes (VM2 sandbox). Use HTTP Request nodes for all HTTP calls.
- Empty array responses from Supabase REST API (`[]`) produce 0 items — downstream nodes don't execute. Use RPC functions that return a single JSON object instead.
- IF node (1 output path) + Merge node in "append" mode = deadlock. Connect both IF branches directly to the next node.

## Environment Variables

See `.env.example` for full documentation with instructions on where to obtain each value. Key variables:

```
VITE_SUPABASE_URL / VITE_SUPABASE_KEY     — Supabase project
VITE_META_PHONE_NUMBER_ID                 — Meta Cloud API phone number ID
```

Supabase Edge Function secrets (Dashboard → Edge Functions → Secrets):
```
N8N_WHATSAPP_URL   — n8n messaging webhook URL
N8N_WEBHOOK_URL    — n8n CFO analysis webhook URL
N8N_CHAT_URL       — n8n chatbot AI Agent webhook URL
N8N_AUTH_KEY       — Shared secret for all n8n calls
```

Other server-side secrets (Meta access token) live in n8n credentials.
