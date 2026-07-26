-- Fase 5 de la sincronización SAMIT → VPS: ventas.
--
-- LA FASE DE MAYOR RIESGO: de estos datos salen las comisiones que se le pagan
-- a los vendedores. Nada se apaga hasta validar fn_calcular_comisiones sobre un
-- mes cerrado contra el cálculo manual.
--
-- Mata de raíz la duplicación descrita en CLAUDE.md. Los archivos de Excel son
-- ACUMULADOS del mes, así que un mes queda con ~18 cargas solapadas y la tabla
-- tiene 110.107 filas donde deberían ir ~22.400. El ERP no tiene acumulados:
-- cada línea tiene identidad propia y estable, `(IN_Movimiento.Documento, Item)`.
-- Con upsert sobre esa llave, correr la sincronización 1 vez o 50 da el mismo
-- estado y `SUM(valor_total)` vuelve a ser correcto.
--
-- POR QUÉ (Documento, Item) Y NO OTRA COSA:
--   · `factura` NO es única: una devolución DV reutiliza el número de la VE
--     original (FELE-25197 existe como VE y como DV).
--   · (Documento, Producto) tampoco: 697 combinaciones se repiten.
--
-- MODELO DE CARGAS: una carga sincronizada POR MES. fn_calcular_comisiones
-- trabaja sobre una carga_id, y las comisiones se liquidan por mes; meter todo
-- el año en una sola carga rompería ese cálculo.
--
-- Referencia: docs/plans/plan-sincronizacion-samit.md §2, §3.2.

-- ── Procedencia ─────────────────────────────────────────────────────────────
ALTER TABLE public.distrimm_comisiones_cargas
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'manual';

-- Una sola carga sincronizada por mes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_comisiones_cargas_erp_mes
  ON public.distrimm_comisiones_cargas ((date_trunc('month', fecha_ventas::timestamp)))
  WHERE origen = 'erp';

-- ── La vista de dedup debe SEGUIR PREFIRIENDO LO MANUAL ─────────────────────
--
-- Sin esto el corte ocurre solo: la carga sincronizada lleva fecha más reciente
-- que la manual del mes, el DISTINCT ON la elegiría, y todo lo que agrega ventas
-- (CFO, MCP, comisiones) cambiaría de fuente en silencio.
--
-- PARA HACER EL CORTE: borrar la línea `(c.origen = 'erp')` del ORDER BY.
CREATE OR REPLACE VIEW public.distrimm_ventas_vigentes AS
SELECT v.id, v.carga_id, v.vendedor_codigo, v.vendedor_nit, v.vendedor_nombre,
       v.producto_codigo, v.producto_descripcion, v.cliente_nit, v.cliente_nombre,
       v.municipio, v.fecha, v.factura, v.precio, v.descuento, v.valor_unidad,
       v.cantidad, v.valor_total, v.costo, v.created_at, v.tipo,
       v.margen_valor, v.margen_pct
FROM distrimm_comisiones_ventas v
JOIN (
  SELECT DISTINCT ON ((date_trunc('month', c.fecha_ventas::timestamp))) c.id
  FROM distrimm_comisiones_cargas c
  ORDER BY (date_trunc('month', c.fecha_ventas::timestamp)),
           (c.origen = 'erp'),          -- false (manual) primero: convivencia
           c.fecha_ventas DESC,
           c.created_at DESC
) ultima_del_mes ON ultima_del_mes.id = v.carga_id;

