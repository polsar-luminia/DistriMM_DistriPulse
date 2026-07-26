---
name: senior-dev
description: >
  Guía maestra de buenas prácticas de desarrollo senior full-stack. SIEMPRE usar esta skill al
  escribir, modificar, revisar o refactorizar cualquier código — JavaScript, TypeScript, Python,
  SQL, React, Node.js, CSS, HTML, configuraciones, scripts, migraciones, o cualquier otro
  lenguaje/framework. Se activa para CUALQUIER tarea que involucre producir código: nuevas
  funciones, bug fixes, refactors, componentes UI, endpoints API, queries, schemas, tests,
  configs, CI/CD, scripts de deploy, o documentación técnica. Prioriza mantenibilidad y
  seguridad sobre velocidad de desarrollo. Incluso para cambios de una sola línea, consultar
  esta skill. Aplica a CUALQUIER archivo de código sin excepción — si se va a escribir o
  modificar código, esta skill debe estar activa.
---

# Senior Full-Stack Development Guide

## Filosofía

**Prioridades en orden:** seguridad > escalabilidad > mantenibilidad > velocidad de desarrollo.

Código que otro dev entiende en 6 meses vale más que código que se escribe rápido. Pero un senior sabe cuándo la pragmaticidad supera la pureza — estas son guías, no dogma. Si hay una razón técnica concreta para desviarse, documentarla y seguir adelante.

---

## 0. Pensar Como Senior

Antes de escribir código, responder estas preguntas mentalmente:

**¿Qué puede salir mal?** Pensar en edge cases, datos corruptos, red caída, usuario malicioso, concurrencia. Un junior piensa en el happy path; un senior piensa en los modos de fallo.

**¿Esto escala?** No prematuramente — pero si estoy haciendo `array.filter()` sobre datos que hoy son 100 y mañana serán 100,000, usar SQL. Si agrego un `setTimeout`, preguntarme qué pasa con 1000 usuarios concurrentes.

**¿Cuál es el blast radius?** Cambiar un util que usan 30 componentes es más riesgoso que cambiar un handler local. Proporcionar el cuidado al impacto.

**¿Estoy resolviendo el problema real?** A veces el bug report dice "el botón no funciona" pero el problema real es un race condition en el fetch. Investigar la causa raíz, no parchear síntomas.

**Trade-offs conscientes.** Cada decisión técnica tiene un costo:
- Abstraer temprano → rigidez. Duplicar → mantenimiento. Elegir conscientemente.
- Si tres funciones son similares, duplicar es OK. Si son 7, abstraer.
- Preguntarse: "¿qué elegiría yo si tuviera que mantener esto 2 años?"

---

## 1. Arquitectura y Estructura

**Responsabilidad única.** Cada función/componente/módulo hace UNA cosa. Si el nombre necesita "y"/"And", probablemente hay que dividir.

**Separación de capas** — cada capa habla solo con la adyacente:

```
UI (componente) → Lógica (hook) → Datos (servicio) → Backend (DB/API)
```

Los componentes renderizan. Los hooks orquestan estado y lógica. Los servicios manejan I/O. No mezclar estas responsabilidades.

**Composición sobre herencia.** Preferir children pattern y compound components sobre prop drilling excesivo:

```jsx
// Composición — flexible, extensible
<Card>
  <Card.Header>Título</Card.Header>
  <Card.Body>{content}</Card.Body>
</Card>

// Prop drilling — rígido, difícil de extender
<Card title="..." body="..." footer="..." icon="..." variant="..." />
```

**Colocación.** Archivos relacionados viven juntos. Un componente y su hook helper van en la misma carpeta, no en carpetas genéricas separadas.

**Tamaño de archivo.** 300-400 líneas es señal de revisar si conviene dividir. No es un límite duro — un wizard de 450 líneas cohesivas puede ser más legible que 6 archivos de 75. La pregunta correcta: "¿un dev nuevo puede entender este archivo en una lectura?" Si no → dividir.

