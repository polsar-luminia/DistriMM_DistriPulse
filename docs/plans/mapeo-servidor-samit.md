# Mapa del servidor SAMIT y su base de datos

**Última verificación:** 24/07/2026
**Alcance:** referencia permanente del servidor de la oficina, del ERP SAMIT SQL y de la base
`E0032026`. Todo lo que aparece aquí fue consultado contra la base real; lo que no se pudo
confirmar está marcado explícitamente como **NO VERIFICADO**.

> **Regla de oro:** este servidor es de **solo lectura** para nosotros. No se escribe, no se crean
> objetos, no se altera configuración del ERP. La oficina trabaja contra él de lunes a sábado,
> ~8am a 7pm.

---

## 1. Inventario del servidor

| Dato | Valor (verificado 24/07/2026) |
|---|---|
| Hostname | `SERVER` |
| Modelo | Lenovo `13DG000TLD` |
| CPU | 13th Gen Intel Core i7-13620H |
| RAM | 15.6 GB |
| SO | Windows 11 Pro, build 26200 |
| Último arranque | 24/07/2026 07:50:47 |
| Disco físico | **1 solo SSD** KIOXIA `KBG6AZNV512G` — 477 GB, `HealthStatus=Healthy` |
| Partición `C:` | 153.8 GB total / 49.1 GB libre |
| Partición `D:` | 322.2 GB total / 267.1 GB libre |
| Red LAN | `192.168.10.0/24`, servidor en `.150` |
| Acceso remoto | Tailscale → `100.98.122.80` |
| Runtime | `node v24.18.0`, `npm 11.16.0` |

### Acceso

```bash
ssh distrimm
```

Alias en `~/.ssh/config` → `100.98.122.80`, usuario `GERENCIA DISTRI MM`, llave
`~/.ssh/id_distrimm_servidor`, sobre Tailscale.

**El shell por defecto es `cmd.exe`, no PowerShell.** Para evitar problemas de comillas conviene
enviar los comandos codificados:

```bash
#!/bin/bash
CMD=$(cat)
B64=$(printf '%s' "$CMD" | iconv -t UTF-16LE | base64 | tr -d '\n')
ssh distrimm "powershell -NoProfile -NonInteractive -EncodedCommand $B64"
```

Filtrar el ruido de PowerShell remoto con `| grep -v CLIXML | grep -v "^<Objs"`.

**Límite importante:** `cmd.exe` corta la línea de comandos alrededor de los 8.191 caracteres.
Una consulta SQL larga codificada en base64 revienta ese límite (`La línea de comandos es
demasiado larga`). Para consultas grandes hay que **subir el `.sql` por `scp`** y leerlo desde
PowerShell con `Get-Content -Raw`, en vez de incrustarlo en el comando.

### Conexión a SQL Server

Desde la sesión SSH, con **Integrated Security** (el usuario de la sesión ya tiene acceso):

```powershell
$c = New-Object System.Data.SqlClient.SqlConnection(
  "Server=.\SAMIT;Database=E0032026;Integrated Security=True;Connect Timeout=15")
```

### Servicios

| Servicio | Estado |
|---|---|
| `MSSQL$SAMIT` | Running — **instancia real** |
| `MSSQL$SAMITNEW` | Running — instancia vacía, no se usa |
| `SQLBrowser` | Running |

### Rutas del ERP

