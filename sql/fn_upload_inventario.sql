-- Upload atómico de inventario (Saldos de Productos): carga + items + cleanup
-- de cargas anteriores de la misma fecha en una transacción.
-- Si cualquier paso falla, PostgreSQL hace ROLLBACK automático.

CREATE OR REPLACE FUNCTION fn_upload_inventario(
  p_carga JSONB,
  p_items JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carga_id UUID;
  v_old_ids UUID[];
  v_fecha DATE := (p_carga->>'fecha_saldos')::DATE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'p_items no puede estar vacío';
  END IF;

  -- Reemplazar cargas de la misma fecha (re-subir el archivo corrige la anterior)
  PERFORM id FROM distrimm_inventario_cargas
  WHERE fecha_saldos = v_fecha
  FOR UPDATE;

  SELECT array_agg(id) INTO v_old_ids
  FROM distrimm_inventario_cargas
  WHERE fecha_saldos = v_fecha;

  INSERT INTO distrimm_inventario_cargas (
    nombre_archivo, fecha_saldos, total_registros, total_valor
  ) VALUES (
    p_carga->>'nombre_archivo',
    v_fecha,
    (p_carga->>'total_registros')::INT,
    (p_carga->>'total_valor')::NUMERIC
  ) RETURNING id INTO v_carga_id;

  INSERT INTO distrimm_inventario_items (
    carga_id, producto_codigo, producto_nombre, bodega,
    cantidad, valor, transito,
    categoria_codigo, categoria_nombre, marca,
    ult_compra, ult_val_compra, ult_val_venta, precio_medio
  )
  SELECT
    v_carga_id,
    i->>'producto_codigo',
    i->>'producto_nombre',
    safe_int(i->>'bodega'),
    safe_numeric(i->>'cantidad'),
    safe_numeric(i->>'valor'),
    safe_numeric(i->>'transito'),
    i->>'categoria_codigo',
    i->>'categoria_nombre',
    i->>'marca',
    safe_date(i->>'ult_compra'),
    safe_numeric(i->>'ult_val_compra'),
    safe_numeric(i->>'ult_val_venta'),
    safe_numeric(i->>'precio_medio')
  FROM jsonb_array_elements(p_items) AS i;

  IF v_old_ids IS NOT NULL THEN
    DELETE FROM distrimm_inventario_cargas WHERE id = ANY(v_old_ids);
  END IF;

  RETURN v_carga_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_upload_inventario(JSONB, JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION fn_upload_inventario(JSONB, JSONB) FROM anon;
