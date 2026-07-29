# Cómo hacer el sugerido más acertado — investigación

**Fecha:** 28/07/2026 · **Estado:** investigación cerrada, sin implementar (salvo lo ya hecho hoy)

Todo lo de aquí está medido contra el ERP real (`ssh distrimm`, `E0032026`/`E0032025`) y contra el
VPS, no estimado. Las consultas usan `WITH (NOLOCK)` y son de solo lectura.

---

## 0. De dónde partimos

Hoy `fn_sugerido_pedidos` calcula, por producto:

```
venta_diaria = unidades netas vendidas en la ventana / días efectivos
sugerido     = techo(venta_diaria × dias_cobertura × (1+crec) × (1+reserva) − (stock + tránsito))
```

Esta mañana se corrigió el denominador para que sean los **días que el producto estuvo
disponible** en vez de la ventana nominal (ver CLAUDE.md, sección "Sugerido de Pedidos"). Eso
resolvió el caso del producto **nuevo**. Lo que sigue es lo que queda.

---

## 1. Hallazgo mayor: la demanda sigue ciega a los quiebres de stock

El arreglo de hoy usa como inicio de historia la primera aparición del producto en un **corte
mensual** de inventario. Pero el inventario solo se guarda **una foto por mes**, así que no se ve
que un producto se agotó el día 12 y volvió el día 40. Se sigue dividiendo entre días en los que
era imposible vender.

Medido sobre los 90 días previos al 28/07/2026, productos con venta en la ventana:

| | productos |
|---|---|
| Con venta en los últimos 90 días | 1.082 |
| **Estuvieron sin stock en algún momento** | **537 (50%)** |
| Estuvieron sin stock **30 días o más** | **351 (32%)** |
| Promedio de días sin stock (de 90) | **22,4** |

Efecto agregado sobre la demanda diaria del catálogo:

| Cómo se mide | Unidades/día |
|---|---|
| Hoy (entre los días de la ventana) | 1.040 |
| Dividiendo entre los **días con stock** | **1.618** |

**La demanda real es ~55% mayor que la que ve el sistema.** No es un sesgo repartido: se concentra
en los productos que más se agotan, que son justamente los que hay que reponer.

### Se puede arreglar, y el dato existe

El stock **diario** es reconstruible exactamente desde `IN_Documento` + `IN_Movimiento`.
Verificado sobre el `90497` (bodegas 1/5/6):

| Fecha | Doc | Bodega | Movimiento | Saldo |
|---|---|---|---|---|
| 03/07 | CO | 5 | +26 | 26 |
| 10/07 | TR | 5 → 6 | −6 / +6 | 20 / 6 |
| 14/07 | VE | 5 | −12 | 8 |
| 17/07 | TR + CO | 5, 6 | +6 / −6, +26 | 14 / 26 |
| 21/07 | VE | 6 | −10 | 16 |
| 25/07 | VE | 6 | −16 | 0 |

Cierra en **14 en bodega 5 y 0 en bodega 6**, idéntico a `IN_ProdBodega.CantidadFinal`. La
identidad `CantidadInicial + Σ débitos − Σ créditos = CantidadFinal` ya estaba verificada en las
2.539 filas del mapeo; esto la extiende a la línea de tiempo.

**Propuesta:** dataset nuevo `movimientos_inventario` — una fila por
`(documento, item)` con fecha, bodega, `DC` y cantidad, **todos los tipos de documento**
(`VE`, `DV`, `CO`, `EN`, `SA`, `TR`), no solo ventas. Son **24.007 líneas en 2026**: trivial al
lado de los datasets que ya se sincronizan.

Con eso, `venta_diaria = unidades / días con stock > 0`.

> **Necesita guardarraíl, igual que el piso que se puso hoy.** Un producto que solo tuvo stock 3
> días y vendió 5 unidades daría 1,67/día y un sugerido desbocado. El mismo criterio ya aplicado
> —piso en `dias_cobertura`— acota el resultado a "no pedir más de lo que se vendió".

---

## 2. El "proveedor" del sugerido no es el proveedor

La pantalla dice *"Todos los proveedores"* y el modal exporta *"Orden de compra por proveedor"*,
pero ambos filtran por **`marca`**. No es lo mismo.

Contra los 911 documentos de compra (`TipoDoc='CO'`) de 2026:

| | |
|---|---|
| Proveedores reales (`IN_Documento.Tercero` en compras) | **147** |
| Marcas compradas | 107 |
| **Marcas que se compran a más de un proveedor** | **51 de 107** |
| Máximo de proveedores de una sola marca | **59** |

**Una "orden de compra" exportada hoy puede mezclar mercancía de decenas de proveedores
distintos.** No sirve como orden de compra; sirve como listado por marca.

Ejemplo real: el `90497` y el `93129` son marca **CORTEVA**, pero el proveedor al que se les
compra es **AGROMARK S.A** (NIT 813002096).

### Cuidado: las tablas de proveedores del ERP están vacías

Es lo primero que parecía la solución, y no lo es:

| Tabla | Filas |
|---|---|
| `IN_Proveedores` | **0** |
| `IN_OrdenCompra` | 3 |
| `IN_OrdenDetalle` | 3 |
| `IN_ProductoProveedor` | 31 (de 4.374 productos) |

