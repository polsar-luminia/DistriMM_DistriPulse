# Auditoría: Cálculo de Comisiones de Recaudo

**Fecha:** 2026-03-20
**Estado:** Completado
**Responsable:** auditor-recaudo

---

## Resumen Ejecutivo

Se identificaron **6 hallazgos** en el módulo de cálculo de comisiones de recaudo, siendo **4 CRÍTICOS** y **2 MEDIOS**. Los hallazgos críticos afectan el cálculo de comisiones, validación de tramos, exclusión de marca y lógica de aplicabilidad. Se requieren correcciones inmediatas.

| Severidad | Hallazgos | Archivos |
|-----------|-----------|----------|
| **CRÍTICO** | 4 | calculus (2), presupuestos UI (1), upload (1) |
| **MEDIO** | 2 | calculator (1), upload (1) |

---

## Hallazgo #1 — Deduplicación de Recaudos Inconsistente [CRÍTICO]

**Severidad:** CRÍTICO — Distorsiona cálculo de liquidación
**Archivos:**
- `src/hooks/comisiones/useComisionesRecaudos.js:145` (fetchRecaudosPeriodo)
- `src/hooks/comisiones/useComicionesCalculo.js:134` (generarReporteMensual)

**Descripción:**

La deduplicación de recaudos produce resultados diferentes según el contexto:

1. **Contexto 1** (vista de período):
```js
// useComisionesRecaudos.js:145
const key = `${r.cliente_nit}|${r.factura}|${r.valor_recaudo}`;
```
Deduplica **sin incluir carga_id**. Si la misma factura se carga en febrero y se reprocesa en marzo, la segunda carga se filtra.

2. **Contexto 2** (snapshot mensual):
```js
// useComisionesCalculo.js:134
const key = `${r.carga_id}|${r.cliente_nit}|${r.factura}|${r.valor_recaudo}`;
```
Deduplica **incluyendo carga_id**. Mismo recaudo en 2 cargas se cuenta 2 veces.

**Escenario de Riesgo:**

1. Cliente ABC paga factura 12345 por $500.000 → carga el 28/02 (febrero)
2. Usuario actualiza archivo y lo carga el 05/03 (marzo)
3. En **RecaudoTab** (período marzo): Recaudo aparece una sola vez (correctamente deduplicado)
4. En **snapshot de marzo**: Recaudo se cuenta **DOS VECES** (comisión incorrecta)
5. Discrepancia entre "Recaudos Detectados" en UI y liquidación congelada en snapshot

**Causa Raíz:**

Dos lógicas de deduplicación implementadas para dos casos de uso:
- **useComisionesRecaudos**: Necesita deduplicar entre cargas (contexto: período completo)
- **useComicionesCalculo**: Requiere mantener ambos si vienen de cargas distintas (contexto: calcular comisión x carga_id)

**Recomendación:**

Decidir semántica:
- **Opción A**: "Un recaudo es único por (cliente_nit, factura, valor_recaudo)" → usar key sin carga_id en ambos
- **Opción B**: "Un recaudo es único por (carga_id, cliente_nit, factura, valor_recaudo)" → permitir múltiples de misma factura en cargas distintas

Implementación propuesta (Opción A = más conservadora):
```js
// Cambiar useComicionesCalculo.js:134
const key = `${r.cliente_nit}|${r.factura}|${r.valor_recaudo}`;
// Esto asegura que el snapshot y el período ven el mismo dato
```

---

## Hallazgo #2 — Validación de Continuidad de Tramos Ausente [CRÍTICO]

**Severidad:** CRÍTICO — Pérdida silenciosa de comisiones
**Archivos:**
- `src/components/comisiones/PresupuestosTab.jsx:25-54` (template EMPTY_RECAUDO)
- `src/utils/comisionesCalculator.js:101-138` (calcularComisionRecaudo)

**Descripción:**

El sistema permite crear presupuestos con tramos que no son continuos. Si el cumplimiento % cae en un "gap" entre tramos, la comisión es 0, sin aviso.

**Ejemplo de Misconfiguration:**

```
Tramo 1: 0% — 50%    → 1%
Tramo 2: 60% — 100%  → 2%
[GAP en 50-60%]

Vendedor obtiene 55% cumplimiento → comisión = 0 (no aplica ningún tramo)
```

**Test que Demuestra:**
```js
// comisionesCalculator.test.js:560-584
test("cumplimiento en gap entre tramos retorna comisión 0", () => {
  // Tramo 1: 0-50%, Tramo 2: 60-100%
  // cumplimiento = 55% → cae en gap
  // Resultado: comisionRecaudo = 0
});
```

**Causa Raíz:**

