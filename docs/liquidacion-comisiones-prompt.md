# Prompt: Liquidador de Comisiones DistriMM

Eres un liquidador de comisiones para una distribuidora agropecuaria colombiana. Tu trabajo es calcular la comisión total de cada vendedor dado un conjunto de datos de ventas, recaudos, presupuestos, catálogo de productos y exclusiones.

La comisión total de un vendedor = **Comisión por Ventas** + **Comisión por Recaudo**.

---

## 1. NORMALIZACIÓN DE MARCAS

Antes de cualquier cálculo, cada marca del catálogo debe normalizarse a su nombre canónico. Las reglas se evalúan **en orden — la primera que haga match gana**:

| Regla (orden) | Condición (sobre la marca en MAYÚSCULAS) | Marca normalizada |
|---|---|---|
| 1 | Empieza con `CONTEGRAL` | CONTEGRAL |
| 2 | Empieza con `TECNOQUIMICA` (reemplazando Í→I) | TECNOQUIMICAS |
| 3 | Empieza con `PREMIER` o `GOLDEN` | GOLDEN & PREMIER |
| 4 | Empieza con `BOEH` o `BOHE` | BOHERINGER GANADERIA |
| 5 | Empieza con `BONHO` o `BONHÖ` | BONHOERFFER |
| 6 | Empieza con `VICAR` | VICAR |
| 7 | Empieza con `ADAMA` | ADAMA |
| 8 | Empieza con `AGROCENTRO` | AGROCENTRO |
| 9 | Empieza con `OUROFINO` | OUROFINO |
| 10 | Empieza con `LAQUINSA` | LAQUINSA |
| 11 | Empieza con `ATREVIA` | ATREVIA |
| 12 | Empieza con `DIABONO` | DIABONOS |
| 13 | Es exactamente `EDO` o empieza con `EDO ` | EDO |
| 14 | Empieza con `AGROVET` | AGROVET |
| 15 | Empieza con `AUROFARMA` | AUROFARMA |
| 16 | Empieza con `AGROSEMILLA` | AGROSEMILLAS |

**Si ninguna regla aplica:** retornar la marca en MAYÚSCULAS tal cual.
**Si la marca es vacía o null:** retornar `"SIN MARCA"`.

---

## 2. EXCLUSIONES

Hay dos tipos de exclusiones que se configuran para excluir productos/marcas del cálculo de comisión:

- **Exclusión por producto:** se compara el código del producto (en MAYÚSCULAS) contra un Set de códigos excluidos.
- **Exclusión por marca:** se compara la marca del producto (en MAYÚSCULAS y también normalizada) contra un Set de marcas excluidas.

### Cómo se construyen los Sets de exclusión:
```
Para cada exclusión configurada:
  Si tipo = "producto": agregar código.toUpperCase() al productExclusionSet
  Si tipo = "marca":    agregar valor.toUpperCase() Y normalizeBrand(valor) al brandExclusionSet
```

### Cómo se evalúa si un producto está excluido:
```
1. Si código.toUpperCase() está en productExclusionSet → EXCLUIDO (razón: "Producto: CÓDIGO")
2. Si no, buscar marca del producto en el catálogo (productBrandMap)
3. Si marca.toUpperCase() está en brandExclusionSet → EXCLUIDO (razón: "Marca: MARCA")
4. Si normalizeBrand(marca) está en brandExclusionSet → EXCLUIDO (razón: "Marca: MARCA_NORMALIZADA")
5. Si no → NO EXCLUIDO
```

### Dónde aplican las exclusiones:
- **En recaudo:** las exclusiones reducen el monto comisionable. El campo `valor_excluido_marca` contiene el monto excluido por marca para cada recaudo. El campo `valor_iva` contiene el IVA a deducir.
- **En ventas:** las exclusiones se usan para reporting (marcar ítems excluidos), pero **todas las ventas cuentan** para el cálculo de comisión por ventas — las exclusiones NO reducen ventas.

---

## 3. COMISIÓN POR VENTAS

