-- Upload atómico de ventas: carga + items + cleanup de duplicados en una transacción
-- Si cualquier paso falla, PostgreSQL hace ROLLBACK automático

CREATE OR REPLACE FUNCTION fn_upload_ventas(
  p_carga JSONB,
  p_ventas JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_carga_id UUID;
  v_old_ids UUID[];
BEGIN
  IF jsonb_array_length(p_ventas) = 0 THEN
    RAISE EXCEPTION 'p_ventas no puede estar vacío';
  END IF;

  -- Bloquear filas para evitar race conditions, luego agregar IDs
  PERFORM id FROM distrimm_comisiones_cargas
  WHERE fecha_ventas = (p_carga->>'fecha_ventas')::DATE
  FOR UPDATE;

  SELECT array_agg(id) INTO v_old_ids
  FROM distrimm_comisiones_cargas
  WHERE fecha_ventas = (p_carga->>'fecha_ventas')::DATE;

  INSERT INTO distrimm_comisiones_cargas (
    nombre_archivo, fecha_ventas, total_registros, total_ventas, total_costo
  ) VALUES (
    p_carga->>'nombre_archivo',
    (p_carga->>'fecha_ventas')::DATE,
    (p_carga->>'total_registros')::INT,
    (p_carga->>'total_ventas')::NUMERIC,
    (p_carga->>'total_costo')::NUMERIC
  ) RETURNING id INTO v_carga_id;

  INSERT INTO distrimm_comisiones_ventas (
    carga_id, vendedor_codigo, vendedor_nit, vendedor_nombre,
    producto_codigo, producto_descripcion,
    cliente_nit, cliente_nombre, municipio, fecha, factura,
    precio, descuento, valor_unidad, cantidad,
    valor_total, costo, tipo
  )
  SELECT
    v_carga_id,
    r->>'vendedor_codigo', r->>'vendedor_nit', r->>'vendedor_nombre',
    r->>'producto_codigo', r->>'producto_descripcion',
    r->>'cliente_nit', r->>'cliente_nombre', r->>'municipio',
    safe_date(r->>'fecha'), r->>'factura',
    safe_numeric(r->>'precio'), safe_numeric(r->>'descuento'),
    safe_numeric(r->>'valor_unidad'), safe_numeric(r->>'cantidad'),
    safe_numeric(r->>'valor_total'), safe_numeric(r->>'costo'),
    COALESCE(r->>'tipo', 'VE')
  FROM jsonb_array_elements(p_ventas) AS r;

  IF v_old_ids IS NOT NULL THEN
    DELETE FROM distrimm_comisiones_cargas WHERE id = ANY(v_old_ids);
  END IF;

  RETURN v_carga_id;
END;
$$;