1. **Template sin restricciones** (PresupuestosTab.jsx:45-54):
   - `EMPTY_RECAUDO` permite crear cualquier configuración
   - No hay validación al guardar (`upsertPresupuestoRecaudo`)
   - Usuario puede guardar "accidentalmente"

2. **Lógica de búsqueda de tramo** (comisionesCalculator.js:130-138):
```js
for (const tramo of tramos) {
  const meetsMin = pctCumplimiento >= tramo.min;
  const meetsMax = tramo.max == null || pctCumplimiento <= tramo.max;
  if (meetsMin && meetsMax) {
    tramoAplicado = tramo.nombre;
    pctComision = tramo.pct;
    break;  // Toma el PRIMERO que cumpla (iterando de mayor a menor)
  }
}
// Si no encuentra ninguno → tramoAplicado = null, pctComision = 0
```

**Impacto:**

- Vendedor con 55% cumplimiento pierde comisión esperada
- No hay alerta visual en PresupuestosTab
- Snapshot congela la comisión 0 sin advertencia
- Descubierto solo en auditoría de ingresos posterior

**Recomendación — Fase 1 (Inmediata):**

Agregar validación en `upsertPresupuestoRecaudo` (comisionesService.js):
```js
export async function upsertPresupuestoRecaudo(row) {
  // Validar continuidad de tramos
  const tramos = [
    { min: 0, max: row.tramo1_max, pct: row.tramo1_pct },
    { min: row.tramo2_min, max: row.tramo2_max, pct: row.tramo2_pct },
    { min: row.tramo3_min, max: row.tramo3_max, pct: row.tramo3_pct },
    { min: row.tramo4_min, max: null, pct: row.tramo4_pct }, // sin límite superior
  ].filter(t => t.pct > 0); // solo tramos configurados

  // Verificar: max de uno = min de siguiente (o similar)
  for (let i = 0; i < tramos.length - 1; i++) {
    if (tramos[i].max != null && tramos[i + 1].min != null) {
      if (tramos[i].max < tramos[i + 1].min) {
        throw new Error(`Gap entre Tramo ${i + 1} y ${i + 2}: ${tramos[i].max}% a ${tramos[i + 1].min}%`);
      }
    }
  }

  return supabase.from("distrimm_presupuestos_recaudo").upsert(row);
}
```

**Recomendación — Fase 2 (UI):**

En PresupuestosTab, mostrar diagrama de tramos al guardar:
```
Tramo 1: 0 — 50%   (1%)
Tramo 2: 60 — 100% (2%)  ⚠️ Gap: 50—60% (comisión = 0)
```

---

## Hallazgo #3 — Exclusión de Marca sin Validación de Límites [CRÍTICO]

**Severidad:** CRÍTICO — Subdesctto silencioso de marca
**Archivo:** `src/components/comisiones/RecaudoUploadModal.jsx:182-185`

**Descripción:**

La lógica de exclusión de marca calcula el descuento del costo excluido desde ventas, pero no valida que el descuento total acumulado no exceda el valor del recaudo.

**Código Actual:**
```js
const valorExcluidoMarca = Math.min(
  Math.round(pendiente),
  row.valor_recaudo,  // Tapa: no descontar más que lo pagado
);
```

**Escenario de Riesgo:**

Factura 50000 tiene productos:
- 30.000 ADAMA (marca excluida, costo = $30k)
- 20.000 otros (marca normal)

Recaudos:
1. Febrero: Cliente paga $20.000 → descuenta $0 (no hay exclusión de ADAMA)
2. Marzo: Cliente paga $10.000 → descuenta min($30k pendiente, $10k) = $10k ✓

Pero si la data es inconsistente (ventas dice $30k, pero factura real es $25k):
- Descuento se basaría en $30k (de ventas)
- Con 2 pagos de $15k cada → segunda carga descontaría $15k, perdiendo dinero comisionable

**Causa Raíz:**

`enrichRecaudoExclusions` obtiene `costoExcluido` de `distrimm_comisiones_ventas`, que es autoridad de verdad. Pero no hay auditoría de que ese costo coincida con lo que se pagó realmente.

**Recomendación:**

1. **Log de auditoría** (inmediato):
```js
if (pendiente > 0 && pendiente > row.valor_recaudo) {
  console.warn(
    `[enrichRecaudoExclusions] Factura ${row.factura}: `+
    `costo excluido $${pendiente} supera pago $${row.valor_recaudo} `+
    `— posible inconsistencia de datos`
  );
}
```

2. **Validación en snapshot** (fase 2):
   - Comparar `SUM(valor_excluido_marca)` por factura vs costo de ventas
   - Alert si discrepancia > 5%

---

