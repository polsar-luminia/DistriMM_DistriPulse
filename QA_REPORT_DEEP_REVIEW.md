# DistriMM — Reporte QA Profundo (Browser + Código Fuente)

**Fecha:** 24 de marzo de 2026
**Ambiente:** Producción — https://distrimm.luminiatech.digital
**Código fuente:** Repositorio local DistriMM
**Revisado por:** QA Senior (Claude)

---

## Resumen Ejecutivo

Se realizó una revisión profunda combinando pruebas funcionales en el navegador de producción con análisis estático del código fuente. Se identificaron hallazgos en 4 categorías: terminología inconsistente, brecha de despliegue, accesibilidad y manejo de errores.

**Score General: 7.5 / 10**

---

## 1. Login y Autenticación

| Criterio | Estado |
|---|---|
| Formulario de login visible | OK |
| Botón "Iniciar sesión con Google" funcional | OK |
| Redirige correctamente post-login | OK |
| Sesión persiste tras recarga | OK |

**Hallazgos:** Sin problemas. El flujo OAuth con Supabase funciona correctamente.

---

## 2. Dashboard Principal

| Criterio | Estado |
|---|---|
| Carga datos de cartera | OK |
| KPIs visibles y formateados en COP | OK |
| Gráficos renderizan correctamente | OK |
| Filtros funcionan | OK |

**Hallazgo código:** `MainLayout.jsx` contiene un comentario interno `// DistriPulse style` (línea 3). Solo es interno, sin impacto al usuario, pero evidencia el renombramiento del proyecto desde "DistriPulse" a "DistriMM".

---

## 3. Vendedores

| Criterio | Estado |
|---|---|
| Lista carga correctamente | OK |
| Búsqueda/filtro funciona | OK |
| Detalle de vendedor abre | OK |

**Hallazgo código:** `VendedoresPage.jsx` tiene un catch silencioso en al menos un bloque de error — solo hace `console.error` sin feedback al usuario. Si falla la carga de datos, el usuario no recibe ninguna notificación.

---

## 4. Módulo de Comisiones

### 4.1 Ventas Tab

| Criterio | Estado |
|---|---|
| Tabla de ventas carga | OK |
| KPIs visibles | ⚠️ Brecha de despliegue |
| Exportación funciona | OK |

**Hallazgo crítico — Brecha de despliegue:** El código fuente de `VentasTab.jsx` fue refactorizado para mostrar **3 KPIs** (Ventas Brutas, Devoluciones, Venta Neta), pero producción muestra **5 KPIs** (Total Ventas, Costo Total, Costo Comisionable, Sin Comisión, Devoluciones). Esto confirma que el código desplegado no coincide con la versión más reciente del repositorio.

**Hallazgo terminología (código):** Línea 153 del source usa `"Sin presupuesto"` como texto de fallback en la exportación. Debería ser `"Sin cuota"` según la terminología actual.

### 4.2 Recaudo Tab

| Criterio | Estado |
|---|---|
| Tabla de recaudos carga | OK |
| KPIs de recaudo visibles | OK |
| Tramos de comisión se calculan | OK |

**Hallazgo menor:** Columnas en la UI muestran `EXCL. MORA` y `EXCL. MARCA`. Abreviaturas como "EXCL." podrían confundir — considerar usar "Sin comisión (mora)" / "Sin comisión (marca)" para consistencia con la terminología adoptada. Variables internas usan `excluidoMora`, `excluidoMarca` — aceptable como nombres de variable.

### 4.3 Cuotas Tab (antes "Presupuestos")

| Criterio | Estado |
|---|---|
| Formulario de configuración | OK |
| Guardado persiste | OK |
| Selects de vendedor/marca funcionan | OK |

**Hallazgo accesibilidad:** `PresupuestosTab.jsx` líneas 567–619 — los elementos `<select>` no tienen `aria-label` ni `<label>` asociado. Esto afecta a usuarios con lectores de pantalla.

**Hallazgo terminología:** El archivo sigue nombrado `PresupuestosTab.jsx` internamente (sin impacto al usuario, pero dificulta mantenimiento).

### 4.4 Exclusiones Tab

| Criterio | Estado |
|---|---|
| Lista de exclusiones carga | OK |
| Agregar/eliminar exclusión funciona | OK |

**Hallazgo accesibilidad:** `ExclusionesTab.jsx` también carece de `aria-label` en controles de formulario.

### 4.5 Catálogo Tab

| Criterio | Estado |
|---|---|
| Productos listados | ❌ Vacío en re-verificación |
| Búsqueda funciona | N/A |
| Badge de estado visible | ⚠️ Terminología antigua |

**Hallazgo crítico — Catálogo vacío:** En la primera revisión, el Catálogo mostraba **4,155 productos**. En la re-verificación posterior, muestra **"Catálogo vacío"**. Esto podría indicar un problema de datos (carga eliminada, error de consulta, o despliegue nuevo que afectó la tabla `distrimm_productos_catalogo`).

**Hallazgo terminología (código):**
- Línea 175: `· {excludedCount} excluidos` → debería ser `sin comisión`
- Línea 219: badge `Excluido` → debería ser `Sin comisión`

### 4.6 Reporte Mensual

| Criterio | Estado |
|---|---|
| Genera reporte por vendedor | OK |
| Exportar PDF funciona | OK |
| Exportar Excel funciona | OK |
| Snapshot/liquidación funciona | OK |

**Hallazgo terminología (código):**
- Línea 498: `subtitle="Marcas sin cuota"` ← ✅ Correcto
- Líneas 765 y 898: aún usan `"presupuesto"` en texto visible al usuario → debería ser `"cuota"`

