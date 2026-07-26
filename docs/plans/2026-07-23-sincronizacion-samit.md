# Sincronización automática SAMIT SQL → Supabase

**Fecha:** 23/07/2026
**Estado:** mapeo en curso — lado destino confirmado, lado origen pendiente de verificar columnas

## Objetivo

Eliminar la carga manual de Excel. Hoy alguien exporta seis reportes del ERP, los manda por
WhatsApp y se suben a mano al dashboard. Con acceso directo a la base del ERP, los datos
pueden viajar solos.

## Acceso al origen

PC servidor de la oficina (`SERVER`, Windows 11 Pro), alcanzable por `ssh distrimm` sobre
Tailscale. ERP **SAMIT SQL** sobre **SQL Server 2017**, instancia `.\SAMIT`.

Una base por empresa y por año. **DistriMM es la empresa `E003`; la base viva es `E0032026`**
(~1.9 GB, 229 tablas). La instancia `.\SAMITNEW` está vacía y no se usa.

## Mapeo origen → destino

Los campos destino salen de `src/utils/*Upload.js` y `src/utils/excelETL.js` (confirmados).
Las tablas origen salen del conteo de filas de `E0032026` (confirmadas); **las columnas exactas
están pendientes** de volcar — el servidor se apagó a mitad del inventario.

| Dataset | Reporte Excel que reemplaza | Tabla(s) origen | Destino en Supabase | Campos destino |
|---|---|---|---|---|
| Cartera | Listado de Cuentas por Cobrar | `CT_FacVentasCred` (3.881) | `cartera_items` | `cliente_nombre`, `documento_id`, `fecha_emision`, `fecha_vencimiento`, `dias_mora`, `valor_saldo`, `estado`, `vendedor_codigo`, `tercero_nit`, `cuenta_contable`, `cuota` |
| Clientes | TERCEROS | `G_Clientes` (2.178) | `distrimm_clientes` | `no_identif`, `tipo_ident`, nombres/apellidos, `fecha_nacimiento`, `direccion`, `telefono_1/2`, `celular`, `correo_electronico`, `cupo_venta`, `cupo_compra`, `barrio`, `municipio`, `vendedor_codigo`, `cobrador_codigo` |
| Ventas | Ventas de Productos por Factura | `IN_Documento` (7.494) + `IN_DocumentoTran` (27.550) | `distrimm_comisiones_ventas` | `vendedor_codigo/nit/nombre`, `producto_codigo`, `producto_descripcion`, `cliente_nit`, `cliente_nombre`, `municipio`, `fecha`, `factura`, `precio`, `descuento`, `valor_unidad`, `cantidad`, `valor_total`, `costo`, `tipo` |
| Recaudo | Movimiento de Comprobante RC | `CT_Movimientos` (53.323) | recaudos | `comprobante`, `fecha_abono`, `cliente_nit`, `cliente_nombre`, `factura`, `fecha_cxc`, `fecha_vence`, `vendedor_codigo`, `valor_recaudo`, `dias_mora` |
| Inventario | SALDO DE PRODUCTOS | `IN_ProdBodega` (2.533) + `IN_Producto` (4.373) + `IN_Marcas` (253) + `IN_Categorias` (47) | inventario / sugerido | `producto_codigo`, `producto_nombre`, `bodega`, `cantidad`, `valor`, `transito`, `categoria_codigo`, `categoria_nombre`, `marca`, `ult_compra`, `ult_val_compra`, `ult_val_venta`, `precio_medio` |
| Vendedores | — | `IN_Vendedor` (17) | `distrimm_vendedores` | código, nombre, NIT |

## Beneficio lateral: se acaba el problema de deduplicación

Hoy los archivos de ventas son **acumulados del mes** (cada carga trae del día 1 hasta su fecha),
y solo se reemplazan cargas de la misma `fecha_ventas`. Un mes termina con ~20 cargas solapadas y
cualquier agregación global multiplica los totales ~10x — por eso existe la vista
`distrimm_ventas_vigentes` (ver `sql/ventas_vigentes_dedup.sql`) y la regla de no agregar nunca
sobre `distrimm_comisiones_ventas` directo.

Leyendo de la base del ERP ese problema **desaparece de raíz**: se sincroniza por factura, con su
identificador propio, en modo upsert. No hay acumulados ni solapamiento. La vista de dedup seguiría
haciendo falta solo para los datos históricos ya cargados.

## Arquitectura propuesta

El servidor ya tiene **node v24.18.0** instalado, así que el agente puede correr ahí mismo:

```
SQL Server (E0032026)  ──lectura──>  agente node en el PC servidor
                                            │
                                            ├── transforma al esquema del dashboard
                                            └── upsert a Supabase (service_role) cada N horas
```

Ventajas de correrlo en el propio servidor: no hay que exponer SQL Server a la red, la conexión
es local, y si el túnel se cae la sincronización sigue funcionando (solo se pierde la
administración remota, no los datos).

Alternativa: correrlo desde el VPS a través de Tailscale. Más centralizado y más fácil de
mantener, pero depende de que el túnel esté arriba. La latencia medida (4.5 ms) lo permite sin
problema.

## Correcciones al mapeo (24/07/2026, columnas ya verificadas)

Al volcar las columnas reales aparecieron tres cosas que invalidan supuestos del mapeo inicial:

1. **`IN_DocumentoTran` NO es el detalle de la factura.** Sus columnas (`Secuencial`,
   `SecDocumento`, `Transaccion`, `Sesion`, `Version`) son un log de auditoría, no líneas de
   venta. El detalle real es casi seguro **`IN_Movimiento`** (23.244 filas) — falta confirmarlo.
