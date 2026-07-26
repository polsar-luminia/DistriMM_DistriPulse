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

Secretos de las Edge Functions — ya **no** están en el panel de Supabase, sino en
`/etc/distrimm/functions.env` del VPS (chmod 600). Tras editarlo: `pm2 restart distrimm-functions`.
```
OPENAI_API_KEY                 — proxy-n8n-cfo (GPT-4.1) y proxy-n8n-chatbot (GPT-4.1-mini)
META_APP_ID / META_APP_SECRET  — Facebook App (token exchange). NUNCA en el frontend
META_PHONE_NUMBER_ID / META_ACCESS_TOKEN
WHATSAPP_WEBHOOK_VERIFY_TOKEN  — debe coincidir con el configurado en Meta
SUPABASE_URL                   — apunta al dominio propio, no a supabase.co
SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY — JWT firmados con el secreto del VPS
```

Edge Functions: `proxy-n8n-whatsapp` (messaging with lazy token refresh), `proxy-n8n-cfo` (CFO analysis), `proxy-n8n-chatbot` (AI agent chat, 100s timeout), `proxy-embedded-signup` (WhatsApp Embedded Signup onboarding).
Other server-side secrets (Meta access token per instance) live in `distrimm_whatsapp_credentials`.

## VPS y Deploy

**El código se edita localmente y se deploya manualmente al VPS.**

> **DistriMM ya NO usa Supabase cloud** (migrado el 26/07/2026). Todo corre en el VPS. El proyecto
> Supabase `xzhqhmjfhnvqxndxayxs` sigue existiendo intacto como respaldo de rollback, pero nada lo
> consulta. Ver "Plataforma propia (fuera de Supabase)" más abajo.

- VPS: `ssh admin@161.97.111.39` (clave `~/.ssh/id_ed25519`, sin contraseña)
- Dominio: https://distrimm.luminiatech.digital
- Código en VPS: `/var/www/distrimm-agro/`
- PM2 procesos: `distrimm-rest` (3110), `distrimm-auth` (3111), `distrimm-functions` (3112),
  `distrimm-mcp` (3102), `luminia-monitor`
- El VPS es **compartido** con otros proyectos (`central-api`, `clubdellicor-bot`, `distrimm-sms`,
  `encuesta-polosalazar`, `inspeccion-preoperacional`). No asumir que es exclusivo de DistriMM.
- Zona horaria del VPS: **Europe/Berlin**, no Bogotá. Cualquier cron debe fijar `CRON_TZ`.
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

### Plataforma propia (fuera de Supabase) — 26/07/2026

Se reemplazó Supabase cloud por sus **mismos componentes upstream**, corriendo como binarios bajo
PM2 contra un PostgreSQL propio. El frontend usa `supabase-js` **sin un solo cambio de código**:
solo cambió `VITE_SUPABASE_URL` al dominio propio, porque nginx sirve los mismos prefijos de API.

| Componente | Qué es | Puerto |
|---|---|---|
| **PostgreSQL 17.10** | cluster propio en `5433`. El cluster `16.14` de `5432` es de OTROS proyectos — no tocarlo | 5433 |
| **PostgREST 14.15** | el mismo que Supabase usa para `/rest/v1` | 3110 |
| **GoTrue 2.193.1** (`supabase/auth`) | el mismo servidor de auth de Supabase | 3111 |
| **Deno 2.9.4** | corre las Edge Functions **tal cual**, sin reescribirlas a Node | 3112 |

- Binarios y funciones en `/opt/distrimm/`. Secretos en `/etc/distrimm/` (chmod 600):
  `secrets.env` (JWT secret, claves de rol, `ANON_KEY`, `SERVICE_ROLE_KEY`) y `functions.env`.
- Base `distrimm`: roles `anon`, `authenticated`, `service_role`, `authenticator`,
  `supabase_auth_admin`. Las 77 políticas RLS funcionan igual.
- **`auth.uid()` / `auth.role()` / `auth.jwt()` / `auth.email()` NO las crea GoTrue** — son de
  Supabase y están recreadas a mano. Si se recrea la base desde cero, hay que volver a crearlas o
  todas las políticas RLS fallan.
- Supabase aloja sus extensiones en un esquema **`extensions`** (pgcrypto, uuid-ossp, moddatetime).
  Sin ese esquema PostgREST no arranca.
- **Las Edge Functions no se reescribieron.** Cada `index.ts` exporta su handler por default y solo
  se auto-sirve si `DISTRIMM_ROUTER` no está definido, así que el mismo archivo sigue siendo
  desplegable a Supabase. El router es `supabase/functions/_router.ts`.
