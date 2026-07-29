-- ============================================================================
-- DistriMM — Movimientos de inventario (línea de tiempo del stock)
-- 2026-07-28
--
-- POR QUÉ EXISTE. El inventario se sincroniza como UNA FOTO POR MES, así que
-- el sistema no ve que un producto se agotó el día 12 y volvió el día 40.
-- `fn_sugerido_pedidos` divide la venta entre días en los que era imposible
-- vender, y subestima la demanda de justo los productos que hay que reponer.
--
-- Medido sobre los 90 días previos al 28/07/2026 (ver
-- docs/plans/2026-07-28-sugerido-precision.md):
--   · 537 de 1.082 productos con venta (50%) estuvieron sin stock
--   · 351 (32%) estuvieron sin stock 30 días o más
--   · demanda diaria del catálogo: 1.040 u/día medida hoy vs 1.618 real
--
-- Con esta tabla el stock queda reconstruible DÍA A DÍA. La identidad
-- `CantidadInicial + Σ débitos − Σ créditos = CantidadFinal` está verificada
-- en las 2.539 filas de IN_ProdBodega, y se comprobó movimiento a movimiento
-- sobre el producto 90497 (bodega 5 cierra en 14, bodega 6 en 0, idéntico al
-- ERP).
--
-- ALCANCE: esta migración solo crea el almacén y su sincronización. El cambio
-- de `fn_sugerido_pedidos` para dividir entre días CON stock va aparte, para
-- poder cargar el histórico y contrastarlo antes de mover ninguna cifra que
-- gerencia esté viendo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS distrimm_inventario_movimientos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Llave del ERP. (Documento, Item) es única: verificado en las 24.059
  -- líneas de 2026. NUNCA usar (factura, producto): hay 697 combinaciones
  -- (Documento, Producto) repetidas.
  erp_documento INTEGER NOT NULL,
  erp_item SMALLINT NOT NULL,
  fecha DATE NOT NULL,
  -- VE venta · DV devolución · CO compra · EN entrada · SA salida
  -- TR traslado · NA y DC (sin identificar, pero mueven existencia)
  tipo_doc TEXT NOT NULL,
  producto_codigo TEXT NOT NULL,
  bodega SMALLINT NOT NULL,
  -- 'D' entra a la bodega, 'C' sale. Nunca vacío en las 24.059 líneas.
  dc CHAR(1) NOT NULL CHECK (dc IN ('D', 'C')),
  cantidad NUMERIC(14,4) NOT NULL,
  -- Movimiento con signo, para poder sumar sin repetir el CASE en cada
  -- consulta. Un traslado aporta +6 a la bodega destino y −6 a la origen.
  delta NUMERIC(14,4) GENERATED ALWAYS AS
    (CASE WHEN dc = 'D' THEN cantidad ELSE -cantidad END) STORED,
  origen TEXT NOT NULL DEFAULT 'erp',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT distrimm_inventario_movimientos_erp_key UNIQUE (erp_documento, erp_item)
);

-- La consulta que viene es "todos los movimientos de este producto en esta
-- ventana, en orden": el índice va por producto y fecha.
CREATE INDEX IF NOT EXISTS idx_inv_mov_producto_fecha
  ON distrimm_inventario_movimientos (producto_codigo, fecha);

-- El borrado por periodo de fn_sync_movimientos recorre por fecha.
CREATE INDEX IF NOT EXISTS idx_inv_mov_fecha
  ON distrimm_inventario_movimientos (fecha);

ALTER TABLE distrimm_inventario_movimientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated full access on distrimm_inventario_movimientos"
  ON distrimm_inventario_movimientos;
CREATE POLICY "Authenticated full access on distrimm_inventario_movimientos"
  ON distrimm_inventario_movimientos FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- RPC de sincronización — FULL POR MES, en una transacción
