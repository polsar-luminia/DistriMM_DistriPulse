-- Fase 6 de la sincronización SAMIT → VPS: recaudos y contado.
--
-- OJO CON `origen`: en las tablas de recaudo NO significa procedencia, sino
-- MODALIDAD DE PAGO — vale 'credito' (recibos de caja RC) o 'contado' (el PDF
-- que hoy se manda a mano). El plan §3.5 lo mapeaba como 'RC', que está
-- desactualizado. Escribir 'erp' ahí destruiría la clasificación que usa
-- comisionesCalculator (buildDesgloseOrigen). Por eso la procedencia va en una
-- columna nueva: `fuente`.
--
-- Modelo: por mes hay DOS cargas independientes, una de cada modalidad, que se
-- concatenan para la liquidación (useComisionesCalculo.js:114-127).
--
-- Llave de idempotencia: (origen, erp_documento, erp_item). Hace falta incluir
-- la modalidad porque crédito usa CT_Documentos.Doc_Secuencial y contado usa
-- IN_Documento.Secuencial: son secuencias distintas y pueden colisionar.
--
-- Referencia: docs/plans/plan-sincronizacion-samit.md §3.5, §3.6.

-- ── Procedencia (separada de la modalidad) ──────────────────────────────────
ALTER TABLE public.distrimm_comisiones_recaudos
  ADD COLUMN IF NOT EXISTS fuente text NOT NULL DEFAULT 'manual';
ALTER TABLE public.distrimm_comisiones_cargas_recaudo
  ADD COLUMN IF NOT EXISTS fuente text NOT NULL DEFAULT 'manual';

-- El índice de Fase 0 no distinguía modalidad: se reemplaza.
DROP INDEX IF EXISTS public.uq_recaudos_erp_linea;
CREATE UNIQUE INDEX IF NOT EXISTS uq_recaudos_erp_linea
  ON public.distrimm_comisiones_recaudos (origen, erp_documento, erp_item)
  WHERE erp_documento IS NOT NULL;

-- Una sola carga sincronizada por (mes, modalidad).
CREATE UNIQUE INDEX IF NOT EXISTS uq_cargas_recaudo_erp_mes_modalidad
  ON public.distrimm_comisiones_cargas_recaudo
     ((date_trunc('month', fecha_periodo::timestamp)), origen)
  WHERE fuente = 'erp';

-- ── Reemplazo atómico de (mes, modalidad) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sync_recaudos(
  p_periodo text, p_modalidad text, p_filas jsonb)
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
  v_fecha    date;
