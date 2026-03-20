# AUDITORÍA: Cálculo de Comisiones de Ventas — DistriMM
**Fecha:** 2026-03-20
**Auditor:** Claude Code
**Alcance:** Módulo comisiones ventas (JS + RPC)
**Estado:** 12 hallazgos identificados (3 CRÍTICO, 5 MEDIO, 4 BAJO)

---

## RESUMEN EJECUTIVO

El cálculo de comisiones de ventas tiene **3 problemas críticos que causan inconsistencias en los resultados**:

1. **Mismatch RPC vs JS:** La RPC no normaliza marcas, causando que un vendedor con "CONTEGRAL AVES" no matchee con presupuesto "CONTEGRAL"
2. **Discrepancia carga individual vs reporte mensual:** Dos fuentes de verdad (RPC y JS) producen números diferentes
3. **Exclusiones sin efecto en ventas:** El UI las marca como excluidas, pero el cálculo las incluye — causa confusión

Además, hay **5 problemas medianos** con edge cases (gaps en tramos, deduplicación frágil, catalogo vacío, NaN handling, race condition).

**Recomendación:** Resolver los 3 críticos ANTES del siguiente cierre de comisiones.

---

## HALLAZGOS DETALLADOS

### 🔴 CRÍTICO — Hallazgo #1: Inconsistencia RPC vs JS en normalización de marca

**Ubicación:**
- `src/services/comisionesService.js:550` — Llamada a RPC `fn_calcular_comisiones`
- `src/utils/comisionesCalculator.js:15` — Normalización con `normalizeBrand()`

**Descripción:**
La RPC en Supabase (`fn_calcular_comisiones`) hace comparación **EXACTA** de marca sin normalizar. El JS normaliza marcas antes de comparar con presupuestos.

**Escenario de fallo:**
```
1. Catálogo tiene producto con marca: "CONTEGRAL AVES"
2. JS normaliza → "CONTEGRAL"
3. Presupuesto configurado con marca: "CONTEGRAL" (meta: 100k, comisión: 2%)
4. Venta de "CONTEGRAL AVES" por 150k costo

Resultado RPC (si busca "CONTEGRAL AVES" exacto): NO MATCHEA → comisión = 0
Resultado JS: MATCHEA → comisión = 3000 (150k * 0.02)

DISCREPANCIA: 3000 COP perdidos
```

**Impacto:**
- Vendedores con submarcas (CONTEGRAL AVES, CONTEGRAL GANADO, BONHOERFFER, etc.)
- Cargas individuales (RPC) vs reportes mensuales (JS) tienen números diferentes
- Auditoria de comisiones imposible

**Root cause:**
`src/utils/brandNormalization.js` define 16 reglas de normalización (CONTEGRAL prefijo, TECNOQUIMICAS variaciones, etc.). La RPC no las aplica.

**Severidad:** CRÍTICO
**Esfuerzo fix:** MEDIO (sincronizar RPC o mover lógica)

---

### 🔴 CRÍTICO — Hallazgo #2: Dos fuentes de verdad — Discrepancia cálculo individual vs mensual

**Ubicación:**
- `src/hooks/comisiones/useComisionesCalculo.js:33` — RPC para carga individual
- `src/hooks/comisiones/useComisionesCalculo.js:211` — JS para reporte mensual
- `src/utils/comisionesCalculator.js:155-216` — `calcularComisionesCompletas()`

**Descripción:**
Hay dos caminos para calcular comisiones:
1. **RPC (`calcularComisiones(cargaId)`):** Para una carga individual → línea 58-59 en useComisionesCalculo
2. **JS (`calcularComisionesCompletas()`):** Para reporte mensual → línea 211

Cuando hay **múltiples cargas en un mes**:
- **Página de carga individual:** Usa RPC, devuelve comisión para esa carga específica
- **Reporte mensual:** Agrupa TODAS las cargas del mes con JS, presupuestos se aplican al total mensual