El módulo de compras del ERP **no se usa**. La única fuente confiable del proveedor es el
histórico de documentos `CO`: 911 documentos, 1.053 productos, 147 proveedores. Se derivaría el
proveedor por producto como el más frecuente o el más reciente.

---

## 3. La columna "tránsito" siempre vale cero

`transito` se sincroniza desde `IN_ProdBodega.Remisionado`, que está en **0 en las 2.582 filas**.
La fórmula del sugerido resta `(stock + tránsito)` y ese segundo término nunca aporta nada.

**Consecuencia:** el sugerido no sabe qué mercancía ya está pedida y en camino, así que puede
sugerir volver a pedir algo que llega mañana. Con `IN_OrdenCompra` en 3 filas, **no hay dato en el
ERP que lo resuelva**: es una decisión operativa (que la oficina empiece a registrar las órdenes),
no un arreglo de código. Mientras tanto, conviene al menos quitar la columna muerta de la UI o
marcarla como no disponible, para que nadie asuma que está cubierto.

---

## 4. El sugerido no respeta el lote de compra

Gerencia compra en lotes fijos, no en unidades sueltas:

| Producto | Compras 2026 | Sugerido de hoy |
|---|---|---|
| `90497` INTREPID X100 | 26 el 03/07, 26 el 17/07 | 25 |
| `93129` INTREPID 2F litro | 13 el 03/06, 13 el 03/07 | 17 |

De 432 productos con dos o más compras, **87 repiten exactamente la misma cantidad**. Redondear el
sugerido hacia arriba al lote habitual lo vuelve directamente accionable: 25 → 26.

---

## 5. Estacionalidad: el promedio móvil de 90 días no la ve

Ventas facturadas por mes (millones COP, `VE`−`DV`, sin anulados):

| Mes | 2025 | 2026 |
|---|---|---|
| Ene | 738 | 1.051 |
| Feb | 573 | 1.022 |
| Mar | 731 | 1.024 |
| Abr | 809 | 1.174 |
| May | 559 | 958 |
| **Jun** | **451** | 937 |
| Jul | 640 | 739 *(al día 28)* |
| Ago | **485** | |
| Sep | 676 | |
| **Oct** | **1.010** | |
| **Nov** | **1.015** | |
| Dic | 785 | |

El pico de octubre-noviembre es **más del doble** del valle de junio-agosto. Una ventana móvil de
90 días corrida en septiembre promedia justo el valle y **sub-pronostica la temporada alta**, que
es cuando quedarse corto cuesta más.

Es el arreglo más delicado de los cinco: hay que separar estacionalidad de crecimiento (2026 corre
muy por encima de 2025), y solo hay un año de historia comparable. Un índice mensual sobre 2025,
normalizado por la tendencia, es viable pero merece validarse contra el resultado de octubre antes
de dejarlo mandando.

---

## 6. Cadencia real de reposición vs. el parámetro global

El promedio entre compras consecutivas de un mismo producto es de **51 días**, no 30. El
`dias_cobertura` es un único número global para las 1.477 referencias. Un producto que se compra
cada 14 días (el `90497`) y uno que se compra cada 90 no deberían cubrirse igual.

---

## 7. Debilidades del modelo que no dependen del ERP

- **Promedio simple, sin tendencia.** Un producto que cae 30% mes a mes y otro que sube 30% dan la
  misma venta diaria si el total de la ventana coincide.
- **La "reserva" es un porcentaje plano.** El stock de seguridad correcto depende de la
  *variabilidad* de la demanda, no del volumen: un producto regular necesita menos colchón que uno
  errático con la misma media.
- **`dias_analisis` es global.** Un producto de alta rotación se describe mejor con 30 días; uno
  lento necesita 180 para no verse como ruido.

---

## 8. Orden recomendado

| # | Cambio | Impacto | Esfuerzo | Riesgo |
|---|---|---|---|---|
| 1 | Demanda sobre días **con stock** (dataset `movimientos_inventario`) | **Muy alto** — 55% de la demanda | Medio | Medio: necesita el piso ya probado |
| 2 | Proveedor real desde documentos `CO` | Alto — hace usable la orden de compra | Bajo | Bajo |
| 3 | Redondeo al lote de compra | Medio — vuelve accionable el número | Bajo | Bajo |
| 4 | Quitar/marcar la columna `tránsito` muerta | Bajo, pero evita una falsa sensación | Muy bajo | Ninguno |
| 5 | Cobertura por cadencia real del producto | Medio | Medio | Medio |
| 6 | Índice de estacionalidad | Alto en temporada | Alto | **Alto** — validar contra octubre |

**Recomendación:** hacer 1 + 2 + 3 juntos. Son los que atacan las dos quejas originales de
gerencia por la raíz y no dependen de que nadie cambie cómo trabaja. El 6 se deja para después de
tener el 1 andando, porque una corrección de estacionalidad montada sobre una demanda mal medida
amplifica el error en vez de arreglarlo.

---

## Consultas de referencia

El ayudante de consulta usado en esta investigación manda la consulta como `-EncodedCommand`
(UTF-16LE base64) para no pelear con el escapado entre zsh, ssh y PowerShell, y bloquea toda
sentencia que no sea de lectura. La cadena de conexión es `Server=.\SAMIT` — con `localhost`
falla por named pipes.
