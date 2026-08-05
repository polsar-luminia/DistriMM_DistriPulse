-- ═══════════════════════════════════════════════════════════════════════════
-- distrimm_recaudos_comisionables — los dos candados que la sincronización perdió
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Creada el 26/07/2026.
--
-- EL PROBLEMA. La base comisionable de un recaudo es
-- `valor_recaudo − valor_excluido_marca − valor_iva`, contando solo las filas
-- con `aplica_comision`. Los dos primeros descuentos los calculaba el MODAL DE
-- CARGA MANUAL (`RecaudoUploadModal` + `recaudoEnrichment.js`), que se desmontó
-- al cortar a la sincronización. `fn_sync_recaudos` nunca los escribió, así que
-- las 5.794 filas del ERP entran con `aplica_comision = true` y
-- `valor_excluido_marca = 0`: todo comisiona. Contra 449 y 1.234 filas que el
-- modal sí marcaba.
--
-- POR QUÉ UNA VISTA Y NO ESCRIBIRLO AL SINCRONIZAR. El snapshot
-- (`distrimm_comisiones_snapshots`) YA congela la liquidación; guardar además
-- los valores congelados en la fila es congelar dos veces y crea una segunda
-- copia que hay que mantener al día. Una vista no se desactualiza: si mañana
-- gerencia agrega una marca excluida o cambia los días de mora, todo lo que se
-- recalcule usa la regla nueva y lo ya liquidado sigue intacto en su snapshot.
--
-- SOLO TOCA LAS FILAS DEL ERP. Las manuales conservan sus valores guardados,
-- como el resto del proyecto: los datos manuales no se reescriben. No es
-- nostalgia — son el registro de lo que se liquidó y se pagó.
--
-- VALIDACIÓN. Portar esta lógica a SQL y contrastarla contra las 4.095 filas
-- manuales —mismos insumos, comparar salidas— da **99,0%** de coincidencia. Las
-- 39 diferencias están todas explicadas y en las tres causas el valor viejo era
-- el equivocado: 22 porque el modal leía `distrimm_comisiones_ventas` (la tabla
-- CRUDA, con cargas solapadas: la factura 20892 le daba 250,1% de exclusión,
-- imposible), 11 porque no encontró la venta y guardó 0, y 6 por facturas
-- neteadas a cero.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW distrimm_recaudos_comisionables
WITH (security_invoker = true) AS
WITH umbral AS (
  -- Los días de mora los configura gerencia desde la pantalla de Exclusiones.
  -- El 72 de respaldo solo aplica si la fila no está: ante una lectura fallida
  -- conviene liquidar como siempre, no dejar de excluir a nadie (sobrepagar).
  SELECT COALESCE(
    (SELECT valor::int FROM distrimm_comisiones_exclusiones
      WHERE tipo = 'dias_mora' AND activa LIMIT 1), 72) AS dias
),
marcas_excl AS (
  SELECT normalize_brand(valor) AS marca
  FROM distrimm_comisiones_exclusiones
  WHERE activa AND tipo = 'marca'
),
productos_excl AS (
  SELECT upper(btrim(valor)) AS codigo
  FROM distrimm_comisiones_exclusiones
  WHERE activa AND tipo = 'producto'
),
-- Por factura: fecha de emisión y qué proporción era de marcas/productos
-- excluidos. Se lee de la vista DEDUPLICADA, nunca de la tabla cruda: ahí las
-- cargas solapadas de la era manual producen proporciones por encima del 100%.
-- El producto manda sobre la marca, igual que en `getExclusionInfo`.
por_factura AS (
  SELECT regexp_replace(v.factura, '^(FELE|FCI)-', '') AS fac,
         min(v.fecha) AS fecha_factura,
         sum(v.valor_total) AS venta_total,
         COALESCE(sum(v.valor_total) FILTER (
           WHERE upper(btrim(v.producto_codigo)) IN (SELECT codigo FROM productos_excl)
              OR normalize_brand(p.marca) IN (SELECT marca FROM marcas_excl)
         ), 0) AS venta_excluida
  FROM distrimm_ventas_vigentes v
  LEFT JOIN distrimm_productos_catalogo p ON p.codigo = v.producto_codigo
  GROUP BY 1
)
SELECT
  r.id,
  r.carga_id,
  r.vendedor_codigo,
  r.cliente_nit,
  r.cliente_nombre,
  r.factura,
  r.comprobante,
  r.fecha_abono,
  r.fecha_cxc,
  r.fecha_vence,
  r.valor_recaudo,
  r.dias_mora,

  -- Mora: los días se cuentan DESDE LA EMISIÓN DE LA FACTURA (decisión del
  -- dueño, 26/07/2026), que es lo que el umbral de 72 siempre significó.
  --
  -- OJO, la trampa: `r.dias_mora` NO sirve aquí. La sincronización lo calcula
  -- desde el VENCIMIENTO (`Doc_FechaDoc − Mov_FecVcto`), mientras que el Excel
  -- lo contaba desde la factura. La diferencia es el plazo de pago —846 filas
  -- difieren en exactamente 30 días, otras en 45 o 60— así que aplicar 72 sobre
  -- la medida del ERP sería mucho más laxo: en marzo el vendedor 14 pasaría de
  -- 54% a 102% de su meta y cobraría 4,3 millones de más.
  --
  -- Se recalcula contra la fecha de la venta, que reproduce la medida histórica
  -- en 3.582 de 3.702 filas comparables (96,8%).
  --
  -- Sin fecha de factura (35 filas, 5,6 M) no se puede saber cuánto tardó el
  -- cobro: no comisiona. Es la misma política conservadora que el modal manual
  -- aplicaba a las facturas sin cruce en cartera.
  --
  -- Contado se cobra en el acto: cero días por definición.
  CASE WHEN c.fuente <> 'erp'  THEN r.aplica_comision
       WHEN r.origen = 'contado' THEN true
       WHEN pf.fecha_factura IS NULL THEN false
       ELSE (r.fecha_abono - pf.fecha_factura) BETWEEN 0 AND u.dias
  END AS aplica_comision,

  r.periodo_year,
  r.periodo_month,
  r.created_at,

  -- Marca: se descuenta del abono la misma proporción que la factura tenía en
  -- marcas excluidas. `venta_total = 0` es una factura devuelta por completo
  -- (VE y DV se cancelan): se decide explícitamente que no excluye nada, en vez
  -- de dejar que una división por cero lo resuelva sola. Son 6 filas y vienen
  -- en pares +/− que se anulan, así que no mueve dinero — pero queda escrito.
  CASE WHEN c.fuente <> 'erp' THEN r.valor_excluido_marca
       WHEN pf.venta_total IS NULL OR pf.venta_total <= 0 THEN 0
       ELSE round(pf.venta_excluida / pf.venta_total * r.valor_recaudo)
  END AS valor_excluido_marca,

  r.valor_iva,
  r.origen,
  r.erp_documento,
  r.erp_item,
  r.fuente,

  -- Los días que la regla de mora de arriba REALMENTE evaluó (desde la emisión
  -- de la factura). Existe porque la UI etiquetaba el motivo de exclusión
  -- adivinándolo con `r.dias_mora` —la medida del ERP, desde el vencimiento— y
  -- un abono a 85 días de la factura pero 25 del vencimiento salía rotulado
  -- "100% marca" en vez de mora. NULL = factura sin cruce (no comisiona por
  -- política conservadora, no por mora).
  CASE WHEN c.fuente <> 'erp'      THEN r.dias_mora  -- lo manual ya contaba desde la emisión
       WHEN r.origen = 'contado'   THEN 0
       WHEN pf.fecha_factura IS NULL THEN NULL
       ELSE r.fecha_abono - pf.fecha_factura
  END AS dias_mora_comision
FROM distrimm_comisiones_recaudos r
JOIN distrimm_comisiones_cargas_recaudo c ON c.id = r.carga_id
LEFT JOIN por_factura pf ON pf.fac = r.factura
CROSS JOIN umbral u;

GRANT SELECT ON distrimm_recaudos_comisionables TO authenticated, service_role, anon;
