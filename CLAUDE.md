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

Edge Function architecture (sin n8n):
- **WhatsApp** (`proxy-n8n-whatsapp`): llama directo a Meta Graph API v21.0. Lazy token refresh, loop secuencial por destinatario. Verifica JWT con service_role (`verify_jwt: false` en deploy + auth interna). Persiste `wamid` y `phone_number_id` en `distrimm_recordatorios_detalle` para auditoría. Recomputa conteos del lote desde el detalle (idempotente).
- **CFO** (`proxy-n8n-cfo`): llama RPC `fn_cfo_distrimm_dashboard` → GPT-4o (`response_format: json_object`) → guarda en `distrimm_cfo_analyses`. Timeout 90s.
- **Chatbot** (`proxy-n8n-chatbot`): AI agent GPT-4.1-mini con tool-calling nativo. Tool `consulta_sql_cartera` → RPC `fn_distribot_consulta_cartera`. Historial desde `distrimm_chat_messages`. Timeout 100s, máx 25 iteraciones.
- Todos usan `supabase.functions.invoke()` con auth JWT del usuario. Requiere `OPENAI_API_KEY` en secrets.

### Supabase Tables
Legacy tables (no prefix): `historial_cargas`, `cartera_items`
New tables (`distrimm_` prefix): `distrimm_clientes`, `distrimm_vendedores`, `distrimm_mensajes_log`, `distrimm_recordatorios_lote`, `distrimm_recordatorios_detalle`, `distrimm_plantillas_mensajes`, `distrimm_historial_cargas_clientes`, `distrimm_cfo_analyses`, `distrimm_chat_sessions`, `distrimm_chat_messages`, `distrimm_whatsapp_instances`
Comisiones tables: `distrimm_comisiones_cargas` (upload history), `distrimm_comisiones_ventas` (sale line items, CASCADE on carga), `distrimm_productos_catalogo` (product master with marca/categoría), `distrimm_comisiones_exclusiones` (brand/product exclusion rules)
RPC: `fn_calcular_comisiones(p_carga_id UUID)` — returns per-salesperson totals with exclusions applied

**REGLA CRÍTICA — deduplicación de ventas:** los archivos de ventas son ACUMULADOS del mes (cada carga trae del día 1 hasta su fecha) y solo se reemplazan cargas de la misma `fecha_ventas`, así que un mes queda con ~20 cargas solapadas. Cualquier agregación global sobre `distrimm_comisiones_ventas` multiplica los totales (~10x). Usar SIEMPRE la vista `distrimm_ventas_vigentes` (última carga de cada mes — ver `sql/ventas_vigentes_dedup.sql`), salvo que se trabaje sobre una `carga_id` específica como hacen VentasTab y los snapshots.

`distrimm_whatsapp_instances` stores per-user WhatsApp Business connections (via Embedded Signup). The frontend reads it (SELECT) to show connection status; Edge Functions write to it (INSERT/UPDATE via `service_role`). **Regla operativa: una sola instancia con `status='active'` por organización.** El frontend hace `eq(status,'active').order(created_at desc).limit(1)` — si hay más de una activa, toma la más reciente y puede acabar mandando desde el número equivocado. Cuando aparezca una intrusa, marcarla como `disconnected`.
`distrimm_whatsapp_credentials` stores access tokens for each instance — only accessible via Edge Functions with `service_role` key (no RLS policies for users).
`distrimm_recordatorios_detalle` incluye `wamid` y `phone_number_id` (nullable) — se llenan en cada envío exitoso para auditar desde qué número salió y cruzar con webhooks de Meta.

Link key between datasets: `cartera_items.tercero_nit` ↔ `distrimm_clientes.no_identif`

RLS is enabled on all tables with permissive policies (authenticated user access).

### Notifications
Use `sileo` (not `sonner`). Import: `import { toast } from "sileo"`. The `<Toaster>` is mounted in `App.jsx`.

### Colombian Context
- Currency: COP, formatted as Colombian pesos
- Dates: `dd/MM/yyyy` format, `date-fns` with `es` locale
- WhatsApp send restriction: 7am–9pm Colombia time (`COLOMBIA_OFFSET = -5`)
- Phone format for Meta Cloud API: `57XXXXXXXXXX` (country code + 10 digits, no `+`)

## WhatsApp: Meta Cloud API

**Status:** Conexión directa con Meta Cloud API vía Edge Function `proxy-n8n-whatsapp`. Sin intermediarios.

