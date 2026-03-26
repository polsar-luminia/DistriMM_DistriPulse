-- Upload atómico de recaudos: carga + items + cleanup de duplicados en una transacción
-- Si cualquier paso falla, PostgreSQL hace ROLLBACK automático

CREATE OR REPLACE FUNCTION fn_upload_recaudos(
  p_carga JSONB,
  p_recaudos JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_carga_id UUID;
  v_old_ids UUID[];
BEGIN
  IF jsonb_array_length(p_recaudos) = 0 THEN
    RAISE EXCEPTION 'p_recaudos no puede estar vacío';
  END IF;

  -- Bloquear y reemplazar TODAS las cargas del mismo mes (la última acumulativa reemplaza las anteriores)
  PERFORM id FROM distrimm_comisiones_cargas_recaudo
  WHERE EXTRACT(YEAR FROM fecha_periodo) = EXTRACT(YEAR FROM (p_carga->>'fecha_periodo')::DATE)
    AND EXTRACT(MONTH FROM fecha_periodo) = EXTRACT(MONTH FROM (p_carga->>'fecha_periodo')::DATE)
  FOR UPDATE;

  SELECT array_agg(id) INTO v_old_ids
  FROM distrimm_comisiones_cargas_recaudo
  WHERE EXTRACT(YEAR FROM fecha_periodo) = EXTRACT(YEAR FROM (p_carga->>'fecha_periodo')::DATE)
    AND EXTRACT(MONTH FROM fecha_periodo) = EXTRACT(MONTH FROM (p_carga->>'fecha_periodo')::DATE);

  INSERT INTO distrimm_comisiones_cargas_recaudo (
    nombre_archivo, fecha_periodo, total_registros,
    total_recaudado, total_comisionable, registros_excluidos_mora, total_iva
  ) VALUES (
    p_carga->>'nombre_archivo',
    (p_carga->>'fecha_periodo')::DATE,
    (p_carga->>'total_registros')::INT,
    (p_carga->>'total_recaudado')::NUMERIC,
    (p_carga->>'total_comisionable')::NUMERIC,
    (p_carga->>'registros_excluidos_mora')::INT,
    COALESCE((p_carga->>'total_iva')::NUMERIC, 0)
  ) RETURNING id INTO v_carga_id;

  INSERT INTO distrimm_comisiones_recaudos (
    carga_id, vendedor_codigo, cliente_nit, cliente_nombre,
    factura, comprobante, fecha_abono, fecha_cxc, fecha_vence,
    valor_recaudo, valor_excluido_marca, valor_iva, dias_mora,
    aplica_comision, periodo_year, periodo_month
  )
  SELECT
    v_carga_id,
    r->>'vendedor_codigo', r->>'cliente_nit', r->>'cliente_nombre',
    r->>'factura', r->>'comprobante',
    NULLIF(r->>'fecha_abono', '')::DATE,
    NULLIF(r->>'fecha_cxc', '')::DATE,
    NULLIF(r->>'fecha_vence', '')::DATE,
    safe_numeric(r->>'valor_recaudo'),
    safe_numeric(r->>'valor_excluido_marca'),
    safe_numeric(r->>'valor_iva'),
    safe_int(r->>'dias_mora'),
    COALESCE((r->>'aplica_comision')::BOOLEAN, true),
    COALESCE(NULLIF(r->>'periodo_year', '')::INT, 0),
    COALESCE(NULLIF(r->>'periodo_month', '')::INT, 0)
  FROM jsonb_array_elements(p_recaudos) AS r;

  IF v_old_ids IS NOT NULL THEN
    DELETE FROM distrimm_comisiones_cargas_recaudo WHERE id = ANY(v_old_ids);
  END IF;

  RETURN v_carga_id;
END;
$$;