- El cron `refresh-whatsapp-tokens` (lunes 13:00 UTC) ya no vive en `pg_cron`: es un crontab del
  VPS con `CRON_TZ=UTC`.
- Migración reproducible: `/opt/distrimm/bin/migrar-desde-supabase.sh`.

**Rollback:** revertir `VITE_SUPABASE_URL`/`VITE_SUPABASE_KEY` en `.env` (queda copia en
`.env.supabase-cloud.bak`), `pnpm build` y desplegar. El build anterior está en
`/var/www/distrimm-agro.bak-<fecha>` del VPS.

### Nginx
```
distrimm.luminiatech.digital
├── /rest/v1      → proxy_pass 127.0.0.1:3110  (PostgREST)
├── /auth/v1      → proxy_pass 127.0.0.1:3111  (GoTrue)
├── /functions/v1 → proxy_pass 127.0.0.1:3112  (Edge Functions en Deno)
├── /mcp          → proxy_pass 127.0.0.1:3102  (MCP Server, StreamableHTTP)
└── /             → try_files (React SPA)
```
Las tres primeras rutas viven en `/etc/nginx/snippets/distrimm-backend.conf`.

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

## Sincronización automática desde el ERP SAMIT (COMPLETA, 26/07/2026)

Los datos viajan solos del ERP de la oficina al VPS. Reemplaza la carga manual de Excel.
Plan completo en `docs/plans/plan-sincronizacion-samit.md`; mapa del ERP en
`docs/plans/mapeo-servidor-samit.md`. **Al retomar, leer esos dos antes de tocar nada.**

```
Servidor oficina (SERVER, Tailscale)          VPS
┌──────────────────────────────┐             ┌────────────────────────────┐
│ SQL Server SAMIT / E0032026  │             │ /functions/v1/sync-ingest  │
│  ↓ Integrated Security       │  HTTPS +    │  ↓ allowlist server-side   │
│ C:\distrimm-sync\            │  token      │ PostgreSQL 17 (5433)       │
│  sync-samit.ps1              │ ──────────► │ distrimm_sync_estado       │
│  (tarea programada, S4U)     │             └────────────────────────────┘
└──────────────────────────────┘
```

- **El agente no instala nada** en el servidor de la oficina: PowerShell usa
  `System.Data.SqlClient`, que ya viene con Windows. Fuente en `sync-agent/sync-samit.ps1`;
  el token vive en `sync-samit.config.json` **solo en el servidor** (fuera de OneDrive, ACL
  restringida, en `.gitignore`).
- **Tarea programada `DistriMM Sync SAMIT`**: al arrancar (+2 min, aprovecha la alarma del BIOS
  de las 15:00) y cada 2 h. Corre con **S4U** — sin sesión iniciada y sin guardar contraseñas.
  `SYSTEM` NO sirve: se autentica como `WORKGROUP\SERVER$`, que no tiene acceso a `E0032026`.
- **El agente no decide a qué tabla escribe.** Solo nombra un dataset; tabla, llave de conflicto
  y allowlist de columnas viven en `supabase/functions/sync-ingest/index.ts`.
- **Dos modos**: incremental (upsert por lotes) y **full** (una llamada a un RPC que borra e
  inserta en UNA transacción, para que el dashboard nunca vea un estado parcial).
- **Observabilidad**: `distrimm_sync_estado`, una fila por dataset y corrida, con reconciliación
  contra la cifra de control del ERP. `estado='sospechoso'` = se escribió pero no cuadró.
- **Procedencia**: cada fila sincronizada lleva `origen='erp'`; lo cargado a mano queda como
  `'manual'` e intacto. No apagar la carga manual hasta que los números cuadren solos dos semanas.

| Dataset | Origen en el ERP | Destino | Modo | Estado |
|---|---|---|---|---|
| `vendedores` | `IN_Vendedor` | `distrimm_vendedores` | upsert por `codigo` | ✅ |
| `catalogo` | `IN_Producto`+`IN_Marcas`+`IN_Categorias` | `distrimm_productos_catalogo` | upsert por `codigo` | ✅ |
| `clientes` | `G_Clientes`+`G_Municipio` | `distrimm_clientes` | upsert por `no_identif` | ✅ |
| `inventario` | `IN_ProdBodega`+`IN_Producto` | `distrimm_inventario_items` | full vía `fn_sync_inventario` | ✅ |
| `cartera` | `CT_Movimientos` cta. `13050501`, **años 2022–2026** | `cartera_items`+`historial_cargas` | full vía `fn_sync_cartera` | ✅ |
| `ventas` | `IN_Documento`(VE/DV)+`IN_Movimiento`, **años 2025–2026** | `distrimm_comisiones_ventas` | full **por mes** vía `fn_sync_ventas` | ✅ |
| `recaudos` | `CT_Documentos`(RC/NC/CE)+`CT_Movimientos` y ventas sin CxC | `distrimm_comisiones_recaudos` | full por **mes + modalidad** vía `fn_sync_recaudos` | ✅ |