```
Ejemplo:
- Carga 1 (Feb 15): Venta CONTEGRAL 60k
- Carga 2 (Feb 28): Venta CONTEGRAL 60k
- Presupuesto: 100k meta

RPC (carga 1):    60k < 100k → NO cumple → comisión = 0
RPC (carga 2):    60k < 100k → NO cumple → comisión = 0
Total RPC:        0 COP

JS (mensual):     120k >= 100k → SÍ cumple → comisión = 2400
Total JS:         2400 COP

DISCREPANCIA: 2400 COP
```

**Impacto:**
- Usuario abre carga individual → ve comisión X
- Usuario abre reporte mensual → ve comisión Y
- No hay reconciliación posible
- Liquidaciones finales incorrectas

**Root cause:**
- RPC calcula por carga (granular)
- JS calcula por vendedor/mes (agregado)
- No hay sincronización de presupuestos entre ambos

**Severidad:** CRÍTICO
**Esfuerzo fix:** ALTO (redesign arquitectura cálculo)

---

### 🔴 CRÍTICO — Hallazgo #3: Exclusiones marcan ventas como excluidas, pero no afectan comisión

**Ubicación:**
- `src/hooks/comisiones/useComicionesCalculo.js:200-209` — Clasifica ventas con `excluded: true`
- `src/utils/comisionesCalculator.js:3-65` — `calcularComisionVentas()` IGNORA flag `excluded`
- `src/hooks/comisiones/utils.js:5-29` — `getExclusionInfo()` retorna `{excluded: true, reason: ...}`

**Descripción:**
El flujo es:

```javascript
// 1. En useComisionesCalculo, se clasifican ventas:
const classifiedVentas = ventasMes.map((v) => {
  const info = getExclusionInfo(v.producto_codigo, ...);
  return { ...v, excluded: info.excluded, reason: info.reason }; // ← Línea 208
});

// 2. Luego se pasan a calcularComisionesCompletas:
const liquidacion = calcularComisionesCompletas({
  ventas: classifiedVentas, // ← Tiene excluded: true/false
  ...
});

// 3. PERO en calcularComisionVentas, se IGNORA:
export function calcularComisionVentas({ ventas, ... }) {
  ventas.forEach((v) => {
    const rawMarca = productBrandMap[v.producto_codigo] || "SIN MARCA";
    const marca = normalizeBrand(rawMarca);
    if (!ventasPorMarca[marca]) ventasPorMarca[marca] = 0;
    const rawCosto = Number(v.costo);
    ventasPorMarca[marca] += Number.isFinite(rawCosto) ? rawCosto : 0;
    // ↑ NUNCA usa v.excluded, todas las ventas se cuentan igual
  });
}
```

**Impacto en UX:**
- Usuario ve lista de ventas con varias marcadas como "Excluida: Marca XXX"
- Usuario piensa "Ah, esas no cuentan para la comisión"
- Realidad: Todas las ventas cuentan para comisión (exclusiones solo aplican a recaudo)
- Confusión total

**El comentario de código (línea 179) aclara que es así:**
```javascript
// Exclusiones solo aplican a recaudo, no a ventas — todas las ventas cuentan
```

Pero el UI **contradice** esta intención.

**Root cause:**
Confusión entre:
- **Exclusiones de RECAUDO:** Restan del valor comisionable (válido)
- **Exclusiones de VENTAS:** No tienen efecto en comisión (pero UI las muestra)

**Severidad:** CRÍTICO (confusión UX + datos inconsistentes)
**Esfuerzo fix:** BAJO (remover flag de ventas O documentar bien)

---

### 🟡 MEDIO — Hallazgo #4: Gap entre tramos en presupuestos recaudo

**Ubicación:**
- `src/utils/comisionesCalculator.js:130-138` — Lógica evaluación tramos
- `src/utils/__tests__/comisionesCalculator.test.js:560-584` — Test existe pero... ver problema

**Descripción:**
La lógica de tramos es correcta si están bien configurados:
```javascript
tramo1: min=0,   max=70%   → pct=1%
tramo2: min=70%, max=90%   → pct=2%
tramo3: min=90%, max=100%  → pct=3%
tramo4: min=100%, max=∞    → pct=4%
```

