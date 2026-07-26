-- Fase 4 de la sincronización SAMIT → VPS: cartera.
--
-- Origen: agregación de CT_Movimientos sobre la cuenta 13050501 UNIENDO LAS
-- BASES DE TODOS LOS AÑOS (E0032022..E0032026). Mirando solo 2026 aparecen 517
-- saldos negativos, porque al cerrar el año el ERP abre base nueva y no arrastra
-- el detalle: una factura de 2025 pagada en 2026 tiene el débito en E0032025 y
-- el crédito en E0032026. Verificado hoy: uniendo los cinco años salen 656 ítems
-- por 1.295.446.226 COP, que cuadra AL PESO con CT_PlanTerceros.
--
-- `dias_mora` se guarda con la convención comercial de 360 días del ERP
-- (decisión del dueño, 26/07/2026), para que los números cuadren con lo que la
-- oficina ve en SAMIT. Consumidores verificados:
--   · la leen directo  → fn_cfo_* (buckets de aging, >90, >360) y las fn_mcp_*
--   · la recalculan    → la UI (portfolioCalculations.preprocessItems) y el
--                        score crediticio, a los que les da igual.
--
-- Igual que inventario, es un dataset FULL sobre UNA sola carga de origen 'erp',
-- reemplazada dentro de una transacción.
--
-- Referencia: docs/plans/plan-sincronizacion-samit.md §3.1; mapeo §5.

ALTER TABLE public.historial_cargas
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'manual';

-- UNA CARGA POR MES. El mes en curso se refresca en sitio en cada
-- sincronizacion; al cambiar de mes queda congelado y se abre el siguiente.
-- Asi "como cerro junio" es consultable y julio muestra el estado hasta la
-- ultima sincronizacion.
DROP INDEX IF EXISTS public.uq_historial_cargas_erp;
CREATE UNIQUE INDEX IF NOT EXISTS uq_historial_cargas_erp_mes
  ON public.historial_cargas ((date_trunc('month', fecha_corte::timestamp)))
  WHERE origen = 'erp';

CREATE UNIQUE INDEX IF NOT EXISTS uq_cartera_items_carga_doc_cuota
  ON public.cartera_items (carga_id, documento_id, cuota, tercero_nit);

