# Prompt de arranque — cierre definitivo de Supabase y verificación integral

> **Cómo usar este archivo:** copia todo lo que está bajo la línea `═══` en una sesión nueva de
> Claude Code, abierta en el repo `DistriMM`.
>
> Se guarda en `docs/` y **no** en `docs/plans/` a propósito: esa carpeta está en `.gitignore`
> (línea 92) y sus documentos existen solo en el disco del dueño. Este sí queda versionado.

═══════════════════════════════════════════════════════════════════════════════════════════════

## Objetivo

Cortar el último cordón con Supabase y **verificar que todo el negocio sigue dando los mismos
números**: comisiones, sugerido de pedidos, cartera, CFO, chatbot, WhatsApp y el MCP.

El trabajo pesado ya está hecho (26/07/2026): DistriMM corre íntegramente en su VPS y la carga
manual de Excel se retiró. Lo que queda es **apagar lo que aún respira del lado de Supabase**,
comprobar que nada dependía de ello, y dejar constancia.

## Antes de tocar nada, lee

1. **`CLAUDE.md`** del repo — es la fuente de verdad. Secciones "Plataforma propia (fuera de
   Supabase)", "Sincronización automática desde el ERP SAMIT" y "Decisiones tomadas y pendientes
   abiertos". **Todas las trampas conocidas están ahí; no las redescubras.**
2. `docs/plans/mapeo-servidor-samit.md` — mapa del ERP, verificado contra la base real.
3. `docs/plans/plan-sincronizacion-samit.md` — marcado como histórico; el mapeo campo a campo sigue
   siendo válido, el destino ya no.

## Estado verificado el 26/07/2026 (no re-investigar, sí re-confirmar)

**Producción está limpia.** Cero referencias a `supabase.co` en el bundle desplegado, en el `.env`
del MCP y en `/etc/distrimm/*.env`. El dashboard, el MCP y las Edge Functions leen del VPS.

**Pero del lado de Supabase sigue vivo esto:**

| Qué | Estado | Riesgo |
|---|---|---|
| **`pg_cron` `refresh-whatsapp-tokens`** (lunes 13:00 UTC) | **ACTIVO** | **El más serio.** Llama a la Edge Function vieja y refresca el token de Meta contra la base vieja. En el VPS existe un cron equivalente. **Dos sistemas rotando la misma credencial de Meta pueden invalidarse entre sí.** Desactivarlo es lo primero. |
| Edge Functions desplegadas en Supabase | Activas | Nadie las llama, pero siguen expuestas |
| Rol `distrimm_migracion` | Existe, `BYPASSRLS`, ya en `NOLOGIN` | Se creó para el dump. Borrarlo cuando la migración se dé por definitiva |
| 6 sesiones en `auth.sessions` | Vivas | Último login real: 19/03/2026. Residuo |
| Base de 115 MB | Intacta | **Es el rollback. NO borrar todavía** |

## Lo que hay que hacer

### 1. Apagar, en este orden

1. **Desactivar el `pg_cron`** de Supabase (`UPDATE cron.job SET active=false`) y **verificar que el
   cron del VPS sí corre** (`crontab -l`, con `CRON_TZ=UTC`, y el log en
   `/var/log/distrimm-token-refresh.log`). Confirmar que WhatsApp sigue enviando después.
2. Revisar en Meta que el webhook apunte al VPS
   (`https://distrimm.luminiatech.digital/functions/v1/whatsapp-webhook`, token en
   `/etc/distrimm/functions.env`). El dueño ya lo cambió; **confirmarlo, no asumirlo**.
3. Retirar las Edge Functions desplegadas en Supabase.
4. Borrar el rol `distrimm_migracion` y las sesiones residuales.

### 2. Verificación integral — el corazón de esta sesión

**No basta con que la app cargue.** Hay que comprobar que los números coinciden. Cifras de control
medidas el 26/07/2026 contra las que contrastar:

| Módulo | Qué comprobar | Valor esperado |
|---|---|---|
| **Comisiones** | `fn_calcular_comisiones` sobre la carga de **junio** | 6 vendedores, **818.036.093 COP**, `ventas_comisionables` 526.927.377, **2.311 ítems**. Dio idéntico con datos manuales y sincronizados |
| **Comisiones por recaudo** | Liquidación con `valor_iva` lleno | El IVA se excluye siempre. Impacto ya medido: −75.723 COP en 5 meses, sin cambios de tramo |
| **Sugerido de pedidos** | `fn_sugerido_pedidos` sobre la carga de inventario del mes | Devuelve sugerencias con stock, rotación y días sin venta. Bodegas confiables 1, 5 y 6 |
| **Cartera** | Total del mes en curso | Cuadra **al peso** con `SUM(CT_PlanTerceros.SaldoFinal)` del ERP, cuenta `13050501` |
| **Ventas** | 2026 completo | **17.957 líneas**, sin duplicados. `distrimm_ventas_vigentes` solo mira cargas `erp` |
| **Inventario** | Mes en curso | **1.533 filas**, y por bodega cuadra exacto con `IN_ProdBodega` |
| **CFO y chatbot** | Que respondan | Necesitan `OPENAI_API_KEY` en `/etc/distrimm/functions.env` |
| **MCP** | `GET /mcp/health` y una consulta real | Lee del VPS vía `fn_mcp_*` |
| **Login** | Entrar con un usuario real | Ya hubo un login real el 26/07 (`operacion@luminiatech.digital`) |

**Cómo verificar sin manejar contraseñas:** para probar la UI autenticada, crear un usuario temporal
por el API de admin de GoTrue, obtener el token por API e inyectar la sesión en `localStorage`
(clave `sb-distrimm-auth-token`), y **borrar el usuario al terminar**. No escribir contraseñas en
formularios.

### 3. Cerrar los riesgos de documentación

- **10 de 35 RPCs `fn_*` viven solo en la base.** Lista en `CLAUDE.md`. Exportarlas a `sql/`. Si se
  recrea la base desde el repo, hoy se pierden.
- `docs/plans/` está en `.gitignore`: el mapeo del ERP y el plan existen solo en el disco del dueño.
  **Preguntarle** si se versionan (no contienen secretos; se verificó).
- Rotar `OPENAI_API_KEY` y `META_APP_SECRET` (pasaron por el chat) y sustituir por un marcador la
  llave `anon` real que `.env.example` arrastra desde `5262f79`.

## NO TOCAR

- **`supabase/functions/whatsapp-webhook/index.ts` línea 27**, la URL
  `rwxczwykqxhxugmcaoha.supabase.co`. **No es residuo de DistriMM: es DistriPolsar**, otro proyecto
  que comparte la app de Meta. Borrarla rompe a DistriPolsar.
- **`PresupuestosUploadModal`**: metas y tramos de comisión. Es lo único que no sale del ERP; sin él
  no se pueden cargar los presupuestos y no se liquida comisión.
- **La base de Supabase**, hasta que el dueño dé por definitiva la migración. Es el rollback.
- Los datos manuales del VPS (83 cargas de cartera, 110.107 filas de ventas, 4.095 recaudos) y los
  respaldos `*_bak_20260726`. El dueño pidió expresamente conservarlos para poder contrastar.

## Decisiones del dueño ya tomadas (no re-litigar)

- **Sin respaldo del VPS**, por ahora. Riesgo aceptado explícitamente.
- **Sin SMTP** → no existe "olvidé mi contraseña". Se repone por base.
- `dias_mora` con convención de **360 días** del ERP.
- El **IVA se excluye siempre** de la base comisionable, con la regla del propio ERP
  (`dbo.DeterminarBasePagoComisionVendedor`).
- Solo **2026** de histórico de ventas (2022–2025 están disponibles si se piden).

## Acceso

- **VPS:** `ssh admin@161.97.111.39`. PostgreSQL 17 en `5433` (base `distrimm`); el cluster 16 de
  `5432` es de otros proyectos, no tocarlo. Servicios PM2: `distrimm-rest` (3110), `distrimm-auth`
  (3111), `distrimm-functions` (3112), `distrimm-mcp` (3102). Secretos en `/etc/distrimm/`.
- **Servidor SAMIT:** `ssh distrimm` (Tailscale, `cmd.exe`). **Solo lectura, siempre `WITH (NOLOCK)`.**
  La oficina lo apaga al cerrar; se auto-enciende a las 15:00 por alarma del BIOS. Tarea programada
  `DistriMM Sync SAMIT`, corre con S4U sin guardar contraseñas.
- **Git:** el remoto `origin` es HTTPS y no hay credencial en el llavero; `git push` a secas falla.
  Empujar con la URL SSH `git@github.com:polsar-luminia/DistriMM_DistriPulse.git`, que sí autentica.
  Rama de trabajo actual: `feat/sincronizacion-samit`, sin mezclar a `main`.

## Método

Verificar antes de apagar, y apagar de a uno. Si una cifra no cuadra, **decirlo con el número**, no
maquillarlo: la carga manual ya no existe y no hay red de seguridad más allá del rollback a Supabase.
Al terminar, actualizar `CLAUDE.md` y comitear — nada de este proyecto puede quedar viviendo solo en
una conversación.