2. **`CT_FacVentasCred` no alcanza para la cartera.** Tiene `NumDoc`, `Cuota`, `Tercero`,
   `Vendedor`, `VrVenta`, `VrIva`, `Cobrador`, pero **no tiene saldo pendiente, fecha de
   vencimiento ni días de mora** — que es justo lo que el dashboard necesita. El saldo vivo hay
   que derivarlo cruzando con `CT_Movimientos` (los abonos) o encontrar la vista que use el ERP
   para su "Listado de Cuentas por Cobrar".
3. **`IN_ProdBodega` guarda buckets mensuales**, no un stock plano: `CantD01..CantD12` /
   `CantC01..CantC12` (débitos y créditos por mes) más `CantidadFinal` / `ValorFinal`. La
   existencia actual sale de `CantidadFinal`, no de una columna `Cantidad`.

Columnas confirmadas que sí calzan directo:
- `G_Clientes`: `Identificacion`+`Dv` → `no_identif`, `PNombre`/`SNombre`/`PApellido`/`SApellido`,
  `Direccion`, `Tel1`, `Tel2`, `NumCelular`, `Email`, `Municipio`, `Barrio`, `VRCupoCredCli`,
  `VendAsg` (vendedor asignado), `Genero`, `TipoPersona`, `ClasificacionIVA`.
- `IN_Producto`: `codigo`, `Nombre`, `Marca`, `Categoria`, `UltCompra`, `UltValCompra`,
  `UltValVenta`, `CostoPromedio`, `PrecioVenta`, `Existencia`.
- `IN_Vendedor`: `CodVendedor`, `Identificacion`, `Nombre`, `Zona`, `PorcVentas`.
- `IN_Marcas`: `CodigoMarca`, `NombreMarca`. `IN_Categorias`: `CodCategoria`, `NomCategoria`.
- `IN_Documento` (cabecera de factura): `NumComprobante`, `FechaDoc`, `Tercero`, `Vendedor`,
  `TotalMov`, `ValIva`, `FechaVencimiento`, `Anulado`, `FormaPago`, `TipoDoc`, `CUFE`,
  `BdDevolucion`/`DocDevolucion` (para distinguir devoluciones = tipo DV).

## Estado de los backups (verificado 24/07/2026)

**Sí se ejecutan y son válidos.** La tarea `COPIA SAMIT` corre **a las 3:00pm** (en horario
laboral, por eso el apagado nocturno nunca la afectó) y `msdb` confirma respaldos completos:
`E0032026` de 1.6 GB el 23/07 a las 15:00. Van a `D:\COPIASAMIT\` con rotación por día de la
semana (`thursdayE0032026_PM.bak`) — 7 días de historial, 144 archivos, 41.6 GB en total.

La tarea `copia SAMITNEW` falla (código `3221225786` = proceso terminado), pero respalda la
instancia que no se usa, así que no es crítico.

### Riesgo crítico: un solo disco, sin copia fuera

`C:` y `D:` son **particiones del mismo disco físico** (un único SSD KIOXIA de 477 GB,
`DiskNumber 0`). Los backups viven en el mismo disco que las bases que respaldan. No hay disco
externo, ni unidad de red, ni sincronización a la nube — el script de backup escribe en
`D:\COPIASAMIT\` y termina ahí.

Si ese SSD falla, se pierden **simultáneamente** la contabilidad de la empresa y todos sus
respaldos. Es el riesgo más grave detectado y es independiente del proyecto de sincronización.

### Credencial expuesta

`C:\Program Files (x86)\SamitSQL\Samit_Ejecuta_BackupSQLCMD.bat` contiene la contraseña del
usuario `sa` de SQL Server **en texto plano**. Cualquiera con acceso al equipo la lee y obtiene
control total de todas las bases contables. Conviene rotarla y guardarla fuera del `.bat`.

## Pendientes antes de escribir código

1. **Volcar las columnas** de las 10 tablas y confirmar el mapeo campo a campo. Los sospechosos
   de no ser traducción directa: el cálculo de `dias_mora` y el de comisiones.
2. Confirmar cómo se relacionan `IN_Documento` e `IN_DocumentoTran` (cabecera/detalle de factura)
   y dónde vive el `tipo` de documento (VE = venta, DV = devolución).
3. Definir la ventana de sincronización (¿incremental por fecha de modificación, o full upsert
   del año en curso?).
4. Verificar que exista un usuario de SQL de solo lectura, o crear uno — el agente no debe correr
   con permisos de escritura sobre el ERP.

## Riesgos operativos detectados

- **El PC se apaga.** Se cayó de la red a los pocos minutos de salir de la oficina. Si se apaga a
  diario, el agente solo sincroniza en horario laboral — aceptable, pero hay que saberlo. Conviene
  revisar si alguien lo apaga a propósito o si fue algo puntual.
- **El firewall de Windows está apagado.** El puerto 22 es visible desde toda la LAN pese a la
  regla que lo restringe a Tailscale. Encenderlo exige crear antes reglas para las instancias de
  SQL Server (puertos dinámicos) y el SQL Browser, o la oficina pierde el ERP.
- **Tarea programada `\Activation-Renewal`** ejecutando `Activation_task.cmd`, con pinta de
  activador no oficial de Windows/Office.
- **La llave del nodo en Tailscale expira el 19/01/2027** salvo que se marque "Disable key expiry".
