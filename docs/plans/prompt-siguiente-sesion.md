# Prompt de arranque — sincronización SAMIT automática con destino en el VPS (fuera de Supabase)

> **Cómo usar este archivo:** copia todo lo que está bajo la línea `═══` en una sesión nueva de
> Claude Code, abierta en el repo `DistriMM`. Es el punto de partida para implementar. No
> re-planifiques desde cero: casi todo el diseño ya está hecho y verificado contra la base real.

**Contexto de por qué existe este prompt (no lo copies, es para ti):** en sesiones previas se
investigó a fondo el servidor del ERP y se escribió un plan de sincronización completo, ambos
verificados contra la base real. Todo ese plan asumía **Supabase como destino**. El 26/07/2026 el
dueño decidió **salir de Supabase por completo y llevar todo a su VPS**. Este prompt reencuadra la
implementación con ese cambio. Además, ese día se configuró el **auto-encendido del servidor**
(alarma BIOS diaria 15:00) para poder trabajar remoto los fines de semana.

═══════════════════════════════════════════════════════════════════════════════════════════════

## Objetivo

Eliminar la carga manual de Excel del dashboard de DistriMM: que los datos del ERP **SAMIT SQL**
viajen solos a `https://distrimm.luminiatech.digital`. **Cambio arquitectónico clave: el destino
ya NO es Supabase — es PostgreSQL en el VPS. La meta es sacar el proyecto de Supabase por
completo.**

## Antes de escribir una sola línea, lee (en este orden)

1. `CLAUDE.md` del repo — arquitectura, reglas, VPS y deploy.
2. `docs/plans/mapeo-servidor-samit.md` — **el mapa del servidor y su base de datos**, verificado.
   Los tres nudos (detalle de factura, cartera/mora, inventario) están resueltos ahí. Incluye la
   sección de energía/auto-encendido del servidor.
3. `docs/plans/plan-sincronizacion-samit.md` — **el plan de sincronización completo**: mapeo campo
   a campo de los 6 datasets, estrategia de upsert idempotente, observabilidad, manejo de errores,
   seguridad, plan de corte y fases. **Sigue siendo válido salvo en una cosa: el destino.** Donde
   diga "Supabase / service_role / @supabase/supabase-js" hay que releerlo como "Postgres del VPS".
4. Los archivos de ETL que definen los campos destino exactos (no adivinar):
   `src/utils/excelETL.js`, `src/utils/ventasUpload.js`, `src/utils/recaudoUpload.js`,
   `src/utils/inventarioUpload.js`; lógica de negocio en `src/utils/comisionesCalculator.js` y
   `src/utils/portfolioCalculations.js`; escritura actual en `src/services/portfolioService.js` y
   `src/services/comisionesService.js`.

## Lo que ya está resuelto (no re-investigar, verificar si dudas)

- **Detalle de factura** = `IN_Movimiento`, unido por `Documento = IN_Documento.Secuencial`.
- **Cartera y mora** = agregar `CT_Movimientos` sobre cuenta `13050501` **uniendo las bases de
  todos los años** `E0032022..E0032026` (por el corte de año, si miras solo 2026 salen 517 saldos
  negativos). Cuadra al peso con `CT_PlanTerceros`. Mora con convención **DAYS360**.
- **Inventario** = `IN_ProdBodega.CantidadFinal` (NO `IN_Producto.Existencia`, desactualizada).
- **Llave de idempotencia de ventas/recaudos** = `(Documento, Item)`, nunca la factura (una `DV`
  reutiliza el número de la `VE`).
- **Sin `rowversion` ni Change Tracking**; `FechaSys` es solo inserción → estrategia de ventana
  móvil de reproceso + upsert idempotente (ver plan §4).

## El cambio grande: salir de Supabase → todo al VPS

Hoy el dashboard depende de Supabase para mucho más que las tablas de datos:
**Auth (login), PostgREST (el frontend usa `@supabase/supabase-js`), Edge Functions**
(`proxy-n8n-whatsapp`, `proxy-n8n-cfo`, `proxy-n8n-chatbot`, `proxy-embedded-signup`), **RLS** y
**RPCs** (`fn_calcular_comisiones`, `fn_cfo_*`, `fn_distribot_*`, `fn_mcp_*`, `fn_upload_*`).
Salir de Supabase implica reemplazar todo eso en el VPS.