**CORTE HECHO (26/07/2026). La carga manual de Excel ya no existe.** El ERP es la única fuente.

**Backfill de años cerrados.** La tarea programada sincroniza **solo el año en curso**: no tiene
por qué reprocesar años cerrados cada 2 h. Para traer histórico, una vez y a mano:

```powershell
powershell -ExecutionPolicy Bypass -File C:\distrimm-sync\sync-samit.ps1 -Dataset ventas -AniosVentas 2025
```

Cada año vive en su propia base del ERP (`E0032025`, `E0032026`…), así que los **movimientos** se
leen de la base del año y los **maestros** (vendedor, cliente, municipio) siempre de `E0032026`
—los nombres vigentes—, igual que ya hacía `Sync-Cartera`. Hoy hay 2025 y 2026: 44.719 líneas.
Traer 2025 costó ~1 min y **no movió ninguna cifra de 2026** (verificado con huellas md5 de
`fn_calcular_comisiones` y `fn_sugerido_pedidos` antes y después). Sí mejoró la atribución de
vendedor en cartera, de 92,2% a 95,1%: facturas viejas que antes no tenían venta contra la cual
cruzarse.

> Traer 2025 obligó a **ensanchar `margen_pct` de `numeric(8,2)` a `(18,2)`** —ver
> `sql/widen_margen_pct.sql`—. Hay 15 líneas facturadas a 1 peso con su costo real (obsequios y
> ajustes) cuyo margen porcentual desborda el tope: `-12.499.900%` en el peor caso. La
> sincronización moría con `numeric field overflow`. Ojo con los promedios: son atípicos que
> arrastran cualquier `AVG(margen_pct)`.
>
> Además `fn_sync_ventas` descarta a propósito las filas con `valor_total = 0` (mismo filtro que el
> ETL manual). Por eso 2025 lee 26.770 y escribe 26.762: son 8 líneas en cero, y la cifra de
> control cuadra en 0. **No es pérdida de datos.**

### Modelo de visualización: UNA CARGA POR MES

Todos los datasets con historia (cartera, ventas, inventario, recaudos) mantienen **una carga por
mes**. El mes en curso se refresca en sitio en cada sincronización; al cambiar de mes queda
congelado y se abre el siguiente, sin intervención. Así "cómo cerró junio" es consultable y julio
muestra el estado hasta la última sincronización.

Los meses cerrados se reconstruyeron desde el ERP:
- **Cartera**: `CT_Movimientos` es un libro contable — filtrando `Doc_FechaDoc <= corte` se obtiene
  el saldo a cualquier fecha. La mora también se calcula **a la fecha de corte**, no a hoy.
- **Inventario**: por los acumulados mensuales de `IN_ProdBodega`
  (`CantidadInicial + Σ CantD01..N − Σ CantC01..N`). El mes en curso usa `CantidadFinal`.
- El agente acepta `-Backfill` para reconstruir los meses cerrados del año; sin esa bandera (que es
  como corre la tarea programada) solo toca el mes en curso.

**Blindaje contra recaídas.** El frontend filtra explícitamente `origen='erp'` en cartera,
`fuente='erp'` en recaudos y la vista de ventas solo mira cargas `erp`. Si alguien volviera a
insertar datos manuales, no entran a lo que ve gerencia. Los componentes `*UploadModal` siguen en el
repo pero **ya no están montados en ninguna pantalla**.

**Lo que NO se retiró, a propósito:** `PresupuestosUploadModal` (metas y tramos de comisión por
vendedor). Es lo único que NO sale del ERP — lo define gerencia. Sin él no se pueden cargar los
presupuestos y no se liquida comisión.

**`pct_iva` SÍ viene del ERP** (resuelve la incógnita del mapeo §10). La fuente correcta es
**`IN_Movimiento.TipoIva`** —la tasa realmente aplicada en la venta, 0/5/19— y **no**
`IN_Producto.TablaIva`, que está vacío en 2.263 productos. Es exactamente lo que traía el "Informe
Diario de Ventas tipo de IVA" que se cargaba a mano. Va como dataset **`tasas_iva`**, separado de
`catalogo`: solo 1.429 de los 4.374 productos se han vendido, así que solo esos tienen tasa
observada; meterlo en `catalogo` obligaría a mandar null para el resto y borraría las tasas. De
1.429 productos, 1.425 tienen una sola tasa; para los 4 que varían manda la venta más reciente.
Ese dataset **no lleva cifra de control** — es parcial, y contar sus filas contra el total de la
tabla daría siempre `sospechoso`.

