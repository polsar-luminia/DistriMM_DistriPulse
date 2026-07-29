# ─────────────────────────────────────────────────────────────────────────────
# Agente de sincronización SAMIT → DistriMM (VPS)
#
# Corre EN EL SERVIDOR DE LA OFICINA. Lee el ERP con Integrated Security y
# publica por HTTPS en /functions/v1/sync-ingest del VPS.
#
# No requiere instalar NADA: usa System.Data.SqlClient de .NET, que ya viene
# con Windows. Por eso no hay node_modules ni dependencias que mantener aquí.
#
# REGLA INVIOLABLE: solo lectura sobre el ERP. Todas las consultas van con
# WITH (NOLOCK) para no bloquear a la oficina (L-S ~8am-7pm, SQL Express).
#
# Config en sync-samit.config.json junto a este archivo (NO va al repo):
#   { "url": "https://.../functions/v1/sync-ingest", "token": "..." }
#
# Uso:  powershell -ExecutionPolicy Bypass -File sync-samit.ps1 [-Dataset todos]
# ─────────────────────────────────────────────────────────────────────────────
param(
  [string]$Dataset = "todos",
  [switch]$DryRun,
  # Reconstruye los meses cerrados del anio, no solo el mes en curso.
  [switch]$Backfill,
  # Anios de ventas a sincronizar. Vacio = solo el anio en curso, que es como
  # corre la tarea programada. Para traer historico:
  #   -Dataset ventas -AniosVentas 2025
  # Cada anio vive en su propia base del ERP (E0032025, E0032026...).
  [int[]]$AniosVentas = @()
)

$ErrorActionPreference = "Stop"

# El pipeline SSH/consola mutila ñ y tildes si no se fija UTF-8 explícitamente.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$raiz    = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfgPath = Join-Path $raiz "sync-samit.config.json"
if (-not (Test-Path $cfgPath)) { throw "Falta $cfgPath" }
$cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json

$CONN = "Server=.\SAMIT;Database=E0032026;Integrated Security=True;Connect Timeout=30"

function Escribir-Log($msg) {
  $t = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  Write-Host "[$t] $msg"
}

# Ejecuta una consulta de solo lectura y devuelve un arreglo de hashtables.
function Consultar($sql) {
  $c = New-Object System.Data.SqlClient.SqlConnection($CONN)
  try {
    $c.Open()
    $cmd = New-Object System.Data.SqlClient.SqlCommand($sql, $c)
    $cmd.CommandTimeout = 300
    $r = $cmd.ExecuteReader()
    $filas = New-Object System.Collections.ArrayList
    while ($r.Read()) {
      $fila = @{}
      for ($i = 0; $i -lt $r.FieldCount; $i++) {
        $v = $r.GetValue($i)
        if ($v -is [DBNull]) { $v = $null }
        elseif ($v -is [string]) { $v = $v.Trim() }
        $fila[$r.GetName($i)] = $v
      }
      [void]$filas.Add($fila)
    }
    $r.Close()
    return ,$filas.ToArray()
  } finally { $c.Close() }
}

# Publica un dataset en el VPS. El servidor decide tabla y llave de conflicto.
function Publicar($dataset, $filas, $controlErp, $periodo, $modalidad, $corte) {
  $etiqueta = (@($dataset, $periodo, $modalidad) | Where-Object { $_ }) -join " "
  if ($DryRun) {
    Escribir-Log "  [dry-run] $etiqueta : $($filas.Count) filas, control=$controlErp (no se envía)"
    return
  }
  $mapa = @{ dataset = $dataset; filas = $filas; control_erp = $controlErp }
  if ($periodo)   { $mapa["periodo"]   = $periodo }
  if ($modalidad) { $mapa["modalidad"] = $modalidad }
  if ($corte)     { $mapa["corte"]     = $corte }
  $cuerpo = $mapa | ConvertTo-Json -Depth 6 -Compress
  # ConvertTo-Json emite UTF-16 en el objeto; se fuerza UTF-8 en el cable.
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($cuerpo)
  $resp = Invoke-RestMethod -Uri $cfg.url -Method Post -Body $bytes `
            -ContentType "application/json; charset=utf-8" `
            -Headers @{ Authorization = "Bearer $($cfg.token)" } `
            -TimeoutSec 300
  Escribir-Log ("  {0}: estado={1} leidas={2} escritas={3} ({4} ms)" -f `
    $etiqueta, $resp.estado, $resp.filas_leidas, $resp.filas_escritas, $resp.duracion_ms)
  if ($resp.estado -ne "ok") { Escribir-Log "  ATENCION: estado '$($resp.estado)'" }
}

