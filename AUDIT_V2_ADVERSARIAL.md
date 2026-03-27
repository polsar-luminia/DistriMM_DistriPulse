# DistriMM — Auditoría Adversarial v2

**Fecha:** 24 de marzo de 2026
**Ambiente producción:** https://distrimm.luminiatech.digital
**Commit HEAD (main):** `589a86c` — "fix(clientes): no sobreescribir datos maestros con NULLs al subir cartera"
**Estado local:** 186 archivos modificados sin commit, sin stage
**Auditor:** QA Senior adversarial (Claude)

---

## Metodología

Esta auditoría combina:

1. **Browser en producción** — navegación real con capturas de pantalla
2. **Código fuente local** — lectura con líneas exactas de 20+ archivos
3. **SQL y Edge Functions** — esquemas, RLS, CORS, funciones SECURITY DEFINER
4. **Git status** — comparación entre HEAD, worktree local y lo desplegado

Cada hallazgo incluye: severidad, fuente de evidencia, archivo + línea, impacto, nivel de confianza, y estado de confirmación. No se modificó ningún archivo.

---

## HALLAZGOS ORDENADOS POR SEVERIDAD

---

### H01 — CORS Wildcard Fallback en Edge Functions

- **Severidad:** CRÍTICA
- **Fuente:** `supabase/functions/_shared/cors.ts`, línea 15
- **Qué está mal:** Si el secreto `ALLOWED_ORIGINS` no está configurado en Supabase Dashboard, la función `resolveOrigin()` retorna `"*"`. Esto expone TODAS las Edge Functions (proxy-n8n-whatsapp, proxy-n8n-cfo, proxy-n8n-chatbot, proxy-embedded-signup) a invocaciones desde cualquier dominio.
- **Impacto:** Un atacante puede enviar mensajes WhatsApp, invocar análisis CFO, y usar el chatbot desde cualquier sitio web, consumiendo recursos y potencialmente enviando spam.
- **Confianza:** ALTA — lógica clara en código.
- **Estado:** `confirmado en código` — no verificable si ALLOWED_ORIGINS está configurado en el Dashboard sin acceso a Supabase.
- **Recomendación:** Verificar en Supabase Dashboard → Edge Functions → Secrets que `ALLOWED_ORIGINS` esté configurado con `https://distrimm.luminiatech.digital`. Si no existe, configurarlo inmediatamente.

---

### H02 — RLS Permisiva: Todos los Usuarios Autenticados Ven Todos los Datos

- **Severidad:** CRÍTICA (condicional — depende de si hay múltiples usuarios en producción)
- **Fuente:** `sql/distrimm_schema.sql` líneas 22-24, 67-69; `sql/comisiones_schema.sql` líneas 97-115
- **Qué está mal:** Las políticas RLS en tablas legacy (`historial_cargas`, `cartera_items`) usan `USING (true)`. Las tablas `distrimm_*` usan `USING (auth.role() = 'authenticated')`. En ambos casos, cualquier usuario autenticado puede leer, insertar y eliminar datos de TODOS los usuarios.
- **Impacto:** Si DistriMM tiene un solo usuario (Santiago), impacto nulo. Si hay más usuarios, hay exposición total de datos entre cuentas.
- **Confianza:** ALTA en código. MEDIA en producción (no sé cuántos usuarios hay).
- **Estado:** `confirmado en código` — hay archivos `sql/secure_rls.sql` y `sql/rls_security_fix.sql` con políticas más restrictivas, pero no hay confirmación de que estén aplicadas en producción.
- **Excepción:** `distrimm_whatsapp_instances` SÍ tiene aislamiento por `user_id` (`sql/020_whatsapp_instances.sql`, líneas 63-70). `distrimm_whatsapp_credentials` no tiene políticas de usuario (solo accesible por `service_role`). Ambos correctos.
- **Recomendación:** Si hay más de un usuario, aplicar las políticas de `rls_security_fix.sql` inmediatamente. Si es single-tenant por diseño, documentarlo explícitamente.

---

### H03 — Storage Bucket `comprobantes` Público Sin Autenticación

