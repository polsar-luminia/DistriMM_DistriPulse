# Plan de sincronización automática SAMIT → Supabase

> ## ⚠️ DOCUMENTO HISTÓRICO — EJECUTADO Y SUPERADO (26/07/2026)
> Este plan se escribió con **destino Supabase**. DistriMM salió de Supabase el 26/07/2026 y la
> sincronización se implementó **con destino el PostgreSQL del VPS**. Las seis fases están hechas
> y la carga manual de Excel quedó retirada.
>
> **El estado real y las decisiones vigentes están en `CLAUDE.md`**, sección "Sincronización
> automática desde el ERP SAMIT". Este archivo se conserva porque el mapeo campo a campo, las
> cifras de control y el razonamiento siguen siendo válidos — pero donde diga "Supabase",
> léase "Postgres del VPS", y varias decisiones que aquí figuran como abiertas ya se cerraron
> (dias_mora a 360 días, IVA excluido de la base comisionable, solo 2026 de histórico).

**Fecha:** 24/07/2026
**Estado:** investigación terminada y verificada contra la base real. Listo para decidir e implementar.
**Referencia técnica:** [mapeo-servidor-samit.md](./mapeo-servidor-samit.md)

---

## 1. Qué se elimina

Hoy alguien exporta seis reportes del ERP a `.xls`, los manda por WhatsApp y se suben a mano:

| # | Reporte manual | Fuente en el ERP | Destino |
|---|---|---|---|
| 1 | Listado de Cuentas por Cobrar | `CT_Movimientos` (todas las bases de año) | `cartera_items` + `historial_cargas` |
| 2 | Ventas de Productos por Factura | `IN_Documento` + `IN_Movimiento` | `distrimm_comisiones_ventas` + `distrimm_comisiones_cargas` |
| 3 | SALDO DE PRODUCTOS | `IN_ProdBodega` + `IN_Producto` | `distrimm_inventario_items` + `distrimm_inventario_cargas` |
| 4 | TERCEROS | `G_Clientes` | `distrimm_clientes` |
| 5 | Movimiento de Comprobante RC | `CT_Documentos` + `CT_Movimientos` | `distrimm_comisiones_recaudos` |
| 6 | PDF de contado | `IN_Documento` sin CxC asociada | (ver §3.6) |

Los tres nudos que bloqueaban el diseño quedaron resueltos y verificados; el detalle de cómo se
llegó a cada uno está en el mapa. Resumen:

1. **Detalle de factura** → `IN_Movimiento`, unido por `Documento = IN_Documento.Secuencial`
   (0 huérfanos sobre 23.349 líneas).
2. **Cartera y mora** → agregación de `CT_Movimientos` sobre la cuenta `13050501`
   **uniendo las bases de todos los años**; cuadra al peso con `CT_PlanTerceros`. La mora usa
   convención comercial de 360 días.
3. **Inventario** → `IN_ProdBodega.CantidadFinal` (`IN_Producto.Existencia` está desactualizada
   en el 57% de los productos y **no debe usarse**).

---

## 2. El mayor beneficio: se acaba la duplicación de ventas

### El problema hoy

Los archivos de ventas son **acumulados del mes** (cada carga trae desde el día 1 hasta su fecha)
y sólo se reemplazan cargas de la misma `fecha_ventas`. Un mes termina con ~20 cargas solapadas.

Medido en Supabase el 24/07/2026:

| Métrica | Valor |
|---|---|
| Filas en `distrimm_comisiones_ventas` | **110.107** |
| Filas en la vista `distrimm_ventas_vigentes` | **22.407** |
| Cargas acumuladas | 74 |
| Suma ingenua de `valor_total` | **36.486.375.119 COP** |
| Suma correcta (vista de dedup) | **7.780.616.319 COP** |

**Cualquier agregación directa sobre la tabla infla las ventas 4,69x** y guarda 4,9 veces más
filas de las necesarias. Por eso existe `sql/ventas_vigentes_dedup.sql` y la regla de no agregar
nunca sobre la tabla base.

### Por qué sincronizar desde el ERP lo elimina de raíz

El ERP no tiene acumulados: tiene **líneas de factura con identidad propia y estable**. Cada línea
es `(IN_Movimiento.Documento, IN_Movimiento.Item)` — un entero y un smallint que no cambian nunca.

Sincronizando con **upsert idempotente sobre esa llave**:

- No hay solapamiento: correr la sincronización 1 vez o 50 veces produce exactamente el mismo estado.
- La tabla converge a ~22.400 filas en vez de 110.000 y crece al ritmo real del negocio.
- **`SUM(valor_total)` vuelve a ser correcto sin vista de dedup.**
- Una corrida perdida se recupera sola en la siguiente.