## Hallazgo #4 — Lógica de Aplica_Comision Inconsistente entre Formatos [CRÍTICO]

**Severidad:** CRÍTICO — Inconsistencia entre flujos de carga
**Archivo:** `src/components/comisiones/RecaudoUploadModal.jsx:479-531`

**Descripción:**

Los dos formatos de carga (RC vs CxC) aplican lógica diferente al marcar recaudos como comisionables.

**RC Format (línea 485):**
```js
aplica_comision: !row._sinMatchCartera && row.dias_mora <= DIAS_MORA_LIMITE,
```
Si no hay match en cartera (`_sinMatchCartera = true`), se marca **NO comisionable**.

**CxC Format (línea 505):**
```js
aplica_comision:
  row.dias_mora <= DIAS_MORA_LIMITE &&
  (row._valor_excluido_marca || 0) < row.valor_recaudo,
```
Si NO hay exclusión (o es menor al recaudo), se marca **comisionable**.

**Línea 527** (retry path):
```js
aplica_comision: row.dias_mora <= DIAS_MORA_LIMITE && !row._excluded,
```
No usa `_sinMatchCartera`.

**Escenario de Riesgo:**

Factura sin match en cartera (ej: error en tercero_nit):

1. **RC format** → `aplica_comision = false` (no comisiona)
2. **CxC format** → `aplica_comision = true` (sí comisiona)
3. Usuario carga mismo recaudo en ambos formatos → resultados divergentes

**Causa Raíz:**

- RC: obtiene datos de cartera (donde se valida match)
- CxC: trae datos ERP directamente (sin validación de cartera)
- Políticas diferentes: RC conservadora (sin match = rechaza), CxC permisiva (confía ERP)

**Recomendación:**

Unificar lógica. Propuesta: Ambos usan `!_sinMatchCartera && dias_mora <= LIMITE`:
```js
// RC format
const withExclusions = await enrichFromDB(transformed);
processed = withExclusions
  .map((row) => ({
    ...row,
    aplica_comision: !row._sinMatchCartera && row.dias_mora <= DIAS_MORA_LIMITE,
    // ... resto
  }))

// CxC format (CAMBIAR)
const withExclusions = await enrichRecaudoExclusions(transformed);
processed = withExclusions
  .map((row) => ({
    ...row,
    // NO usar "_valor_excluido_marca" aquí — it's only metadata
    aplica_comision: !row._sinMatchCartera && row.dias_mora <= DIAS_MORA_LIMITE,
    // ... resto
  }))
```

---

## Hallazgo #5 — Sin Alerta si Presupuesto Recaudo No Existe [MEDIO]

**Severidad:** MEDIO — UX confusa
**Archivo:** `src/utils/comisionesCalculator.js:84-95`

**Descripción:**

Si no hay presupuesto recaudo configurado, `calcularComisionRecaudo` retorna estructura con comisión = 0, pero no diferencia entre "no hay presupuesto" y "presupuesto configurado pero no se cumple".

**Código:**
```js
if (!presupuestoRecaudo || !presupuestoRecaudo.meta_recaudo) {
  return {
    totalRecaudado,
    totalComisionable,
    totalExcluido,
    metaRecaudo: 0,
    pctCumplimiento: 0,
    tramoAplicado: null,
    pctComision: 0,
    comisionRecaudo: 0,  // Mismo resultado si no hay presupuesto O si no cumple
  };
}
```

**Impacto:**

RecaudoTab y snapshot no diferencian:
- "Recaudos $500k, comisión $0 porque no hay presupuesto"
- "Recaudos $500k, comisión $0 porque no se cumplió meta"

**Recomendación:**

Agregar flag:
```js
return {
  // ... resto
  comisionRecaudo: 0,
  sinPresupuesto: !presupuestoRecaudo, // Flag nuevo
};
```

En RecaudoTab, mostrar diferente mensaje:
```jsx
{totalComisionable > 0 && presupuestoRecaudo?.meta_recaudo && comisionRecaudo === 0 && (
  <span className="text-amber-600">⚠️ Sin presupuesto para este vendedor</span>
)}
```

---

## Hallazgo #6 — Acumulación de Exclusión entre Cargas sin Cap Superior [MEDIO]

**Severidad:** MEDIO — Riesgo bajo pero necesita monitoreo
**Archivo:** `src/components/comisiones/RecaudoUploadModal.jsx:176-189`

**Descripción:**

El sistema acumula exclusiones de marca entre cargas correctamente (con remanente), pero no valida que el total acumulado no exceda el costo exclusivo de la factura.