- **Severidad:** CRÍTICA (condicional — solo si el portal de pagos está activo)
- **Fuente:** `sql/setup_payment_portal.sql`, líneas 18-24
- **Qué está mal:** El bucket `comprobantes` está configurado como `public = true` con políticas que permiten SELECT e INSERT a cualquier persona (sin `auth.uid()` ni `auth.role()`). También `reportes_pago` permite inserts anónimos.
- **Impacto:** Cualquiera en internet puede subir archivos al bucket (posible hosting de malware) y leer comprobantes de pago de otros usuarios.
- **Confianza:** ALTA en código. MEDIA en producción — no confirmé que estas tablas/buckets existan en Supabase.
- **Estado:** `confirmado en código` — el SQL existe en el repo. Si fue ejecutado en producción, el riesgo está activo.
- **Recomendación:** Verificar en Supabase Dashboard → Storage si el bucket `comprobantes` existe. Si existe y es público, restringir a usuarios autenticados.

---

### H04 — SECURITY DEFINER sin `SET search_path` en 4 Funciones

- **Severidad:** MEDIA
- **Fuente:** `sql/comisiones_schema.sql` línea 137 (`fn_calcular_comisiones`); `sql/fn_upload_ventas.sql` línea 9; `sql/credit_score_v2_migration.sql` línea 50; `sql/fix_payment_portal_schema.sql` línea 16
- **Qué está mal:** Funciones `SECURITY DEFINER` ejecutan con privilegios del owner. Sin `SET search_path = public`, un atacante que pueda crear schemas podría inyectar funciones maliciosas en el search_path.
- **Impacto:** Bajo en práctica (requiere acceso para crear schemas en PostgreSQL), pero es un best-practice violation documentado por Supabase.
- **Confianza:** ALTA — verificado en código.
- **Estado:** `confirmado en código`. `verify_distrimm_payment_v4` SÍ tiene `SET search_path = public` (correcta).
- **Recomendación:** Agregar `SET search_path = public` a las 4 funciones restantes.

---

### H05 — Restricción de Horario WhatsApp Solo en Frontend

- **Severidad:** MEDIA
- **Fuente:** `src/services/messagingService.js` líneas 12-22 (cliente); `supabase/functions/proxy-n8n-whatsapp/index.ts` (servidor — sin validación de horario)
- **Qué está mal:** La restricción de envío 7am-9pm Colombia solo se valida en `checkSendingHours()` en el frontend. La Edge Function no verifica horario.
- **Impacto:** Un usuario técnico podría enviar mensajes fuera de horario llamando la Edge Function directamente (o modificando el JS del cliente). Riesgo amplificado si CORS es wildcard (H01).
- **Confianza:** ALTA — revisé ambos archivos completos.
- **Estado:** `confirmado en ambos` (validación presente en cliente, ausente en servidor).
- **Recomendación:** Agregar validación de horario en `proxy-n8n-whatsapp/index.ts` antes de invocar n8n.

---

### H06 — Terminología Inconsistente en Exports (PDF/Excel)

- **Severidad:** MEDIA (impacto externo — documentos compartidos con terceros)
- **Fuente:** Múltiples archivos
- **Qué está mal:** Los exports generan documentos con terminología inconsistente:

| Archivo | Línea | Texto actual | Problema |
|---|---|---|---|
| `reportePDF.js` | 710 | `"Sin presupuesto de recaudo configurado"` | Usa "presupuesto" en vez de "cuota" |
| `reporteExcelMensual.js` | 74 | `"Motivo Exclusion"` | Falta acento: "Exclusión" |
| `VentasTab.jsx` | 107, 110, 117 | `"Sin Comision"` | Falta acento en "Comisión" |
| `VentasTab.jsx` | 153 | `"Sin presupuesto"` | Usa "presupuesto" en vez de "cuota" |
| `RecaudoTab.jsx` | 239 | `"Marca excluida"` | UI en producción usa "MARCA EXCLUIDA" |
| `RecaudoTab.jsx` | 284-285 | `"Excl. Mora"` / `"Excl. Marca"` | Abreviatura ambigua |