**Naming:**
- Componentes: `PascalCase.jsx`
- Hooks: `useCamelCase.js`
- Servicios/utils: `camelCase.js`
- Constantes/config: `camelCase.js` o `SCREAMING_SNAKE` para valores
- SQL: `snake_case.sql` descriptivo

---

## 2. Nombrado y Legibilidad

- **Funciones**: verbos → `calculateCommission()`, `formatCurrency()`, `validateInput()`
- **Variables**: sustantivos descriptivos → `totalAmount`, `activeUsers`, `brandMap`
- **Booleanos**: preguntas → `isLoading`, `hasPermission`, `canDelete`, `shouldRetry`
- **Constantes mágicas**: nombre que explique el dominio → `const GRACE_PERIOD_DAYS = 3;`
- **Handlers**: `handleX` o `onX` → `handleSubmit`, `onFilterChange`

**Comentarios: POR QUÉ, no QUÉ.** El código dice qué hace. El comentario dice por qué esa decisión:

```js
// MAL — repite el código
// Filtra items vencidos
const overdue = items.filter(i => i.diasMora > 0);

// BIEN — explica la regla de negocio
// Regulación local exige reportar facturas con mora > 0 días a partir de 2024
const overdue = items.filter(i => i.diasMora > 0);
```

**Funciones pequeñas con nombres descriptivos > comentarios.** Si necesitas un comentario para explicar un bloque de 20 líneas, extraer esa lógica a una función con nombre descriptivo.

---

## 3. Manejo de Errores y Resiliencia

### Principios

**Nunca ignorar errores.** `catch (e) {}` y `catch (e) { console.log(e) }` son bugs en espera. Cada catch debe: logear con contexto, retornar un valor seguro, o propagar.

```js
// Patrón mínimo — logear + retorno seguro
catch (error) {
  console.error("[serviceName] operación fallida:", error);
  return { data: null, error };
}
```

**Try/catch granular.** Envolver la operación específica que puede fallar, no bloques de 50 líneas donde no sabes cuál tiró.

**Errores informativos** con contexto:
```js
// MAL — no dice nada útil para debuggear
throw new Error("Not found");

// BIEN — localizable en logs
throw new Error(`Vendedor con código ${codigo} no encontrado en carga ${cargaId}`);
```

### Patrones de resiliencia

**Retornos consistentes.** Si un servicio usa `{ data, error }`, TODAS sus funciones retornan ese shape. Mezclar `{ success, error }` con `{ data, error }` en el mismo servicio causa confusión.

**Fail-safe vs fail-fast:** elegir conscientemente:
- **Fail-fast** para datos críticos (transacciones financieras, mutaciones): si algo falla, abortar y notificar
- **Fail-safe** para operaciones no-críticas (analytics, logging, cache): si falla, degradar sin romper la experiencia

```js
// Fail-safe — la app funciona aunque el analytics falle
try { await trackEvent("page_view", data); }
catch { /* analytics failure shouldn't block user */ }

// Fail-fast — no continuar si la mutación falla
const { error } = await saveInvoice(invoice);
if (error) throw error; // Propagar — el caller decide qué hacer
```

**UI — tres estados para componentes async:**
1. **Loading** — skeleton/spinner que refleje la estructura final
2. **Error** — mensaje útil + acción de retry
3. **Vacío** — empty state que guíe al usuario ("No hay facturas. Importa tu primera cartera")

**Error Boundaries** en React para capturar errores de render en rutas principales.

---

## 4. Seguridad (No Negociable)

La seguridad no se negocia por velocidad ni por conveniencia. Estos puntos aplican siempre:

**Secretos fuera del frontend.** Variables `VITE_*` / `NEXT_PUBLIC_*` se compilan al bundle y son visibles. Solo exponer tokens read-only de bajo riesgo (Supabase anon key). Todo lo demás → backend/edge functions/env vars del servidor.

**Sanitización de HTML.** Cualquier contenido dinámico que se renderice como HTML debe sanitizarse:
```js
// Si es inevitable usar dangerouslySetInnerHTML
import DOMPurify from "dompurify";
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }} />

// Mejor aún — usar componentes de markdown con sanitización built-in
<ReactMarkdown rehypePlugins={[rehypeSanitize]}>{content}</ReactMarkdown>
```