> `pct_iva` hoy **no entra en ningún cálculo**: solo alimenta `buildInputHash` (invalidación de
> caché). Lo usaba `recaudoUpload.js` para prorratear IVA, pero ese ETL se retiró — el IVA de
> recaudos ahora sale de `dbo.DeterminarBasePagoComisionVendedor`.

**Trampas ya resueltas (no repetirlas):**
- **`marca` se sincroniza CRUDA del ERP.** Las 238 diferencias de nombre (`CONTEGRAL MASCOTAS` vs
  `CONTEGRAL`, `PREMIER` vs `GOLDEN & PREMIER`, `BOEHRINGER` vs `BOHERINGER`) NO rompen las
  exclusiones de comisiones: `fn_calcular_comisiones` compara con `normalize_brand()` en ambos
  lados. Verificado. `normalize_brand` existe **dos veces** —`src/utils/brandNormalization.js` y
  la función SQL— con las mismas 16 reglas: **cambiar una sin la otra hace divergir el dashboard
  del cálculo de comisiones en silencio.**
- **`pct_iva` se deja FUERA** de la sincronización a propósito: su fuente no está resuelta
  (mapeo §10) y sincronizarlo pisaría el valor actual con uno peor.
- **Inventario = instantáneas, no estado actual.** `fn_sugerido_pedidos` lee UNA `carga_id`, así
  que la sincronización mantiene **una sola** carga con `origen='erp'` y la refresca en sitio;
  crear una carga por corrida serían ~4.400 al año.
- **Existencia manda desde `IN_ProdBodega.CantidadFinal`**, nunca `IN_Producto.Existencia`
  (desactualizada en el 57%).
- **Codificación**: fijar `[Console]::OutputEncoding = UTF8` y mandar el body como bytes UTF-8, o
  las ñ y tildes llegan corruptas (`BAÑOS` → `BA?OS`).
- **RECAUDOS: `origen` NO es procedencia, es la MODALIDAD** (`credito`/`contado`). La procedencia
  va en la columna **`fuente`** (`manual`/`erp`). Escribir `origen='erp'` destruiría la
  clasificación que usa `comisionesCalculator.buildDesgloseOrigen`.
- **El recaudo NO es solo `RC`.** El reporte manual cuenta `RC` + `NC` (notas crédito) + `CE`, y
  **excluye `DV`** (devoluciones: bajan la deuda pero no son un cobro) y `CP`. Filtrar solo por
  `RC` deja las comisiones por recaudo ~4% bajas. Verificado contra el dato manual de junio.
- **ABIERTO — el IVA en la base comisionable de recaudos.** En junio, 562 de 604 abonos coinciden
  exactos con el Excel, pero **42 vienen NETOS del IVA de la factura** (diferencia 483.136 COP,
  0,057%). La causa está identificada al peso: la diferencia de cada fila es exactamente
  `CT_FacVentasCred.VrIva` de esa factura. Lo que NO se pudo determinar es qué selecciona esas 42.
  Reglas probadas y descartadas (todas empeoran el cuadre):

  | Regla | Filas idénticas de 604 |
  |---|---|
  | Abono bruto (**lo que está desplegado**) | **562** |
  | `dbo.DeterminarBasePagoComisionVendedor` con saldo del mes | 462 |
  | La misma función con saldo del año completo | 471 |
  | Restar IVA cuando el abono marca "Cancela" | 475 |
  | Restar IVA a toda factura con IVA | 194 diferencias (peor) |

  Dato duro: la función del ERP **reproduce el valor manual exacto** en los 5 casos probados de
  esas 42 — pero en junio hay 194 abonos sobre facturas con IVA y el Excel solo lo restó en 42.
  **Es decisión del dueño / contabilidad:** si la base debe excluir el IVA siempre (lo razonable,
  no se comisiona un impuesto que se le remite al Estado) o replicar el Excel. Afecta liquidaciones,
  así que no se resuelve adivinando. Mientras tanto se guarda el bruto, que es lo que más se parece
  a la producción actual.
- **Llave de recaudos: `(origen, erp_documento, erp_item)`** — hay que incluir la modalidad porque
  crédito usa `CT_Documentos.Doc_Secuencial` y contado usa `IN_Documento.Secuencial`: son
  secuencias distintas que pueden colisionar.
- **`vendedor_codigo` es NOT NULL** en recaudos. Cadena: vendedor de la factura
  (`CT_FacVentasCred`) → vendedor asignado al cliente (`G_Clientes.VendAsg`) → `'0'`. Solo 15 de
  3.974 caen en `'0'`; se dejan visibles como grupo aparte en vez de atribuirlos a nadie.
