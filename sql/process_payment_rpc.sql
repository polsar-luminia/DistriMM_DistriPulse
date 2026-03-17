-- RPC to process payment verification or rejection
CREATE OR REPLACE FUNCTION process_payment_report(
    report_id UUID,
    new_status TEXT -- 'verificado' or 'rechazado'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    item_ids JSONB;
    inv_id UUID;
BEGIN
    -- 1. Get the list of invoices associated with this report
    SELECT facturas_seleccionadas INTO item_ids
    FROM reportes_pago
    WHERE id = report_id;

    -- 2. Update the report status
    UPDATE reportes_pago
    SET estado = new_status
    WHERE id = report_id;

    -- 3. Update associated invoices
    IF new_status = 'verificado' THEN
        -- Mark as fully paid
        FOR inv_id IN SELECT jsonb_array_elements_text(item_ids)::UUID
        LOOP
            UPDATE distrimm_cartera_items
            SET valor_saldo = 0,
                pago_reportado = TRUE,
                estado = 'PAGADA' -- Optional: track as paid
            WHERE id = inv_id;
        END LOOP;
    ELSIF new_status = 'rechazado' THEN
        -- Release the "pending" flag so they appear in reminders again
        FOR inv_id IN SELECT jsonb_array_elements_text(item_ids)::UUID
        LOOP
            UPDATE distrimm_cartera_items
            SET pago_reportado = FALSE
            WHERE id = inv_id;
        END LOOP;
    END IF;
END;
$$;