**Queries parametrizadas siempre.** Nunca interpolar variables en SQL:
```js
// CORRECTO — parametrizado
const { data } = await supabase.from("users").select("*").eq("id", userId);
const { data } = await supabase.rpc("fn_calculate", { p_id: id });

// NUNCA — interpolación directa
`SELECT * FROM users WHERE id = '${userId}'`
```

**Validación en ambos lados.** Frontend valida para UX (feedback inmediato). Backend valida para seguridad (no confiar en el cliente). Nunca asumir que los datos del frontend son seguros.

**Dependencias:** antes de instalar un paquete, verificar:
- Mantenimiento activo (último commit < 6 meses)
- Vulnerabilidades conocidas (`npm audit`)
- Tamaño vs beneficio (no agregar 200KB para un helper de 5 líneas)

**RLS/Authorization** activo en la base de datos. La DB debe proteger sus propios datos independientemente del frontend.

---

## 5. Integridad de Datos

Un senior trata los datos como el activo más valioso de la aplicación.

**Operaciones multi-paso deben ser atómicas.** Si insertas un "lote" y luego sus "detalles", y el segundo paso falla, tienes un lote huérfano. Usar transacciones o RPC functions que encapsulen la operación completa.

```js
// MAL — dos operaciones independientes, puede fallar entre ambas
const { data: lote } = await supabase.from("lotes").insert(loteData).select().single();
const { error } = await supabase.from("detalles").insert(detalles); // Si falla → lote huérfano

// BIEN — operación atómica en el backend
const { data } = await supabase.rpc("fn_crear_lote_con_detalles", {
  p_lote: loteData,
  p_detalles: detalles
});
```

**Idempotencia.** Las operaciones que pueden re-ejecutarse (retries, doble-click) deben producir el mismo resultado. Usar upsert con claves naturales, UUIDs generados en el cliente, o locks optimistas.

**Constraints en la DB.** La base de datos es la última línea de defensa:
- `NOT NULL` para campos requeridos
- `REFERENCES` para integridad referencial con `ON DELETE` apropiado
- `CHECK` para validar rangos y formatos
- `UNIQUE` para prevenir duplicados
- `DEFAULT` para valores seguros

**Agregaciones en la DB, no en JS.** Si necesitas `GROUP BY`, `SUM`, o `COUNT`, hacerlo en SQL. Traer 10,000 filas al frontend para filtrar en JS es un antipatrón de escalabilidad:

```js
// MAL — trae todos los registros al frontend para agrupar
const { data } = await supabase.from("clientes").select("*");
const grouped = data.reduce((acc, c) => { /* agrupa en JS */ }, {});

// BIEN — la DB hace el trabajo pesado
const { data } = await supabase.rpc("fn_clientes_agrupados");
```

**Migraciones versionadas.** Cada cambio de schema = archivo de migración con nombre descriptivo. Nunca ALTER TABLE directamente en producción sin registro.

---

## 6. Patrones Frontend (React)

### Estado

**Estado donde corresponde:**
- `useState` → UI local (modales, tabs, paginación, form inputs)
- Context → estado compartido entre componentes hermanos o cercanos
- URL (search params) → filtros, paginación, tabs que deben ser compartibles/bookmarkable
- Server → datos que vienen del backend (la fuente de verdad está en la DB)

**Custom hooks para lógica de negocio.** Si un `useEffect` crece más allá de lo trivial, extraerlo a un hook con nombre descriptivo.

**Keys estables.** Usar `item.id` o identificadores naturales. Nunca `index` en listas que se reordenan, filtran o mutan.

### Async en React

**Cleanup en useEffect** — cualquier efecto que haga I/O necesita cancelación:

```js
useEffect(() => {
  const controller = new AbortController();
  fetchData(id, { signal: controller.signal })
    .then(setData)
    .catch(err => { if (!controller.signal.aborted) setError(err); });
  return () => controller.abort();
}, [id]);
```