- Instalación: `C:\Program Files (x86)\SamitSQL\`
- Backups: `D:\COPIASAMIT\`
- Script de backup: `C:\Program Files (x86)\SamitSQL\Samit_Ejecuta_BackupSQLCMD.bat`

### Motor

```
Microsoft SQL Server 2017 (RTM) 14.0.1000.169 (X64) — Express Edition
```

> **Express Edition** impone límites relevantes: 10 GB por base de datos, 1.4 GB de RAM para el
> buffer pool y 4 cores. `E0032026` pesa ~1.9 GB, así que hay margen, pero el límite de 10 GB es
> un techo real a futuro y la memoria disponible es poca — una razón más para no lanzar consultas
> pesadas en horario laboral.

### Energía y encendido remoto (auto-wake) — configurado 25/07/2026

Detalle operativo completo en la memoria [[servidor-samit-energia]]. Resumen:

- **La oficina apaga el equipo al cerrar** (~12 m sábado, ~7 pm L–V). Sin acceso físico, la única
  vía de reencendido remoto es la **alarma RTC del BIOS**.
- **No se suspende solo:** `sleep AC = 0` (nunca); solo apaga la pantalla a los 15 min. Solo
  soporta S0 Modern Standby (no S3, no hibernación). Si nadie lo apaga a mano, sigue vivo.
- **Sin contraseña de BIOS** (`Lenovo_BiosPasswordSettings.PasswordState = 0`): arranca sin pedir
  clave, y la config del BIOS se lee/escribe por WMI **sin password**
  (`Lenovo_BiosSetting` / `Lenovo_SetBiosSetting` / `Lenovo_SaveBiosSettings`).
- **Auto-encendido activo:** BIOS `WakeUponAlarm = Daily Event`, `AlarmTime = 15:00`.
  **Verificado:** el 25/07/2026 encendió solo a las `15:00:14`. Entre semana ya está encendido a
  esa hora (inofensivo); el efecto real es prenderlo sáb/dom. La sincronización automática debe
  apoyarse en esta alarma (arranque a las 15:00) + reintentos idempotentes.
- **Wake-on-LAN NO sirve remoto:** el magic packet es broadcast L2 y Tailscale no lo transporta;
  el server es el único nodo Tailscale en la LAN. La vía real es la alarma del BIOS, no WoL.
- **Servicios críticos en arranque `Auto`** (levantan sin login tras el auto-encendido):
  `sshd`, `Tailscale`, `MSSQL$SAMIT`, `SQLBrowser`. Verificado 25/07/2026.
- **Bache de Tailscale al arrancar:** el pong entra `via DERP` con "direct connection not
  established" unos minutos → SSH puede dar timeout aunque el equipo ya esté encendido. La prueba
  en vivo es `tailscale ping`, no el estado verde de la app.

Cambiar la alarma por WMI (desde `ssh distrimm`):
```powershell
$set  = Get-WmiObject -Namespace root\wmi -Class Lenovo_SetBiosSetting
$save = Get-WmiObject -Namespace root\wmi -Class Lenovo_SaveBiosSettings
$set.SetBiosSetting("WakeUponAlarm,Daily Event").return   # o Disabled / Single Event / Weekly Event
$save.SaveBiosSettings("").return                          # "" porque no hay supervisor password
```
> El modo `User Defined` (días sueltos, p. ej. solo fin de semana) usa campos `[Status:ShowOnly]`
> **no escribibles por WMI** — solo desde la pantalla del BIOS presencial. Por eso se usó
> `Daily Event`. `SetBiosSetting("AlarmTime,HH:MM:SS")` devuelve `Invalid Parameter` si el valor
> no cambia (ya estaba en 15:00).

---

## 2. Arquitectura de las bases

### Convención de nombres

```
E<empresa><año>     una base por empresa y por año fiscal   → E0032026
E<empresa>GENERAL   maestros compartidos entre años         → E003GENERAL
E<empresa>NOM(INA)  nómina                                  → E003NOM / E003NOMINA
```

**DistriMM es la empresa `E003`.** La base viva es **`E0032026`** (~1.9 GB, 229 tablas).
Existen los años anteriores `E0032022`, `E0032023`, `E0032024`, `E0032025`. La instancia
`.\SAMITNEW` está vacía.

### Corte de año — el punto más importante de todo este documento

Al cerrar el año el ERP **abre una base nueva** y **no arrastra el detalle documento por
documento** de la cartera pendiente. Consecuencia verificada:

> Una factura emitida en 2025 y pagada en 2026 tiene su **débito en `E0032025`** y su
> **crédito (el recibo de caja) en `E0032026`**.

Si se calcula la cartera mirando **solo** `E0032026`, esas facturas aparecen con **saldo
negativo** (solo se ven los abonos). Medido: **517 documentos con saldo negativo** sumando
**−988.185.757 COP**.

Ejemplo concreto (factura 19502, tercero 94193975), consultado en `E0032026`:

| Comprobante | Fecha | D/C | Valor | Detalle |
|---|---|---|---|---|
| RC-2-899 | 20/03/2026 | C | 20.000.000 | `Abona a factura: 19502  Saldo: 11,664,695.00` |
| RC-2-1378 | 27/04/2026 | C | 11.664.695 | `Cancela factura: 19502` |

El débito original nunca aparece: la factura venció el **25/12/2025**, vive en `E0032025`.

**Por lo tanto: cualquier cálculo de cartera debe unir las bases de todos los años.** Ver §5.

---

## 3. Diccionario de tablas

Volúmenes de `E0032026` medidos el 24/07/2026.

### 3.1 Tablas grandes

| Tabla | Filas | Para qué sirve |
|---|---|---|
| `UsysAu` | 191.073 | Auditoría interna del ERP |
| `CT_MovimientosANT` | 96.769 | **Copia/archivo** de movimientos contables (ver aviso abajo) |
| `CT_Movimientos` | 53.323 | Movimientos contables (líneas de asiento) |
| `IN_DocumentoTran` | 27.550 | **Log de auditoría**, NO es el detalle de factura |
| `IN_Movimiento` | 23.349 | **Detalle de documentos de inventario/venta** |
| `CT_PlanTerceros` | 14.195 | Saldos por tercero y cuenta, con buckets mensuales |
| `CT_Documentos` | 11.254 | Cabecera de comprobantes contables |
| `IN_Documento` | 7.524 | Cabecera de documentos de inventario/venta |
| `IN_Producto` | 4.374 | Maestro de productos |
| `CT_FacVentasCred` | 3.891 | Facturas de venta a crédito (índice CxC) |
| `IN_ProdBodega` | 2.539 | Existencias por producto y bodega |
| `G_Clientes` | 2.178 | Maestro de terceros |
| `IN_Marcas` | 253 | Marcas |
| `IN_Categorias` | 47 | Categorías |
| `IN_Vendedor` | 17 | Vendedores |

> **`CT_MovimientosANT` no es un complemento de `CT_Movimientos`.** Es una copia/archivo. Al
> unirla a `CT_Movimientos` la cartera se duplica (la prueba dio 3.746 millones contra los 1.260
> millones reales). **No usar** para cálculos.

> **`IN_DocumentoTran` no es el detalle de la factura.** Sus columnas (`Secuencial`,
> `SecDocumento`, `Transaccion`, `Sesion`, `Version`) son un log de auditoría. Descartada.

### 3.2 `IN_Documento` — cabecera de venta/inventario (7.524 filas)

PK: `Secuencial` (int). 69 columnas. Las que importan:

| Columna | Tipo | Notas |
|---|---|---|
| `Secuencial` | int | **PK. Es la llave que usa `IN_Movimiento.Documento`.** |
| `TipoDoc` | varchar(2) | `VE` venta, `DV` devolución, `CO` compra, `SA` salida, `EN` entrada, `TR` traslado, `NA`, `DC` |
| `Prefijo` | varchar(5) | `FELE` para factura electrónica |
| `NumComprobante` | varchar(100) | Número de factura. **`Prefijo + '-' + NumComprobante` = `factura` del dashboard** |
| `FechaDoc` | smalldatetime | Fecha del documento |
| `Tercero` | bigint | NIT del cliente → `G_Clientes.Identificacion` |
| `Vendedor` | smallint | → `IN_Vendedor.CodVendedor` |
| `Valor` | money | **Total del documento SIN IVA** |
| `ValIva` | money | IVA del documento |
| `TotalMov` | smallint | **Cantidad de líneas, NO un valor monetario** |
| `Anulado` | bit | Documento anulado |
| `FechaVencimiento` | smalldatetime | Vencimiento |
| `FormaPago` | varchar(100) | **Vacío en las 5.039 ventas — no se usa** |
| `BdDevolucion` | varchar(15) | Base de la factura devuelta (`E0032026`) |
| `DocDevolucion` | bigint | **`Secuencial` de la factura original que se devuelve** |
| `FechaSys` | datetime | **Fecha de INSERCIÓN** (no de modificación — ver §6) |
| `CUFE`, `EstDIAN`, `MensajeDIAN` | varchar | Facturación electrónica DIAN |
| `Bodega`, `BodOrigen`, `BodDestino` | int/smallint | Bodegas; las dos últimas para traslados `TR` |

**Cuadre verificado cabecera ↔ detalle** (facturas `VE` no anuladas):
`SUM(IN_Movimiento.VrVenta) = IN_Documento.Valor` y `SUM(IN_Movimiento.VrIva) =
IN_Documento.ValIva`, **exacto al peso**, y `TotalMov` coincide con el número real de líneas.

### 3.3 `IN_Movimiento` — detalle de línea (23.349 filas)

**Este es el detalle real de la factura.** 56 columnas. Unión verificada:
`IN_Movimiento.Documento = IN_Documento.Secuencial` → **0 líneas huérfanas de 23.349**.

| Columna | Tipo | Notas |
|---|---|---|
| `Secuencial` | int | PK propia de la línea |
| `Documento` | int | **FK lógica → `IN_Documento.Secuencial`** |
| `Item` | smallint | Número de línea dentro del documento |
| `Producto` | varchar(15) | → `IN_Producto.codigo` |
| `ProductoDesc` | varchar(500) | Descripción congelada al momento de la venta |
| `Cantidad` | money | Unidades |
| `VrVenta` | money | **Total de la línea SIN IVA** (no es precio unitario) |
| `VrIva` | money | IVA de la línea |
| `TipoIva` | money | **Porcentaje de IVA aplicado**: 0, 5 o 19 |
| `Costo` | money | **Costo total de la línea** |
| `Descuento` / `PorcDesc` | money | Descuento — **0 en absolutamente todas las líneas** |
| `Bodega` | smallint | Bodega de la que sale |
| `DC` | varchar(1) | Débito/crédito de inventario |
| `Devolucion` | int | Marca de devolución a nivel línea |
| `ListaPrecio` | money | **Número de lista de precios (vale 2), NO un precio** |

> **Ojo con la llave:** hay **697 combinaciones `(Documento, Producto)` que aparecen más de una
> vez** — un mismo producto puede repetirse en varias líneas del mismo documento. La llave única
> del detalle es **`(Documento, Item)`**, nunca `(factura, producto)`.

### 3.4 `CT_Documentos` — cabecera contable (11.254 filas)

PK: `Doc_Secuencial`.

| Columna | Notas |
|---|---|
| `Doc_Secuencial` | PK. `CT_Movimientos.Mov_Documento` apunta aquí |
| `Doc_TipoComp` | `FV` factura, `RC` **recibo de caja (recaudos)**, `NC`, `CE`, `CP`, `NA`, `RG`, `DS`, `CC`, `TR`, `DC`, `CB`, `DV` |
| `Doc_NumDocumento` | Número del comprobante |
| `Doc_FechaDoc` | Fecha contable |
| `Doc_Tercero` | NIT |
| `Doc_Anulado` | Anulado |
| `Doc_FecAnula` / `Doc_UsrAnula` | **Fecha y usuario de anulación** |
| `Doc_FechaSistema` | Fecha de inserción (no se actualiza al anular — §6) |

Distribución de comprobantes en 2026: `FV` 5.039 · `RC` 2.361 · `NA` 1.227 · `RG` 722 ·
`NC` 487 · `CP` 451 · `CE` 427 · `DV` 267 · `DS` 202 · `CC` 54 · `TR` 39 · `DC` 29 · `CB` 8.

### 3.5 `CT_Movimientos` — línea de asiento (53.323 filas)

| Columna | Notas |
|---|---|
| `Mov_Documento` | → `CT_Documentos.Doc_Secuencial` |
| `Mov_Cuenta` | varchar(10). **`13050501` = CxC Clientes** |
| `Mov_Tercero` | NIT |
| `Mov_DocDetalle` | varchar(15). **Número de la factura a la que se imputa** |
| `Mov_Cuota` | smallint. Número de cuota |
| `Mov_DC` | `D` débito / `C` crédito |
| `Mov_Valor` | money |
| `Mov_FecVcto` | datetime. **Fecha de vencimiento de la factura** |
| `Mov_Anulado` | bit |
| `Mov_Detalle` | varchar(150). Texto libre (`Abona a factura: 19502  Saldo: ...`) |

**La cartera se arma con esta tabla.** Ver §5.

### 3.6 `CT_FacVentasCred` — índice de facturas a crédito (3.891 filas)

| Columna | Notas |
|---|---|
| `NumDoc` | varchar(15). Número de factura |
| `Cuota` | smallint |
| `Tercero`, `Estab`, `Cuenta`, `Sucursal` | Identifican la CxC |
| `Vendedor` | **Vendedor de la factura** — dato que el Excel de cartera NO trae |
| `Cobrador` | Cobrador asignado |
| `VrVenta` | **Total de la factura CON IVA incluido** (verificado: 281.706,75 + 8.295,25 = 290.002) |
| `VrIva` | Porción de IVA contenida en `VrVenta` |

> Cuidado: `VrVenta` significa cosas distintas en `IN_Movimiento` (sin IVA) y en
> `CT_FacVentasCred` (con IVA). Es la trampa más fácil de este esquema.

Esta tabla **no tiene saldo pendiente, ni fecha de vencimiento, ni días de mora**. Sirve como
índice de qué facturas son a crédito y para recuperar `Vendedor`/`Cobrador`.

### 3.7 `CT_PlanTerceros` — saldo por tercero y cuenta (14.195 filas)

`Tercero` + `Cuenta` + `Sucursal`, con `SaldoInicial`, buckets `Mes01D`/`Mes01C` … `Mes13D`/`Mes13C`
y `SaldoFinal`.

**Sirve como cifra de control:** `SUM(SaldoFinal) WHERE Cuenta='13050501'` = **1.260.707.059 COP**,
que coincide **exactamente** con el resultado del cálculo documento por documento de §5.

### 3.8 `IN_ProdBodega` — existencias por bodega (2.539 filas)

Llave: `CodProducto` + `CodBodega`. 83 columnas, casi todas buckets mensuales
(`CantD01..CantD12`, `CantC01..CantC12`, `ValorD01..`, `AjusteD01..`).

Lo que importa:

| Columna | Notas |
|---|---|
| `CodProducto` / `CodBodega` | Llave |
| `CantidadFinal` | **Existencia vigente** |
| `ValorFinal` | **Valor del inventario** |
| `Remisionado` | Mercancía remisionada — **0 en las 2.539 filas** |
| `FechaUltMov` | Fecha del último movimiento |

**Verificado:** `CantidadInicial + Σ(CantD01..12) − Σ(CantC01..12) = CantidadFinal` en las
**2.539 filas, sin una sola discrepancia**. `CantidadFinal` es un acumulado mantenido y confiable.

Bodegas existentes (24/07/2026, filtrando `CantidadFinal <> 0`):

| Bodega | Productos | Unidades | Valor COP |
|---|---|---|---|
| 1 | 215 | 6.809 | 34.777.150 |
| 2 | 122 | 5.744 | 22.823.893 |
| 3 | 69 | 2.992 | 296.339.727 |
| 4 | 19 | 81 | 7.398.163 |
| 5 | 856 | 44.918 | 639.363.986 |
| 6 | 271 | 45.269 | 872.393.843 |

Gerencia considera confiables únicamente las bodegas **3, 5 y 6** (actualizado 05/08/2026; hasta entonces eran 1, 5 y 6)
(`BODEGAS_CONFIABLES` en `src/utils/inventarioUpload.js`).

### 3.9 `IN_Producto` — maestro de productos (4.374 filas)

`codigo` (varchar 15, PK), `Nombre`, `Marca` (int → `IN_Marcas`), `Categoria` (int →
`IN_Categorias`), `CostoPromedio`, `PrecioVenta`, `UltCompra`, `UltValCompra`, `UltValVenta`,
`ManejaIva` (bit), `TablaIva` (smallint → `IN_TipoIva.CodIva`), `PrecioIncluyeIva` (bit),
`Existencia` (money), `FechaUltActualizacion` (datetime).

> **`IN_Producto.Existencia` NO es confiable.** Comparado contra
> `SUM(IN_ProdBodega.CantidadFinal)` por producto: de 1.906 productos comparables,
> **1.090 (57%) no coinciden**, con diferencias de hasta 6.050 unidades. Es un campo
> desnormalizado y desactualizado. **La existencia manda desde `IN_ProdBodega.CantidadFinal`.**

### 3.10 `G_Clientes` — maestro de terceros (2.178 filas)

| Columna | Destino en el dashboard |
|---|---|
| `Identificacion` (bigint) + `Dv` | `no_identif` |
| `TipoIdentificacion` | `tipo_ident` |
| `TipoPersona` (`N`/`J`) | `tipo_persona` |
| `PNombre`, `SNombre`, `PApellido`, `SApellido` | nombres/apellidos |
| **`NombreTercero`** | **`cliente_nombre` ya formateado por el ERP** |
| `Direccion`, `Barrio` | `direccion`, `barrio` |
| `Municipio` (varchar 6) | **código DANE** → `G_Municipio.IdMunicipio` |
| `Tel1`, `Tel2`, `NumCelular`, `Email` | teléfonos y correo |
| `VRCupoCredCli` / `VRCupoCredPro` | `cupo_venta` / `cupo_compra` |
| `VendAsg` | `vendedor_codigo` (vendedor asignado al cliente) |
| `CobraAsig` | `cobrador_codigo` |
| `FechaNacimiento`, `Genero`, `EstadoCivil`, `Profesion`, `Actividad` | homónimos |
| `ClasificacionIVA` | `clasificacion_iva` |
| **`UltimaActualizacion`** (datetime) | **marca de tiempo para sincronización incremental** |

> En personas jurídicas la razón social viene en **`PApellido`**; `NombreTercero` ya trae el
> nombre listo (`CENTRO COMERCIAL AGROPECUARIO DEL CAQUETA S.A.S`, `SARRIA HURTADO ALEXANDER`)
> y es el que usa el ERP en sus reportes. **Usar `NombreTercero`, no concatenar.**

### 3.11 Catálogos

| Tabla | Columnas | Notas |
|---|---|---|
| `IN_Vendedor` | `CodVendedor`, `Identificacion`, `Nombre`, `Zona`, `Estado`, `PorcVentas`, `FechaUltActualizacion` | `Estado`: `V` vigente / `I` inactivo |
| `IN_Marcas` | `CodigoMarca`, `NombreMarca`, `EstadoMarca` | 253 marcas |
| `IN_Categorias` | `CodCategoria`, `NomCategoria`, cuentas contables por categoría | 47 categorías |
| `IN_TipoIva` | `CodIva`, `NomIva`, `PorceIva` | `1`→19%, `2`→5%, `3`→19% servicios |
| `G_Municipio` | `Departamento`, `IdMunicipio`, `CodMunicipio`, `NombreMunicipio` | DANE. `IdMunicipio` empata con `G_Clientes.Municipio` |

---

## 4. Diagrama de relaciones

```
                       ┌────────────────────┐
                       │    G_Clientes      │  Identificacion (NIT)
                       │  NombreTercero     │◄──────────┐
                       │  VendAsg, Municipio│           │
                       └─────────┬──────────┘           │
                                 │ Municipio            │ Tercero
                                 ▼                      │
                        ┌────────────────┐              │
                        │  G_Municipio   │              │
                        └────────────────┘              │
                                                        │
  VENTAS / INVENTARIO                                   │
  ┌──────────────────────┐   Documento    ┌─────────────┴──────────┐
  │    IN_Documento      │◄───────────────│     IN_Movimiento      │
  │  PK Secuencial       │  = Secuencial  │  PK (Documento, Item)  │
  │  TipoDoc VE/DV/CO..  │                │  Producto, Cantidad    │
  │  Prefijo+NumCompro.  │                │  VrVenta, VrIva, Costo │
  │  Tercero, Vendedor   │                └───────────┬────────────┘
  │  Valor, ValIva       │                            │ Producto
  │  DocDevolucion ──────┼──► IN_Documento            ▼
  │  Anulado, FechaSys   │    (factura original)  ┌──────────────┐
  └──────────────────────┘                        │ IN_Producto  │
             │ Vendedor                           │  Marca ──────┼─► IN_Marcas
             ▼                                    │  Categoria ──┼─► IN_Categorias
      ┌──────────────┐                            │  TablaIva ───┼─► IN_TipoIva
      │ IN_Vendedor  │                            └──────┬───────┘
      └──────────────┘                                   │ codigo
                                                         ▼
                                                 ┌────────────────┐
                                                 │  IN_ProdBodega │
                                                 │ (CodProducto,  │
                                                 │  CodBodega)    │
                                                 │ CantidadFinal  │◄── existencia real
                                                 └────────────────┘

  CONTABILIDAD / CARTERA
  ┌──────────────────────┐  Mov_Documento  ┌────────────────────────┐
  │   CT_Documentos      │◄────────────────│     CT_Movimientos     │
  │  PK Doc_Secuencial   │ = Doc_Secuencial│  Mov_Cuenta 13050501   │
  │  Doc_TipoComp FV/RC  │                 │  Mov_Tercero           │
  │  Doc_FechaDoc        │                 │  Mov_DocDetalle (fact) │
  │  Doc_Anulado         │                 │  Mov_Cuota, Mov_DC     │
  │  Doc_FecAnula        │                 │  Mov_Valor, Mov_FecVcto│
  └──────────────────────┘                 └────────────────────────┘
                                                      │
                          cifra de control            ▼
                                         ┌──────────────────────────┐
                                         │    CT_PlanTerceros       │
                                         │  SaldoFinal por tercero  │
                                         └──────────────────────────┘

  ┌────────────────────┐  índice de facturas a crédito:
  │  CT_FacVentasCred  │  NumDoc, Cuota, Tercero, Vendedor, Cobrador
  │  VrVenta CON IVA   │  (no tiene saldo ni vencimiento)
  └────────────────────┘