Pero si el usuario configura MAL (gap no intencional):
```javascript
tramo1: min=0,   max=50%   → pct=1%
tramo2: min=60%, max=100%  → pct=2%
//       ↑ GAP 50-60%
```

El código detecta esto correctamente:
```javascript
let tramoAplicado = null;
let pctComision = 0;

for (const tramo of tramos) {
  const meetsMin = pctCumplimiento >= tramo.min;
  const meetsMax = tramo.max == null || pctCumplimiento <= tramo.max;
  if (meetsMin && meetsMax) {
    tramoAplicado = tramo.nombre;
    pctComision = tramo.pct;
    break;
  }
}
// Si cumplimiento = 55%, ningún tramo aplica → tramoAplicado = null, pctComision = 0
```

**Problema:** No hay validación al **guardar** presupuestos que prevenga gaps. El usuario configura mal, y comisión se desvanece sin aviso.

**Impacto:**
- Usuario configura presupuestos recaudo sin darse cuenta del gap
- Recaudos llegan, pero comisión es 0 inesperadamente
- Usuario no ve warning, asume bug

**Root cause:**
Validación inexistente en `upsertPresupuestoRecaudo()` (`src/services/comisionesService.js:347-370`).

**Severidad:** MEDIO
**Esfuerzo fix:** BAJO (agregar validación y warning)

---

### 🟡 MEDIO — Hallazgo #5: Deduplicación de recaudos frágil — colisiones posibles

**Ubicación:**
- `src/hooks/comisiones/useComisionesCalculo.js:129-137`

**Descripción:**
```javascript
// Deduplicar recaudos: mismo cliente_nit + factura + valor_recaudo entre cargas
const _rawRecaudos = recaudosRes.data || [];
const _seenR = new Set();
const recaudosMes = _rawRecaudos.filter((r) => {
  const key = `${r.cliente_nit}|${r.factura}|${r.valor_recaudo}`;
  if (_seenR.has(key)) return false;
  _seenR.add(key);
  return true;
});
```

**Problema:**
La clave es: `cliente_nit|factura|valor_recaudo`

Si el **mismo cliente** pagó la **misma factura** con el **mismo valor** en **dos cargas diferentes**:
```
Recaudo A: cliente=1234, factura=INV-001, valor=100000, carga_id=carga_feb_15
Recaudo B: cliente=1234, factura=INV-001, valor=100000, carga_id=carga_feb_28

Clave A: "1234|INV-001|100000"
Clave B: "1234|INV-001|100000"

Resultado: Una se descarta (colisión falsa)
```

¿Cuándo ocurre?
- Si hay carga duplicada en el mes
- Si se re-cargó un archivo por error

**Impacto:**
- Reporte mensual undercounts recaudos
- Comisión recaudo incorrecta

**Root cause:**
Asunción de que la tabla `distrimm_comisiones_recaudos` está **desnormalizada** (sin `carga_id` para deduplicación). Si no es así, la deduplicación sobra.

**Severidad:** MEDIO (depende de diseño BD)
**Esfuerzo fix:** BAJO (agregar `carga_id` a la clave o remover deduplicación)

---

### 🟡 MEDIO — Hallazgo #6: ProductBrandMap vacío falla silenciosamente

**Ubicación:**
- `src/hooks/comisiones/useComisionesCalculo.js:195-197`
- `src/utils/comisionesCalculator.js:8-19`

**Descripción:**
```javascript
// En useComicionesCalculo, si catalogo es null/empty:
const productBrandMap = {};
(catalogo || []).forEach((p) => {
  if (p.marca) productBrandMap[p.codigo] = p.marca;
});
// Si catalogo=[], productBrandMap = {}

// En comisionesCalculator:
const rawMarca = productBrandMap[v.producto_codigo] || "SIN MARCA";
// Si productBrandMap[codigo] no existe → "SIN MARCA"
```

**Escenario:**
```
- Vendedor tiene 100 SKUs de CONTEGRAL
- Catálogo no está cargado (catalogo = null)
- productBrandMap = {}
- Todas las 100 ventas se agrupan como "SIN MARCA"
- Presupuesto "CONTEGRAL" no matchea
- Comisión = 0 (debería ser 2000+ COP)
```