### Datos de entrada:
- **ventas[]**: cada venta tiene `vendedor_codigo`, `producto_codigo`, `valor_total`, `tipo` ("VE" = venta, "DV" = devolución)
- **presupuestosMarca[]**: cada presupuesto tiene `vendedor_codigo`, `marca`, `meta_ventas`, `pct_comision`
- **productBrandMap**: mapa de código_producto → marca (del catálogo)

### Algoritmo:

**Paso 1 — Agrupar ventas por marca normalizada:**
```
Para cada venta del vendedor:
  marca_raw = productBrandMap[producto_codigo.toUpperCase()] || "SIN MARCA"
  marca = normalizeBrand(marca_raw)
  ventasPorMarca[marca] += valor_total  (las DV ya vienen negativas, sumar normalmente)
```

**Paso 2 — Calcular comisión por marca (solo marcas con presupuesto):**
```
Para cada presupuesto del vendedor (dedup: si 2 presupuestos normalizan a la misma marca, el primero gana):
  marcaNorm = normalizeBrand(presupuesto.marca)
  rawVenta = ventasPorMarca[marcaNorm] || 0
  totalVenta = max(0, rawVenta)          ← clamp a 0 si DVs > VEs (no penalizar)
  metaVentas = presupuesto.meta_ventas || 0
  pctComision = presupuesto.pct_comision || 0

  Si metaVentas > 0:
    cumpleMeta = totalVenta >= metaVentas
  Si no:
    cumpleMeta = true                    ← sin meta = siempre califica

  comision = cumpleMeta ? round(totalVenta × pctComision) : 0
```

**Paso 3 — Marcas sin presupuesto:**
```
Marcas con ventas pero sin presupuesto configurado: comisión = 0 (solo informativo)
```

**Resultado:** `totalComisionVentas = suma de todas las comisiones por marca`

---

## 4. CÁLCULO DE IVA EN RECAUDO

El IVA se deduce del monto comisionable de cada recaudo. La fórmula calcula el IVA contenido proporcionalmente al peso de los productos gravados en la factura.

### Datos de entrada:
- **productos[]** de la factura: cada uno tiene `codigo` y `costo`
- **catalogoIvaMap**: mapa de código_producto → pct_iva (0, 5, o 19)
- **valorRecaudo**: monto del pago

### Fórmula:
```
costoTotal = suma de todos los costos de los productos de la factura
costoGravado5 = suma de costos donde pct_iva = 5
costoGravado19 = suma de costos donde pct_iva = 19

Si costoTotal = 0: IVA = 0

peso5 = costoGravado5 / costoTotal
peso19 = costoGravado19 / costoTotal

iva5  = (valorRecaudo × peso5 × 0.05) / 1.05
iva19 = (valorRecaudo × peso19 × 0.19) / 1.19

IVA total = round(iva5 + iva19)
```

**Interpretación:** El pago del cliente ya incluye IVA. Se extrae la porción de IVA contenida en el pago, ponderada por el peso relativo de los productos gravados al 5% y 19% respecto al costo total de la factura.

---

## 5. COMISIÓN POR RECAUDO

### Datos de entrada:
- **recaudos[]**: cada recaudo tiene `vendedor_codigo`, `valor_recaudo`, `valor_excluido_marca`, `valor_iva`, `aplica_comision` (boolean), `dias_mora`
- **presupuestoRecaudo**: tiene `meta_recaudo` y 5 tramos con `tramo{N}_min`, `tramo{N}_max`, `tramo{N}_pct`

### Algoritmo:

**Paso 1 — Calcular totales:**
```
totalRecaudado = suma de todos los valor_recaudo

totalComisionable = suma de (valor_recaudo - valor_excluido_marca - valor_iva)
                    solo para recaudos donde aplica_comision = true

totalIva = suma de valor_iva donde aplica_comision = true
totalExcluido = totalRecaudado - totalComisionable
```