- **Confianza:** ALTA — todas las líneas verificadas en código y parcialmente en browser.
- **Estado:** `confirmado en ambos` — vi "MARCA EXCLUIDA" y "EXCL. MORA" en producción.
- **Recomendación:** Normalizar toda terminología visible. Usar "Sin comisión" (con acento, minúscula) consistentemente. Reemplazar "presupuesto" por "cuota" en texto visible.

---

### H07 — Exclusiones Tab Usa "excluidos/excluidas" en Producción

- **Severidad:** BAJA-MEDIA (inconsistencia visible al usuario)
- **Fuente:** Browser producción + `src/components/comisiones/ExclusionesTab.jsx` líneas 120, 143, 180
- **Qué está mal:** Producción muestra "No hay marcas excluidas", "No hay productos excluidos", "Excluir por Marca", "Excluir por Producto". Mientras Catálogo y ReporteMensual ya usan "sin comisión".
- **Confianza:** ALTA — screenshot de producción confirma.
- **Estado:** `confirmado en ambos`.
- **Recomendación:** El concepto de "exclusión" como acción del usuario es semánticamente correcto ("Excluir por Marca" es una acción). La inconsistencia es que el resultado se llama "excluidos" aquí pero "sin comisión" en otros tabs. Considerar renombrar el resultado pero mantener la acción.

---

### H08 — Accesibilidad: Selects sin Label en Múltiples Componentes

- **Severidad:** BAJA-MEDIA
- **Fuente:** Código fuente — múltiples archivos
- **Qué está mal:** Elementos `<select>` sin `<label>` asociado ni `aria-label`:

| Archivo | Líneas | Elemento |
|---|---|---|
| `RecaudoTab.jsx` | 167-188 | Selectores mes/año |
| `ReporteMensualTab.jsx` | 278-320 | Selectores mes/año/vendedor |
| `CatalogoTab.jsx` | 124-151 | Selectores marca/categoría |
| `ExclusionesTab.jsx` | 91-97 | Inputs de búsqueda |

- **Confianza:** ALTA — verificado en código.
- **Estado:** `confirmado en código`.
- **Recomendación:** Agregar `aria-label` descriptivo a cada `<select>` e `<input>`.

---

### H09 — Botones Solo-Ícono sin `aria-label`

- **Severidad:** BAJA
- **Fuente:** Código fuente
- **Qué está mal:**

| Archivo | Línea | Elemento | Nota |
|---|---|---|---|
| `VentasTab.jsx` | 305 | Trash icon (eliminar carga) | Tiene `title` pero no `aria-label` |
| `ExclusionesTab.jsx` | 125, 130, 185, 193 | Toggle y delete icons | Sin nombre accesible |
| `RecaudoTab.jsx` | 341-351 | Chevrons expandir/colapsar | Sin `aria-expanded` |

- **Confianza:** ALTA.
- **Estado:** `confirmado en código`.
- **Recomendación:** Agregar `aria-label` a cada botón icono. Agregar `aria-expanded` a filas expandibles.

---

### H10 — Vendor "Sin nombre #16" en Reporte Mensual

- **Severidad:** BAJA (dato, no bug de código)
- **Fuente:** Browser producción — Reporte Mensual, tabla de liquidación
- **Qué está mal:** Un vendedor aparece como "Sin nombre #16" con $0 en todas las comisiones. Esto sugiere un registro en `distrimm_comisiones_ventas` con `cod_vendedor = 16` que no tiene nombre asociado.
- **Confianza:** ALTA — visible en screenshot de producción.
- **Estado:** `confirmado en producción`.
- **Recomendación:** Verificar en Supabase qué datos están asociados a cod_vendedor 16. Puede ser un vendedor eliminado o un registro huérfano.

---

### H11 — Payment Portal RPC con Column Mismatch

- **Severidad:** MEDIA (condicional — solo si el portal de pagos está activo)
- **Fuente:** `sql/setup_payment_portal_safe.sql` líneas 86, 108
- **Qué está mal:** La función RPC usa `SELECT cliente, telefono...` pero la tabla podría usar `cliente_nombre` como nombre de columna. Si el esquema no coincide, las consultas fallarán silenciosamente.
- **Confianza:** MEDIA — no puedo verificar qué columnas tiene la tabla en producción.
- **Estado:** `plausible no confirmado`.
- **Recomendación:** Verificar con `\d reportes_pago` en Supabase SQL Editor.