**Cuidado con la llave.** Verificado: **697 combinaciones `(Documento, Producto)` aparecen más de
una vez** — un mismo producto puede repetirse en varias líneas del mismo documento. Y
**`factura` tampoco es única**: una devolución reutiliza el número de la factura original
(`FELE-25197` existe como `VE` y como `DV`). La única llave segura es `(Documento, Item)`.

### Qué pasa con lo ya cargado

Los datos históricos bajo el esquema viejo **no se pueden convertir**: no tienen `Documento`/`Item`,
sólo el número de factura, que no es único. Opciones:

- **Recomendada:** re-sincronizar desde el ERP **todo 2026** (5.039 ventas + 267 devoluciones — es
  poco volumen) hacia la tabla nueva, y conservar la vieja como archivo histórico de solo lectura.
- La vista `distrimm_ventas_vigentes` se mantiene mientras convivan los dos esquemas y se retira
  cuando la tabla histórica deje de consultarse.
- Los años anteriores a 2026 viven en `E0032022..E0032025` y se pueden recuperar igual si se quiere.

> **Decisión pendiente del dueño del negocio:** ¿hasta qué año atrás hay que traer ventas?
> Traer 2022–2025 es factible pero multiplica el volumen y el tiempo de la primera carga.

---

## 3. Mapeo campo a campo

Convenciones: **D** = traducción directa · **C** = cálculo derivado · **L** = lookup a otra tabla.

### 3.1 Cartera → `cartera_items`

Origen: agregación de `CT_Movimientos` + `CT_Documentos` sobre cuenta `13050501`, **uniendo
`E0032022`…`E0032026`**, agrupando por `(Mov_Tercero, Mov_DocDetalle, Mov_Cuota)` y quedándose
con `saldo > 0`.

| Campo destino | Origen | Tipo | Nota |
|---|---|---|---|
| `documento_id` | `Mov_DocDetalle` | D | Número de factura |
| `cuota` | `Mov_Cuota` | D | |
| `tercero_nit` | `Mov_Tercero` | D | |
| `cliente_nombre` | `G_Clientes.NombreTercero` | L | Ya viene formateado por el ERP |
| `fecha_emision` | `MIN(Doc_FechaDoc)` de las líneas débito | C | |
| `fecha_vencimiento` | `MAX(Mov_FecVcto)` | C | |
| `valor_saldo` | `Σ(D) − Σ(C)` | **C** | Núcleo del cálculo |
| `dias_mora` | fórmula 360 días (§3.1.1) | **C** | |
| `estado` | `dias_mora > 0 ? 'VENCIDA' : 'POR VENCER'` | C | |
| `vendedor_codigo` | `CT_FacVentasCred.Vendedor` | L | **Dato nuevo: el Excel no lo trae** |
| `cuenta_contable` | `'13050501'` | D | Constante |
| `nombre_cuenta` | — | — | Hoy siempre `null` |
| `telefono` | `G_Clientes.NumCelular` / `Tel1` | L | **Dato nuevo, mejora los recordatorios** |
| `ciudad` | `G_Municipio.NombreMunicipio` | L | **Dato nuevo** |
| `asesor` | `IN_Vendedor.Nombre` | L | **Dato nuevo** |
| `valor_inicial`, `valor_abonos` | `Σ(D)` y `Σ(C)` | C | **Datos nuevos**, hoy vacíos |

Filtros: `ISNULL(Mov_Anulado,0)=0` y `ISNULL(Doc_Anulado,0)=0`.

**Ganancia lateral:** hoy `vendedor_codigo`, `telefono`, `ciudad`, `asesor`, `valor_inicial` y
`valor_abonos` llegan vacíos porque el Excel no los trae. La sincronización los llena.

#### 3.1.1 Días de mora — decisión abierta

El ERP usa convención comercial de 360 días:

```sql
dias_mora = (YEAR(@corte)-YEAR(venc))*360 + (MONTH(@corte)-MONTH(venc))*30 + (DAY(@corte)-DAY(venc))
```

Verificado contra 10 facturas: coincide en las 10; el `DATEDIFF` calendario se desvía entre 8 y
18 días en deuda antigua. **Puede ser negativo** (factura por vencer).

