-- ═══════════════════════════════════════════════════════════════════════════
-- margen_pct: numeric(8,2) → numeric(18,2)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Aplicado el 26/07/2026, al sincronizar el histórico de ventas de 2025.
--
-- POR QUÉ. `margen_pct` es GENERATED ALWAYS AS ((valor_total - costo)/valor_total)*100.
-- Con numeric(8,2) el tope es ±999.999,99, y 2025 trae 15 líneas que lo pasan:
-- artículos facturados a 1 peso con su costo real (obsequios, muestras, ajustes).
-- Ejemplo real: FELE-16696, producto 91614, valor 2 y costo 250.000 → -12.499.900%.
-- La sincronización de 2025-02 fallaba con `numeric field overflow` y el dataset
-- se cortaba ahí.
--
-- POR QUÉ ENSANCHAR Y NO RECORTAR. Se evaluó acotar la expresión con
-- LEAST/GREATEST, pero cuesta lo mismo (ambas obligan a recrear la columna) y
-- falsea el dato. El porcentaje es absurdo pero correcto: el margen de vender
-- algo de 250.000 por 2 pesos ES catastrófico, y esconderlo detrás de un tope
-- lo haría parecer una venta mala normal. 18,2 iguala a sus columnas hermanas
-- (valor_total, costo, margen_valor).
--
-- OJO: una columna generada no se puede ALTER TYPE — hay que DROP y ADD, lo que
-- reescribe la tabla (130.265 filas, 58 MB) y obliga a soltar antes las dos
-- vistas que la leen. Todo va en UNA transacción para que nadie vea la tabla a
-- medias.
--
-- Quien mire promedios de margen: estas líneas son atípicos que arrastran
-- cualquier AVG(margen_pct). Conviene acotar por rango al analizar.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP VIEW IF EXISTS distrimm_ventas_vigentes;
DROP VIEW IF EXISTS comisiones_ventas;

ALTER TABLE distrimm_comisiones_ventas DROP COLUMN margen_pct;

ALTER TABLE distrimm_comisiones_ventas
  ADD COLUMN margen_pct numeric(18,2)
  GENERATED ALWAYS AS (
    CASE
      WHEN valor_total <> 0::numeric
        THEN ((valor_total - costo) / valor_total) * 100::numeric
      ELSE 0::numeric
    END
  ) STORED;

-- Vista de compatibilidad: espejo plano de la tabla.
CREATE VIEW comisiones_ventas AS
 SELECT id, carga_id, vendedor_codigo, vendedor_nit, vendedor_nombre,
        producto_codigo, producto_descripcion, cliente_nit, cliente_nombre,
        municipio, fecha, factura, precio, descuento, valor_unidad, cantidad,
        valor_total, costo, created_at, tipo, margen_valor, margen_pct
   FROM distrimm_comisiones_ventas;

-- Vista DEDUPLICADA: una sola carga por mes, siempre la del ERP.
-- Es la que hay que usar para cualquier agregado; la tabla cruda tiene cargas
-- solapadas de la era manual y multiplica los totales ~10x.
CREATE VIEW distrimm_ventas_vigentes AS
 SELECT v.id, v.carga_id, v.vendedor_codigo, v.vendedor_nit, v.vendedor_nombre,
        v.producto_codigo, v.producto_descripcion, v.cliente_nit, v.cliente_nombre,
        v.municipio, v.fecha, v.factura, v.precio, v.descuento, v.valor_unidad,
        v.cantidad, v.valor_total, v.costo, v.created_at, v.tipo,
        v.margen_valor, v.margen_pct
   FROM distrimm_comisiones_ventas v
   JOIN ( SELECT DISTINCT ON ((date_trunc('month', c.fecha_ventas::timestamp)))
                 c.id
            FROM distrimm_comisiones_cargas c
           WHERE c.origen = 'erp'
           ORDER BY (date_trunc('month', c.fecha_ventas::timestamp)),
                    c.fecha_ventas DESC, c.created_at DESC
        ) ultima_del_mes ON ultima_del_mes.id = v.carga_id;

COMMIT;