# ── Vendedores (17 filas) ────────────────────────────────────────────────────
function Sync-Vendedores {
  Escribir-Log "vendedores: leyendo IN_Vendedor"
  $filas = Consultar @"
SELECT CAST(CodVendedor AS varchar(10)) AS codigo,
       Nombre                            AS nombre,
       CAST(Identificacion AS varchar(20)) AS nit,
       Zona                              AS zona,
       Estado                            AS estado
FROM IN_Vendedor WITH (NOLOCK)
"@
  Publicar "vendedores" $filas $filas.Count
}

# ── Catálogo de productos (4.374 filas) ──────────────────────────────────────
# marca y categoría se traen CRUDAS del ERP: fn_calcular_comisiones compara con
# normalize_brand() en ambos lados, así que las variantes del ERP
# (CONTEGRAL MASCOTAS, PREMIER, BOEHRINGER…) no rompen las exclusiones.
# pct_iva NO se toca: su fuente sigue sin resolver (ver mapeo §10).
function Sync-Catalogo {
  Escribir-Log "catalogo: leyendo IN_Producto + IN_Marcas + IN_Categorias"
  $filas = Consultar @"
SELECT p.codigo                                   AS codigo,
       p.Nombre                                   AS nombre,
       CAST(p.Categoria AS varchar(10))           AS categoria_codigo,
       ISNULL(c.NomCategoria, '')                 AS categoria_nombre,
       ISNULL(NULLIF(LTRIM(RTRIM(m.NombreMarca)), ''), 'SIN MARCA') AS marca
FROM IN_Producto p WITH (NOLOCK)
LEFT JOIN IN_Categorias c WITH (NOLOCK) ON c.CodCategoria = p.Categoria
LEFT JOIN IN_Marcas     m WITH (NOLOCK) ON m.CodigoMarca  = p.Marca
"@
  Publicar "catalogo" $filas $filas.Count
}

# ── Tasas de IVA por producto ────────────────────────────────────────────────
# Reemplaza el "Informe Diario de Ventas tipo de IVA" que se cargaba a mano.
# La tasa real es la que se aplico en la venta (IN_Movimiento.TipoIva), no la
# del maestro (IN_Producto.TablaIva, vacio en 2.263 productos).
# De 1.429 productos vendidos, 1.425 tienen una sola tasa; para los 4 que
# varian se toma la de la venta MAS RECIENTE (si cambia la tarifa, manda la
# nueva), desempatando por frecuencia.
function Sync-TasasIva {
  Escribir-Log "tasas_iva: leyendo IN_Movimiento.TipoIva"
  $filas = Consultar @"
WITH obs AS (
  SELECT m.Producto, CAST(m.TipoIva AS int) AS tipo_iva,
         COUNT(*) AS veces, MAX(d.FechaDoc) AS ult
  FROM IN_Documento  d WITH (NOLOCK)
  JOIN IN_Movimiento m WITH (NOLOCK) ON m.Documento = d.Secuencial
  WHERE d.TipoDoc IN ('VE','DV') AND ISNULL(d.Anulado,0)=0
    AND m.TipoIva IS NOT NULL AND CAST(m.TipoIva AS int) IN (0,5,19)
  GROUP BY m.Producto, CAST(m.TipoIva AS int)
), rk AS (
  SELECT Producto, tipo_iva,
         ROW_NUMBER() OVER (PARTITION BY Producto ORDER BY ult DESC, veces DESC) rn
  FROM obs
)
SELECT LTRIM(RTRIM(Producto)) AS codigo, tipo_iva AS pct_iva
FROM rk WHERE rn = 1
"@
  # Sin cifra de control: es un dataset PARCIAL (solo productos con venta),
  # asi que contar filas contra el total de la tabla daria siempre "sospechoso".
  Publicar "tasas_iva" $filas $null
}