```

`sys.foreign_keys` reporta **247 FK declaradas** en `E0032026`. Aun así, las uniones clave del
negocio (`IN_Movimiento.Documento` → `IN_Documento.Secuencial`,
`CT_Movimientos.Mov_Documento` → `CT_Documentos.Doc_Secuencial`) fueron **verificadas por datos**,
que es lo que importa: 0 huérfanos sobre 23.349 líneas.

---

## 5. Cómo calcula el ERP la cartera (resuelto y verificado)

`CT_FacVentasCred` no alcanza: no tiene saldo, ni vencimiento, ni mora. La cartera se arma
**agregando `CT_Movimientos` sobre la cuenta `13050501`, uniendo TODAS las bases de año**.

```sql
-- por cada base E003<año> disponible (2022..2026), unir:
SELECT m.Mov_Tercero, m.Mov_DocDetalle, m.Mov_Cuota, m.Mov_DC, m.Mov_Valor,
       m.Mov_FecVcto, d.Doc_FechaDoc
FROM E003<año>.dbo.CT_Movimientos m WITH (NOLOCK)
JOIN E003<año>.dbo.CT_Documentos  d WITH (NOLOCK) ON d.Doc_Secuencial = m.Mov_Documento
WHERE m.Mov_Cuenta = '13050501'
  AND ISNULL(m.Mov_Anulado,0) = 0
  AND ISNULL(d.Doc_Anulado,0) = 0