---

## 5. Exportaciones (PDF y Excel)

### PDF (`reportePDF.js`)

| Hallazgo | Línea | Texto actual | Texto correcto |
|---|---|---|---|
| Label en resumen vendedor | 303 | `Excluido: ${formatCOP(...)}` | `Sin comisión: ${formatCOP(...)}` |
| Sección de detalle | 423 | `Productos Excluidos (${n} items...)` | `Productos Sin Comisión (${n} items...)` |

### Excel (`reporteExcelMensual.js`)

| Hallazgo | Línea | Texto actual | Texto correcto |
|---|---|---|---|
| Header columna | 29 | `"Ventas Excluidas"` | `"Ventas Sin Comisión"` |
| Nombre de sheet | 158 | `"Detalle Excluido"` | `"Detalle Sin Comisión"` |
| Header columna | 103 | `Excluidas` | `Sin Comisión` |

Estos textos aparecen en documentos que el usuario descarga y potencialmente comparte con terceros, lo que hace estos hallazgos de **prioridad alta**.

---

## 6. Lógica de Cálculo (`comisionesCalculator.js`)

| Criterio | Estado |
|---|---|
| Protección contra NaN | ✅ `toFinite()` helper |
| División por cero | ✅ Validación `metaRecaudo > 0` |
| Valores negativos (devoluciones) | ✅ `Math.max(0, rawVenta)` |
| Evaluación de tramos | ✅ De mayor a menor (5→1) |
| Normalización de marcas | ✅ `normalizeBrand()` |
| Redondeo de comisiones | ✅ `Math.round()` |

**Veredicto:** La lógica de cálculo es sólida y bien implementada. No se encontraron bugs en el motor de comisiones.

---

## 7. Servicio de Datos (`comisionesService.js`)

| Criterio | Estado |
|---|---|
| Paginación con `fetchAllRows` | ✅ |
| Snapshots con hash de invalidación | ✅ CALC_VERSION = 3 |
| RPC para cálculos server-side | ✅ `fn_calcular_comisiones` |
| Manejo de errores en queries | ✅ |

**Veredicto:** Servicio bien estructurado con buenas prácticas de paginación y versionado de cálculos.

---

## 8. Footer y Elementos Generales

| Criterio | Estado |
|---|---|
| Footer visible | OK |
| Links funcionales | OK |
| Responsive design | OK |
| Título del navegador | ✅ "DistriMM | Gestión de Cartera" |

---

## Resumen de Hallazgos por Severidad

### 🔴 Críticos (2)

1. **Brecha de despliegue (deploy gap):** El código fuente tiene cambios significativos (VentasTab refactorizado con 3 KPIs) que no están en producción (que muestra 5 KPIs). Esto genera riesgo de que correcciones ya hechas en código no lleguen al usuario.

2. **Catálogo vacío en producción:** Pasó de 4,155 productos a "Catálogo vacío" durante la sesión de pruebas. Requiere investigación inmediata — posible pérdida de datos o error en carga.

### 🟡 Importantes (3)

3. **Terminología "Excluido" en exports:** Los PDFs y Excels descargables usan "Excluido/Excluidas" en lugar de "Sin comisión". Estos documentos se comparten externamente.

4. **Terminología "presupuesto" residual en UI:** `ReporteMensualTab` líneas 765/898 aún muestran "presupuesto" al usuario cuando la terminología oficial es "cuota".

5. **Terminología "excluidos" en Catálogo UI:** Badge y contador en CatalogoTab.jsx usan "excluidos" en vez de "sin comisión".

### 🟢 Menores (4)

6. **Accesibilidad — selects sin aria-label:** `PresupuestosTab.jsx` y `ExclusionesTab.jsx` tienen controles `<select>` sin labels accesibles.

7. **Error handling silencioso:** `VendedoresPage.jsx` y `ChatbotPage.jsx` capturan errores sin mostrar feedback al usuario.

8. **Abreviatura "EXCL." en RecaudoTab:** Las columnas podrían usar terminología más clara.

9. **Nombre de archivo `PresupuestosTab.jsx`:** El archivo sigue nombrado con la terminología antigua, dificultando la mantenibilidad.

---

## Top 3 Acciones Urgentes

1. **Desplegar la versión actual del código** — Cerrar la brecha entre el repositorio y producción. Verificar que el pipeline de CI/CD esté configurado correctamente.

2. **Investigar el Catálogo vacío** — Verificar la tabla `distrimm_productos_catalogo` en Supabase. Si los datos se perdieron, restaurar desde backup.

3. **Actualizar terminología en exports** — Cambiar "Excluido/Excluidas" a "Sin comisión" en `reportePDF.js` y `reporteExcelMensual.js`. Estos archivos se comparten con terceros y la inconsistencia genera confusión.

---

## Score Final

| Categoría | Peso | Nota | Ponderado |
|---|---|---|---|
| Funcionalidad core | 30% | 8.5 | 2.55 |
| Lógica de cálculo | 20% | 9.5 | 1.90 |
| Consistencia terminológica | 15% | 5.0 | 0.75 |
| Despliegue y DevOps | 15% | 5.0 | 0.75 |
| Accesibilidad | 10% | 6.0 | 0.60 |
| Manejo de errores | 10% | 7.0 | 0.70 |
| **Total** | **100%** | | **7.25 / 10** |

---

*Reporte generado el 24 de marzo de 2026. Revisión combinada: pruebas funcionales en producción + análisis estático del código fuente.*