---

### H12 — Tramo Boundary: Ambigüedad Semántica en `<=`

- **Severidad:** BAJA (funciona correctamente pero es frágil)
- **Fuente:** `src/utils/comisionesCalculator.js` línea 145
- **Qué está mal:** El calculador usa `pctCumplimiento <= tramo.max` (inclusivo). Si Tramo1 max=90 y Tramo2 min=90, un valor exacto de 90% matchea ambos. Se resuelve por orden de iteración (5→1, el tramo más alto gana), pero esto es implícito y no documentado. La validación en `recaudoTierValidation.js` usa EPSILON=0.02 para detectar gaps/overlaps, lo cual es suficiente.
- **Confianza:** ALTA — lógica verificada línea por línea.
- **Estado:** `confirmado en código`.
- **Recomendación:** Agregar un test unitario explícito para valores exactos en boundaries. Documentar que el tramo más alto gana.

---

### H13 — COMISIÓN RECAUDO $0 en Reporte Mensual

- **Severidad:** INDETERMINADA — requiere contexto de negocio
- **Fuente:** Browser producción — Reporte Mensual Marzo 2026
- **Qué está mal:** La liquidación muestra COMISIÓN RECAUDO = $0 para TODOS los vendedores, aunque el Recaudo Tab muestra $714M recaudado con 83% comisionable. Posibles causas:
  1. No hay cuotas de recaudo configuradas (el PDF muestra "Sin presupuesto de recaudo configurado")
  2. Los recaudos no se asociaron al mes correcto
  3. Bug en el cálculo
- **Confianza:** MEDIA — vi $0 en producción pero no puedo distinguir entre las causas sin ver la tabla `distrimm_comisiones_presupuestos_recaudo`.
- **Estado:** `confirmado en producción, causa no confirmada`.
- **Recomendación:** Verificar en Cuotas Tab si hay presupuestos de recaudo configurados para Marzo 2026.

---

### H14 — No Hay Mecanismo para Determinar Versión en Producción

- **Severidad:** MEDIA (operacional, no de seguridad)
- **Fuente:** `package.json` (version "1.0.0"), ausencia de build hashes o deploy config
- **Qué está mal:** No hay Vercel, Netlify, ni Dockerfile. No hay build hash embebido en el HTML o JS. No hay forma de saber qué commit está desplegado sin acceso al servidor de hosting.
- **Impacto:** Hace imposible confirmar drift de despliegue con certeza. Los 186 archivos modificados localmente pueden o no estar desplegados.
- **Confianza:** ALTA — no encontré ningún indicador de versión.
- **Estado:** `confirmado en código`.
- **Recomendación:** Embeber `VITE_BUILD_HASH` o `VITE_BUILD_DATE` en el build. Agregar un endpoint `/version` o un meta tag.

---

## SECCIÓN ESPECIAL: Hallazgos Previos Que Estaban Bien

1. **IVA se descuenta correctamente.** `comisionesCalculator.js` línea 81: `valor_recaudo - valor_excluido_marca - valor_iva`. Consistente en RecaudoTab línea 99. **Bien planteado por la primera auditoría** (aunque no fue un hallazgo explícito — fue implícito al decir "lógica sólida").

2. **`normalizeBrand()` es robusto.** 16 reglas bien ordenadas, sin colisiones falsas, sin splits falsos. `brandNormalization.js` líneas 3-131. **Bien planteado.**

3. **`fetchAllRows` es seguro.** Dos condiciones de salida (página vacía, página parcial), page size 1000. No hay loop infinito posible en la práctica. **Bien planteado.**

4. **Tokens WhatsApp bien protegidos.** `distrimm_whatsapp_credentials` sin políticas de usuario, solo accesible por `service_role`. Refresh lazy con 7 días de margen. **Bien planteado.**

5. **n8n webhooks no expuestos al frontend.** Secrets solo en Edge Function environment. Frontend usa `supabase.functions.invoke()`. **Bien planteado.**