Pero hay un detalle importante del lado del dashboard: `preprocessItems()` en
[portfolioCalculations.js:26](../../src/utils/portfolioCalculations.js#L26) **sobrescribe**
`dias_mora` recalculándolo desde `fecha_vencimiento` con **días calendario**, y lo trunca con
`Math.max(0, …)`. Es decir, la UI **nunca usa el valor almacenado**.

> **Necesita tu visto bueno.** Propongo guardar el valor del ERP (360 días) para que los números
> cuadren con lo que la oficina ve en SAMIT, y dejar la UI como está. Pero antes hay que revisar
> si algún consumidor **sí** lee la columna directamente — RPCs de score crediticio, análisis CFO,
> tools del MCP — porque ahí sí cambiaría el resultado. **NO VERIFICADO todavía.**

### 3.2 Ventas → `distrimm_comisiones_ventas`

Origen: `IN_Documento` (`TipoDoc IN ('VE','DV')`, `Anulado = 0`) + `IN_Movimiento`.

| Campo destino | Origen | Tipo | Nota |
|---|---|---|---|
| `factura` | `Prefijo + '-' + NumComprobante` | C | `FELE-25252` — **verificado** |
| `tipo` | `IN_Documento.TipoDoc` | D | `VE` / `DV` |
| `fecha` | `IN_Documento.FechaDoc` | D | |
| `vendedor_codigo` | `IN_Documento.Vendedor` | D | Vendedor **del documento** |
| `vendedor_nombre` | `IN_Vendedor.Nombre` | L | |
| `vendedor_nit` | `IN_Vendedor.Identificacion` | L | |
| `cliente_nit` | `IN_Documento.Tercero` | D | |
| `cliente_nombre` | `G_Clientes.NombreTercero` | L | |
| `municipio` | `G_Municipio.NombreMunicipio` vía `G_Clientes.Municipio` | L | |
| `producto_codigo` | `IN_Movimiento.Producto` | D | Normalizar a 5 dígitos con ceros |
| `producto_descripcion` | `IN_Movimiento.ProductoDesc` | D | |
| `cantidad` | `IN_Movimiento.Cantidad` | D | |
| **`valor_total`** | **`VrVenta + VrIva`** | **C** | **Con IVA — verificado** |
| `costo` | `IN_Movimiento.Costo` | D | Ya es el total de la línea |
| `valor_unidad` | `(VrVenta + VrIva) / Cantidad` | C | |
| `precio` | `(VrVenta + VrIva) / Cantidad` | C | Ver nota de descuentos |
| `descuento` | `IN_Movimiento.Descuento` | D | **Siempre 0 en la base** |
| `margen_valor` | `valor_total − costo` | C | |
| `margen_pct` | `margen_valor / valor_total` | C | |

**Verificación del campo crítico.** Factura `FELE-25252`, producto `93149`:

| | Dashboard (Excel) | ERP |
|---|---|---|
| cantidad | 6 | 6 ✅ |
| costo | 131.209,17 | `Costo` = 131.209,17 ✅ |
| **valor_total** | **168.600** | `VrVenta` 160.571,43 + `VrIva` 8.028,57 = **168.600** ✅ |

Esto importa porque `comisionesCalculator.js` suma **`valor_total`** por marca: si se mapeara a
`VrVenta` a secas, todas las comisiones saldrían bajas por el IVA faltante.

**Signo de las devoluciones.** En el ERP las líneas `DV` tienen `VrVenta` **positivo**. El ETL
actual las niega ([ventasUpload.js:49](../../src/utils/ventasUpload.js#L49)). La sincronización
debe hacer lo mismo: `valor_total` y `costo` negativos cuando `tipo = 'DV'`.

**`precio` vs `valor_unidad`:** no hay una sola línea con descuento en toda la base (0 de 23.349),
así que ambos campos son iguales y no se puede distinguir empíricamente cuál era cuál. Si algún
día se activan descuentos habrá que revisarlo. `IN_Movimiento.ListaPrecio` **no** sirve: es el
número de lista de precios (vale 2), no un precio.

**Llave de upsert: `(IN_Movimiento.Documento, IN_Movimiento.Item)`.** Requiere agregar dos
columnas a `distrimm_comisiones_ventas` (`erp_documento int`, `erp_item smallint`) con índice
único. Es el cambio de esquema que hace posible la idempotencia.

### 3.3 Inventario → `distrimm_inventario_items`

Origen: `IN_ProdBodega` + `IN_Producto` + `IN_Marcas` + `IN_Categorias`, filtrando
`CantidadFinal <> 0`.

| Campo destino | Origen | Tipo | Nota |
|---|---|---|---|
| `producto_codigo` | `IN_ProdBodega.CodProducto` | D | Normalizar a 5 dígitos |
| `producto_nombre` | `IN_Producto.Nombre` | L | |
| `bodega` | `IN_ProdBodega.CodBodega` | D | |
| **`cantidad`** | **`IN_ProdBodega.CantidadFinal`** | D | **No usar `IN_Producto.Existencia`** |
| `valor` | `IN_ProdBodega.ValorFinal` | D | |
| `transito` | `IN_ProdBodega.Remisionado` | D | **Vale 0 en las 2.539 filas — confirmar con gerencia** |
| `categoria_codigo` | `IN_Producto.Categoria` | L | |
| `categoria_nombre` | `IN_Categorias.NomCategoria` | L | |
| `marca` | `IN_Marcas.NombreMarca` | L | |
| `ult_compra` | `IN_Producto.UltCompra` | D | `01/01/1900` → `null` |
| `ult_val_compra` | `IN_Producto.UltValCompra` | D | |
| `ult_val_venta` | `IN_Producto.UltValVenta` | D | |
| `precio_medio` | `IN_Producto.CostoPromedio` | D | **Confirmar equivalencia** |

**Verificación:** con el filtro `CantidadFinal <> 0`, la bodega 2 da **122 productos, 5.744
unidades, 22.823.893 COP** en el ERP y **122 / 5.744 / 22.823.893** en el dashboard — coincidencia
exacta al peso. Las demás bodegas difieren sólo por movimiento posterior a la última carga manual.

El filtro de bodegas confiables (1, 5, 6) **se sigue aplicando aguas abajo**, en el RPC de cálculo;
la sincronización guarda todas las bodegas, igual que hoy.

### 3.4 Clientes → `distrimm_clientes`

Origen: `G_Clientes`. Todo traducción directa salvo lo marcado.

| Campo destino | Origen |
|---|---|
| `no_identif` | `Identificacion` (+ `Dv` — **ver pregunta abierta**) |
| `tipo_ident` / `tipo_persona` | `TipoIdentificacion` / `TipoPersona` |
| `primer_nombre` … `segundo_apellido` | `PNombre`, `SNombre`, `PApellido`, `SApellido` |
| `nombre_completo` | **`NombreTercero`** (ya formateado; no concatenar) |
| `direccion`, `barrio` | `Direccion`, `Barrio` |
| `municipio` | `G_Municipio.NombreMunicipio` vía código DANE (**L**) |
| `telefono_1`, `telefono_2`, `celular` | `Tel1`, `Tel2`, `NumCelular` |
| `correo_electronico`, `pagina_web` | `Email`, `WebPage` |
| `cupo_venta`, `cupo_compra` | `VRCupoCredCli`, `VRCupoCredPro` |
| `vendedor_codigo`, `cobrador_codigo` | `VendAsg`, `CobraAsig` |
| `fecha_nacimiento`, `genero`, `estado_civil`, `profesion`, `actividad`, `clasificacion_iva`, `comentario` | homónimos |

Llave de upsert: `no_identif`. **Incremental por `UltimaActualizacion`** — es de las pocas
columnas que sí se actualizan al modificar.

### 3.5 Recaudos → `distrimm_comisiones_recaudos`

Origen: `CT_Documentos` (`Doc_TipoComp = 'RC'`) + `CT_Movimientos` (cuenta `13050501`, `Mov_DC='C'`).
Medido en 2026: **2.346 comprobantes, 3.937 líneas, 5.378.711.374 COP**.

| Campo destino | Origen | Tipo |
|---|---|---|
| `comprobante` | `'RC-' + Doc_IdComp + '-' + Doc_NumDocumento` | C |
| `fecha_abono` | `Doc_FechaDoc` | D |
| `cliente_nit` | `Mov_Tercero` | D |
| `cliente_nombre` | `G_Clientes.NombreTercero` | L |
| `factura` | `Mov_DocDetalle` | D |
| `fecha_vence` | `Mov_FecVcto` | D |
| `valor_recaudo` | `Mov_Valor` | D |
| `fecha_cxc` | fecha del débito original de esa factura | C |
| `vendedor_codigo` | `CT_FacVentasCred.Vendedor` de la factura | L |
| `dias_mora` | 360 días entre `fecha_vence` y `fecha_abono` | C |
| `valor_iva` | ver nota | C |
| `origen` | `'RC'` | D |
| `periodo_year`, `periodo_month` | de `fecha_abono` | C |

El `valor_iva` hoy se estima prorrateando por el peso de los productos gravados
([recaudoUpload.js:98](../../src/utils/recaudoUpload.js#L98)). Desde el ERP se puede calcular con
el IVA real de la factura (`IN_Documento.ValIva` y `IN_Movimiento.TipoIva`), lo que **mejora la
precisión** respecto del método actual.

> **Hallazgo aprovechable:** el ERP expone `dbo.DeterminarBasePagoComisionVendedor(@VrAbono,
> @VrVenta, @VrIVA, @SaldoAntesAbono) → money`, que es **su propia regla** de base comisionable por
> recaudo. Está cifrada pero es invocable. Vale la pena contrastarla contra
> `comisionesCalculator.js` antes de replicar lógica a mano. **NO VERIFICADO todavía.**

Llave de upsert: `(Doc_Secuencial, Mov_Item)`.

### 3.6 Contado

`FormaPago` está vacío en las 5.039 ventas, así que no distingue nada. La modalidad se deriva de
si la venta generó cuenta por cobrar:

| Modalidad | Facturas | Valor con IVA |
|---|---|---|
| Crédito (aparece en `CT_FacVentasCred`) | 3.315 | 5.997.332.281 |
| **Contado** | **1.724** | **457.068.747** |

No hay hoy una tabla destino para esto. **Pregunta abierta:** ¿basta con una columna
`es_contado boolean` en `distrimm_comisiones_ventas` (mi recomendación: es lo más simple y deja
el dato disponible para cualquier reporte), o se quiere un dataset aparte?

---

## 4. Estrategia de sincronización

### El problema de fondo

Verificado: **no hay `rowversion` en ninguna tabla y Change Tracking está desactivado**. Y lo más
importante: **`FechaSys` / `Doc_FechaSistema` son marcas de inserción que NO se actualizan al
modificar ni al anular** (probado: documento `29456` con `FechaSistema` 06/05 y `FecAnula` 25/06).

> Una sincronización puramente incremental **perdería anulaciones y ediciones de documentos
> viejos**. Una factura anulada la semana pasada seguiría contando como venta para siempre.

No podemos arreglarlo en el origen: activar Change Tracking sería escribir en el ERP, lo cual está
prohibido.

### Solución: ventana móvil de reproceso + upsert idempotente

Cada dataset se reprocesa completo dentro de una ventana lo bastante amplia como para capturar
correcciones, y el upsert idempotente hace que repetir trabajo sea inofensivo.

| Dataset | Estrategia | Llave de upsert | Frecuencia |
|---|---|---|---|
| **Cartera** | **Full** — se recalcula el estado completo (661 filas) | `(documento_id, cuota, tercero_nit)` | cada 2 h |
| **Ventas** | Ventana móvil **90 días** + full mensual | `(erp_documento, erp_item)` | cada 2 h |
| **Recaudos** | Ventana móvil **90 días** + full mensual | `(erp_documento, erp_item)` | cada 2 h |
| **Inventario** | **Full** (2.539 filas) | `(producto_codigo, bodega)` | cada 2 h |
| **Clientes** | Incremental por `UltimaActualizacion` + full semanal | `no_identif` | diario |
| **Vendedores / marcas / categorías** | Full (17 / 253 / 47 filas) | `codigo` | diario |

Los volúmenes son pequeños: la cartera completa son 661 filas y el inventario 2.539. **Hacer full
es más barato que razonar sobre deltas**, y elimina toda una clase de errores.

Para ventas, la ventana de 90 días cubre el reproceso de anulaciones tardías; el full mensual del
año en curso (5.306 documentos) cierra cualquier hueco restante y corre de madrugada… salvo que el
servidor esté apagado (§5). En la práctica conviene programarlo el primer sábado del mes en horario
laboral, aprovechando que el volumen es bajo.

### Detección de borrados

Tres mecanismos distintos, según el caso:

1. **Anulaciones** (lo normal en el ERP): el documento sigue existiendo con `Anulado = 1`. Se
   detecta al reprocesar la ventana. En destino se marca `deleted_at` o se borra la fila.
2. **Cartera saldada**: una factura que se paga deja de tener saldo > 0. Como la cartera se
   sincroniza **full**, basta con reemplazar el conjunto completo dentro de una transacción.
3. **Borrado físico** (raro): sólo lo detecta el full. Es el argumento principal para conservar
   el full mensual.

### Reconciliación automática

Cada corrida compara contra las cifras de control del propio ERP y registra el resultado:

| Dataset | Cifra de control |
|---|---|
| Cartera | `SUM(CT_PlanTerceros.SaldoFinal) WHERE Cuenta='13050501'` |
| Ventas | `SUM(IN_Documento.Valor + ValIva)` por mes vs suma de líneas sincronizadas |
| Inventario | `SUM(IN_ProdBodega.ValorFinal)` por bodega |

Si la diferencia supera un umbral (propongo 1.000 COP por redondeos), la corrida se marca como
**sospechosa** y no se apaga la carga manual. Esta comprobación es barata y es la mejor defensa
contra un cambio silencioso de versión del ERP.

---

## 5. Dónde corre el agente

**Recomendación: en el propio servidor de la oficina.**

| | En el servidor `SERVER` | En el VPS vía Tailscale |
|---|---|---|
| Conexión a SQL | Local, sin exponer nada | Hay que abrir SQL Server al túnel |
| Superficie de ataque | Mínima | Mayor: SQL Server accesible por red |
| Dependencia del túnel | Sólo para administrarlo | **Total** — si cae el túnel, no hay datos |
| Runtime | `node v24.18.0` ya instalado | Ya hay Node en el VPS |
| Disponibilidad | Sólo con la oficina abierta | 24/7, pero inútil si el origen está apagado |
| Despliegue | Requiere SSH al equipo | Más cómodo |

El argumento decisivo es que **el servidor se apaga al cerrar la oficina** (arrancó hoy a las
07:50). Correr el agente en el VPS no compra disponibilidad: si el origen está apagado, no hay nada
que leer. Y sí añade una dependencia (el túnel) y una superficie de ataque (SQL Server expuesto).

Además la restricción de solo lectura se refuerza sola: con Integrated Security bajo un usuario de
Windows dedicado, el agente no necesita credenciales de SQL guardadas en ningún archivo.

**Contrapartida honesta:** desplegar y ver logs exige entrar por SSH al equipo de la oficina, que
sólo está disponible en horario laboral. Se compensa enviando los logs a Supabase (§7).

**No se propone instalar software nuevo.** Node y npm ya están. El agente sería un proyecto Node
en `C:\distrimm-sync\` con `tedious` (driver SQL puro JS, sin dependencias nativas) y
`@supabase/supabase-js`. Ambos se instalan con `npm install` desde el registro público — **si eso
cuenta como instalar software para efectos de la política, avísame antes y lo confirmamos.**

---

## 6. Cómo se dispara

La oficina apaga el servidor al cerrar, así que no sirve un cron nocturno. Tarea programada de
Windows con **dos disparadores**:

```
Disparador 1: al iniciar el sistema, con 2 minutos de retraso
Disparador 2: cada 2 horas, indefinidamente
Configuración:
  - Ejecutar tanto con sesión iniciada como sin ella
  - NO despertar el equipo (respeta el apagado de la oficina)
  - Si la tarea ya está corriendo, no lanzar otra instancia
  - Detener si corre más de 30 minutos
```

Con upserts idempotentes, **una corrida perdida no requiere intervención**: la siguiente recalcula
el estado completo. Un fin de semana entero sin encender el equipo se recupera solo el lunes a las
07:52.

Ventana de 2 horas: los reportes manuales se suben una vez al día, así que 2 horas ya es una mejora
grande, y mantiene la carga sobre un SQL Express modesto en algo despreciable. Todas las consultas
van con `WITH (NOLOCK)` para no bloquear a la oficina.

---

## 7. Observabilidad

> Sin una marca visible de "última sincronización exitosa", un agente caído se ve **exactamente
> igual** que un día sin ventas. Esto no es opcional.

### Tabla de estado

```sql
CREATE TABLE distrimm_sync_estado (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset         text NOT NULL,              -- cartera | ventas | inventario | clientes | recaudos
  inicio          timestamptz NOT NULL,
  fin             timestamptz,
  estado          text NOT NULL,              -- ok | error | parcial | sospechoso
  filas_leidas    integer,
  filas_escritas  integer,
  control_erp     numeric,                    -- cifra de control del ERP
  control_destino numeric,                    -- lo que quedó en Supabase
  diferencia      numeric,
  mensaje_error   text,
  duracion_ms     integer
);
```

El agente escribe una fila por dataset y corrida. Como Supabase es la única pieza siempre
disponible, **el log vive ahí y no en el servidor** — así se puede diagnosticar sin SSH.

### En el dashboard

1. **Indicador permanente en el header**: punto verde/ámbar/rojo con "Sincronizado hace N minutos".
   - Verde: última corrida `ok` hace < 3 h
   - Ámbar: entre 3 h y 24 h, **o** estado `sospechoso` (la reconciliación no cuadró)
   - Rojo: > 24 h en día hábil, o última corrida con `error`
2. **Ámbar por defecto fuera de horario**: entre las 7pm y las 8am, y los domingos, el estado
   esperado es "sin sincronizar" y no debe alarmar. El indicador debe distinguir *"apagado como
   siempre"* de *"roto"*, o la gente aprende a ignorarlo.
3. **Panel de detalle** en Configuración con las últimas 50 corridas y sus diferencias de
   reconciliación.
4. **Alerta por WhatsApp** a gerencia si en día hábil pasan más de 4 horas sin corrida exitosa —
   reutilizando la infraestructura de mensajería que ya existe.

---

## 8. Manejo de errores

**Principio: nunca dejar un dataset a medias.** Cada dataset se sincroniza en su propia
transacción lógica y son independientes entre sí — si falla inventario, cartera igual se actualiza.

- **Lectura de SQL Server**: 3 reintentos con backoff exponencial (2s, 8s, 30s). Si falla, se
  aborta ese dataset, se registra `error` y se sigue con el siguiente.
- **Escritura a Supabase**: por lotes de 500 filas. Si un lote falla a mitad de camino, el upsert
  idempotente permite **reintentar el lote completo sin duplicar**. Tras 3 fallos se aborta el
  dataset y se marca `parcial` — el indicador se pone rojo y la siguiente corrida rehace todo.
- **Datasets full (cartera, inventario)**: escribir a una tabla temporal y hacer el swap al final,
  de modo que el dashboard nunca vea un estado intermedio. Nunca borrar primero e insertar después.
- **Reconciliación fallida**: los datos se escriben igual, pero la corrida queda como
  `sospechoso` y la carga manual **no se apaga**.
- **Timeout global**: 30 minutos. Un cuelgue no puede dejar la tarea trabada hasta el otro día.

Todo error se registra con contexto (dataset, fase, consulta) en `distrimm_sync_estado`.

---

## 9. Seguridad

### Usuario de SQL de solo lectura

El agente **no debe correr con permisos de escritura sobre el ERP**. Esto exige crear un login en
SQL Server, lo que **es una escritura sobre el servidor** — fuera de lo que puedo hacer sin tu
autorización. Lo dejo propuesto:

```sql
-- REQUIERE TU APROBACIÓN. No ejecutado.
CREATE LOGIN distrimm_sync WITH PASSWORD = '<generada, guardada en gestor>';
-- en cada base de año E0032022..E0032026:
CREATE USER distrimm_sync FOR LOGIN distrimm_sync;
ALTER ROLE db_datareader ADD MEMBER distrimm_sync;
GRANT EXECUTE ON dbo.SaldoDocumento TO distrimm_sync;               -- si se usa
GRANT EXECUTE ON dbo.DeterminarBasePagoComisionVendedor TO distrimm_sync;
```

**Alternativa sin tocar SQL Server:** correr la tarea programada bajo una **cuenta de Windows
dedicada** con Integrated Security. Requiere igualmente concederle acceso de lectura a las bases,
así que tampoco es gratis. Mi recomendación es el login dedicado: es explícito, auditable y su
alcance se ve de un vistazo.

**Mientras tanto, nada de `sa`.** La contraseña de `sa` está en texto plano en
`Samit_Ejecuta_BackupSQLCMD.bat` y **debe rotarse** (riesgo #2 del mapa). No se usó en esta
investigación.

### Credenciales de Supabase en el servidor

El agente necesita la `service_role` key (los upserts saltan RLS).

- En `C:\distrimm-sync\.env`, **fuera de cualquier carpeta sincronizada a OneDrive** — el equipo
  tiene OneDrive activo y una clave de servicio en la nube personal de alguien sería un problema serio.
- ACL restringida a la cuenta que ejecuta la tarea y a Administradores.
- Nunca en el repositorio.
- Conviene una `service_role` **distinta de la que usa el VPS**, para poder revocarla sola.

---

## 10. Plan de corte

Regla: **la carga manual no se apaga hasta que los números cuadren solos durante dos semanas.**

### Fase de convivencia

Ambos mecanismos escriben. Para no pisarse, cada fila lleva `origen` (`'manual'` | `'erp'`) —
`distrimm_comisiones_recaudos` y `distrimm_comisiones_cargas_recaudo` **ya tienen esa columna**,
así que el patrón ya existe en el proyecto y sólo hay que extenderlo.

Durante la convivencia el dashboard sigue leyendo lo manual; lo sincronizado se acumula en paralelo
y sólo se usa para comparar.

### Validación

Comparar contra un **mes cerrado** (junio 2026), no contra el mes en curso:

1. **Cartera**: total y conteo de ítems contra un corte ya cargado. Ya validado para el 24/07 —
   661 vs 660 ítems y 1.260.707.059 vs 1.262.277.327 COP, con la diferencia explicada por las
   horas transcurridas entre la exportación y la consulta.
2. **Ventas**: `SUM(valor_total)` de junio desde el ERP contra `distrimm_ventas_vigentes` del mismo
   mes. **Ojo: hay que comparar contra la vista, nunca contra la tabla base**, o la diferencia
   será de 4,69x por la duplicación.
3. **Inventario**: por bodega. Ya validado en la bodega 2 — coincidencia exacta al peso.
4. **Comisiones**: correr `fn_calcular_comisiones` sobre datos manuales y sobre sincronizados para
   junio; el resultado por vendedor debe ser idéntico. **Esta es la prueba que de verdad importa**,
   porque de ahí sale plata que se le paga a gente.

Criterio de aprobación: diferencia menor a 1.000 COP en cada dataset durante **dos semanas
seguidas**.

### Apagado

Dataset por dataset, en el orden de la §11 — no todo de golpe. Para cada uno: se retira el botón de
carga del modal, se deja la ruta de importación viva un mes más por si hay que volver atrás, y
recién después se elimina.

---

## 11. Fases de implementación

Ordenadas por valor sobre riesgo. Se empieza por lo más simple y verificable.

### Fase 0 — Preparación (sin escribir datos)

- Crear el login de solo lectura (**requiere tu aprobación**, §9).
- Crear `distrimm_sync_estado`.
- Agregar `erp_documento` / `erp_item` a `distrimm_comisiones_ventas` y
  `distrimm_comisiones_recaudos`, con índice único.
- Agregar `origen` donde falte.
- Esqueleto del agente: conexión, logging, reconciliación, **sin escribir a producción**.

### Fase 1 — Catálogos (riesgo mínimo, valor inmediato)

`IN_Vendedor` (17), `IN_Marcas` (253), `IN_Categorias` (47) → `distrimm_vendedores`,
`distrimm_productos_catalogo`.

Volumen ridículo, sin cálculos derivados, sin dependencias. Es el dataset ideal para validar
el andamiaje completo — tarea programada, upsert, logging, indicador en el dashboard —
antes de tocar nada que importe.

### Fase 2 — Inventario

`IN_ProdBodega` + `IN_Producto` → `distrimm_inventario_items`. 2.539 filas, full, sin cálculos
más allá de lookups. **Ya validado contra la bodega 2 al peso.** Alimenta el módulo Sugerido, que
no mueve dinero: si algo sale mal, el daño es acotado.

### Fase 3 — Clientes

`G_Clientes` → `distrimm_clientes`. Estrena la sincronización incremental por
`UltimaActualizacion`. Trae de regalo teléfonos y municipios que hoy llegan vacíos, lo que mejora
directamente los recordatorios de WhatsApp.

### Fase 4 — Cartera

El dataset de mayor valor diario y el que más cálculo derivado tiene. Ya está **verificado fila por
fila** contra el dashboard, incluida la convención de 360 días. Requiere cerrar antes la decisión
sobre `dias_mora` (§3.1.1).

Aporta además `vendedor_codigo`, `telefono`, `ciudad`, `asesor`, `valor_inicial` y `valor_abonos`,
que hoy están vacíos.

### Fase 5 — Ventas

La fase de mayor valor **y** mayor riesgo: de aquí salen las comisiones. Es la que mata el problema
de duplicación (§2). Incluye migrar el histórico de 2026 y validar comisiones de junio contra el
cálculo actual antes de apagar nada.

### Fase 6 — Recaudos y contado

Recaudos cierra el ciclo de comisiones. Aquí conviene evaluar
`DeterminarBasePagoComisionVendedor` antes de replicar reglas a mano. El contado (1.724 facturas,
457 millones) elimina el último reporte manual.

### Fase 7 — Retiro

Apagar las cargas manuales dataset por dataset y retirar `distrimm_ventas_vigentes` cuando la
tabla histórica deje de consultarse.

---

## 12. Decisiones que necesitan tu visto bueno

1. **Crear el login de solo lectura en SQL Server** — es la única escritura sobre el ERP que
   propone este plan. Sin esto el agente tendría que correr con credenciales más amplias de las
   que debería.
2. **Convención de `dias_mora`** (§3.1.1): guardar el valor del ERP (360 días) o días calendario.
   Hay que revisar antes si los RPCs de score crediticio y CFO leen esa columna directamente.
3. **Cuántos años de ventas migrar**: sólo 2026, o también 2022–2025.
4. **Contado**: columna `es_contado` en la tabla de ventas (mi recomendación) o dataset aparte.
5. **`npm install` de dos dependencias** (`tedious`, `@supabase/supabase-js`) en el servidor —
   confirmar si cuenta como "instalar software" para efectos de la política.
6. **Ventana de 2 horas**: confirmar que es suficiente para gerencia, o si se quiere más frecuente.

### Preguntas para el dueño del negocio

- **`transito`**: `IN_ProdBodega.Remisionado` vale 0 en las 2.539 filas. ¿El negocio no usa
  remisiones, o el tránsito del Excel salía de otro lado?
- **`precio_medio`**: ¿equivale a `IN_Producto.CostoPromedio`? Con descuentos siempre en 0 no se
  puede confirmar por datos.
- **Vendedor de la cartera**: para la factura 25154 el vendedor del documento es `14` pero el
  asignado al cliente (`VendAsg`) es `6`. ¿Cuál manda para efectos de cartera y comisiones?
- **`no_identif`**: ¿debe incluir el dígito de verificación (`Dv`)? Hoy el cruce con
  `cartera_items.tercero_nit` se hace sin él.
- **Bodegas confiables**: ¿siguen siendo 1, 5 y 6? Las bodegas 3 y 4 suman 303 millones en
  inventario que hoy se ignoran.

---

## 13. Riesgos del proyecto

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Actualización del ERP cambia el esquema | Alto | Reconciliación automática por corrida (§4); falla ruidosamente en vez de callar |
| Anulación tardía fuera de la ventana de 90 días | Medio | Full mensual del año en curso |
| El equipo se apaga a mitad de corrida | Bajo | Upsert idempotente; la siguiente corrida rehace todo |
| **Fallo del SSD** (riesgo #1 del mapa) | **Crítico** | **Ajeno a este proyecto pero más urgente que él.** Supabase pasaría a ser una copia parcial de los datos del ERP — un efecto colateral útil, pero **no es un respaldo contable** |
| Funciones cifradas del ERP cambian de lógica | Medio | No depender de ellas para cartera; el cálculo explícito ya cuadra al peso |
| Carga sobre SQL Express en horario laboral | Bajo | `WITH (NOLOCK)`, volúmenes pequeños, cada 2 h |

> El riesgo del disco único merece una decisión aparte y probablemente antes que este proyecto:
> hoy la contabilidad de la empresa y todos sus respaldos viven en el mismo SSD.