--
-- Se reemplaza el mes entero en vez de hacer upsert incremental porque los
-- documentos se pueden ANULAR retroactivamente y el ERP no lo delata: ni
-- `FechaSys` ni `Doc_FechaSistema` se actualizan al anular (mapeo §6). Un
-- documento anulado hoy sobre una factura de marzo solo desaparece si marzo
-- se vuelve a publicar completo.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_sync_movimientos(p_periodo TEXT, p_filas JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mes        DATE;
  v_fin        DATE;
  v_insertados INTEGER;
  v_borrados   INTEGER;
  v_total      NUMERIC;
BEGIN
  IF p_periodo !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'p_periodo debe ser YYYY-MM, llegó %', p_periodo;
  END IF;
  IF jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'p_filas debe ser un arreglo JSON';
  END IF;

  v_mes := to_date(p_periodo || '-01', 'YYYY-MM-DD');
  v_fin := (v_mes + INTERVAL '1 month')::date;

  -- Salvaguarda: un payload vacío por un fallo de lectura del ERP no puede
  -- borrar la historia del mes. Un mes sin un solo movimiento no existe en
  -- esta operación.
  IF jsonb_array_length(p_filas) = 0 THEN
    RAISE EXCEPTION 'payload vacío: se aborta para no borrar los movimientos de %', p_periodo;
  END IF;

  CREATE TEMP TABLE tmp_mov ON COMMIT DROP AS
  SELECT
    (f->>'erp_documento')::integer                        AS erp_documento,
    (f->>'erp_item')::smallint                            AS erp_item,
    (f->>'fecha')::date                                   AS fecha,
    upper(nullif(trim(f->>'tipo_doc'), ''))               AS tipo_doc,
    -- Mismo lpad que fn_sync_inventario y fn_sync_ventas: sin esto el código
    -- no cruza contra el catálogo ni contra el inventario.
    lpad(nullif(trim(f->>'producto_codigo'), ''), 5, '0') AS producto_codigo,
    (f->>'bodega')::smallint                              AS bodega,
    upper(nullif(trim(f->>'dc'), ''))                     AS dc,
    coalesce((f->>'cantidad')::numeric, 0)                AS cantidad
  FROM jsonb_array_elements(p_filas) AS f;

  DELETE FROM tmp_mov
  WHERE erp_documento IS NULL OR erp_item IS NULL OR fecha IS NULL
     OR producto_codigo IS NULL OR bodega IS NULL
     OR dc NOT IN ('D', 'C')
     OR cantidad = 0;

  -- Una anulación puede haber creado duplicados lógicos si el ERP reusara la
  -- llave; nos quedamos con una fila por (documento, item) por si acaso.
  DELETE FROM tmp_mov a
  USING tmp_mov b
  WHERE a.erp_documento = b.erp_documento
    AND a.erp_item = b.erp_item
    AND a.ctid < b.ctid;

  -- El mes se reemplaza completo: así las anulaciones retroactivas
  -- desaparecen sin necesidad de detectarlas.
  DELETE FROM distrimm_inventario_movimientos
  WHERE origen = 'erp' AND fecha >= v_mes AND fecha < v_fin;
  GET DIAGNOSTICS v_borrados = ROW_COUNT;

  INSERT INTO distrimm_inventario_movimientos (
    erp_documento, erp_item, fecha, tipo_doc, producto_codigo, bodega, dc, cantidad, origen)
  SELECT t.erp_documento, t.erp_item, t.fecha, t.tipo_doc, t.producto_codigo,
         t.bodega, t.dc, t.cantidad, 'erp'
  FROM tmp_mov t
  -- Un documento fechado fuera del mes que se publica no entra: el borrado de
  -- arriba no lo cubriría y quedaría huérfano para siempre.
  WHERE t.fecha >= v_mes AND t.fecha < v_fin
  ON CONFLICT (erp_documento, erp_item) DO UPDATE SET
    fecha           = EXCLUDED.fecha,
    tipo_doc        = EXCLUDED.tipo_doc,
    producto_codigo = EXCLUDED.producto_codigo,
    bodega          = EXCLUDED.bodega,
    dc              = EXCLUDED.dc,
    cantidad        = EXCLUDED.cantidad;
  GET DIAGNOSTICS v_insertados = ROW_COUNT;

  -- Cifra de control: suma de cantidades ABSOLUTAS del mes. La neta no sirve
  -- —entradas y salidas se cancelan y cualquier pérdida pasaría desapercibida.
  SELECT coalesce(sum(cantidad), 0) INTO v_total
  FROM distrimm_inventario_movimientos
  WHERE origen = 'erp' AND fecha >= v_mes AND fecha < v_fin;

  RETURN jsonb_build_object(
    'periodo',        p_periodo,
    'filas_escritas', v_insertados,
    'filas_borradas', v_borrados,
    'total_cantidad', v_total
  );
END;
$$;

-- Mismo régimen que fn_sync_inventario y fn_sync_ventas: solo service_role.
-- La llama sync-ingest, nunca el navegador.
REVOKE EXECUTE ON FUNCTION fn_sync_movimientos(TEXT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_sync_movimientos(TEXT, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION fn_sync_movimientos(TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION fn_sync_movimientos(TEXT, JSONB) TO service_role;