-- luego agrupar y quedarse con lo que tiene saldo:
GROUP BY Mov_Tercero, Mov_DocDetalle, Mov_Cuota
  saldo            = SUM(CASE WHEN Mov_DC='D' THEN Mov_Valor ELSE -Mov_Valor END)   -- > 0
  fecha_vencimiento= MAX(Mov_FecVcto)
  fecha_emision    = MIN(CASE WHEN Mov_DC='D' THEN Doc_FechaDoc END)
```

### Resultado de la verificación (corte 24/07/2026)

| Fuente | Ítems | Total COP | Negativos |
|---|---|---|---|
| Solo `E0032026` | 629 | 1.244.850.640 | **517** ❌ |
| Uniendo 2022–2026 | **661** | **1.260.707.059** | **0** ✅ |
| `CT_PlanTerceros.SaldoFinal` | — | **1.260.707.059** | — |
| Dashboard (reporte del ERP, 24/07 8:52am) | 660 | 1.262.277.327 | 0 |

Al unir los cinco años **desaparecen los 517 saldos negativos** y el total cuadra **exacto al
peso** con `CT_PlanTerceros`. La diferencia de 1 ítem / 1.570.268 COP contra el dashboard se
explica sola: el reporte se exportó a las 8:52am y la consulta se corrió pasadas las 2pm del
mismo día — entre medias entraron recaudos.

### Contraste fila por fila (top 8 por saldo, 24/07/2026)

Las 8 filas coinciden en **todos** los campos con `cartera_items`: documento, cuota, NIT, nombre,
fecha de emisión, fecha de vencimiento, días de mora, saldo y estado.

| Documento | Cliente | Vence | Mora | Saldo COP | Estado |
|---|---|---|---|---|---|
| 24552 | PUNTO AGRO CAQ S.A.S | 22/08/2026 | −28 | 29.573.872 | POR VENCER |
| 24143 | SARRIA HURTADO ALEXANDER | 05/07/2026 | 19 | 27.698.806 | VENCIDA |
| 24361 | CENTRO COMERCIAL AGROPECUARIO… | 15/08/2026 | −21 | 25.308.800 | POR VENCER |
| 24007 | CENTRO COMERCIAL AGROPECUARIO… | 29/07/2026 | −5 | 18.015.101 | POR VENCER |
| 25154 | MENORES CUANTIAS | 20/08/2026 | −26 | 17.989.605 | POR VENCER |
| 23442 | AGROVETERINARIA LOS GANADEROS… | 06/07/2026 | 18 | 16.144.744 | VENCIDA |
| 24999 | CENTRO COMERCIAL AGROPECUARIO… | 12/09/2026 | −48 | 15.683.700 | POR VENCER |
| 23507 | CENTRO COMERCIAL AGROPECUARIO… | 10/07/2026 | 14 | 15.000.000 | VENCIDA |

### Los días de mora usan convención comercial de 360 días

El ERP **no** calcula mora con días calendario. Usa meses de 30 días (estilo `DAYS360`):

```
dias_mora = (año_corte − año_venc)*360 + (mes_corte − mes_venc)*30 + (día_corte − día_venc)
```

Verificado contra 10 facturas antiguas del dashboard — coincide en las 10, mientras que el
`DATEDIFF` calendario se desvía entre 8 y 18 días:

| Documento | Vence | `dias_mora` ERP | DAYS360 | Días calendario |
|---|---|---|---|---|
| 127 | 25/02/2023 | 1.229 | **1.229** ✅ | 1.245 ❌ |
| 224 | 10/03/2023 | 1.214 | **1.214** ✅ | 1.232 ❌ |
| 1347 | 29/07/2023 | 1.075 | **1.075** ✅ | 1.091 ❌ |
| 10498 | 28/11/2024 | 596 | **596** ✅ | 603 ❌ |

El valor puede ser **negativo** (factura por vencer). `estado` = `VENCIDA` si `dias_mora > 0`,
si no `POR VENCER`.

### Funciones del ERP encontradas

`sys.views` / `sys.procedures` / `sys.objects` reportan 2 vistas, 33 procedimientos y 10 funciones.
Dos son directamente relevantes y **ambas están cifradas** (`WITH ENCRYPTION`: `sys.sql_modules.definition`
es `NULL`), así que no se puede leer su lógica — pero **sí se pueden invocar**:

| Objeto | Firma | Uso |
|---|---|---|
| `dbo.SaldoDocumento` | `(@Ofi tinyint, @Cta varchar(10), @Ter bigint, @TerEstab smallint, @DocDetalle varchar(15), @Cuota smallint, @FecCorte datetime) → money` | Saldo de un documento a una fecha de corte |
| `dbo.DeterminarBasePagoComisionVendedor` | `(@VrAbono money, @VrVenta money, @VrIVA money, @SaldoAntesAbono money) → money` | **Base de comisión por recaudo, según el propio ERP** |

> `SaldoDocumento` **funciona pero sólo mira la base en la que se ejecuta**, así que reproduce el
> mismo problema de los 517 negativos del corte de año. Para cartera es preferible el cálculo
> explícito de arriba, que además cuadra exacto con `CT_PlanTerceros`.
>
> `DeterminarBasePagoComisionVendedor` es un hallazgo valioso para el módulo de comisiones por
> recaudo: es la regla oficial del ERP, disponible sin tener que replicarla. **NO VERIFICADO**:
> no se contrastó todavía contra `comisionesCalculator.js`.

---

## 6. Identificación de casos especiales

### Anulados

- Inventario/ventas: `IN_Documento.Anulado = 1`. No hay fecha de anulación.
- Contabilidad: `CT_Documentos.Doc_Anulado = 1`, **con `Doc_FecAnula` y `Doc_UsrAnula`**.
- Líneas contables: `CT_Movimientos.Mov_Anulado`.

Anulados en 2026 por tipo: `CO` 26, `SA` 5, `EN` 5, `DV` 4, `DC` 4, `VE` **0**.

### Devoluciones

`IN_Documento.TipoDoc = 'DV'` (267 en 2026). El enlace a la factura original:

- `BdDevolucion` = nombre de la base (`E0032026`)
- `DocDevolucion` = **`Secuencial` de la factura `VE` original**

> **La devolución reutiliza el número de factura de la original.** Ejemplo verificado: `FELE-25197`
> existe dos veces — como `VE` (Secuencial 43549, 22/07) y como `DV` (Secuencial 43615, 23/07).
> Por eso **`factura` NO es una llave única**; hay que incluir el tipo, o mejor usar `Secuencial`.

En `IN_Movimiento` las líneas de una `DV` tienen `VrVenta` **positivo**; el signo negativo lo pone
el ETL del dashboard, no el ERP.

### Contado vs crédito

`FormaPago` está **vacío en las 5.039 ventas**, así que no sirve. La modalidad se deduce de si la
venta generó cuenta por cobrar:

| Modalidad | Facturas | Valor con IVA |
|---|---|---|
| Crédito (aparece en `CT_FacVentasCred`) | 3.315 | 5.997.332.281 |
| **Contado** (no aparece) | **1.724** | **457.068.747** |

Esto reemplaza el PDF de contado que hoy se manda a mano.

### Documentos electrónicos (DIAN)

`IN_Documento` trae `CUFE`, `EstDIAN`, `MensajeDIAN`, `TufacturaID`, `CodigoQR`, `NumResolucion`,
`OrdenDIAN`. El prefijo `FELE` identifica factura electrónica. Vista auxiliar:
`ListaDocsDIANResolucion`. Función `Traer_Cufe` (legible).

### Traslados entre bodegas

`TipoDoc = 'TR'` (39 en 2026), con `BodOrigen`, `BodDestino` y `SecTrasDestino`. **No son ventas**
y deben excluirse de cualquier agregación de ventas.

### Marcas de tiempo para sincronización

**No existe ninguna columna `rowversion`/`timestamp` en toda la base, y Change Tracking está
desactivado** (`sys.change_tracking_tables` = 0 tablas). Lo disponible:

| Tabla | Columna | Semántica |
|---|---|---|
| `IN_Documento` | `FechaSys` (datetime, NOT NULL) | **Sólo inserción** |
| `CT_Documentos` | `Doc_FechaSistema` | **Sólo inserción** |
| `G_Clientes` | `UltimaActualizacion` | Se actualiza al modificar |
| `IN_Producto` | `FechaUltActualizacion` | Se actualiza al modificar |
| `IN_Vendedor` | `FechaUltActualizacion` | Se actualiza al modificar |
| `IN_ProdBodega` | `FechaUltMov` | Fecha del último movimiento |
| `IN_Movimiento`, `CT_Movimientos` | **ninguna** | Hay que pasar por la cabecera |

> **`FechaSys` / `Doc_FechaSistema` NO se actualizan al modificar ni al anular.** Probado:
> el documento contable `29456` tiene `Doc_FechaSistema = 06/05/2026` y
> `Doc_FecAnula = 25/06/2026` — 50 días después, y la marca de inserción quedó intacta.
> Lo mismo en `IN_Documento`: documentos anulados conservan `FechaSys` igual a `FechaDoc`.
>
> **Consecuencia:** una sincronización incremental basada sólo en estas columnas **no detecta
> anulaciones ni ediciones de documentos viejos**. Ver la estrategia en el plan.

De 7.524 documentos, 7.242 tienen `FechaSys` el mismo día que `FechaDoc` y 281 posterior (hasta
174 días) — son documentos cargados con fecha atrasada, no ediciones.

---

## 7. Backups

**Sí se ejecutan y son válidos**, pero la cobertura es menor de lo que sugiere el esquema.

- Tarea programada `COPIA SAMIT`, **todos los días a las 15:00** (en horario laboral, por eso el
  apagado nocturno no la afecta). Último resultado `0` (éxito).
- Destino `D:\COPIASAMIT\` — **144 archivos, 41.6 GB**.
- Rotación por día de la semana: `thursdayE0032026_PM.bak`, `wednesday…`, etc.
- Último respaldo de `E0032026`: **23/07/2026 15:00, 1.634 MB**, confirmado en `msdb.dbo.backupset`.

### La rotación tiene huecos

Historial real de `E0032026` según `msdb`:

```
2026-07-23 Thursday   2026-07-16 Thursday   2026-07-09 Thursday
2026-07-22 Wednesday  2026-07-15 Wednesday  2026-07-08 Wednesday
2026-07-21 Tuesday    2026-07-14 Tuesday    2026-07-07 Tuesday
                      2026-07-10 Friday     2026-07-06 Monday
                                            2026-07-03 Friday