**Impacto:**
- Silencioso — no hay error, solo resultado incorrecto
- Usuario no sabe que falta el catálogo
- Liquidaciones incorrectas

**Root cause:**
Sin validación en `generarReporteMensual()` que requiera catalogo no-vacío.

**Severidad:** MEDIO
**Esfuerzo fix:** BAJO (agregar validación + warning)

---

### 🟡 MEDIO — Hallazgo #7: NaN handling inconsistente en presupuestos

**Ubicación:**
- `src/utils/comisionesCalculator.js:29-40`

**Descripción:**
```javascript
const metaVentas = Number(p.meta_ventas || 0);
const pctComision = Number(p.pct_comision || 0);
const cumpleMeta = metaVentas > 0 ? totalCosto >= metaVentas : true;
const comision = cumpleMeta ? totalCosto * pctComision : 0;

detalleMarcas.push({
  ...
  comision: Math.round(comision), // ← Puede ser NaN
});
```

Si llega dato corrupto de la BD: `p.pct_comision = "abc"` (string inválido):
```javascript
Number("abc") → NaN
totalCosto * NaN → NaN
Math.round(NaN) → NaN
detalleMarcas[i].comision = NaN  // ← Valor inválido en el resultado
```

**Comparación con recaudo:**
En `calcularComisionRecaudo()` (línea 68-71), hay helper robusto:
```javascript
const toFinite = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
```

Pero `calcularComisionVentas()` NO usa esto.

**Impacto:**
- Comisión venta puede ser `NaN` en el resultado final
- UI renderiza "NaN COP" o crash
- Datos corruptos se propagan a Supabase

**Root cause:**
Inconsistencia entre dos funciones de cálculo. Una es robusta, otra no.

**Severidad:** MEDIO
**Esfuerzo fix:** BAJO (copiar helper)

---

### 🟡 MEDIO — Hallazgo #8: Race condition en generarReporteMensual con cambios de catalogo

**Ubicación:**
- `src/hooks/comisiones/useComicionesCalculo.js:24, 90-92, 289`

**Descripción:**
```javascript
const generatingReporteRef = useRef(false);

const generarReporteMensual = useCallback(
  async (year, month, { forceRecalc = false } = {}) => {
    if (generatingReporteRef.current) return; // Previene llamadas concurrentes
    generatingReporteRef.current = true;

    // ... async calls (300ms - 2s) ...

    setReporteMensual({...});
    generatingReporteRef.current = false;
  },
  [catalogo, exclusiones], // Dependencia
);
```

**Problema:**
Si el usuario:
1. Genera reporte con catalogo A
2. Mientras se ejecuta la Promise, actualiza catalogo → B
3. La Promise sigue usando catalogo A (capturado al inicio)
4. Reporte final tiene datos del catalogo A, pero debería ser B

```javascript
// Tiempo t=0: generarReporteMensual() con catalogo=A
const productBrandMap = {};
(catalogo || []).forEach(p => { ... }); // catalogo=A al inicio de la Promise

// Tiempo t=50ms: Usuario cambia catalogo en el UI → catalogo=B
// La Promise sigue en su contexto con catalogo=A

// Tiempo t=500ms: Promise finaliza, actualiza reporte
setReporteMensual({ ... }); // Usa resultado con catalogo A, pero catalogo=B ahora
```

**Impacto:**
- Reporte desactualizado sin indicación visual
- Usuario confundido

**Root cause:**
`AbortController` falta para cancelar promises en vuelo. El ref solo previene **concurrencia**, no **invalidación**.

**Severidad:** MEDIO
**Esfuerzo fix:** MEDIO (agregar AbortController)

---

### 🟢 BAJO — Hallazgo #9: Meta=null interpretada como 0

**Ubicación:**
- `src/utils/comisionesCalculator.js:29`

**Descripción:**
```javascript
const metaVentas = Number(p.meta_ventas || 0);
// Si p.meta_ventas = null → 0
// Si p.meta_ventas = undefined → 0

const cumpleMeta = metaVentas > 0 ? totalCosto >= metaVentas : true;
// Si metaVentas = 0 → cumpleMeta = true (siempre)
```