- **`useComisionesCalculo` prefiere las cargas de recaudo MANUALES** (`fuente !== 'erp'`) durante
  la convivencia, porque `getRecaudoCargas` ordena por `created_at DESC` y el `find()` tomaría la
  sincronizada. **Para el corte: quitar los dos filtros `esManual`.**
- **VENTAS: la sincronización mata la duplicación.** El Excel es acumulado del mes (~18 cargas
  solapadas); el ERP tiene líneas con identidad estable `(IN_Movimiento.Documento, Item)`. 2026
  completo = **17.957 filas sin una sola duplicada**. `factura` NO sirve de llave (una `DV`
  reutiliza el número de la `VE`) ni `(Documento, Producto)` (697 combinaciones se repiten).
- **Una carga sincronizada POR MES**: `fn_calcular_comisiones` trabaja sobre una `carga_id` y las
  comisiones se liquidan por mes; todo el año en una sola carga rompería el cálculo.
- **`valor_total` va CON IVA** (`VrVenta + VrIva`) y las `DV` con signo negativo. Mapearlo a
  `VrVenta` a secas dejaría TODAS las comisiones bajas.
- **`margen_valor` y `margen_pct` son `GENERATED ALWAYS`** en `distrimm_comisiones_ventas`
  (igual que `nombre_completo` en clientes): Postgres rechaza cualquier escritura sobre ellas.
- **La vista `distrimm_ventas_vigentes` prefiere lo MANUAL** durante la convivencia: su `ORDER BY`
  lleva `(c.origen = 'erp')` para que la carga sincronizada, que tiene fecha más reciente, no
  desplace a la manual y cambie de fuente en silencio a CFO, MCP y comisiones.
  **Para hacer el corte: borrar esa línea del `ORDER BY`.**
- **VALIDADO 26/07/2026:** `fn_calcular_comisiones` sobre junio da **exactamente lo mismo** con
  datos manuales y sincronizados — los 6 vendedores, `total_ventas`, `ventas_comisionables`,
  `margen_comisionable` y los 2.311 ítems, todo con diferencia **0**. Total 818.036.093 COP.
- **CARTERA: hay que unir las bases de TODOS los años** (`E0032022..E0032026`). Al cerrar el año el
  ERP abre base nueva y no arrastra el detalle: una factura de 2025 pagada en 2026 tiene el débito
  en `E0032025` y el crédito en `E0032026`. Mirando solo 2026 salen **517 saldos negativos**.
  Uniendo los cinco años: 656 ítems, cuadra **al peso** con `CT_PlanTerceros`.
- **`dias_mora` se guarda con la convención de 360 días del ERP** (decisión del dueño 26/07/2026),
  no días calendario — la brecha llega a 18 días en deuda antigua. La leen directo `fn_cfo_*` y
  las `fn_mcp_*`; la UI y el score crediticio la recalculan y les da igual.
- **La carga sincronizada NO se adopta sola.** `usePortfolioAnalytics.fetchLoads` elige
  deliberadamente la última carga **manual** (`loads.find(l => l.origen !== 'erp')`), porque la
  carga `erp` lleva `fecha_corte` de hoy y sería siempre la primera. **Para hacer el corte: quitar
  ese `.find()` y volver a `loads[0]`.** Hasta entonces la sincronizada se ve en la lista y se
  puede seleccionar para comparar, pero gerencia sigue viendo lo manual.
- **La cartera sincronizada trae datos que el Excel nunca tuvo**: `vendedor_codigo` (646),
  `telefono` (627), `ciudad` (656), `asesor` (646), `valor_inicial` y `valor_abonos` (656).
  En la carga manual esos seis campos están **vacíos en el 100%** de las filas.
- **Clientes: upsert SIN borrados.** `cartera_items.tercero_nit` cruza contra `distrimm_clientes`;
  un cliente que saliera del ERP con deuda viva perdería su nombre en el dashboard.
  `no_identif` va **sin dígito de verificación** (decisión del dueño 26/07/2026) — el ERP guarda
  el `Dv` aparte y se ignora a propósito.
- **`nombre_completo` es `GENERATED ALWAYS`** en `distrimm_clientes`: se calcula concatenando los
  cuatro campos de nombre y **no se puede escribir**. Efecto secundario a tener presente: el
  dashboard muestra "NOMBRE APELLIDO" mientras SAMIT muestra "APELLIDO NOMBRE"
  (`G_Clientes.NombreTercero`). No es una regresión —siempre fue así—, pero si algún día se quiere
  igualar a SAMIT hay que cambiar la columna generada, no la sincronización.