## Environment Variables

See `.env.example` for full documentation with instructions on where to obtain each value. Key variables:

```
VITE_SUPABASE_URL / VITE_SUPABASE_KEY     — Supabase project
VITE_META_APP_ID                          — Facebook App ID (for Embedded Signup)
VITE_META_CONFIG_ID                       — FB Login for Business config ID
VITE_META_SOLUTION_ID                     — Solution ID (optional)
```

Supabase Edge Function secrets (Dashboard → Edge Functions → Secrets):
```
OPENAI_API_KEY     — Para proxy-n8n-cfo (GPT-4o) y proxy-n8n-chatbot (GPT-4.1-mini)
META_APP_ID        — Facebook App ID (for token exchange)
META_APP_SECRET    — Facebook App Secret (NEVER in frontend)
```

Edge Functions: `proxy-n8n-whatsapp` (messaging with lazy token refresh), `proxy-n8n-cfo` (CFO analysis), `proxy-n8n-chatbot` (AI agent chat, 100s timeout), `proxy-embedded-signup` (WhatsApp Embedded Signup onboarding).
Other server-side secrets (Meta access token per instance) live in `distrimm_whatsapp_credentials`.

## VPS y Deploy

**El código se edita localmente y se deploya manualmente al VPS.**

- VPS: `ssh admin@161.97.111.39` (clave `~/.ssh/id_ed25519`, sin contraseña)
- Dominio: https://distrimm.luminiatech.digital
- Código en VPS: `/var/www/distrimm-agro/`
- Supabase URL: `https://xzhqhmjfhnvqxndxayxs.supabase.co`
- PM2 procesos: `distrimm-mcp` (puerto 3102), `luminia-monitor` (el viejo `distrimm-api`:3103 ya no existe en el VPS)
- Nginx sirve frontend desde: `/var/www/distrimm-agro/` (SPA con `try_files`)
- SSL: Certbot (Let's Encrypt) auto-renovación

### Estructura en VPS
```
/var/www/distrimm-agro/
├── index.html              # Frontend build (React SPA)
├── assets/                 # JS/CSS bundles
└── mcp-server/             # MCP Server v2 (puerto 3102) — código fuente en mcp-server/ del repo
    ├── src/index.js        # StreamableHTTP stateless + auth por token en URL
    ├── src/tools.js        # 8 tools: resumen, ventas, cartera, inventario, sugerido, comisiones, search, fetch
    └── .env                # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MCP_ACCESS_TOKEN, PORT (chmod 600)
```

### Nginx
```
distrimm.luminiatech.digital
├── /mcp    → proxy_pass localhost:3102  (MCP Server, StreamableHTTP)
└── /       → try_files (React SPA)
```

### Proceso de deploy

**Frontend:**
```bash
# Build local
pnpm build
# Subir dist al VPS
tar -cf - -C dist . | ssh admin@161.97.111.39 'cd /var/www/distrimm-agro && rm -rf assets && tar -xf -'
```

**MCP Server:**
```bash
cat mcp-server/src/ARCHIVO.js | ssh admin@161.97.111.39 'cat > /var/www/distrimm-agro/mcp-server/src/ARCHIVO.js'
ssh admin@161.97.111.39 'pm2 restart distrimm-mcp'
```

### Si SSH no responde

El servidor tiene fail2ban. Si hay timeout:
1. Ir a panel Contabo → firewall `distripolsar-fw` → verificar reglas 22/80/443
2. Mi IP está en whitelist de fail2ban — no debería banearse
3. Si sigue sin responder: Rescue System en Contabo → montar `/dev/sda1` en `/mnt/real` → arreglar SSH

### MCP Server (v2, jul/2026)
`https://distrimm.luminiatech.digital/mcp/<MCP_ACCESS_TOKEN>` — StreamableHTTP stateless para conectores de ChatGPT y Claude (gerencia consulta ventas, cartera, inventario, comisiones y sugerido en lenguaje natural). El token vive en el `.env` del VPS; guía completa de conexión y rotación en `mcp-server/README.md`. Los datos salen de las RPCs `fn_mcp_*` (`sql/mcp_server_rpcs.sql`), solo lectura y solo ejecutables con `service_role`. Health: `GET /mcp/health` (sin token).

## Health Stack

- typecheck: tsc --noEmit
- lint: eslint .
- test: vitest run

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