-- ── Reemplazo atómico de un mes ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sync_ventas(p_periodo text, p_filas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carga_id uuid;
  v_mes      date;
  v_escritas integer;
  v_borradas integer;
  v_vigentes integer;
  v_total    numeric;
  v_costo    numeric;
  v_fecha    date;
BEGIN
  IF p_periodo !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'p_periodo debe ser YYYY-MM, llegó %', p_periodo;
  END IF;
  IF jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) = 0 THEN
    RAISE EXCEPTION 'payload vacío o inválido para el periodo %', p_periodo;
  END IF;

  v_mes := to_date(p_periodo || '-01', 'YYYY-MM-DD');

  CREATE TEMP TABLE tmp_ven ON COMMIT DROP AS
  SELECT
    (f->>'erp_documento')::integer                         AS erp_documento,
    (f->>'erp_item')::smallint                             AS erp_item,
    nullif(trim(f->>'factura'), '')                        AS factura,
    upper(nullif(trim(f->>'tipo'), ''))                    AS tipo,
    (f->>'fecha')::date                                    AS fecha,
    nullif(trim(f->>'vendedor_codigo'), '')                AS vendedor_codigo,
    nullif(trim(f->>'vendedor_nit'), '')                   AS vendedor_nit,
    nullif(trim(f->>'vendedor_nombre'), '')                AS vendedor_nombre,
    nullif(trim(f->>'cliente_nit'), '')                    AS cliente_nit,
    nullif(trim(f->>'cliente_nombre'), '')                 AS cliente_nombre,
    nullif(trim(f->>'municipio'), '')                      AS municipio,
    lpad(nullif(trim(f->>'producto_codigo'), ''), 5, '0')  AS producto_codigo,
    nullif(trim(f->>'producto_descripcion'), '')           AS producto_descripcion,
    coalesce((f->>'cantidad')::numeric, 0)                 AS cantidad,
    coalesce((f->>'valor_total')::numeric, 0)              AS valor_total,
    coalesce((f->>'costo')::numeric, 0)                    AS costo,
    coalesce((f->>'descuento')::numeric, 0)                AS descuento
  FROM jsonb_array_elements(p_filas) AS f;

  DELETE FROM tmp_ven
  WHERE erp_documento IS NULL OR erp_item IS NULL
     OR producto_codigo IS NULL
     OR valor_total = 0;   -- mismo filtro que el ETL manual (ventasUpload.js)

  SELECT max(fecha) INTO v_fecha FROM tmp_ven;

  SELECT id INTO v_carga_id
  FROM distrimm_comisiones_cargas
  WHERE origen = 'erp' AND date_trunc('month', fecha_ventas::timestamp) = v_mes;

  IF v_carga_id IS NULL THEN
    INSERT INTO distrimm_comisiones_cargas (nombre_archivo, fecha_ventas, origen)
    VALUES ('Sincronización automática SAMIT ' || p_periodo, v_fecha, 'erp')
    RETURNING id INTO v_carga_id;
  ELSE
    UPDATE distrimm_comisiones_cargas SET fecha_ventas = v_fecha, updated_at = now()
     WHERE id = v_carga_id;
  END IF;

  -- 1) Fuera las líneas del mes que ya no existen en el ERP (anuladas, borradas).
  DELETE FROM distrimm_comisiones_ventas v
  WHERE v.carga_id = v_carga_id
    AND NOT EXISTS (
      SELECT 1 FROM tmp_ven t
      WHERE t.erp_documento = v.erp_documento AND t.erp_item = v.erp_item
    );
  GET DIAGNOSTICS v_borradas = ROW_COUNT;

  -- 2) Estado vigente. `valor_total` va CON IVA (VrVenta+VrIva) y las DV con
  --    signo negativo: así lo espera comisionesCalculator.
  INSERT INTO distrimm_comisiones_ventas (
    carga_id, erp_documento, erp_item, factura, tipo, fecha, vendedor_codigo,
    vendedor_nit, vendedor_nombre, cliente_nit, cliente_nombre, municipio,
    producto_codigo, producto_descripcion, cantidad, valor_total, costo,
    descuento, valor_unidad, precio, origen)
    -- margen_valor y margen_pct NO se escriben: son GENERATED ALWAYS en el
    -- destino, con la misma fórmula (valor_total - costo). La base las calcula.
  SELECT v_carga_id, t.erp_documento, t.erp_item, t.factura, t.tipo, t.fecha,
         t.vendedor_codigo, t.vendedor_nit, t.vendedor_nombre, t.cliente_nit,
         t.cliente_nombre, t.municipio, t.producto_codigo, t.producto_descripcion,
         t.cantidad, t.valor_total, t.costo, t.descuento,
         CASE WHEN t.cantidad <> 0 THEN t.valor_total / t.cantidad END,
         CASE WHEN t.cantidad <> 0 THEN t.valor_total / t.cantidad END,
         'erp'
  FROM tmp_ven t
  ON CONFLICT (erp_documento, erp_item) WHERE erp_documento IS NOT NULL
  DO UPDATE SET
    carga_id             = EXCLUDED.carga_id,
    factura              = EXCLUDED.factura,
    tipo                 = EXCLUDED.tipo,
    fecha                = EXCLUDED.fecha,
    vendedor_codigo      = EXCLUDED.vendedor_codigo,
    vendedor_nit         = EXCLUDED.vendedor_nit,
    vendedor_nombre      = EXCLUDED.vendedor_nombre,
    cliente_nit          = EXCLUDED.cliente_nit,
    cliente_nombre       = EXCLUDED.cliente_nombre,
    municipio            = EXCLUDED.municipio,
    producto_codigo      = EXCLUDED.producto_codigo,
    producto_descripcion = EXCLUDED.producto_descripcion,
    cantidad             = EXCLUDED.cantidad,
    valor_total          = EXCLUDED.valor_total,
    costo                = EXCLUDED.costo,
    descuento            = EXCLUDED.descuento,
    valor_unidad         = EXCLUDED.valor_unidad,
    precio               = EXCLUDED.precio;
  GET DIAGNOSTICS v_escritas = ROW_COUNT;

  SELECT count(*), coalesce(sum(valor_total), 0), coalesce(sum(costo), 0)
    INTO v_vigentes, v_total, v_costo
  FROM distrimm_comisiones_ventas WHERE carga_id = v_carga_id;

  UPDATE distrimm_comisiones_cargas
     SET total_registros = v_vigentes, total_ventas = v_total,
         total_costo = v_costo, updated_at = now()
   WHERE id = v_carga_id;

  RETURN jsonb_build_object(
    'carga_id', v_carga_id, 'periodo', p_periodo,
    'filas_escritas', v_escritas, 'filas_borradas', v_borradas,
    'total_registros', v_vigentes, 'total_valor', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_sync_ventas(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sync_ventas(text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