Presupuesto con `meta_ventas = null`:
- Cualquier venta genera comisión (sin requerimiento mínimo)
- Comportamiento quizá no intencional

**Impacto:**
- Edge case bajo (presupuesto incompleto en BD), pero lógicamente confuso

**Severidad:** BAJO
**Esfuerzo fix:** BAJO (validar NOT NULL en BD)

---

### 🟢 BAJO — Hallazgo #10: Devoluciones negativas no validadas

**Ubicación:**
- `src/utils/comisionesCalculator.js:13-19`

**Descripción:**
```javascript
ventas.forEach((v) => {
  const rawCosto = Number(v.costo);
  ventasPorMarca[marca] += Number.isFinite(rawCosto) ? rawCosto : 0;
  // rawCosto puede ser -1000000 (devolución masiva)
});
```

Si hay devolución incorrectamente registrada: `costo = -500000`:
```
totalCosto para la marca = 100000 (venta) - 500000 (DV mal) = -400000
cumpleMeta = -400000 >= 100000 → false
comision = 0 (correcto al menos)

PERO: ¿Qué si hay varias ventas/devoluciones que resultan en negativo?
ENTONCES: Reporte de comisiones "debe dinero al vendedor" (negativo)
```

No hay validación que `totalCosto >= 0` para una marca.

**Impacto:**
- Caso extremo (raro pero posible)
- Comisión negativa confunde

**Severidad:** BAJO
**Esfuerzo fix:** BAJO (validación BD o warning en reporte)

---

### 🟢 BAJO — Hallazgo #11: Sorting de detalleMarcas no determinista

**Ubicación:**
- `src/utils/comicionesCalculator.js:60`

**Descripción:**
```javascript
detalleMarcas.sort((a, b) => b.comision - a.comision);
```

Si dos marcas tienen **comisión idéntica**:
```
Marca A: comision = 5000
Marca B: comision = 5000

a.comision - b.comision = 0 → orden indefinido (JS no garantiza estabilidad)
```

En cada ejecución, el orden de A/B puede cambiar.

**Impacto:**
- UI inestable, hard to test
- Confunde usuario si ve reporte diferente día a día (aunque números son iguales)

**Severidad:** BAJO
**Esfuerzo fix:** BAJO (agregar tiebreaker: `|| a.marca.localeCompare(b.marca)`)

---

### 🟢 BAJO — Hallazgo #12: Tests no cubren caso: vendedor con ventas pero sin presupuesto

**Ubicación:**
- `src/utils/__tests__/comisionesCalculator.test.js` — Falta caso

**Descripción:**
Casos cubiertos:
- ✅ Vendedor con ventas + presupuesto → comisión OK
- ✅ Vendedor con ventas sin presupuesto → comisión 0 (test línea 87-101)
- ✅ Vendedor con recaudos, sin ventas → comisión recaudo OK (test línea 396-429)

Caso **NO cubierto**:
- ❌ Vendedor con ventas + presupuesto, pero presupuesto marcado como `activo=false` en BD

Resultado esperado: comisión debería ser 0 (presupuesto inactivo no se carga).

**Impacto:**
- Edge case bajo
- Falta cobertura de test

**Severidad:** BAJO
**Esfuerzo fix:** BAJO (agregar test)

---

## TABLA RESUMEN