**Stale closures** — cuidado con callbacks async que capturan estado que puede cambiar:
```js
// PELIGROSO — activeSession puede cambiar mientras await ejecuta
const save = useCallback(async () => {
  await saveMessage(activeSession.id, text); // activeSession podría ser stale
}, [activeSession, text]);

// SEGURO — capturar el valor al momento de la llamada
const save = useCallback(async () => {
  const sessionId = activeSessionRef.current.id;
  await saveMessage(sessionId, text);
}, [text]);
```

### Performance

**Memoización con criterio.** `useMemo`/`useCallback` solo cuando hay un beneficio medible:
- Computaciones costosas sobre arrays grandes
- Referencias estables para `useEffect` dependencies
- Props a componentes memoizados con `React.memo`

No memoizar por defecto — tiene costo de memoria y complejidad.

**Paginación:** >100 items → paginar. >1000 → virtualizar.

**Code splitting** con `React.lazy` para rutas pesadas que no se cargan siempre.

**`React.memo`** solo en componentes que se re-renderizan frecuentemente con las mismas props. No envolver todo.

---

## 7. Patrones Async Generales

**Promise.allSettled** cuando necesitas que todos los calls terminen (aunque algunos fallen):

```js
const results = await Promise.allSettled([fetchA(), fetchB(), fetchC()]);
const succeeded = results.filter(r => r.status === "fulfilled").map(r => r.value);
const failed = results.filter(r => r.status === "rejected");
```

**Retry con backoff exponencial** para operaciones de red idempotentes:

```js
async function withRetry(fn, { maxRetries = 3, baseDelay = 1000 } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await fn(); }
    catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise(r => setTimeout(r, baseDelay * 2 ** attempt));
    }
  }
}
```

**Debounce** en inputs que disparan queries (300-500ms).

**Timeouts explícitos** para operaciones de red. No confiar en defaults del browser:

```js
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30_000);
try {
  const response = await fetch(url, { signal: controller.signal });
  return await response.json();
} finally {
  clearTimeout(timeoutId);
}
```

---

## 8. Observabilidad

Un senior sabe que el código en producción necesita ser debuggeable sin acceso al browser del usuario.

**Logging estructurado.** Prefijo con nombre del módulo para encontrar errores en logs:

```js
console.error("[messagingService] Error enviando WhatsApp:", { phone, error: err.message });
```

**DEV vs PROD logging.** Información detallada en dev, solo errores en prod:

```js
if (import.meta.env.DEV) {
  console.log("[hook] State update:", { prev, next, trigger });
}
// console.error siempre activo, pero sin datos sensibles
console.error("[service] Request failed:", { endpoint, status: res.status });
```

**No logear datos sensibles.** Nunca tokens, passwords, datos personales completos, ni números de tarjeta en logs.

**Errores accionables.** Cuando algo falla en producción, el log debe responder: ¿qué operación? ¿con qué input (no sensible)? ¿qué error? Sin eso, debuggear es adivinar.

---

## 9. Base de Datos

**Índices** para columnas usadas frecuentemente en WHERE, JOIN y ORDER BY.

**Soft delete** para datos de negocio con valor histórico (clientes, facturas, vendedores):
```sql
ALTER TABLE clientes ADD COLUMN deleted_at TIMESTAMPTZ;
```

**Hard delete** para datos operacionales de alto volumen sin valor histórico: logs temporales, sesiones expiradas, colas de procesamiento.

**Nombres consistentes:** prefijo por módulo, `snake_case`, un idioma. Mezclar inglés y español en nombres de columnas dificulta la búsqueda.

**Queries eficientes** — seleccionar columnas específicas, filtros, límites:
```js
const { data } = await supabase
  .from("items")
  .select("nit, nombre, saldo, dias_mora")  // No select("*") si no necesitas todo
  .eq("carga_id", cargaId)
  .order("dias_mora", { ascending: false })
  .limit(100);
```

---

## 10. CSS y Accesibilidad

**Mobile-first** con Tailwind: estilos base para móvil, breakpoints para desktop.