**Estado del VPS (verificado 26/07/2026):** `distrimm.luminiatech.digital` / `161.97.111.39`,
acceso `ssh admin@161.97.111.39`. Ya corre **PostgreSQL 16.14** en `127.0.0.1:5432`, **nginx**
(80/443, SSL Certbot) y el **MCP server** node (`distrimm-mcp`, puerto 3102). **No hay Docker.**
No hay que instalar el motor de base de datos — ya está.

### DECISIÓN #1 a resolver con el dueño antes de implementar: cómo se reemplaza Supabase

| Opción | Qué es | Reescritura de frontend | Esfuerzo | Nota |
|---|---|---|---|---|
| **A. Supabase self-hosted** (recomendada de partida) | Levantar el stack Supabase con docker-compose en el VPS (Postgres + PostgREST + GoTrue Auth + Storage + Edge Runtime). El frontend solo cambia `VITE_SUPABASE_URL` y las keys. Las Edge Functions (Deno) se portan casi tal cual. | Mínima | Medio | Requiere instalar Docker. Sigue siendo el software Supabase, pero en el VPS del dueño (sin depender del servicio cloud ni su facturación). |
| **B. Stack manual** | Postgres 16 (ya está) + PostgREST binario + Auth propio + reescribir las Edge Functions como servicio Node. | Media | Alto | Máximo control, pero Auth propio es superficie de bugs y seguridad. |
| **C. API Node propia** | Reescribir el backend entero como API REST Node contra Postgres. | Alta | Muy alto | Solo si se quiere abandonar el modelo Supabase por completo. |

**Recomendación:** empezar por **A** salvo que el dueño quiera explícitamente no depender del
software de Supabase. Es el camino de menor riesgo para "salir del Supabase cloud" conservando
Auth, RLS, PostgREST y las Edge Functions con poca reescritura. **Confirmar con el dueño antes de
instalar Docker o mover nada.**

## Enfoque por fases (propuesto — validar con el dueño)

Como el destino final es el VPS, **no** tiene sentido construir la sincronización hacia Supabase
para migrarla después. Orden sugerido:

- **Fase A — Plataforma en el VPS.** Resolver la DECISIÓN #1, levantar el stack elegido, recrear el
  esquema (todas las tablas `cartera_items`, `historial_cargas`, `distrimm_*`, comisiones, catálogo,
  la vista `distrimm_ventas_vigentes`, los RPCs), migrar los datos históricos de Supabase, migrar
  Auth (usuarios), portar las Edge Functions, re-apuntar el frontend (`.env` + build + deploy según
  `CLAUDE.md`). Validar que el dashboard funciona igual contra el VPS.
- **Fase B — Sincronización SAMIT → VPS.** Tomar el plan `plan-sincronizacion-samit.md` y ejecutarlo
  con destino Postgres del VPS en vez de Supabase: el agente escribe con el driver `pg` (o el
  PostgREST del VPS) en lugar de `@supabase/supabase-js`; la tabla de observabilidad
  `distrimm_sync_estado` vive en el Postgres del VPS. Empezar por el dataset más simple y verificable
  (catálogos → inventario → clientes → cartera → ventas → recaudos/contado), como en las fases del
  plan.
- **Fase C — Corte.** Convivencia con la carga manual, validación contra un mes cerrado (comparar
  totales y correr `fn_calcular_comisiones` sobre datos manuales vs sincronizados), y apagado dataset
  por dataset. Regla del plan: no apagar la carga manual hasta que los números cuadren solos dos
  semanas.

> El agente de sincronización **corre en el propio servidor SAMIT** (Node v24 ya instalado,
> conexión local a SQL Server con Integrated Security, sin exponer SQL a la red). El destino remoto
> es el Postgres del VPS por Tailscale/red. Ver plan §5–§6. Aprovechar el **auto-encendido a las
> 15:00** (alarma BIOS) para el disparo: tarea programada de Windows al arranque + cada N horas, con
> upserts idempotentes para recuperar corridas perdidas.