```

Faltan **lunes 13/07, viernes 17/07 y lunes 20/07**. Los archivos `mondayE0032026_PM.bak` y
`fridayE0032026_PM.bak` en disco son del **06/07 y 10/07** — 18 y 14 días viejos. La tarea sólo
corre si el equipo está encendido a las 15:00, así que la retención efectiva son los últimos días
consecutivos trabajados, no siete días completos.

La tarea `copia SAMITNEW` falla (`3221225786`), pero respalda la instancia vacía: no es crítico.

---

## 8. Riesgos operativos

| # | Riesgo | Estado |
|---|---|---|
| 1 | **Un solo disco físico.** `C:` y `D:` son particiones del mismo SSD KIOXIA de 477 GB (`DiskNumber 0`). Los backups viven en el mismo disco que respaldan. Sin disco externo, sin unidad de red, sin nube. Si el SSD falla se pierden **a la vez** la contabilidad y todos sus respaldos. | **Crítico, verificado** |
| 2 | **Contraseña de `sa` en texto plano** en `C:\Program Files (x86)\SamitSQL\Samit_Ejecuta_BackupSQLCMD.bat`. Cualquiera con acceso al equipo obtiene control total de todas las bases contables. Hay que rotarla y sacarla del `.bat`. *(No se usó ni se transcribe su valor.)* | **Crítico, verificado** |
| 3 | **Huecos en la rotación de backups**: lunes y viernes frecuentemente sin respaldo (§7). | Verificado |
| 4 | **El equipo se apaga al cerrar la oficina.** Arrancó hoy a las 07:50. Cualquier automatización sólo corre en horario laboral. | Verificado |
| 5 | **SQL Server Express**: tope de 10 GB por base y ~1.4 GB de RAM. `E0032026` va en 1.9 GB. | Verificado |
| 6 | **Firewall de Windows apagado**; el puerto 22 queda visible en toda la LAN. Encenderlo exige crear antes reglas para las instancias SQL (puertos dinámicos) y el SQL Browser, o la oficina pierde el ERP. | Reportado previamente, **no re-verificado hoy** |
| 7 | Tarea programada `\Activation-Renewal` ejecutando `Activation_task.cmd`, con pinta de activador no oficial de Windows/Office. Última ejecución 21/07/2026, resultado `0`. | Verificado |
| 8 | La llave del nodo en Tailscale **expira el 19/01/2027** salvo que se marque "Disable key expiry". | Reportado previamente, **no re-verificado hoy** |
| 9 | `SaldoDocumento` y `DeterminarBasePagoComisionVendedor` están **cifradas**: si el proveedor cambia su lógica, no hay forma de auditarlo desde la base. | Verificado |

---

## 9. Consultas de referencia

```sql
-- Cifra de control de cartera (debe cuadrar con el cálculo documento por documento)
SELECT ROUND(SUM(SaldoFinal),0) FROM CT_PlanTerceros WITH (NOLOCK) WHERE Cuenta='13050501';