---

## SECCIÓN ESPECIAL: Hallazgos Previos Correctos Pero Sobreafirmados

### 1. "Brecha de despliegue — VentasTab muestra 5 KPIs en producción pero 3 en código"

**Veredicto: SOBREAFIRMADO.**

La primera auditoría afirmó con certeza que producción mostraba 5 KPIs mientras el código tenía 3. Sin embargo:
- Hoy producción muestra **3 KPIs** (Ventas Brutas, Devoluciones, Venta Neta) — lo mismo que el código.
- El repo tiene 186 archivos sin commit. Sin mecanismo de versión embebido, es imposible saber qué versión corre en producción.
- La auditoría anterior probablemente vio una versión pre-deploy, y el deploy ocurrió durante o después de la revisión.
- **El hallazgo era correcto en el momento**, pero se presentó como evidencia de "pipeline roto" cuando en realidad era simplemente un deploy pendiente que ya se completó.

### 2. "Catálogo vacío — posible pérdida de datos"

**Veredicto: SOBREAFIRMADO.**

- Primera auditoría: 4,155 productos → "Catálogo vacío" → alerta de pérdida de datos.
- Hoy: **4,155 de 4,155 productos · 144 sin comisión** — datos intactos.
- El "Catálogo vacío" fue probablemente un estado transitorio (carga en progreso, sesión expirada, o error de red momentáneo).
- **No hubo pérdida de datos.** Afirmar "pérdida de datos" sin verificar con un segundo intento o revisar network requests fue precipitado.

### 3. "Terminología `Excluido` en CatalogoTab.jsx líneas 175 y 219"

**Veredicto: PARCIALMENTE SOBREAFIRMADO.**

- Producción hoy muestra "144 sin comisión" y badge "Sin comisión" en el Catálogo.
- El código fuente en la versión local (sin commit) ya usa "sin comisión".
- La primera auditoría reportó "Excluido" como el texto actual, pero esto pudo ser la versión pre-deploy. El hallazgo era válido para esa versión pero ya está corregido en producción.

### 4. "La lógica de cálculo es sólida — no se encontraron bugs"

**Veredicto: CORRECTO PERO INCOMPLETO.**

La lógica ES sólida para los escenarios que maneja. Pero la primera auditoría no investigó:
- La ambigüedad en boundaries de tramos (H12)
- La desconexión entre snapshot congelado y datos actuales (H13, sección F del análisis de comisiones)
- El uso exclusivo de la última carga del mes (lo cual es una decisión de diseño, pero debería estar documentado)
- Que COMISIÓN RECAUDO puede ser $0 incluso con $714M recaudados

---

## SECCIÓN ESPECIAL: Hallazgos Que Faltaron en Auditorías Previas

### 1. CORS Wildcard (H01) — CRÍTICO, nunca mencionado.
La primera auditoría no revisó Edge Functions ni CORS. Este es el hallazgo de seguridad más importante.

### 2. RLS Multi-Tenant (H02) — CRÍTICO, nunca mencionado.
Las políticas RLS permisivas permiten que cualquier usuario autenticado vea datos de todos los usuarios.

### 3. Storage Bucket Público (H03) — CRÍTICO, nunca mencionado.
El bucket `comprobantes` con escritura/lectura anónima.

### 4. SECURITY DEFINER sin search_path (H04) — MEDIO, nunca mencionado.
4 funciones sin protección de schema poisoning.

### 5. Horario WhatsApp solo en frontend (H05) — MEDIO, nunca mencionado.
Bypass trivial de la restricción de horario.

### 6. "Sin nombre #16" (H10) — BAJO, nunca mencionado.
Dato huérfano visible en producción.

### 7. COMISIÓN RECAUDO $0 (H13) — INDETERMINADO, nunca investigado.
$714M recaudados pero $0 comisión — requiere explicación.

### 8. No hay versionado de build (H14) — MEDIO, nunca mencionado.
Hace imposible verificar drift con certeza.

### 9. Payment Portal con column mismatch (H11) — MEDIO, nunca mencionado.