- **`client_max_body_size 64m`** en el snippet de nginx: el agente publica cada dataset en un solo
  POST y el default de 1 MB da 413 con clientes (~2 MB) y dará con ventas (~10 MB).
- **Solo lectura sobre el ERP**, siempre con `WITH (NOLOCK)`. Hoy el agente lee como
  `GERENCIA DISTRI MM`; el plan recomienda un login SQL dedicado de solo lectura (sería la única
  escritura sobre el ERP en todo el proyecto, **requiere aprobación del dueño**).


### Decisiones tomadas y pendientes abiertos (26/07/2026)

**El IVA se excluye SIEMPRE de la base comisionable de recaudos** (decisión del dueño). No se
implementó tocando `valor_recaudo` —que guarda el dinero recibido, bruto— sino llenando
`valor_iva`, porque el cálculo ya hacía `valor_recaudo - valor_excluido_marca - valor_iva`
(`comisionesCalculator.js:148`). El Excel dejaba esa columna en cero, y por eso venía comisionando
sobre el IVA. El valor sale de `dbo.DeterminarBasePagoComisionVendedor`, la regla del propio ERP.

Impacto medido sobre lo ya liquidado — **−75.723 COP en cinco meses**, y **nadie cambia de tramo**
(el cumplimiento se mueve como mucho un punto):

| Mes | Vendedor 14 | Vendedor 4 |
|---|---|---|
| Marzo | −3.752 | −19.271 |
| Abril | −3.728 | −24.351 |
| Mayo | 0 | −13.700 |
| Junio | 0 | −10.921 |
| Julio | 0 | 0 (ninguno llega al 80% del primer tramo) |

Solo afecta a los vendedores **14 y 4**: son los únicos con meta de recaudo activa. En los siete
meses de 2026 el IVA excluido suma **44.513.793 COP** sobre 5.978 millones recaudados (0,74%); el
efecto en dinero pagado es mucho menor porque las tasas de comisión son de 0,5% a 0,9%.

**Pendientes que el dueño decidió dejar abiertos:**
- **No hay respaldo del VPS.** Riesgo aceptado explícitamente. Toda la operación —incluidos los
  siete meses de historia reconstruida— vive solo ahí.
- **No hay SMTP**, así que **no existe "olvidé mi contraseña"**. Para reponer una clave hay que
  hacerlo por base. GoTrue quedó con `MAILER_AUTOCONFIRM` y `DISABLE_SIGNUP`.
- **Rotar `META_APP_SECRET`**: pasó por un archivo y por el chat.
- **Las 42 filas de junio** con diferencia de valor quedaron sin explicación de por qué el Excel las
  trataba distinto (ver arriba). Ya no bloquea: el Excel dejó de ser la fuente.

**RESUELTO — las RPCs que vivían solo en la base ya están versionadas.** El inventario contra la
base real encontró **11**, no 10: faltaba `fn_distribot_consulta_cartera` en la lista. Están en
`sql/fn_no_versionadas.sql`, validado con `BEGIN … ROLLBACK` contra la base. Dos de las once
(`fn_get_wa_instance` y `fn_get_wa_instance_name`) **están rotas en producción** —referencian
columnas que desaparecieron cuando `distrimm_whatsapp_instances` se rehízo para Embedded Signup— y
quedan comentadas en ese archivo; nadie las llama, son código muerto.

### Cierre de Supabase — hecho y pendiente (26/07/2026)

**Verificación integral contra el ERP, no contra sí mismo** (todo cuadra):

| Módulo | Esperado | ERP (SAMIT) | VPS |
|---|---|---|---|
| Ventas 2026 | 17.957 líneas | 17.957 | 17.957 |
| Comisiones junio | 818.036.093 | 818.036.093,01 | 818.036.093,01 |
| — comisionables / ítems | 526.927.377 / 2.311 | — | 526.927.376,65 / 2.311 |
| Cartera julio | al peso | 1.295.446.226,01 | 1.295.446.226,01 |
| Inventario mes en curso | 1.533 filas | 1.533 | 1.533 |
| Recaudos: IVA excluido 2026 | 44.513.793 | — | 44.513.793 |

Dos precisiones para no volver a perseguirlas: los **2.311 ítems** son los *comisionables* (los
totales son 2.651), y un conteo crudo de `IN_Movimiento` da **17.961** — las 4 de más son
documentos anulados, que el agente excluye con `ISNULL(d.Anulado,0)=0`. No es un descuadre.