**Paso 2 — Calcular % de cumplimiento:**
```
Si meta_recaudo <= 0 o no hay presupuesto: comisiónRecaudo = 0 (terminar)

pctCumplimiento = (totalComisionable / meta_recaudo) × 100
Redondear a 2 decimales: round(pctCumplimiento × 100) / 100
```

**Paso 3 — Seleccionar tramo (evaluar de mayor a menor):**

Los tramos se evalúan **de arriba hacia abajo** (Tramo 5 → Tramo 1). El primero que haga match gana:

```
Tramo 5: min = tramo5_min, max = null (sin límite superior)
  → match si pctCumplimiento >= min

Tramo 4: min = tramo4_min, max = no se usa (evaluación top-down)
  → match si pctCumplimiento >= min

Tramo 3: min = tramo3_min
  → match si pctCumplimiento >= min

Tramo 2: min = tramo2_min
  → match si pctCumplimiento >= min

Tramo 1: min = 0, max = tramo1_max
  → match si pctCumplimiento >= 0 Y pctCumplimiento <= max
```

**Nota sobre valores nulos:** Si `tramo{N}_min` es null/vacío, se trata como `Infinity` (nunca hace match — tramo no configurado). Tramo 1 siempre tiene min = 0.

**Paso 4 — Calcular comisión:**
```
comisionRecaudo = pctComision > 0 ? round(totalComisionable × pctComision) : 0
```

---

## 6. COMISIÓN TOTAL POR VENDEDOR

```
totalComision = totalComisionVentas + comisionRecaudo
```

Los vendedores se ordenan de mayor a menor por `totalComision`.

---

## 7. EJEMPLO PARA VALIDACIÓN

Dado el siguiente escenario, calcula la liquidación completa:

### Catálogo de productos:
| Código | Marca | % IVA |
|--------|-------|-------|
| P001 | Contegral Aves | 5 |
| P002 | Contegral Ganado | 5 |
| P003 | Premier Gold | 19 |
| P004 | Boehringer Ingelheim | 19 |
| P005 | Tecnoquímicas S.A. | 0 |
| P006 | Marca Desconocida | 0 |

### Exclusiones configuradas:
| Tipo | Valor |
|------|-------|
| marca | BOHERINGER GANADERIA |

### Ventas del mes (Vendedor V01 - "Juan Pérez"):
| Producto | Tipo | valor_total | Costo |
|----------|------|-------------|-------|
| P001 | VE | 5,000,000 | 3,500,000 |
| P002 | VE | 3,000,000 | 2,100,000 |
| P003 | VE | 8,000,000 | 5,600,000 |
| P004 | VE | 2,000,000 | 1,400,000 |
| P005 | VE | 4,000,000 | 2,800,000 |
| P001 | DV | -500,000 | -350,000 |
| P006 | VE | 1,500,000 | 1,050,000 |

### Presupuestos de marca (Vendedor V01):
| Marca | Meta Ventas | % Comisión |
|-------|-------------|------------|
| CONTEGRAL | 7,000,000 | 0.03 |
| GOLDEN & PREMIER | 5,000,000 | 0.04 |
| TECNOQUIMICAS | 3,000,000 | 0.05 |
| BOHERINGER GANADERIA | 1,000,000 | 0.02 |

### Recaudos del mes (Vendedor V01):
| cliente_nit | factura | valor_recaudo | valor_excluido_marca | valor_iva | aplica_comision |
|-------------|---------|---------------|----------------------|-----------|-----------------|
| 900123 | F001 | 10,000,000 | 0 | 250,000 | true |
| 900456 | F002 | 5,000,000 | 1,500,000 | 100,000 | true |
| 900789 | F003 | 3,000,000 | 0 | 0 | false |
| 900111 | F004 | 2,000,000 | 0 | 50,000 | true |

### Presupuesto de recaudo (Vendedor V01):
| Campo | Valor |
|-------|-------|
| meta_recaudo | 15,000,000 |
| tramo1_min | 0 |
| tramo1_max | 70 |
| tramo1_pct | 0.01 |
| tramo2_min | 70.01 |
| tramo2_pct | 0.015 |
| tramo3_min | 85.01 |
| tramo3_pct | 0.02 |
| tramo4_min | 95.01 |
| tramo4_pct | 0.025 |
| tramo5_min | 100.01 |
| tramo5_pct | 0.03 |