# ── Clientes (2.179 filas) ───────────────────────────────────────────────────
# no_identif va SIN dígito de verificación: el ERP guarda el Dv aparte y se
# ignora, porque así es como cruza hoy con cartera_items.tercero_nit.
# nombre_completo sale de NombreTercero, que el ERP ya entrega formateado
# (en personas jurídicas la razón social vive en PApellido: no concatenar).
# Upsert sin borrados: ver comentario en sync-ingest.
function Sync-Clientes {
  Escribir-Log "clientes: leyendo G_Clientes + G_Municipio"
  $filas = Consultar @"
SELECT CAST(g.Identificacion AS varchar(20))       AS no_identif,
       g.TipoIdentificacion                        AS tipo_ident,
       g.TipoPersona                               AS tipo_persona,
       g.PNombre                                   AS primer_nombre,
       g.SNombre                                   AS segundo_nombre,
       g.PApellido                                 AS primer_apellido,
       g.SApellido                                 AS segundo_apellido,
       g.NombreTercero                             AS nombre_completo,
       CASE WHEN g.FechaNacimiento > '1900-01-02'
            THEN CONVERT(varchar(10), g.FechaNacimiento, 23) END AS fecha_nacimiento,
       g.Genero                                    AS genero,
       g.EstadoCivil                               AS estado_civil,
       g.Direccion                                 AS direccion,
       g.Barrio                                    AS barrio,
       m.NombreMunicipio                           AS municipio,
       g.Tel1                                      AS telefono_1,
       g.Tel2                                      AS telefono_2,
       g.NumCelular                                AS celular,
       g.Email                                     AS correo_electronico,
       g.WebPage                                   AS pagina_web,
       CAST(g.ClasificacionIVA AS varchar(10))     AS clasificacion_iva,
       g.Profesion                                 AS profesion,
       g.Actividad                                 AS actividad,
       g.VRCupoCredCli                             AS cupo_venta,
       g.VRCupoCredPro                             AS cupo_compra,
       g.Comentario                                AS comentario,
       CAST(NULLIF(g.VendAsg, 0)  AS varchar(10))  AS vendedor_codigo,
       CAST(NULLIF(g.CobraAsig, 0) AS varchar(10)) AS cobrador_codigo
FROM G_Clientes  g WITH (NOLOCK)
LEFT JOIN G_Municipio m WITH (NOLOCK) ON m.IdMunicipio = g.Municipio
"@
  Publicar "clientes" $filas $filas.Count
}

# ── Inventario (~1.533 filas con existencia o tránsito) ──────────────────────
# La existencia manda desde IN_ProdBodega.CantidadFinal. NO se usa
# IN_Producto.Existencia: está desactualizada en el 57% de los productos
# (verificado en el mapeo §3.9), es un campo desnormalizado.
#
# Dataset FULL: el servidor lo reemplaza en una transacción, manteniendo una
# sola carga de origen 'erp'. La carga manual no se toca.
function Sync-Inventario {
  $hoy = Get-Date
  $meses = @()
  if ($Backfill) {
    for ($m = 1; $m -le $hoy.Month; $m++) {
      $iniM = Get-Date -Year $hoy.Year -Month $m -Day 1
      $corte = if ($m -eq $hoy.Month) { $hoy } else { $iniM.AddMonths(1).AddDays(-1) }
      $meses += @{ n = $m; periodo = $iniM.ToString("yyyy-MM"); corte = $corte.ToString("yyyy-MM-dd") }
    }
  } else {
    $meses += @{ n = $hoy.Month; periodo = $hoy.ToString("yyyy-MM"); corte = $hoy.ToString("yyyy-MM-dd") }
  }

  foreach ($mm in $meses) {
    $periodo = $mm.periodo; $corte = $mm.corte; $n = $mm.n
    # Existencia al cierre del mes N = inicial + entradas - salidas hasta N.
    # Verificado en el mapeo: la identidad cuadra en las 2.539 filas.
    $cant = (1..$n | ForEach-Object { "pb.CantD{0:00}" -f $_ }) -join " + "
    $cantC = (1..$n | ForEach-Object { "pb.CantC{0:00}" -f $_ }) -join " - "
    $val  = (1..$n | ForEach-Object { "pb.ValorD{0:00}" -f $_ }) -join " + "
    $valC = (1..$n | ForEach-Object { "pb.ValorC{0:00}" -f $_ }) -join " - "
    $esMesActual = ($n -eq $hoy.Month)
    # En el mes en curso se usa CantidadFinal, que es el acumulado vigente.
    $exprCant = if ($esMesActual) { "pb.CantidadFinal" } else { "(pb.CantidadInicial + $cant - $cantC)" }
    $exprVal  = if ($esMesActual) { "pb.ValorFinal" }    else { "(pb.ValorInicial + $val - $valC)" }

    Escribir-Log "inventario $periodo : corte $corte"
    $filas = Consultar @"
SELECT pb.CodProducto                              AS producto_codigo,
       p.Nombre                                    AS producto_nombre,
       pb.CodBodega                                AS bodega,
       $exprCant                                   AS cantidad,
       $exprVal                                    AS valor,
       pb.Remisionado                              AS transito,
       CAST(p.Categoria AS varchar(10))            AS categoria_codigo,
       ISNULL(c.NomCategoria, '')                  AS categoria_nombre,
       ISNULL(NULLIF(LTRIM(RTRIM(m.NombreMarca)), ''), 'SIN MARCA') AS marca,
       CASE WHEN p.UltCompra > '1950-01-01'
            THEN CONVERT(varchar(10), p.UltCompra, 23) END AS ult_compra,
       p.UltValCompra                              AS ult_val_compra,
       p.UltValVenta                               AS ult_val_venta,
       p.CostoPromedio                             AS precio_medio
FROM IN_ProdBodega pb WITH (NOLOCK)
LEFT JOIN IN_Producto   p WITH (NOLOCK) ON p.codigo      = pb.CodProducto
LEFT JOIN IN_Categorias c WITH (NOLOCK) ON c.CodCategoria = p.Categoria
LEFT JOIN IN_Marcas     m WITH (NOLOCK) ON m.CodigoMarca  = p.Marca
WHERE $exprCant <> 0 OR pb.Remisionado <> 0
"@
    $control = 0
    foreach ($f in $filas) { $control += [double]$f["valor"] }
    Publicar "inventario" $filas ([math]::Round($control, 0)) $periodo $null $corte
  }
}