CREATE OR REPLACE FUNCTION public.fn_sync_cartera(p_periodo text, p_corte date, p_filas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carga_id  uuid;
  v_mes       date;
  v_escritas  integer;
  v_borradas  integer;
  v_vigentes  integer;
  v_total     numeric;
BEGIN
  IF p_periodo !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'p_periodo debe ser YYYY-MM, llegó %', p_periodo;
  END IF;
  IF jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'p_filas debe ser un arreglo JSON';
  END IF;
  v_mes := to_date(p_periodo || '-01', 'YYYY-MM-DD');

  -- Un payload vacío por fallo de lectura no puede borrarle la cartera a gerencia.
  IF jsonb_array_length(p_filas) = 0 THEN
    RAISE EXCEPTION 'payload vacío: se aborta para no borrar la cartera vigente';
  END IF;

  SELECT id INTO v_carga_id FROM historial_cargas
   WHERE origen = 'erp' AND date_trunc('month', fecha_corte::timestamp) = v_mes;

  IF v_carga_id IS NULL THEN
    INSERT INTO historial_cargas (nombre_archivo, fecha_corte, origen)
    VALUES ('Sincronización SAMIT ' || p_periodo, p_corte, 'erp')
    RETURNING id INTO v_carga_id;
  END IF;

  CREATE TEMP TABLE tmp_cart ON COMMIT DROP AS
  SELECT
    nullif(trim(f->>'documento_id'), '')      AS documento_id,
    coalesce(nullif(trim(f->>'cuota'), ''), '1') AS cuota,
    nullif(trim(f->>'tercero_nit'), '')       AS tercero_nit,
    nullif(trim(f->>'cliente_nombre'), '')    AS cliente_nombre,
    (f->>'fecha_emision')::date               AS fecha_emision,
    (f->>'fecha_vencimiento')::date           AS fecha_vencimiento,
    (f->>'dias_mora')::integer                AS dias_mora,
    (f->>'valor_saldo')::numeric              AS valor_saldo,
    nullif(trim(f->>'estado'), '')            AS estado,
    (f->>'valor_inicial')::numeric            AS valor_inicial,
    (f->>'valor_abonos')::numeric             AS valor_abonos,
    nullif(trim(f->>'vendedor_codigo'), '')   AS vendedor_codigo,
    nullif(trim(f->>'asesor'), '')            AS asesor,
    nullif(trim(f->>'telefono'), '')          AS telefono,
    nullif(trim(f->>'ciudad'), '')            AS ciudad,
    nullif(trim(f->>'cuenta_contable'), '')   AS cuenta_contable
  FROM jsonb_array_elements(p_filas) AS f;

  DELETE FROM tmp_cart
  WHERE documento_id IS NULL OR tercero_nit IS NULL
     OR valor_saldo IS NULL OR valor_saldo <= 0;

  -- 1) Fuera lo que ya se pagó o dejó de existir.
  DELETE FROM cartera_items i
  WHERE i.carga_id = v_carga_id
    AND NOT EXISTS (
      SELECT 1 FROM tmp_cart t
      WHERE t.documento_id = i.documento_id
        AND t.cuota        = i.cuota
        AND t.tercero_nit  = i.tercero_nit
    );
  GET DIAGNOSTICS v_borradas = ROW_COUNT;

  -- 2) Estado vigente.
  INSERT INTO cartera_items (
    carga_id, documento_id, cuota, tercero_nit, cliente_nombre, fecha_emision,
    fecha_vencimiento, dias_mora, valor_saldo, estado, valor_inicial,
    valor_abonos, vendedor_codigo, asesor, telefono, ciudad, cuenta_contable)
  SELECT v_carga_id, t.documento_id, t.cuota, t.tercero_nit, t.cliente_nombre,
         t.fecha_emision, t.fecha_vencimiento, t.dias_mora, t.valor_saldo,
         t.estado, t.valor_inicial, t.valor_abonos, t.vendedor_codigo,
         t.asesor, t.telefono, t.ciudad, t.cuenta_contable
  FROM tmp_cart t
  ON CONFLICT (carga_id, documento_id, cuota, tercero_nit) DO UPDATE SET
    cliente_nombre    = EXCLUDED.cliente_nombre,
    fecha_emision     = EXCLUDED.fecha_emision,
    fecha_vencimiento = EXCLUDED.fecha_vencimiento,
    dias_mora         = EXCLUDED.dias_mora,
    valor_saldo       = EXCLUDED.valor_saldo,
    estado            = EXCLUDED.estado,
    valor_inicial     = EXCLUDED.valor_inicial,
    valor_abonos      = EXCLUDED.valor_abonos,
    vendedor_codigo   = EXCLUDED.vendedor_codigo,
    asesor            = EXCLUDED.asesor,
    telefono          = EXCLUDED.telefono,
    ciudad            = EXCLUDED.ciudad,
    cuenta_contable   = EXCLUDED.cuenta_contable;
  GET DIAGNOSTICS v_escritas = ROW_COUNT;

  SELECT count(*), coalesce(sum(valor_saldo), 0) INTO v_vigentes, v_total
  FROM cartera_items WHERE carga_id = v_carga_id;

  UPDATE historial_cargas
     SET fecha_corte         = p_corte,
         total_registros     = v_vigentes,
         total_valor_cartera = v_total
   WHERE id = v_carga_id;

  RETURN jsonb_build_object(
    'carga_id',        v_carga_id,
    'periodo',         p_periodo,
    'filas_escritas',  v_escritas,
    'filas_borradas',  v_borradas,
    'total_registros', v_vigentes,
    'total_valor',     v_total
  );
END;
$$;

DROP FUNCTION IF EXISTS public.fn_sync_cartera(jsonb);
REVOKE ALL ON FUNCTION public.fn_sync_cartera(text, date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sync_cartera(text, date, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