## Reglas inviolables

- **Solo lectura sobre el ERP SAMIT.** No escribir, no crear objetos, no tocar su configuración.
  Consultas con `WITH (NOLOCK)`; preferir fuera de horario (oficina L–S ~8am–7pm).
- **No usar la contraseña de `sa`** (está en texto plano en un `.bat` del servidor — reportarla como
  hallazgo a rotar, sin transcribir su valor). Conectar con Integrated Security o crear un login SQL
  de solo lectura dedicado (requiere aprobación del dueño — es la única escritura sobre el ERP que
  contempla el plan).
- **No dejar la oficina sin servicio.** No reiniciar, no suspender, no detener SQL Server. Los otros
  PCs de la oficina trabajan contra ese servidor.
- **El servidor se apaga al cerrar la oficina** y se auto-enciende a las 15:00 por alarma del BIOS
  (ver mapeo). Contar con ventanas muertas.
- **No instalar software sin decirlo antes** — en particular Docker en el VPS y las dependencias del
  agente (`pg`, driver SQL). Describirlo y preguntar.
- **Verificar cada afirmación contra la base real.** Si algo no se pudo confirmar, decirlo en vez de
  rellenar con supuestos. Las decisiones que dependen del dueño se dejan como preguntas abiertas.
- **Seguridad de credenciales:** las claves del destino (VPS) fuera de carpetas sincronizadas a
  OneDrive en el servidor; ACL restringida; nunca en el repo.

## Decisiones abiertas que hay que cerrar (heredadas del plan + nuevas del VPS)

**Nuevas (VPS):**
1. **DECISIÓN #1** de arriba: Supabase self-hosted (A) vs stack manual (B) vs API propia (C).
2. Migración de **Auth**: cómo se mueven los usuarios/login fuera de Supabase.
3. Destino de las **Edge Functions** (WhatsApp/CFO/chatbot): portarlas al VPS o reescribirlas.
4. Qué pasa con el **MCP server** (ya en el VPS, hoy lee de Supabase vía `fn_mcp_*`): re-apuntar sus
   RPCs al Postgres del VPS.
5. **Backup del VPS**: si toda la operación pasa al VPS, definir su respaldo (hoy el riesgo del disco
   único está en el servidor SAMIT; no trasladar el mismo error al VPS).

**Heredadas del plan (siguen vigentes):**
6. Crear el **login SQL de solo lectura** en el ERP (única escritura sobre SAMIT).
7. Convención de **`dias_mora`** (360 días del ERP vs calendario); revisar si RPCs de score/CFO leen
   la columna directamente.
8. **Cuántos años de ventas migrar** (solo 2026 o también 2022–2025).
9. **Contado**: columna `es_contado` en ventas vs dataset aparte.
10. **Vendedor de cartera**: `IN_Documento.Vendedor` vs `G_Clientes.VendAsg` cuando difieren.
11. **`no_identif`** con o sin dígito de verificación.
12. **Bodegas confiables** (¿siguen siendo 1, 5, 6?).
13. `transito` (`Remisionado`=0) y `precio_medio` (`CostoPromedio`) — confirmar con el negocio.

## Acceso rápido

- **Servidor SAMIT:** `ssh distrimm` (cmd.exe; usar el helper `psrun.sh` para PowerShell).
  SQL: `Server=.\SAMIT;Database=E0032026;Integrated Security=True`. Base viva `E0032026` (empresa
  `E003`, año 2026); cartera necesita también `E0032022..E0032025`.
- **VPS destino:** `ssh admin@161.97.111.39`. Postgres 16 en `127.0.0.1:5432`, nginx, MCP en 3102.

## Método

Investiga/valida primero, escribe después. Empieza por resolver la DECISIÓN #1 con el dueño y por
el dataset más simple y verificable, no por el más grande. Al terminar cada fase, valida contra las
cifras de control del ERP (ver plan §4 y §10) antes de apagar cualquier carga manual.
