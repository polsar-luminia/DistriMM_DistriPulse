-- Fase 2 de la sincronización SAMIT → VPS: inventario.
--
-- El inventario NO es una tabla de estado actual: es una serie de instantáneas
-- (`distrimm_inventario_cargas`) y fn_sugerido_pedidos lee UNA carga concreta.
-- Por eso la sincronización no crea una carga por corrida (cada 2 h serían
-- ~4.400 cargas al año) sino que mantiene UNA SOLA carga de origen 'erp' y la
-- actualiza en sitio.
--
-- Todo el reemplazo ocurre dentro de la transacción implícita de la función:
-- ninguna sesión ve un estado intermedio, que es lo que pide el plan §8
-- ("nunca borrar primero e insertar después").
--
-- Referencia: docs/plans/plan-sincronizacion-samit.md §3.3, §4, §8.

-- ── Procedencia y llaves ────────────────────────────────────────────────────
ALTER TABLE public.distrimm_inventario_cargas
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'manual';

-- Garantiza que solo pueda existir UNA carga sincronizada.
-- UNA CARGA POR MES, igual que cartera y ventas.
DROP INDEX IF EXISTS public.uq_inventario_cargas_erp;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventario_cargas_erp_mes
  ON public.distrimm_inventario_cargas ((date_trunc('month', fecha_saldos::timestamp)))
  WHERE origen = 'erp';

-- Llave natural del ítem dentro de una carga.
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventario_items_carga_prod_bodega
  ON public.distrimm_inventario_items (carga_id, producto_codigo, bodega);

-- ── Reemplazo atómico ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sync_inventario(p_periodo text, p_corte date, p_filas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carga_id   uuid;
  v_mes        date;
  v_insertados integer;
  v_borrados   integer;
  v_vigentes   integer;
  v_total      numeric;
BEGIN
  IF p_periodo !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'p_periodo debe ser YYYY-MM, llegó %', p_periodo;
  END IF;
  IF jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'p_filas debe ser un arreglo JSON';
  END IF;
  v_mes := to_date(p_periodo || '-01', 'YYYY-MM-DD');

  -- Salvaguarda: un payload vacío por un fallo de lectura del ERP no puede
  -- vaciar el inventario que ve gerencia.
  IF jsonb_array_length(p_filas) = 0 THEN
    RAISE EXCEPTION 'payload vacío: se aborta para no borrar el inventario vigente';
  END IF;

  -- La carga 'erp' es única (índice parcial de arriba): se crea una vez y
  -- después solo se refresca.
  SELECT id INTO v_carga_id FROM distrimm_inventario_cargas
   WHERE origen = 'erp' AND date_trunc('month', fecha_saldos::timestamp) = v_mes;

  IF v_carga_id IS NULL THEN
    INSERT INTO distrimm_inventario_cargas (nombre_archivo, fecha_saldos, origen)
    VALUES ('Sincronización SAMIT ' || p_periodo, p_corte, 'erp')
    RETURNING id INTO v_carga_id;
  END IF;

  CREATE TEMP TABLE tmp_inv ON COMMIT DROP AS
  SELECT
    lpad(nullif(trim(f->>'producto_codigo'), ''), 5, '0') AS producto_codigo,
    nullif(trim(f->>'producto_nombre'), '')               AS producto_nombre,
    (f->>'bodega')::smallint                              AS bodega,
    coalesce((f->>'cantidad')::numeric, 0)                AS cantidad,
    coalesce((f->>'valor')::numeric, 0)                   AS valor,
    coalesce((f->>'transito')::numeric, 0)                AS transito,
    nullif(trim(f->>'categoria_codigo'), '')              AS categoria_codigo,
    nullif(trim(f->>'categoria_nombre'), '')              AS categoria_nombre,
    nullif(trim(f->>'marca'), '')                         AS marca,
    (f->>'ult_compra')::date                              AS ult_compra,
    (f->>'ult_val_compra')::numeric                       AS ult_val_compra,
    (f->>'ult_val_venta')::numeric                        AS ult_val_venta,
    (f->>'precio_medio')::numeric                         AS precio_medio
  FROM jsonb_array_elements(p_filas) AS f;

  -- Mismo filtro que el ETL manual (inventarioUpload.js): sin código, sin
  -- bodega válida, o sin existencia ni tránsito, la fila no entra.
  DELETE FROM tmp_inv
  WHERE producto_codigo IS NULL
     OR bodega IS NULL OR bodega <= 0
     OR (cantidad = 0 AND transito = 0);

  -- 1) Fuera lo que ya no existe en el ERP.
  DELETE FROM distrimm_inventario_items i
  WHERE i.carga_id = v_carga_id
    AND NOT EXISTS (
      SELECT 1 FROM tmp_inv t
      WHERE t.producto_codigo = i.producto_codigo AND t.bodega = i.bodega
    );
  GET DIAGNOSTICS v_borrados = ROW_COUNT;

  -- 2) Entra/actualiza el estado vigente.
  INSERT INTO distrimm_inventario_items (
    carga_id, producto_codigo, producto_nombre, bodega, cantidad, valor,
    transito, categoria_codigo, categoria_nombre, marca, ult_compra,
    ult_val_compra, ult_val_venta, precio_medio)
  SELECT v_carga_id, t.producto_codigo, t.producto_nombre, t.bodega, t.cantidad,
         t.valor, t.transito, t.categoria_codigo, t.categoria_nombre, t.marca,
         t.ult_compra, t.ult_val_compra, t.ult_val_venta, t.precio_medio
  FROM tmp_inv t
  ON CONFLICT (carga_id, producto_codigo, bodega) DO UPDATE SET
    producto_nombre  = EXCLUDED.producto_nombre,
    cantidad         = EXCLUDED.cantidad,
    valor            = EXCLUDED.valor,
    transito         = EXCLUDED.transito,
    categoria_codigo = EXCLUDED.categoria_codigo,
    categoria_nombre = EXCLUDED.categoria_nombre,
    marca            = EXCLUDED.marca,
    ult_compra       = EXCLUDED.ult_compra,
    ult_val_compra   = EXCLUDED.ult_val_compra,
    ult_val_venta    = EXCLUDED.ult_val_venta,
    precio_medio     = EXCLUDED.precio_medio;
  GET DIAGNOSTICS v_insertados = ROW_COUNT;

  SELECT count(*), coalesce(sum(valor), 0)
    INTO v_vigentes, v_total
  FROM distrimm_inventario_items WHERE carga_id = v_carga_id;

  UPDATE distrimm_inventario_cargas
     SET fecha_saldos    = p_corte,
         total_registros = v_vigentes,
         total_valor     = v_total,
         updated_at      = now()
   WHERE id = v_carga_id;

  RETURN jsonb_build_object(
    'carga_id',        v_carga_id,
    'filas_escritas',  v_insertados,
    'filas_borradas',  v_borrados,
    'total_registros', v_vigentes,
    'total_valor',     v_total
  );
END;
$$;

DROP FUNCTION IF EXISTS public.fn_sync_inventario(jsonb);
REVOKE ALL ON FUNCTION public.fn_sync_inventario(text, date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sync_inventario(text, date, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