-- Existencia real por bodega
SELECT CodBodega, SUM(CantidadFinal) AS unidades, SUM(ValorFinal) AS valor
FROM IN_ProdBodega WITH (NOLOCK) WHERE CantidadFinal <> 0 GROUP BY CodBodega;

-- Ventas del día con su detalle
SELECT d.Prefijo+'-'+d.NumComprobante AS factura, d.TipoDoc, d.FechaDoc, d.Vendedor, d.Tercero,
       m.Item, m.Producto, m.Cantidad, m.VrVenta, m.VrIva, m.Costo
FROM IN_Documento d WITH (NOLOCK)
JOIN IN_Movimiento m WITH (NOLOCK) ON m.Documento = d.Secuencial
WHERE d.TipoDoc IN ('VE','DV') AND d.Anulado = 0 AND d.FechaDoc >= CAST(GETDATE() AS date);

-- Recaudos (recibos de caja) imputados a CxC
SELECT d.Doc_NumDocumento, d.Doc_FechaDoc, m.Mov_Tercero, m.Mov_DocDetalle, m.Mov_Valor
FROM CT_Documentos d WITH (NOLOCK)
JOIN CT_Movimientos m WITH (NOLOCK) ON m.Mov_Documento = d.Doc_Secuencial
WHERE d.Doc_TipoComp='RC' AND m.Mov_Cuenta='13050501' AND m.Mov_DC='C'
  AND ISNULL(d.Doc_Anulado,0)=0 AND ISNULL(m.Mov_Anulado,0)=0;
```

Usar siempre `WITH (NOLOCK)` en horario laboral.

---

## 10. Lo que quedó sin verificar

- **`DeterminarBasePagoComisionVendedor`** no se contrastó contra la lógica de
  `comisionesCalculator.js`. Está cifrada; sólo se conoce su firma.
- **`pct_iva` por producto**: `IN_Producto.TablaIva` → `IN_TipoIva.PorceIva` es la ruta natural,
  pero 2.263 productos tienen `TablaIva` vacío y los productos con `TablaIva=1` muestran IVA
  observado entre 0 y 19 en `IN_Movimiento`. La tasa realmente aplicada está en
  `IN_Movimiento.TipoIva` (0 / 5 / 19). Falta decidir cuál es la fuente para el catálogo.
- **`E003GENERAL`, `E003NOM`, `E003NOMINA`**: no se inspeccionaron; no hacen falta para los seis
  datasets del dashboard.
- **Tipos de documento `NA` (35) y `DC` (29)** en `IN_Documento`: no se identificó su significado.
- **Firewall y expiración de la llave Tailscale**: heredados del informe anterior, no re-medidos hoy.
- **`Doc_TipoComp`** tiene 13 valores; sólo se caracterizaron `FV`, `RC` y `DV`.