# ── Cartera (~656 ítems con saldo) ───────────────────────────────────────────
# EL PUNTO MÁS IMPORTANTE: hay que unir las bases de TODOS los años.
# Al cerrar el año el ERP abre base nueva y no arrastra el detalle, así que una
# factura de 2025 pagada en 2026 tiene el débito en E0032025 y el crédito en
# E0032026. Mirando solo 2026 salen 517 saldos negativos. Uniendo los cinco años
# el total cuadra al peso con CT_PlanTerceros.
#
# dias_mora usa la convención comercial de 360 días del ERP (decisión del dueño),
# no días calendario: así cuadra con lo que la oficina ve en SAMIT.
# ── Ventas (~18.000 líneas en 2026) ──────────────────────────────────────────
# LA MÁS DELICADA: de aquí salen las comisiones.
#
# Se sincroniza MES A MES porque fn_calcular_comisiones trabaja sobre una
# carga_id y las comisiones se liquidan por mes.
#
# valor_total va CON IVA (VrVenta + VrIva) — verificado contra el dashboard:
# factura FELE-25252, producto 93149 -> 160.571,43 + 8.028,57 = 168.600, igual
# al Excel. Si se mapeara a VrVenta a secas, TODAS las comisiones saldrían bajas.
#
# Las devoluciones (DV) tienen VrVenta POSITIVO en el ERP; el signo negativo lo
# pone el ETL, y aquí se replica igual (ventasUpload.js:49).
# Años a sincronizar. Por defecto SOLO el año en curso: la tarea programada corre
# cada 2 h y no tiene por qué reprocesar años cerrados. Para traer histórico se
# pasa -AniosVentas 2025 (o 2024,2025) una vez, a mano.
#
# Al cerrar el año el ERP abre una base nueva (E0032025, E0032026...), así que
# los movimientos se leen de la base del año. Los MAESTROS (vendedor, cliente,
# municipio) se leen siempre de E0032026: son los nombres vigentes, y es el mismo
# criterio que ya usa Sync-Cartera.
$ANIOS_VENTAS = if ($AniosVentas -and $AniosVentas.Count -gt 0) { $AniosVentas }
                else { @((Get-Date).Year) }

function Sync-Ventas {
  foreach ($anio in $ANIOS_VENTAS) {
    $db = "E003$anio"
    Escribir-Log "ventas: año $anio (base $db)"
    $meses = Consultar @"
SELECT DISTINCT CONVERT(varchar(7), d.FechaDoc, 126) AS periodo
FROM $db.dbo.IN_Documento d WITH (NOLOCK)
WHERE d.TipoDoc IN ('VE','DV') AND ISNULL(d.Anulado,0)=0
  AND YEAR(d.FechaDoc) = $anio
ORDER BY 1
"@
    foreach ($m in $meses) {
      $periodo = $m["periodo"]
      Escribir-Log "ventas $periodo : leyendo IN_Documento + IN_Movimiento"
      $filas = Consultar @"
SELECT m.Documento                                   AS erp_documento,
       m.Item                                        AS erp_item,
       d.Prefijo + '-' + d.NumComprobante            AS factura,
       d.TipoDoc                                     AS tipo,
       CONVERT(varchar(10), d.FechaDoc, 23)          AS fecha,
       CAST(NULLIF(d.Vendedor, 0) AS varchar(10))    AS vendedor_codigo,
       CAST(iv.Identificacion AS varchar(20))        AS vendedor_nit,
       iv.Nombre                                     AS vendedor_nombre,
       CAST(d.Tercero AS varchar(20))                AS cliente_nit,
       g.NombreTercero                               AS cliente_nombre,
       mu.NombreMunicipio                            AS municipio,
       m.Producto                                    AS producto_codigo,
       m.ProductoDesc                                AS producto_descripcion,
       m.Cantidad                                    AS cantidad,
       CASE WHEN d.TipoDoc='DV' THEN -(m.VrVenta + m.VrIva)
            ELSE m.VrVenta + m.VrIva END             AS valor_total,
       CASE WHEN d.TipoDoc='DV' THEN -m.Costo ELSE m.Costo END AS costo,
       m.Descuento                                   AS descuento
FROM $db.dbo.IN_Documento  d WITH (NOLOCK)
JOIN $db.dbo.IN_Movimiento m WITH (NOLOCK) ON m.Documento = d.Secuencial
LEFT JOIN E0032026.dbo.IN_Vendedor  iv WITH (NOLOCK) ON iv.CodVendedor   = d.Vendedor
LEFT JOIN E0032026.dbo.G_Clientes   g  WITH (NOLOCK) ON g.Identificacion = d.Tercero
LEFT JOIN E0032026.dbo.G_Municipio  mu WITH (NOLOCK) ON mu.IdMunicipio   = g.Municipio
WHERE d.TipoDoc IN ('VE','DV') AND ISNULL(d.Anulado,0)=0
  AND CONVERT(varchar(7), d.FechaDoc, 126) = '$periodo'
"@
      $control = 0
      foreach ($f in $filas) { $control += [double]$f["valor_total"] }
      Publicar "ventas" $filas ([math]::Round($control, 0)) $periodo
    }
  }
}

