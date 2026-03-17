-- =====================================================
-- 🚨 DISTRIMM - REPARACIÓN ATÓMICA (RPC V4)
-- Usamos un solo parámetro JSONB para máxima compatibilidad
-- =====================================================

-- 1. Eliminar rastro de funciones problemáticas
DROP FUNCTION IF EXISTS public.verify_distrimm_payment(uuid, text);
DROP FUNCTION IF EXISTS public.verify_distrimm_payment(text, uuid);
DROP FUNCTION IF EXISTS public.verify_distrimm_payment(p_report_id uuid, p_status text);
DROP FUNCTION IF EXISTS public.verify_distrimm_payment_v4(jsonb);

-- 2. Crear la función con UN SOLO parámetro JSONB 'p'
CREATE OR REPLACE FUNCTION public.verify_distrimm_payment_v4(p jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_report_id uuid;
    v_status text;
    v_item_ids jsonb;
    v_inv_id uuid;
    v_report_exists boolean;
BEGIN
    -- Extraer valores del JSONB
    v_report_id := (p->>'report_id')::uuid;
    v_status := p->>'status';

    -- Verificar existencia
    SELECT EXISTS(SELECT 1 FROM reportes_pago WHERE id = v_report_id) INTO v_report_exists;
    
    IF NOT v_report_exists THEN
        RAISE EXCEPTION 'El reporte con ID % no existe.', v_report_id;
    END IF;

    -- Obtener items asociados
    SELECT facturas_seleccionadas INTO v_item_ids
    FROM reportes_pago
    WHERE id = v_report_id;

    -- Actualizar estado del reporte
    UPDATE reportes_pago
    SET estado = v_status
    WHERE id = v_report_id;

    -- Procesar facturas
    IF v_item_ids IS NOT NULL AND jsonb_array_length(v_item_ids) > 0 THEN
        IF v_status = 'verificado' THEN
            FOR v_inv_id IN SELECT jsonb_array_elements_text(v_item_ids)::uuid
            LOOP
                UPDATE distrimm_cartera_items
                SET valor_saldo = 0,
                    pago_reportado = TRUE,
                    estado = 'PAGADA'
                WHERE id = v_inv_id;
            END LOOP;
        ELSIF v_status = 'rechazado' THEN
            FOR v_inv_id IN SELECT jsonb_array_elements_text(v_item_ids)::uuid
            LOOP
                UPDATE distrimm_cartera_items
                SET pago_reportado = FALSE
                WHERE id = v_inv_id;
            END LOOP;
        END IF;
    END IF;
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION public.verify_distrimm_payment_v4(jsonb) TO anon, authenticated, service_role;

-- Recarga forzosa del caché de PostgREST
NOTIFY pgrst, 'reload schema';