**Código:**
```js
const previo =
  (yaDescontadoMap[row.factura] || 0) +
  (descontadoEnEstaCarga[row.factura] || 0);
const pendiente = Math.max(0, costoExcluido - previo);
const valorExcluidoMarca = Math.min(Math.round(pendiente), row.valor_recaudo);
```

**Escenario (Bajo Riesgo):**

Factura 30000 con $20k exclusión pagada en 3 cargas:
1. Carga 1: $10k pagado → descuenta $10k (pendiente = $10k)
2. Carga 2: $8k pagado → descuenta $8k (pendiente = $2k)
3. Carga 3: $2k pagado → descuenta $2k (pendiente = $0) ✓

Caso edge: Si carga 2 es $3k:
- Descuenta min($10k, $3k) = $3k
- DB: $10k + $3k = $13k acumulado
- Pendiente = max(0, $20k - $13k) = $7k
- Carga 3: descuenta min($7k, $2k) = $2k ✓

**Riesgo Real:**

Si factura se carga con DIFERENTES cliente_nit o factura number (typo):
- Duplicado en DB
- Diferentes facturas se marcan como "tenían exclusión"

**Recomendación:**

Validación en DB (trigger):
```sql
CREATE TRIGGER validate_exclusion_cap
BEFORE INSERT ON distrimm_comisiones_recaudos
FOR EACH ROW
EXECUTE FUNCTION check_exclusion_limit();
```

O en `saveSnapshot` (comisionesService.js):
```js
// Validar: SUM(valor_excluido_marca) por factura <= costo excluido de ventas
```

---

## Resumen de Correcciones por Fase

### Fase 1 — Inmediata (Hotfix)

| Hallazgo | Acción | Archivo | Prioridad |
|----------|--------|---------|-----------|
| #1 | Unificar deduplicación a key sin `carga_id` | useComisionesCalculo.js:134 | P0 |
| #4 | Cambiar CxC a usar `!_sinMatchCartera` | RecaudoUploadModal.jsx:505 | P0 |
| #3 | Agregar log de auditoría para inconsistencias | RecaudoUploadModal.jsx:182-189 | P1 |

### Fase 2 — Corto Plazo (1-2 sprints)

| Hallazgo | Acción | Archivo | Prioridad |
|----------|--------|---------|-----------|
| #2 | Implementar validación de tramos en upsert | comisionesService.js | P0 |
| #2 | UI para visualizar gaps de tramos | PresupuestosTab.jsx | P1 |
| #5 | Agregar flag `sinPresupuesto` | comisionesCalculator.js | P1 |

### Fase 3 — Mediano Plazo (sprint siguiente)

| Hallazgo | Acción | Archivo | Prioridad |
|----------|--------|---------|-----------|
| #6 | Trigger/validación de límite de exclusión | DB schema | P2 |
| #3 | Auditoría de costo vs recaudo en snapshot | saveSnapshot | P2 |

---

## Test Cases Recomendados

### Test #1: Deduplicación Consistente
```js
test("deduplicación usa key sin carga_id — evita divergencia snapshot/período", () => {
  const recaudosMismaFacturaDosCargasDiferentesAños = [
    { carga_id: "carga1", cliente_nit: "123", factura: "ABC", valor_recaudo: 50000 },
    { carga_id: "carga2", cliente_nit: "123", factura: "ABC", valor_recaudo: 50000 },
  ];
  const deduped = deduplicateRecaudos(recaudosMismaFacturaDosCargasDiferentesAños);
  expect(deduped.length).toBe(1); // Uno deduplicated
});
```

### Test #2: Validación de Tramos
```js
test("upsertPresupuestoRecaudo rechaza tramos con gap", async () => {
  const invalidTramos = {
    tramo1_max: 50,
    tramo1_pct: 0.01,
    tramo2_min: 60, // Gap: 50-60
    tramo2_pct: 0.02,
  };
  const result = await upsertPresupuestoRecaudo(invalidTramos);
  expect(result.error).toMatch(/Gap entre Tramo/);
});
```

### Test #3: Aplica_Comision Consistente
```js
test("RC y CxC usan misma lógica de aplica_comision", () => {
  // Mismo recaudo sin match en cartera
  const rcResult = transformRC([...]) .map(r => ({ ...r, aplica_comision: !r._sinMatchCartera && ... }));
  const cxcResult = transformCxC([...]) .map(r => ({ ...r, aplica_comision: !r._sinMatchCartera && ... }));
  // Deben ser iguales
});
```

---

## Conclusión

Se identificaron **4 hallazgos críticos** que afectan la integridad del cálculo de comisiones. Las correcciones de Fase 1 deben ejecutarse inmediatamente antes de procesar liquidaciones nuevas. Los tests recomendados previenen regresión.

**Aprobado para implementación inmediata (Fase 1).**