Los 41 datasets de `distrimm_sync_estado` están en `ok`, ninguno `sospechoso`; las diferencias son
de centavos por redondeo. El bundle desplegado y `/etc/distrimm/*.env` no tienen **ni una**
referencia a `supabase.co`, y navegando la app todas las peticiones van al VPS. El sugerido de
pedidos responde (exige sesión: `fn_sugerido_pedidos` lanza "No autenticado" si se llama sin
`request.jwt.claims`). El MCP responde en `/mcp/health` y `resumen_ejecutivo` devuelve cifras
coherentes con lo de arriba.

**Apagado ya:**
- **`pg_cron` `refresh-whatsapp-tokens` DESACTIVADO** (`cron.alter_job(1, active := false)`; la
  tabla `cron.job` no acepta `UPDATE` directo ni como `postgres`). El cron equivalente del VPS está
  **probado**: devuelve `HTTP 200 {"processed":0}`. La carrera entre los dos nunca llegó a existir
  —ninguna credencial califica para refresco: dos tienen `token_expires_at` nulo y la activa expira
  en 2099 (token de System User, permanente)—, pero apagarlo era lo correcto igual.
- **Webhook de Meta CONFIRMADO** en el VPS, no asumido: la suscripción de la app apunta a
  `https://distrimm.luminiatech.digital/functions/v1/whatsapp-webhook` y está `active`. El archivo
  desplegado es byte-idéntico al del repo (mismo md5) y responde al challenge (200 con el token
  correcto, 403 con uno falso). Sigue enrutando a los tres inquilinos: Club del Licor, DistriPolsar
  y DistriMM.
- **Rol `distrimm_migracion` eliminado** y **6 sesiones residuales de `auth.sessions` borradas**.
  Verificado después: la base de rollback sigue intacta (62 tablas, 110.107 ventas, 77 políticas).

**RESUELTO — `OPENAI_API_KEY` repuesta (26/07/2026).** La anterior estaba revocada y OpenAI
devolvía `401 invalid_api_key`; se instaló una nueva en `/etc/distrimm/functions.env` (respaldo en
`functions.env.bak-20260726`) y se reinició `distrimm-functions`. CFO y DistriBot verificados de
punta a punta. Al reponer una clave, **validarla antes de instalarla** con
`GET https://api.openai.com/v1/models` — la primera que se intentó era, byte por byte, la misma que
ya estaba puesta y muerta.

**CORREGIDO — las devoluciones se estaban sumando en vez de restarse.** El ERP sincroniza las `DV`
con `valor_total`, `costo` y `margen_valor` **ya negativos**, pero el prompt de DistriBot y
`fn_cfo_distrimm_dashboard` seguían aplicando `CASE WHEN tipo='DV' THEN -valor_total …`, herencia
del Excel manual (donde venían positivas). La doble negación **inflaba las ventas un 8%**:
+499.230.632 COP en 2026, +118.689.118 solo en junio. Se probó al peso: la fórmula vieja daba
936.725.211 para junio contra los 818.036.093 reales, y el bot respondía exactamente eso.

Arreglado en los dos sitios (5 ocurrencias en la RPC + el prompt y su ejemplo). El DSO del CFO pasó
de 41,1 a **44,6 días** — era optimista por la misma causa.

> **`cantidad` es la excepción: NO viene con signo.** Para unidades netas sí hay que usar
> `SUM(CASE WHEN tipo='DV' THEN -cantidad ELSE cantidad END)`, que es justo lo que hacen las
> `fn_mcp_*` — el MCP estaba correcto y no se tocó.

**ATENCIÓN — los snapshots de comisiones de marzo a junio son de la era manual.** Julio se
regeneró hoy con datos sincronizados y **cuadra exacto** con el cálculo en vivo. Los anteriores no:

| Mes | Comisión recaudo *guardada* | Según los datos del ERP |
|---|---|---|
| Marzo | 5.805.272 | 8.891.388 |
| Abril | 1.630.244 | 4.498.596 |
| Mayo | **0** | 1.651.770 |
| Junio | **0** | 2.779.307 |
| Julio | 0 | **0** ✅ |

**⚠️ ESA COLUMNA "Según los datos del ERP" ESTÁ MAL — ver la corrección justo abajo.** Se calculó
sin el filtro de mora, que es el más grande de todos. Se deja a la vista para que nadie la vuelva a
derivar igual.

**BUG ABIERTO — la sincronización de recaudos pierde DOS candados de comisión, no uno.**

La base comisionable de un recaudo es
`valor_recaudo − valor_excluido_marca − valor_iva`, contando solo las filas con
`aplica_comision`. De los tres descuentos, **la sincronización solo implementó el del IVA**:

| Candado | Dónde se calculaba | manual | erp |
|---|---|---|---|
| **Mora** (`aplica_comision`) | `RecaudoUploadModal.jsx:129` | 449 filas fuera | **0** ← perdido |
| **Marca** (`valor_excluido_marca`) | `recaudoEnrichment.js:100` | 1.234 filas · 942.967.569 COP | **0** ← perdido |
| **IVA** (`valor_iva`) | `fn_sync_recaudos` | 0 | 1.687 filas ✅ |

Los dos que faltan los calculaba **el modal de carga manual**, que ya no está montado. Nadie los
reemplazó, y las columnas se quedan en su default (`true` y `0`).

- **Mora:** la regla es `dias_mora >= 0 AND dias_mora <= DIAS_MORA_LIMITE` (72, en
  `src/constants/thresholds.js:57`). El `dias_mora` **sí se sincroniza** (2.294 filas con mora,
  hasta 360 días); solo falta derivar la marca.
- **Marca:** se cruza `recaudo.factura` → `distrimm_ventas_vigentes` (con prefijo `FELE-`/`FCI-`)
  → catálogo → exclusiones, y se descuenta del abono la **proporción** que en esa factura
  correspondía a marcas excluidas. Hoy hay 3 activas —ADAMA, AGROCENTRO y CONTEGRAL— que pesan el
  **21,3%** de las ventas. La comparación va con `normalize_brand()` a ambos lados.

**Prerrequisito RESUELTO: 2025 sincronizado (26/07/2026).** El cruce por marca necesita la venta
original, y muchas facturas de 2025 se cobran en 2026. La forma de validar el port es contrastarlo
contra las 4.095 filas manuales —mismos insumos, comparar salidas—: daba **98,2%**, y las 43 fallas
eran todas facturas fuera de la ventana sincronizada. Con 2025 dentro sube a **99,0% y esas 43
desaparecen**. Quedan **39 filas (0,95%) que difieren por otra causa, sin explicar: entenderlas
antes de dar el arreglo por bueno.**

Mientras no se arregle, **cualquier "Recalcular" sobre un mes con datos del ERP sobreestima la
comisión por recaudo**: en marzo el vendedor 14 pasaría de 0 a 5.607.828 COP.

Aplicando los dos candados a mano sobre los datos sincronizados:

| Mes | Guardada | Solo mora | Mora **+ marca** (correcto) |
|---|---|---|---|
| Marzo | 5.805.272 | 1.789.036 | **1.668.049** |
| Abril | 1.630.244 | 0 | **0** |
| Mayo | 0 | 0 | **0** ✅ |
| Junio | 0 | 0 | **0** ✅ |
| Julio | 0 | 0 | **0** ✅ |

**Mayo, junio y julio cuadran: los ceros son correctos, ahí nadie quedó mal pagado.** Marzo y abril
son de la era manual y no son comparables fila a fila (el ERP suma NC y CE, que el Excel no traía).

> Al arreglarlo hay dos decisiones de diseño abiertas: **(1)** el umbral 72 vive en
> `thresholds.js`; escribirlo también en SQL deja el mismo riesgo que `normalize_brand` — dos
> copias que divergen en silencio. **(2)** el modal guardaba estos valores *congelados* al cargar;
> si en vez de eso se calculan al liquidar, cambiar una exclusión de marca recalcularía también los
> meses viejos. Son comportamientos distintos, hay que elegir a propósito.

**DECISIÓN DEL DUEÑO (26/07/2026): los snapshots de marzo a junio se dejan como están.** Son el
registro de lo que se liquidó en la era manual. **No pulsar "Recalcular" en esos meses.**

**Falsa alarma corregida:** `.env.example` **nunca** tuvo la llave `anon` real. Se revisaron los
cuatro commits que lo tocan y todo el historial del archivo: siempre fue el marcador truncado
`eyJhbGciOiJIUzI1NiIsInR5cCI6...`. El archivo se actualizó para reflejar que el backend es el VPS.

**PENDIENTE — las 9 Edge Functions siguen desplegadas en Supabase.** No se pudieron retirar desde
esta sesión: el MCP de Supabase no expone un `delete_edge_function` y no hay CLI instalado. Hay que
borrarlas a mano (Dashboard → Edge Functions) o con `supabase functions delete <slug>`. Ninguna
recibe tráfico, pero seis tienen `verify_jwt: false` y quedan públicamente invocables.
Tres **no existen en el repo** y morirán con ellas — a propósito, son de la era n8n:
`whatsapp-proxy`, `proxy-n8n-chat` y `tmp-subscribe-waba` (esta última ya es un stub `410 Gone`).
**`whatsapp-proxy` trae un JWT de n8n hardcodeado en el fuente** como valor por defecto: conviene
revocarlo en esa instancia de n8n aunque ya no se use.

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