# ── Recaudos: crédito (RC/NC/CE) y contado ───────────────────────────────────
# OJO: en las tablas de recaudo `origen` es la MODALIDAD ('credito'/'contado'),
# NO la procedencia. La procedencia va en `fuente`.
$ANIOS_RECAUDOS = 2026

function Sync-Recaudos {
  foreach ($anio in $ANIOS_RECAUDOS) {
    $meses = Consultar @"
SELECT DISTINCT CONVERT(varchar(7), d.Doc_FechaDoc, 126) AS periodo
FROM CT_Documentos d WITH (NOLOCK)
WHERE d.Doc_TipoComp IN ('RC','NC','CE') AND ISNULL(d.Doc_Anulado,0)=0
  AND YEAR(d.Doc_FechaDoc)=$anio
ORDER BY 1
"@
    foreach ($m in $meses) {
      $periodo = $m["periodo"]

      Escribir-Log "recaudos $periodo credito : leyendo CT_Documentos"
      $cred = Consultar @"
-- El saldo previo a cada abono se calcula sobre el HISTORIAL COMPLETO de la
-- factura, no sobre el mes: una factura abonada en varios meses daria un saldo
-- equivocado y la funcion del ERP devolveria otra base. La ventana corre sobre
-- todos los abonos del anio y el filtro de periodo se aplica al final.
WITH abonos AS (
  SELECT d.Doc_Secuencial, d.Doc_TipoComp, d.Doc_IdComp, d.Doc_NumDocumento,
         d.Doc_FechaDoc, m.Mov_Item, m.Mov_DocDetalle, m.Mov_Cuota,
         m.Mov_Valor, m.Mov_FecVcto, m.Mov_Tercero, m.Mov_Detalle,
         SUM(m.Mov_Valor) OVER (
           PARTITION BY m.Mov_DocDetalle, m.Mov_Cuota
           ORDER BY d.Doc_FechaDoc, d.Doc_Secuencial, m.Mov_Item
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS abonado_antes
  FROM CT_Documentos  d WITH (NOLOCK)
  JOIN CT_Movimientos m WITH (NOLOCK) ON m.Mov_Documento = d.Doc_Secuencial
  -- RC, NC y CE son los tipos que el reporte manual cuenta como recaudo. Se
  -- EXCLUYEN a proposito DV (devoluciones: bajan la deuda pero no son un cobro)
  -- y CP. Verificado contra el dato manual de junio.
  WHERE d.Doc_TipoComp IN ('RC','NC','CE') AND m.Mov_Cuenta='13050501' AND m.Mov_DC='C'
    AND ISNULL(d.Doc_Anulado,0)=0 AND ISNULL(m.Mov_Anulado,0)=0
)
SELECT a.Doc_Secuencial                                  AS erp_documento,
       a.Mov_Item                                        AS erp_item,
       LTRIM(RTRIM(a.Doc_TipoComp)) + '-' + CAST(a.Doc_IdComp AS varchar(5))
         + '-' + LTRIM(RTRIM(a.Doc_NumDocumento))        AS comprobante,
       LTRIM(RTRIM(a.Mov_DocDetalle))                    AS factura,
       CONVERT(varchar(10), a.Doc_FechaDoc, 23)          AS fecha_abono,
       CONVERT(varchar(10), a.Mov_FecVcto, 23)           AS fecha_vence,
       -- valor_recaudo = el dinero recibido, BRUTO. La exclusion del IVA no va
       -- aqui: el calculo hace valor_recaudo - valor_excluido_marca - valor_iva.
       a.Mov_Valor                                       AS valor_recaudo,
       -- IVA proporcional del abono, segun la regla del PROPIO ERP.
       CASE WHEN fv.VrVenta IS NULL OR fv.VrIva IS NULL OR fv.VrIva = 0 THEN 0
            ELSE CASE WHEN a.Mov_Valor - dbo.DeterminarBasePagoComisionVendedor(
                             a.Mov_Valor, fv.VrVenta, fv.VrIva,
                             fv.VrVenta - ISNULL(a.abonado_antes, 0)) > 0
                      THEN a.Mov_Valor - dbo.DeterminarBasePagoComisionVendedor(
                             a.Mov_Valor, fv.VrVenta, fv.VrIva,
                             fv.VrVenta - ISNULL(a.abonado_antes, 0))
                      ELSE 0 END
       END                                               AS valor_iva,
         (YEAR(a.Doc_FechaDoc)  - YEAR(a.Mov_FecVcto))  * 360
       + (MONTH(a.Doc_FechaDoc) - MONTH(a.Mov_FecVcto)) * 30
       + (DAY(a.Doc_FechaDoc)   - DAY(a.Mov_FecVcto))    AS dias_mora,
       CAST(a.Mov_Tercero AS varchar(20))                AS cliente_nit,
       g.NombreTercero                                   AS cliente_nombre,
       -- Cadena: vendedor de la factura -> vendedor asignado al cliente -> '0'.
       CAST(COALESCE(NULLIF(fv.Vendedor,0), NULLIF(g.VendAsg,0), 0) AS varchar(10)) AS vendedor_codigo
FROM abonos a
LEFT JOIN G_Clientes g WITH (NOLOCK) ON g.Identificacion = a.Mov_Tercero
LEFT JOIN CT_FacVentasCred fv WITH (NOLOCK)
       ON fv.NumDoc = a.Mov_DocDetalle AND fv.Cuota = a.Mov_Cuota
WHERE CONVERT(varchar(7), a.Doc_FechaDoc, 126) = '$periodo'
"@
      $ctrl = 0; foreach ($f in $cred) { $ctrl += [double]$f["valor_recaudo"] }
      Publicar "recaudos" $cred ([math]::Round($ctrl,0)) $periodo "credito"

      # --- CONTADO: ventas que NO generaron cuenta por cobrar ---
      # Reemplaza el PDF que se mandaba a mano. Se cobra al momento:
      # fecha_vence = fecha_abono y dias_mora = 0.
      Escribir-Log "recaudos $periodo contado : leyendo ventas sin CxC"
      $cont = Consultar @"
SELECT d.Secuencial                                      AS erp_documento,
       0                                                 AS erp_item,
       d.Prefijo + '-' + d.NumComprobante                AS comprobante,
       LTRIM(RTRIM(d.NumComprobante))                    AS factura,
       CONVERT(varchar(10), d.FechaDoc, 23)              AS fecha_abono,
       CONVERT(varchar(10), d.FechaDoc, 23)              AS fecha_vence,
       d.Valor + d.ValIva                                AS valor_recaudo,
       d.ValIva                                          AS valor_iva,
       0                                                 AS dias_mora,
       CAST(d.Tercero AS varchar(20))                    AS cliente_nit,
       g.NombreTercero                                   AS cliente_nombre,
       CAST(COALESCE(NULLIF(d.Vendedor,0), NULLIF(g.VendAsg,0), 0) AS varchar(10)) AS vendedor_codigo
FROM IN_Documento d WITH (NOLOCK)
LEFT JOIN G_Clientes g WITH (NOLOCK) ON g.Identificacion = d.Tercero
WHERE d.TipoDoc='VE' AND ISNULL(d.Anulado,0)=0
  AND CONVERT(varchar(7), d.FechaDoc, 126) = '$periodo'
  AND NOT EXISTS (SELECT 1 FROM CT_FacVentasCred fv WITH (NOLOCK)
                  WHERE fv.NumDoc = d.NumComprobante)
"@
      if ($cont.Count -gt 0) {
        $ctrl2 = 0; foreach ($f in $cont) { $ctrl2 += [double]$f["valor_recaudo"] }
        Publicar "recaudos" $cont ([math]::Round($ctrl2,0)) $periodo "contado"
      } else {
        Escribir-Log "  recaudos $periodo contado: sin filas, se omite"
      }
    }
  }
}

$ANIOS_CARTERA = 2022, 2023, 2024, 2025, 2026

function Sync-Cartera {
  # Una carga por mes. Los meses cerrados se reconstruyen a su fecha de cierre
  # (el mayor de CT_Movimientos es un libro contable: filtrando por fecha se
  # obtiene el saldo a cualquier corte). El mes en curso se corta HOY y se
  # refresca en cada sincronizacion.
  $hoy = Get-Date
  $meses = @()
  if ($Backfill) {
    for ($m = 1; $m -le $hoy.Month; $m++) {
      $ini = Get-Date -Year $hoy.Year -Month $m -Day 1
      $corte = if ($m -eq $hoy.Month) { $hoy } else { $ini.AddMonths(1).AddDays(-1) }
      $meses += @{ periodo = $ini.ToString("yyyy-MM"); corte = $corte.ToString("yyyy-MM-dd") }
    }
  } else {
    $meses += @{ periodo = $hoy.ToString("yyyy-MM"); corte = $hoy.ToString("yyyy-MM-dd") }
  }

  $movs = ($ANIOS_CARTERA | ForEach-Object {
"SELECT m.Mov_Tercero, m.Mov_DocDetalle, m.Mov_Cuota, m.Mov_DC, m.Mov_Valor, m.Mov_FecVcto, d.Doc_FechaDoc
 FROM E003$_.dbo.CT_Movimientos m WITH (NOLOCK)
 JOIN E003$_.dbo.CT_Documentos  d WITH (NOLOCK) ON d.Doc_Secuencial = m.Mov_Documento
 WHERE m.Mov_Cuenta='13050501' AND ISNULL(m.Mov_Anulado,0)=0 AND ISNULL(d.Doc_Anulado,0)=0"
  }) -join " UNION ALL "

  $vends = ($ANIOS_CARTERA | ForEach-Object {
"SELECT NumDoc, Cuota, Vendedor FROM E003$_.dbo.CT_FacVentasCred WITH (NOLOCK)"
  }) -join " UNION ALL "

  foreach ($mm in $meses) {
    $periodo = $mm.periodo; $corte = $mm.corte
    Escribir-Log "cartera $periodo : corte $corte, uniendo $($ANIOS_CARTERA -join ', ')"
    $filas = Consultar @"
WITH mov AS ($movs),
agr AS (
  SELECT Mov_Tercero, Mov_DocDetalle, Mov_Cuota,
    SUM(CASE WHEN Mov_DC='D' THEN Mov_Valor ELSE -Mov_Valor END) AS saldo,
    SUM(CASE WHEN Mov_DC='D' THEN Mov_Valor ELSE 0 END)          AS valor_inicial,
    SUM(CASE WHEN Mov_DC='C' THEN Mov_Valor ELSE 0 END)          AS valor_abonos,
    MAX(Mov_FecVcto)                                             AS fecha_vencimiento,
    MIN(CASE WHEN Mov_DC='D' THEN Doc_FechaDoc END)              AS fecha_emision
  FROM mov
  WHERE Doc_FechaDoc <= '$corte'
  GROUP BY Mov_Tercero, Mov_DocDetalle, Mov_Cuota
  HAVING SUM(CASE WHEN Mov_DC='D' THEN Mov_Valor ELSE -Mov_Valor END) > 0
),
vend AS (
  SELECT NumDoc, Cuota, MAX(Vendedor) AS Vendedor FROM ($vends) v GROUP BY NumDoc, Cuota
),
calc AS (
  SELECT a.*,
    -- Mora a la FECHA DE CORTE del periodo, no a hoy: asi "como cerro junio"
    -- muestra la mora que habia el 30 de junio. Convencion DAYS360 del ERP.
      (YEAR('$corte')  - YEAR(a.fecha_vencimiento))  * 360
    + (MONTH('$corte') - MONTH(a.fecha_vencimiento)) * 30
    + (DAY('$corte')   - DAY(a.fecha_vencimiento))                AS dias_mora
  FROM agr a
)
SELECT CAST(c.Mov_DocDetalle AS varchar(20))                     AS documento_id,
       CAST(c.Mov_Cuota AS varchar(10))                          AS cuota,
       CAST(c.Mov_Tercero AS varchar(20))                        AS tercero_nit,
       g.NombreTercero                                           AS cliente_nombre,
       CONVERT(varchar(10), c.fecha_emision, 23)                 AS fecha_emision,
       CONVERT(varchar(10), c.fecha_vencimiento, 23)             AS fecha_vencimiento,
       c.dias_mora                                               AS dias_mora,
       c.saldo                                                   AS valor_saldo,
       CASE WHEN c.dias_mora > 0 THEN 'VENCIDA' ELSE 'POR VENCER' END AS estado,
       c.valor_inicial                                           AS valor_inicial,
       c.valor_abonos                                            AS valor_abonos,
       CAST(NULLIF(v.Vendedor, 0) AS varchar(10))                AS vendedor_codigo,
       iv.Nombre                                                 AS asesor,
       NULLIF(LTRIM(RTRIM(ISNULL(NULLIF(LTRIM(RTRIM(g.NumCelular)), ''), g.Tel1))), '') AS telefono,
       mu.NombreMunicipio                                        AS ciudad,
       '13050501'                                                AS cuenta_contable
FROM calc c
LEFT JOIN E0032026.dbo.G_Clientes  g  WITH (NOLOCK) ON g.Identificacion = c.Mov_Tercero
LEFT JOIN E0032026.dbo.G_Municipio mu WITH (NOLOCK) ON mu.IdMunicipio   = g.Municipio
LEFT JOIN vend v ON v.NumDoc = c.Mov_DocDetalle AND v.Cuota = c.Mov_Cuota
LEFT JOIN E0032026.dbo.IN_Vendedor iv WITH (NOLOCK) ON iv.CodVendedor = v.Vendedor
"@
    $control = 0
    foreach ($f in $filas) { $control += [double]$f["valor_saldo"] }
    Publicar "cartera" $filas ([math]::Round($control, 0)) $periodo $null $corte
  }
}

# ── Movimientos de inventario (~24.000 líneas al año) ────────────────────────
# La línea de tiempo del stock. El inventario se guarda como UNA FOTO POR MES,
# así que hoy no se ve que un producto se agotó el día 12 y volvió el día 40:
# la demanda se divide entre días en los que era imposible vender. Con estos
# movimientos el stock queda reconstruible día a día.
#
# Van TODOS los tipos que mueven existencia, no solo ventas: CO y EN suman,
# VE y SA restan, TR aparece dos veces (sale de una bodega y entra a otra) y
# DV devuelve. NA y DC no están identificados en el mapeo pero mueven
# existencia, así que entran: para reconstruir un saldo hay que sumarlo todo o
# no cuadra.
#
# Se publican TODAS las bodegas, no solo las confiables 1/5/6. El filtro vive
# del lado del cálculo, igual que en inventario, para poder cambiarlo sin
# volver a cargar el histórico.
#
# POR DEFECTO: mes en curso Y mes anterior. No solo el actual, porque una
# ventana de análisis de 90 días cruza meses y porque los documentos se
# registran con fecha atrasada (281 de 7.524 tienen FechaSys posterior a
# FechaDoc, hasta 174 días). Con -Backfill se reconstruye el año completo, que
# es además la única forma de que desaparezcan las anulaciones retroactivas de
# meses viejos.
function Sync-Movimientos {
  $hoy = Get-Date
  $meses = @()
  if ($Backfill) {
    for ($m = 1; $m -le $hoy.Month; $m++) {
      $meses += (Get-Date -Year $hoy.Year -Month $m -Day 1)
    }
  } else {
    $ini = Get-Date -Year $hoy.Year -Month $hoy.Month -Day 1
    # El mes anterior solo si cae dentro del mismo año: cada año vive en su
    # propia base del ERP y esta consulta lee la del año en curso.
    if ($hoy.Month -gt 1) { $meses += $ini.AddMonths(-1) }
    $meses += $ini
  }

  foreach ($mes in $meses) {
    $periodo = $mes.ToString("yyyy-MM")
    $desde   = $mes.ToString("yyyy-MM-dd")
    $hasta   = $mes.AddMonths(1).ToString("yyyy-MM-dd")
    Escribir-Log "movimientos $periodo"
    $filas = Consultar @"
SELECT d.Secuencial                       AS erp_documento,
       m.Item                             AS erp_item,
       CONVERT(varchar(10), d.FechaDoc, 23) AS fecha,
       LTRIM(RTRIM(d.TipoDoc))            AS tipo_doc,
       LTRIM(RTRIM(m.Producto))           AS producto_codigo,
       m.Bodega                           AS bodega,
       LTRIM(RTRIM(m.DC))                 AS dc,
       m.Cantidad                         AS cantidad
FROM IN_Documento d WITH (NOLOCK)
JOIN IN_Movimiento m WITH (NOLOCK) ON m.Documento = d.Secuencial
WHERE ISNULL(d.Anulado, 0) = 0
  AND d.FechaDoc >= '$desde' AND d.FechaDoc < '$hasta'
  AND m.Cantidad <> 0
  AND m.DC IN ('D', 'C')
"@
    # Cifra de control: suma de cantidades ABSOLUTAS. La neta no sirve, porque
    # entradas y salidas se cancelan y cualquier pérdida pasaría inadvertida.
    $control = 0
    foreach ($f in $filas) { $control += [math]::Abs([double]$f["cantidad"]) }
    Publicar "movimientos" $filas ([math]::Round($control, 0)) $periodo $null $null
  }
}

# ── Orquestación ─────────────────────────────────────────────────────────────
Escribir-Log "=== sincronización SAMIT -> VPS (dataset: $Dataset) ==="
$huboError = $false
foreach ($d in @("vendedores", "catalogo", "tasasIva", "clientes", "inventario", "movimientos", "cartera", "ventas", "recaudos")) {
  if ($Dataset -ne "todos" -and $Dataset -ne $d) { continue }
  try {
    & "Sync-$([char]::ToUpper($d[0]) + $d.Substring(1))"
  } catch {
    # Cada dataset es independiente: si uno falla, los demás siguen.
    $huboError = $true
    Escribir-Log "  ERROR en ${d}: $($_.Exception.Message)"
  }
}
Escribir-Log "=== fin ==="
if ($huboError) { exit 1 }