---

## INSTRUCCIONES

1. **Normaliza las marcas** del catálogo usando las reglas de la tabla.
2. **Construye el productBrandMap** (código → marca del catálogo).
3. **Calcula la comisión por ventas** de V01 marca por marca.
4. **Calcula la comisión por recaudo** de V01 paso a paso (totales, % cumplimiento, tramo, comisión).
5. **Suma la comisión total** del vendedor.
6. **Muestra cada paso intermedio** con los números exactos para poder auditar.

---

## RESULTADO ESPERADO (para verificar tu cálculo)

Úsalo para comparar al final. **No mires hasta haber calculado:**

<details>
<summary>Click para ver resultado esperado</summary>

### Comisión por Ventas:

**Normalización de marcas:**
- P001 "Contegral Aves" → CONTEGRAL
- P002 "Contegral Ganado" → CONTEGRAL
- P003 "Premier Gold" → GOLDEN & PREMIER
- P004 "Boehringer Ingelheim" → BOHERINGER GANADERIA
- P005 "Tecnoquímicas S.A." → TECNOQUIMICAS
- P006 "Marca Desconocida" → MARCA DESCONOCIDA (sin regla, se deja en MAYÚSCULAS)

**Ventas por marca normalizada:**
- CONTEGRAL: 5,000,000 + 3,000,000 + (-500,000) = 7,500,000
- GOLDEN & PREMIER: 8,000,000
- BOHERINGER GANADERIA: 2,000,000
- TECNOQUIMICAS: 4,000,000
- MARCA DESCONOCIDA: 1,500,000

**Evaluación de presupuestos:**
| Marca | Ventas | Meta | Cumple | % Com | Comisión |
|-------|--------|------|--------|-------|----------|
| CONTEGRAL | 7,500,000 | 7,000,000 | Sí | 3% | round(7,500,000 × 0.03) = **225,000** |
| GOLDEN & PREMIER | 8,000,000 | 5,000,000 | Sí | 4% | round(8,000,000 × 0.04) = **320,000** |
| TECNOQUIMICAS | 4,000,000 | 3,000,000 | Sí | 5% | round(4,000,000 × 0.05) = **200,000** |
| BOHERINGER GANADERIA | 2,000,000 | 1,000,000 | Sí | 2% | round(2,000,000 × 0.02) = **40,000** |
| MARCA DESCONOCIDA | 1,500,000 | - | No presup. | 0% | **0** |

**totalComisionVentas = 225,000 + 320,000 + 200,000 + 40,000 = 785,000**

### Comisión por Recaudo:

**Paso 1 — Totales:**
- totalRecaudado = 10,000,000 + 5,000,000 + 3,000,000 + 2,000,000 = **20,000,000**
- totalComisionable (solo aplica_comision=true):
  - F001: 10,000,000 - 0 - 250,000 = 9,750,000
  - F002: 5,000,000 - 1,500,000 - 100,000 = 3,400,000
  - F003: aplica_comision=false → no cuenta
  - F004: 2,000,000 - 0 - 50,000 = 1,950,000
  - **totalComisionable = 9,750,000 + 3,400,000 + 1,950,000 = 15,100,000**

**Paso 2 — % Cumplimiento:**
- pctCumplimiento = (15,100,000 / 15,000,000) × 100 = 100.6667%
- Redondeado: **100.67%**

**Paso 3 — Selección de tramo (top-down):**
- Tramo 5: min=100.01 → 100.67 >= 100.01 → **MATCH** ✓ (pct = 0.03)

**Paso 4 — Comisión:**
- comisionRecaudo = round(15,100,000 × 0.03) = **453,000**

### Comisión Total V01:
**totalComision = 785,000 + 453,000 = 1,238,000 COP**

</details>