### 10. Solo se usa la última carga del mes — no es un bug pero es una decisión de diseño no documentada que puede sorprender al usuario si sube dos archivos en el mismo mes.

---

## SECCIÓN FINAL

### Top 5 Riesgos Reales

| # | Riesgo | Severidad | Probabilidad | Acción |
|---|---|---|---|---|
| 1 | **CORS wildcard** permite invocación externa de Edge Functions | CRÍTICA | ALTA si ALLOWED_ORIGINS no está configurado | Verificar secreto en Supabase Dashboard |
| 2 | **RLS permisiva** expone datos entre usuarios | CRÍTICA | MEDIA (depende de si hay múltiples usuarios) | Aplicar `rls_security_fix.sql` |
| 3 | **Storage público** permite upload anónimo | CRÍTICA | MEDIA (depende de si el portal de pagos está activo) | Restringir bucket a autenticados |
| 4 | **Horario WhatsApp bypass** | MEDIA | BAJA (requiere conocimiento técnico) | Agregar validación server-side |
| 5 | **Exports con terminología incorrecta** van a terceros | MEDIA | ALTA (cada vez que se exporta) | Normalizar strings en reportePDF.js y reporteExcelMensual.js |

### Top 5 Cambios Que Más Probablemente Impactan Mañana

| # | Cambio | Por qué |
|---|---|---|
| 1 | Commitear los 186 archivos modificados | Sin commit, los cambios se pierden. No hay stash, no hay branch. |
| 2 | Configurar ALLOWED_ORIGINS en Supabase | Cierra el vector de ataque más grande |
| 3 | Investigar COMISIÓN RECAUDO $0 | Si los vendedores esperan comisión de recaudo y no la ven, es un problema de negocio |
| 4 | Corregir acentos en exports ("Comision" → "Comisión", "Exclusion" → "Exclusión") | Profesionalismo de documentos externos |
| 5 | Resolver "Sin nombre #16" | Dato visible en reportes que genera confusión |

### Cosas Que Requieren Acceso a Supabase/Ambiente para Cerrar Confirmación

1. **ALLOWED_ORIGINS** — ¿Está configurado el secreto? → Dashboard → Edge Functions → Secrets
2. **RLS activas** — ¿Cuáles de los múltiples archivos SQL se ejecutaron? → `SELECT * FROM pg_policies WHERE tablename LIKE 'distrimm%'`
3. **Bucket `comprobantes`** — ¿Existe? ¿Es público? → Dashboard → Storage
4. **SECURITY DEFINER functions** — ¿Tienen search_path? → `SELECT proname, prosrc FROM pg_proc WHERE proname IN ('fn_calcular_comisiones', 'fn_upload_ventas', 'fn_calcular_credit_score_v2', 'get_payment_info')`
5. **`distrimm_comisiones_presupuestos_recaudo`** — ¿Hay cuotas de recaudo para Marzo 2026? → Explica si COMISIÓN RECAUDO $0 es correcto
6. **cod_vendedor 16** — ¿Qué registro es? → `SELECT * FROM distrimm_comisiones_ventas WHERE cod_vendedor = 16`
7. **Portal de pagos** — ¿Está activo? ¿Se ejecutó `setup_payment_portal.sql`? → Dashboard → Tables → `reportes_pago`
8. **Build desplegado** — ¿Qué commit está en producción? → Acceso al servidor de hosting o plataforma de deploy

---

## Nota sobre Scoring

No asigno un score numérico a esta auditoría. La primera auditoría dio 7.25/10 con hallazgos de seguridad backend que no revisó. Un score sin verificar CORS, RLS, y storage sería engañoso.

**Si CORS está abierto y RLS es permisiva con múltiples usuarios:** el score real sería ≤5/10 por la exposición de seguridad.
**Si CORS está configurado y es single-tenant:** el score estaría en ~7.5/10, con los exports y la accesibilidad como áreas de mejora.

El score depende de verificaciones que solo pueden hacerse con acceso a Supabase Dashboard.

---

*Reporte generado el 24 de marzo de 2026. Revisión adversarial: browser + código fuente + SQL + Edge Functions + git status. No se modificaron archivos.*