BEGIN
  IF p_periodo !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'p_periodo debe ser YYYY-MM, llegó %', p_periodo;
  END IF;
  IF p_modalidad NOT IN ('credito', 'contado') THEN
    RAISE EXCEPTION 'p_modalidad debe ser credito o contado, llegó %', p_modalidad;
  END IF;
  IF jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) = 0 THEN
    RAISE EXCEPTION 'payload vacío o inválido para % %', p_periodo, p_modalidad;
  END IF;

  v_mes := to_date(p_periodo || '-01', 'YYYY-MM-DD');

  CREATE TEMP TABLE tmp_rec ON COMMIT DROP AS
  SELECT
    (f->>'erp_documento')::integer            AS erp_documento,
    (f->>'erp_item')::smallint                AS erp_item,
    nullif(trim(f->>'comprobante'), '')       AS comprobante,
    nullif(trim(f->>'factura'), '')           AS factura,
    (f->>'fecha_abono')::date                 AS fecha_abono,
    (f->>'fecha_vence')::date                 AS fecha_vence,
    (f->>'fecha_cxc')::date                   AS fecha_cxc,
    coalesce((f->>'valor_recaudo')::numeric, 0) AS valor_recaudo,
    -- El calculo hace valor_recaudo - valor_excluido_marca - valor_iva
    -- (comisionesCalculator.js:148). El Excel dejaba esto en cero, por eso
    -- venia comisionando sobre el IVA.
    coalesce((f->>'valor_iva')::numeric, 0)     AS valor_iva,
    (f->>'dias_mora')::integer                AS dias_mora,
    nullif(trim(f->>'cliente_nit'), '')       AS cliente_nit,
    nullif(trim(f->>'cliente_nombre'), '')    AS cliente_nombre,
    nullif(trim(f->>'vendedor_codigo'), '')   AS vendedor_codigo
  FROM jsonb_array_elements(p_filas) AS f;

  DELETE FROM tmp_rec
  WHERE erp_documento IS NULL OR erp_item IS NULL OR valor_recaudo = 0;

  SELECT max(fecha_abono) INTO v_fecha FROM tmp_rec;

  SELECT id INTO v_carga_id
  FROM distrimm_comisiones_cargas_recaudo
  WHERE fuente = 'erp' AND origen = p_modalidad
    AND date_trunc('month', fecha_periodo::timestamp) = v_mes;

  IF v_carga_id IS NULL THEN
    INSERT INTO distrimm_comisiones_cargas_recaudo
      (nombre_archivo, fecha_periodo, origen, fuente)
    VALUES ('Sincronización automática SAMIT ' || p_periodo || ' ' || p_modalidad,
            v_fecha, p_modalidad, 'erp')
    RETURNING id INTO v_carga_id;
  ELSE
    UPDATE distrimm_comisiones_cargas_recaudo
       SET fecha_periodo = v_fecha WHERE id = v_carga_id;
  END IF;

  DELETE FROM distrimm_comisiones_recaudos r
  WHERE r.carga_id = v_carga_id
    AND NOT EXISTS (
      SELECT 1 FROM tmp_rec t
      WHERE t.erp_documento = r.erp_documento AND t.erp_item = r.erp_item
    );
  GET DIAGNOSTICS v_borradas = ROW_COUNT;

  INSERT INTO distrimm_comisiones_recaudos (
    carga_id, erp_documento, erp_item, comprobante, factura, fecha_abono,
    fecha_vence, fecha_cxc, valor_recaudo, valor_iva, dias_mora, cliente_nit,
    cliente_nombre, vendedor_codigo, periodo_year, periodo_month,
    origen, fuente)
  SELECT v_carga_id, t.erp_documento, t.erp_item, t.comprobante, t.factura,
         t.fecha_abono, t.fecha_vence, t.fecha_cxc, t.valor_recaudo,
         t.valor_iva, t.dias_mora, t.cliente_nit, t.cliente_nombre, t.vendedor_codigo,
         extract(year from t.fecha_abono)::int,
         extract(month from t.fecha_abono)::int,
         p_modalidad, 'erp'
  FROM tmp_rec t
  ON CONFLICT (origen, erp_documento, erp_item) WHERE erp_documento IS NOT NULL
  DO UPDATE SET
    carga_id        = EXCLUDED.carga_id,
    comprobante     = EXCLUDED.comprobante,
    factura         = EXCLUDED.factura,
    fecha_abono     = EXCLUDED.fecha_abono,
    fecha_vence     = EXCLUDED.fecha_vence,
    fecha_cxc       = EXCLUDED.fecha_cxc,
    valor_recaudo   = EXCLUDED.valor_recaudo,
    valor_iva       = EXCLUDED.valor_iva,
    dias_mora       = EXCLUDED.dias_mora,
    cliente_nit     = EXCLUDED.cliente_nit,
    cliente_nombre  = EXCLUDED.cliente_nombre,
    vendedor_codigo = EXCLUDED.vendedor_codigo,
    periodo_year    = EXCLUDED.periodo_year,
    periodo_month   = EXCLUDED.periodo_month;
  GET DIAGNOSTICS v_escritas = ROW_COUNT;

  SELECT count(*), coalesce(sum(valor_recaudo), 0) INTO v_vigentes, v_total
  FROM distrimm_comisiones_recaudos WHERE carga_id = v_carga_id;

  UPDATE distrimm_comisiones_cargas_recaudo
     SET total_registros = v_vigentes, total_recaudado = v_total
   WHERE id = v_carga_id;

  RETURN jsonb_build_object(
    'carga_id', v_carga_id, 'periodo', p_periodo, 'modalidad', p_modalidad,
    'filas_escritas', v_escritas, 'filas_borradas', v_borradas,
    'total_registros', v_vigentes, 'total_valor', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_sync_recaudos(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sync_recaudos(text, text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
