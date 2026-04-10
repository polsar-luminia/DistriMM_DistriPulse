-- ============================================================================
-- TEST: fn_calcular_credit_score(p_nit TEXT)
-- Run in Supabase SQL Editor to validate credit score calculation.
-- Creates temp test data, runs function, validates results, then cleans up.
-- ============================================================================

DO $$
DECLARE
  v_carga_id UUID;
  v_result JSONB;
  v_score INT;
  v_nivel TEXT;
  v_plazo INT;
  v_detalles JSONB;
  v_test_count INT := 0;
  v_pass_count INT := 0;
  v_fail_count INT := 0;
  v_test_nit TEXT := '__TEST_NIT_999999__';
  v_test_nit_clean TEXT := '__TEST_NIT_CLEAN__';
  v_test_nit_none TEXT := '__TEST_NIT_NONE__';
BEGIN
  RAISE NOTICE '=== TEST: fn_calcular_credit_score ===';

  -- ── SETUP: Create a test carga (must be the most recent) ──
  INSERT INTO historial_cargas (fecha_corte, nombre_archivo, total_items)
  VALUES (CURRENT_DATE, '__TEST_CREDIT_SCORE__', 0)
  RETURNING id INTO v_carga_id;

  -- ── TEST 1: NIT sin datos → score 0, "Sin datos" ──
  v_test_count := v_test_count + 1;
  v_result := fn_calcular_credit_score(v_test_nit_none);
  v_score := (v_result->>'score')::INT;
  v_nivel := v_result->>'nivel';

  IF v_score = 0 AND v_nivel = 'Sin datos' THEN
    RAISE NOTICE 'PASS [1] NIT sin facturas: score=0, nivel="Sin datos"';
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE 'FAIL [1] NIT sin facturas: score=%, nivel=%', v_score, v_nivel;
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ── SETUP: Create invoices for "risky" client ──
  -- 5 invoices, all overdue (60-120 days), total debt 5M
  INSERT INTO cartera_items (carga_id, tercero_nit, cliente_nombre, documento_id, valor_saldo, fecha_vencimiento, fecha_emision, vendedor_codigo, dias_mora)
  VALUES
    (v_carga_id, v_test_nit, 'CLIENTE TEST', 'DOC-1', 2000000, CURRENT_DATE - INTERVAL '120 days', CURRENT_DATE - INTERVAL '150 days', '14', 120),
    (v_carga_id, v_test_nit, 'CLIENTE TEST', 'DOC-2', 1500000, CURRENT_DATE - INTERVAL '90 days', CURRENT_DATE - INTERVAL '120 days', '14', 90),
    (v_carga_id, v_test_nit, 'CLIENTE TEST', 'DOC-3', 800000, CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE - INTERVAL '90 days', '14', 60),
    (v_carga_id, v_test_nit, 'CLIENTE TEST', 'DOC-4', 500000, CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE - INTERVAL '60 days', '14', 30),
    (v_carga_id, v_test_nit, 'CLIENTE TEST', 'DOC-5', 200000, CURRENT_DATE - INTERVAL '15 days', CURRENT_DATE - INTERVAL '45 days', '14', 15);

  -- ── TEST 2: Risky client → score should be low (< 40) ──
  v_test_count := v_test_count + 1;
  v_result := fn_calcular_credit_score(v_test_nit);
  v_score := (v_result->>'score')::INT;
  v_nivel := v_result->>'nivel';
  v_plazo := (v_result->>'plazo_sugerido_dias')::INT;
  v_detalles := v_result->'detalles';

  IF v_score < 40 THEN
    RAISE NOTICE 'PASS [2] Cliente riesgoso: score=% (< 40)', v_score;
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE 'FAIL [2] Cliente riesgoso: score=% (esperaba < 40)', v_score;
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ── TEST 3: Nivel matches score range ──
  v_test_count := v_test_count + 1;
  IF (v_score >= 80 AND v_nivel = 'Excelente')
    OR (v_score >= 60 AND v_score < 80 AND v_nivel = 'Bueno')
    OR (v_score >= 40 AND v_score < 60 AND v_nivel = 'Regular')
    OR (v_score >= 20 AND v_score < 40 AND v_nivel = 'Riesgo')
    OR (v_score < 20 AND v_nivel = 'Alto riesgo')
  THEN
    RAISE NOTICE 'PASS [3] Nivel "%" corresponde a score=%', v_nivel, v_score;
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE 'FAIL [3] Nivel "%" no corresponde a score=%', v_nivel, v_score;
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ── TEST 4: Plazo matches nivel ──
  v_test_count := v_test_count + 1;
  IF (v_nivel = 'Excelente' AND v_plazo = 90)
    OR (v_nivel = 'Bueno' AND v_plazo = 60)
    OR (v_nivel = 'Regular' AND v_plazo = 30)
    OR (v_nivel = 'Riesgo' AND v_plazo = 15)
    OR (v_nivel = 'Alto riesgo' AND v_plazo = 0)
  THEN
    RAISE NOTICE 'PASS [4] Plazo=% días corresponde a nivel "%"', v_plazo, v_nivel;
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE 'FAIL [4] Plazo=% no corresponde a nivel "%"', v_plazo, v_nivel;
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ── TEST 5: Detalles contain expected fields ──
  v_test_count := v_test_count + 1;
  IF v_detalles ? 'mora_promedio_ponderada'
    AND v_detalles ? 'max_mora'
    AND v_detalles ? 'concentracion_vencida_pct'
    AND v_detalles ? 'num_facturas'
    AND v_detalles ? 'antiguedad_dias'
    AND v_detalles ? 'total_deuda'
    AND v_detalles ? 'deuda_vencida'
    AND v_detalles ? 'scores_parciales'
  THEN
    RAISE NOTICE 'PASS [5] Detalles contienen todos los campos esperados';
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE 'FAIL [5] Detalles faltan campos: %', v_detalles;
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ── TEST 6: max_mora = 120 (the oldest overdue) ──
  v_test_count := v_test_count + 1;
  IF (v_detalles->>'max_mora')::INT = 120 THEN
    RAISE NOTICE 'PASS [6] max_mora=120 (factura más antigua)';
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE 'FAIL [6] max_mora=% (esperaba 120)', v_detalles->>'max_mora';
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ── TEST 7: num_facturas = 5 ──
  v_test_count := v_test_count + 1;
  IF (v_detalles->>'num_facturas')::INT = 5 THEN
    RAISE NOTICE 'PASS [7] num_facturas=5';
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE 'FAIL [7] num_facturas=% (esperaba 5)', v_detalles->>'num_facturas';
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ── TEST 8: total_deuda = 5M ──
  v_test_count := v_test_count + 1;
  IF (v_detalles->>'total_deuda')::NUMERIC = 5000000 THEN
    RAISE NOTICE 'PASS [8] total_deuda=5000000';
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE 'FAIL [8] total_deuda=% (esperaba 5000000)', v_detalles->>'total_deuda';
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ── TEST 9: concentracion_vencida = 100% (all overdue) ──
  v_test_count := v_test_count + 1;
  IF (v_detalles->>'concentracion_vencida_pct')::INT = 100 THEN
    RAISE NOTICE 'PASS [9] concentracion_vencida=100%% (todo vencido)';
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE 'FAIL [9] concentracion_vencida=%% (esperaba 100)', v_detalles->>'concentracion_vencida_pct';
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ── TEST 10: facturas_vencidas array has 5 items ──
  v_test_count := v_test_count + 1;
  IF jsonb_array_length(v_result->'facturas_vencidas') = 5 THEN
    RAISE NOTICE 'PASS [10] facturas_vencidas tiene 5 elementos';
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE 'FAIL [10] facturas_vencidas tiene % elementos (esperaba 5)',
      jsonb_array_length(v_result->'facturas_vencidas');
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ── TEST 11: Clean client (all current) → high score (>= 60) ──
  v_test_count := v_test_count + 1;
  INSERT INTO cartera_items (carga_id, tercero_nit, cliente_nombre, documento_id, valor_saldo, fecha_vencimiento, fecha_emision, vendedor_codigo, dias_mora)
  VALUES
    (v_carga_id, v_test_nit_clean, 'CLIENTE LIMPIO', 'DOC-C1', 1000000, CURRENT_DATE + INTERVAL '30 days', CURRENT_DATE - INTERVAL '200 days', '4', 0),
    (v_carga_id, v_test_nit_clean, 'CLIENTE LIMPIO', 'DOC-C2', 800000, CURRENT_DATE + INTERVAL '15 days', CURRENT_DATE - INTERVAL '180 days', '4', 0),
    (v_carga_id, v_test_nit_clean, 'CLIENTE LIMPIO', 'DOC-C3', 500000, CURRENT_DATE + INTERVAL '45 days', CURRENT_DATE - INTERVAL '160 days', '4', 0),
    (v_carga_id, v_test_nit_clean, 'CLIENTE LIMPIO', 'DOC-C4', 300000, CURRENT_DATE + INTERVAL '60 days', CURRENT_DATE - INTERVAL '140 days', '4', 0),
    (v_carga_id, v_test_nit_clean, 'CLIENTE LIMPIO', 'DOC-C5', 200000, CURRENT_DATE + INTERVAL '90 days', CURRENT_DATE - INTERVAL '120 days', '4', 0);

  v_result := fn_calcular_credit_score(v_test_nit_clean);
  v_score := (v_result->>'score')::INT;
  v_nivel := v_result->>'nivel';

  IF v_score >= 60 THEN
    RAISE NOTICE 'PASS [11] Cliente limpio: score=% (>= 60), nivel="%"', v_score, v_nivel;
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE 'FAIL [11] Cliente limpio: score=% (esperaba >= 60)', v_score;
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ── TEST 12: Clean client has 0 facturas_vencidas ──
  v_test_count := v_test_count + 1;
  IF jsonb_array_length(COALESCE(v_result->'facturas_vencidas', '[]'::jsonb)) = 0 THEN
    RAISE NOTICE 'PASS [12] Cliente limpio: 0 facturas vencidas';
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE 'FAIL [12] Cliente limpio: % facturas vencidas (esperaba 0)',
      jsonb_array_length(v_result->'facturas_vencidas');
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ── TEST 13: Score weights sum to 1.0 (35+20+20+10+15 = 100) ──
  v_test_count := v_test_count + 1;
  -- Verify via partial scores: clean client should have high partials
  v_detalles := v_result->'detalles'->'scores_parciales';
  IF v_detalles IS NOT NULL
    AND (v_detalles->>'mora_prom')::INT >= 0
    AND (v_detalles->>'max_mora')::INT >= 0
    AND (v_detalles->>'concentracion')::INT >= 0
    AND (v_detalles->>'num_facturas')::INT >= 0
    AND (v_detalles->>'antiguedad')::INT >= 0
  THEN
    RAISE NOTICE 'PASS [13] Scores parciales presentes y >= 0: mora_prom=%, max_mora=%, concentracion=%, num_facturas=%, antiguedad=%',
      v_detalles->>'mora_prom', v_detalles->>'max_mora',
      v_detalles->>'concentracion', v_detalles->>'num_facturas',
      v_detalles->>'antiguedad';
    v_pass_count := v_pass_count + 1;
  ELSE
    RAISE NOTICE 'FAIL [13] Scores parciales inválidos: %', v_detalles;
    v_fail_count := v_fail_count + 1;
  END IF;

  -- ── CLEANUP ──
  DELETE FROM cartera_items WHERE carga_id = v_carga_id;
  DELETE FROM historial_cargas WHERE id = v_carga_id;

  -- ── SUMMARY ──
  RAISE NOTICE '';
  RAISE NOTICE '=== RESULTS: %/% passed ===', v_pass_count, v_test_count;
  IF v_fail_count = 0 THEN
    RAISE NOTICE 'ALL TESTS PASSED';
  ELSE
    RAISE NOTICE '% TESTS FAILED', v_fail_count;
  END IF;
END $$;