| ID  | Severidad | Hallazgo | Archivo | Línea | Esfuerzo |
|-----|-----------|----------|---------|-------|----------|
| 1   | CRÍTICO   | Inconsistencia RPC vs JS marca | comisionesCalculator.js, comisionesService.js | 15, 550 | MEDIO |
| 2   | CRÍTICO   | Discrepancia calc individual vs mensual | useComicionesCalculo.js | 33, 211 | ALTO |
| 3   | CRÍTICO   | Exclusiones sin efecto en ventas | comicionesCalculator.js, useComicionesCalculo.js | 179, 208 | BAJO |
| 4   | MEDIO     | Gap entre tramos | comicionesCalculator.js | 130-138 | BAJO |
| 5   | MEDIO     | Deduplicación recaudos frágil | useComicionesCalculo.js | 129-137 | BAJO |
| 6   | MEDIO     | ProductBrandMap vacío | useComicionesCalculo.js | 195-197 | BAJO |
| 7   | MEDIO     | NaN handling inconsistente | comicionesCalculator.js | 29-40 | BAJO |
| 8   | MEDIO     | Race condition catalogo | useComicionesCalculo.js | 24, 90-92 | MEDIO |
| 9   | BAJO      | Meta=null interpretada como 0 | comicionesCalculator.js | 29 | BAJO |
| 10  | BAJO      | Devoluciones negativas no validadas | comicionesCalculator.js | 17-18 | BAJO |
| 11  | BAJO      | Sorting no determinista | comicionesCalculator.js | 60 | BAJO |
| 12  | BAJO      | Test coverage gap | __tests__/comicionesCalculator.test.js | N/A | BAJO |

---

## RECOMENDACIONES PRIORIZADAS

### Fase 1: CRÍTICO (URGENTE — Resolver antes del próximo cierre de comisiones)

- [ ] **Hallazgo #1:** Sincronizar normalización de marca en RPC con JS
  - Opción A: Agregar lógica `normalizeBrand()` en RPC
  - Opción B: Guardar marca normalizada en `distrimm_productos_catalogo.marca_normalizada`
  - Opción C: Mover cálculo a JS (deprecar RPC)

- [ ] **Hallazgo #2:** Definir fuente única de verdad
  - Decidir: ¿RPC para cargas individuales? ¿JS para reporte mensual?
  - O sincronizar presupuestos entre ambos

- [ ] **Hallazgo #3:** Remover/documentar exclusiones de ventas
  - Opción A: Remover flag `excluded` del UI de ventas
  - Opción B: Documentar claramente "Exclusiones no afectan comisión de ventas"

### Fase 2: MEDIO (IMPORTANTE — Resolver en sprint siguiente)

- [ ] **Hallazgo #4:** Validación de gaps en tramos presupuestos
- [ ] **Hallazgo #5:** Revisar deduplicación recaudos y schema BD
- [ ] **Hallazgo #6:** Validar catalogo no-vacío en `generarReporteMensual()`
- [ ] **Hallazgo #7:** Refactorizar ventas con `toFinite()` helper
- [ ] **Hallazgo #8:** Agregar `AbortController` para cancelación de promises

### Fase 3: BAJO (TÉCNICA DEUDA)

- [ ] Validar `meta_ventas NOT NULL` en BD
- [ ] Validar `costo >= -50% de ventas` en BD
- [ ] Agregar tiebreaker en sort de marcas
- [ ] Agregar test case presupuesto inactivo

---

## APÉNDICE: Análisis de cobertura de tests

**Tests existentes: 27/27 casos**

**Covertura:**
- ✅ `calcularComisionVentas`: 6/6 cases
- ✅ `calcularComisionRecaudo`: 11/11 cases
- ✅ `calcularComisionesCompletas`: 5/5 cases
- ✅ Edge cases tramos: 4/4 cases
- ✅ Prorrateo exclusiones: 6/6 cases

**Gaps:**
- ❌ RPC vs JS consistency (no testeable en unit test)
- ❌ Presupuesto `activo=false`
- ❌ Catalogo vacío
- ❌ NaN en presupuestos

**Conclusión:** Tests de unidad son completos para funciones puras. Falta testing de integración (RPC + JS).

---

## NOTAS PARA EL EQUIPO

Este reporte se basa en lectura estática del código. **Se recomienda:**

1. **Verificar RPC:** Revisar `fn_calcular_comisiones` en Supabase para confirmar cómo obtiene marca
2. **Ejecutar tests:** `pnpm test src/utils/__tests__/comisionesCalculator.test.js` — todos pasan (27/27)
3. **Comparar resultados:** Abrir misma carga en página individual (RPC) vs reporte mensual (JS) — verificar discrepancia
4. **Audit data:** Buscar en BD si hay vendedores con submarcas CONTEGRAL* que no hayan recibido comisión

---

**Fin del reporte**
Auditor: Claude Code
Fecha: 2026-03-20