**Accesibilidad no es opcional.** Nivel mínimo:
- `<label>` asociado a cada input (o `aria-label` si no hay label visual)
- `alt` descriptivo en imágenes informativas (vacío en decorativas)
- Contraste 4.5:1 en texto
- Navegación por teclado funcional (focus visible, tab order lógico)
- `aria-label` en botones que solo tienen icono
- Roles semánticos en componentes custom (tabs, modales, menús)

**Clases Tailwind con mesura.** Si una cadena de utility classes se repite en 3+ lugares, extraer a componente.

---

## 11. Testing

**Testear lo que duele si se rompe.** Priorizar:
1. Lógica de negocio pura (cálculos financieros, transformaciones de datos, validaciones)
2. Edge cases de funciones críticas (null, array vacío, datos malformados)
3. Integraciones complejas (parsing de formatos externos como Excel)

**No testear lo trivial.** Componentes que solo renderizan props, wrappers de servicios, constantes.

**Nombres que documentan comportamiento:**
```js
test("retorna comisión 0 cuando ventas no alcanzan el mínimo", () => { ... });
test("normaliza teléfono colombiano con prefijo 57 a 12 dígitos", () => { ... });
test("excluye productos de marcas en la lista de exclusión", () => { ... });
```

**Regla de oro:** si cambiar una línea puede romper un cálculo financiero o transformación de datos sin que nadie se dé cuenta → necesita test.

---

## 12. Control de Versiones

**Commits atómicos.** Cada commit compila y representa una unidad lógica coherente.

**Mensajes con formato consistente:**
```
tipo(scope): descripción concisa en imperativo

fix(comisiones): corregir cálculo de margen cuando precio es cero
feat(mensajes): agregar retry automático en envío fallido
refactor(hooks): extraer lógica de polling a usePolling
```

**Nunca committear secretos.** `.env` en `.gitignore`. Si se commitea por error → rotar inmediatamente, no solo borrar el archivo.

---

## 13. JSDoc para JavaScript

En proyectos JS puro, documentar tipos con JSDoc en interfaces públicas:

```js
/**
 * Calcula comisiones por vendedor para una carga específica.
 * @param {string} cargaId - UUID de la carga
 * @returns {Promise<{ data: ComisionVendedor[]|null, error: Error|null }>}
 */
export async function getComisionesByCarga(cargaId) { ... }
```

**Cuándo:** funciones exportadas de servicios/utils, hooks custom (params + return), props de componentes complejos (>5 props).

**Cuándo NO:** funciones internas triviales, handlers de UI obvios, constantes autodescriptivas.

---

## 14. Cuándo Romper Estas Guías

Un senior sabe cuándo la pragmaticidad gana:

- **Prototipos/spikes:** código exploratorio puede ignorar estructura. Marcarlo y refactorizar antes de merge.
- **Hotfixes críticos:** un parche a las 2am puede ser feo. Crear ticket para limpiar después.
- **Código con fecha de expiración:** si se va a reemplazar en 2 semanas, no invertir horas puliéndolo.
- **Performance crítico:** si un benchmark demuestra que la solución "limpia" es 10x más lenta en un hot path, la optimización justificada gana.
- **Único uso real:** no crear abstracción para algo que se usa una vez. Esperar al segundo uso.

La clave: **desviarse con intención, no por pereza.** Un comentario breve explicando la decisión.

---

## Checklist Rápido Pre-Entrega

No es binario — es un sanity check mental:

- ¿Otro dev puede entender este cambio sin que yo le explique?
- ¿Los errores dan información útil? (no solo "Error" o catch vacío)
- ¿Hay secretos expuestos en el cliente?
- ¿Inputs del usuario están validados/sanitizados?
- ¿Efectos secundarios tienen cleanup? (listeners, timers, fetch)
- ¿Operaciones de escritura son atómicas? (no dejan datos a medias si fallan)
- ¿El código sigue los patrones existentes del proyecto?
- ¿Sin código muerto, imports no usados, ni console.logs de debug?
- ¿JSDoc en funciones públicas de negocio?
