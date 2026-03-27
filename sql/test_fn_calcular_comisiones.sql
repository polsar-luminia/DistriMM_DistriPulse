-- ============================================================================
-- TEST: fn_calcular_comisiones(p_carga_id UUID)
-- Run in Supabase SQL Editor to validate commission calculation logic.
-- Creates temp test data, runs function, validates results, then cleans up.
-- ============================================================================

DO $$
DECLARE
  v_carga_id UUID;
  v_result RECORD;
  v_count INT := 0;
  v_pass INT := 0;
  v_fail INT := 0;
BEGIN
  RAISE NOTICE '=== TEST: fn_calcular_comisiones ===';

  -- ── SETUP: Create test data ──
  INSERT INTO distrimm_comisiones_cargas (nombre_archivo, fecha_ventas, total_registros)
  VALUES ('__TEST_COMISIONES__', '2026-01-15', 0)
  RETURNING id INTO v_carga_id;

  -- Products in catalog (with brands)
  INSERT INTO distrimm_productos_catalogo (codigo, nombre, marca) VALUES
    ('PROD-A', 'Producto A', 'CONTEGRAL'),
    ('PROD-B', 'Producto B', 'TECNOQUIMICAS'),
    ('PROD-C', 'Producto C', 'VICAR')
  ON CONFLICT (codigo) DO UPDATE SET marca = EXCLUDED.marca;

  -- Exclusion: VICAR is excluded by brand
  INSERT INTO distrimm_comisiones_exclusiones (tipo, valor, descripcion, activa)
  VALUES ('marca', 'VICAR', '__TEST__', TRUE)
  ON CONFLICT DO NOTHING;

  -- Sales: 2 vendors
  INSERT INTO distrimm_comisiones_ventas (carga_id, vendedor_codigo, vendedor_nombre, producto_codigo, producto_descripcion, valor_total, costo) VALUES
    -- Vendor 14: 2 sales CONTEGRAL + 1 TECNOQUIMICAS + 1 VICAR (excluded)
    (v_carga_id, '14', 'PAULO', 'PROD-A', 'Producto A', 1000000, 800000),
    (v_carga_id, '14', 'PAULO', 'PROD-A', 'Producto A', 500000, 400000),
    (v_carga_id, '14', 'PAULO', 'PROD-B', 'Producto B', 300000, 250000),
    (v_carga_id, '14', 'PAULO', 'PROD-C', 'Producto C (excluido)', 200000, 150000),
    -- Vendor 4: 1 sale only
    (v_carga_id, '4', 'ESNEIDER', 'PROD-B', 'Producto B', 700000, 600000);

  -- ── TEST 1: Function returns results for both vendors ──
  v_count := v_count + 1;
  SELECT COUNT(*) INTO v_pass FROM fn_calcular_comisiones(v_carga_id);
  IF v_pass = 2 THEN
    RAISE NOTICE 'PASS [1] Retorna 2 vendedores';
    v_pass := 1;
  ELSE
    RAISE NOTICE 'FAIL [1] Esperaba 2 vendedores, obtuvo %', v_pass;
    v_fail := v_fail + 1;
    v_pass := 0;
  END IF;

  -- ── TEST 2: Vendor 14 — totals correct ──
  v_count := v_count + 1;
  SELECT * INTO v_result FROM fn_calcular_comisiones(v_carga_id)
  WHERE vendedor_codigo = '14';

  IF v_result.total_ventas = 2000000 -- 1M + 500K + 300K + 200K
     AND v_result.total_costo = 1600000 -- 800K + 400K + 250K + 150K
  THEN
    RAISE NOTICE 'PASS [2] Vendor 14: total_ventas=2000000, total_costo=1600000';
    v_pass := v_pass + 1;
  ELSE
    RAISE NOTICE 'FAIL [2] Vendor 14: total_ventas=%, total_costo=%',
      v_result.total_ventas, v_result.total_costo;
    v_fail := v_fail + 1;
  END IF;

  -- ── TEST 3: VICAR exclusion applied ──
  v_count := v_count + 1;
  IF v_result.ventas_excluidas = 200000 AND v_result.items_excluidos = 1 THEN
    RAISE NOTICE 'PASS [3] VICAR exclusion: ventas_excluidas=200000, items=1';
    v_pass := v_pass + 1;
  ELSE
    RAISE NOTICE 'FAIL [3] Exclusion: ventas_excluidas=%, items=%',
      v_result.ventas_excluidas, v_result.items_excluidos;
    v_fail := v_fail + 1;
  END IF;

  -- ── TEST 4: Comisionable = total - excluded ──
  v_count := v_count + 1;
  IF v_result.ventas_comisionables = 1800000 -- 2M - 200K
     AND v_result.costo_comisionable = 1450000 -- 1.6M - 150K
     AND v_result.items_comisionables = 3
  THEN
    RAISE NOTICE 'PASS [4] Comisionables: ventas=1800000, costo=1450000, items=3';
    v_pass := v_pass + 1;
  ELSE
    RAISE NOTICE 'FAIL [4] Comisionables: ventas=%, costo=%, items=%',
      v_result.ventas_comisionables, v_result.costo_comisionable, v_result.items_comisionables;
    v_fail := v_fail + 1;
  END IF;

  -- ── TEST 5: Margen comisionable ──
  v_count := v_count + 1;
  -- margen = ventas_comisionables - costo_comisionable = 1800000 - 1450000 = 350000
  IF v_result.margen_comisionable = 350000 THEN
    RAISE NOTICE 'PASS [5] Margen comisionable=350000';
    v_pass := v_pass + 1;
  ELSE
    RAISE NOTICE 'FAIL [5] Margen comisionable=%', v_result.margen_comisionable;
    v_fail := v_fail + 1;
  END IF;

  -- ── TEST 6: Vendor 4 — no exclusions ──
  v_count := v_count + 1;
  SELECT * INTO v_result FROM fn_calcular_comisiones(v_carga_id)
  WHERE vendedor_codigo = '4';

  IF v_result.ventas_excluidas = 0
     AND v_result.items_excluidos = 0
     AND v_result.ventas_comisionables = 700000
  THEN
    RAISE NOTICE 'PASS [6] Vendor 4: sin exclusiones, comisionable=700000';
    v_pass := v_pass + 1;
  ELSE
    RAISE NOTICE 'FAIL [6] Vendor 4: excluidas=%, comisionable=%',
      v_result.ventas_excluidas, v_result.ventas_comisionables;
    v_fail := v_fail + 1;
  END IF;

  -- ── TEST 7: Empty carga returns no rows ──
  v_count := v_count + 1;
  SELECT COUNT(*) INTO v_pass FROM fn_calcular_comisiones(gen_random_uuid());
  IF v_pass = 0 THEN
    RAISE NOTICE 'PASS [7] Carga inexistente retorna 0 filas';
    -- reset v_pass for final count
    SELECT COUNT(*) INTO v_pass FROM (
      SELECT 1 FROM fn_calcular_comisiones(v_carga_id)
    ) t;
    v_pass := v_count - v_fail;
  ELSE
    RAISE NOTICE 'FAIL [7] Carga inexistente retornó % filas', v_pass;
    v_fail := v_fail + 1;
    v_pass := v_count - v_fail;
  END IF;

  -- ── CLEANUP ──
  DELETE FROM distrimm_comisiones_ventas WHERE carga_id = v_carga_id;
  DELETE FROM distrimm_comisiones_cargas WHERE id = v_carga_id;
  DELETE FROM distrimm_comisiones_exclusiones WHERE descripcion = '__TEST__';
  -- Don't delete catalog products as they might exist for real

  RAISE NOTICE '';
  RAISE NOTICE '=== RESULTS: %/% passed ===', v_pass, v_count;
  IF v_fail = 0 THEN
    RAISE NOTICE 'ALL TESTS PASSED';
  ELSE
    RAISE NOTICE '% TESTS FAILED', v_fail;
  END IF;
END $$;
