-- FINAL SCHEMA FIX FOR PAYMENT PORTAL
-- This script fixes the column name mismatches (cliente -> cliente_nombre)

-- 1. Ensure column exists
ALTER TABLE distrimm_cartera_items 
ADD COLUMN IF NOT EXISTS pago_reportado BOOLEAN DEFAULT FALSE;

-- 2. Corrected RPC Function
CREATE OR REPLACE FUNCTION get_payment_info(lookup_id UUID)
RETURNS TABLE (
    client_name TEXT,
    client_phone TEXT,
    invoices JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    target_client TEXT;
    target_phone TEXT;
BEGIN
    -- Corrected column: cliente_nombre
    SELECT cliente_nombre, telefono INTO target_client, target_phone
    FROM distrimm_cartera_items
    WHERE id = lookup_id;

    IF target_client IS NULL THEN
        -- Check if maybe it's a different UUID type or record doesn't exist
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        target_client,
        target_phone,
        jsonb_agg(
            jsonb_build_object(
                'id', i.id,
                'factura', i.documento_id,
                'valor', i.valor_saldo,
                'vencimiento', i.fecha_vencimiento,
                'pago_reportado', COALESCE(i.pago_reportado, false)
            )
        )
    FROM distrimm_cartera_items i
    WHERE i.cliente_nombre = target_client 
      AND i.valor_saldo > 0
      AND (i.pago_reportado IS FALSE OR i.pago_reportado IS NULL);
END;
$$;

-- 3. Ensure Table exists
CREATE TABLE IF NOT EXISTS reportes_pago (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_id UUID REFERENCES distrimm_cartera_items(id),
    cliente_nombre TEXT,
    monto_reportado NUMERIC,
    comprobante_url TEXT,
    facturas_seleccionadas JSONB,
    estado TEXT DEFAULT 'pendiente',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Enable RLS
ALTER TABLE reportes_pago ENABLE ROW LEVEL SECURITY;

-- 5. Corrected Trigger Function
CREATE OR REPLACE FUNCTION mark_invoices_as_reported()
RETURNS TRIGGER AS $$
DECLARE
    inv_id UUID;
BEGIN
    FOR inv_id IN SELECT jsonb_array_elements_text(NEW.facturas_seleccionadas)::UUID
    LOOP
        UPDATE distrimm_cartera_items
        SET pago_reportado = TRUE
        WHERE id = inv_id;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Trigger
DROP TRIGGER IF EXISTS trigger_mark_reported ON reportes_pago;
CREATE TRIGGER trigger_mark_reported
AFTER INSERT ON reportes_pago
FOR EACH ROW
EXECUTE FUNCTION mark_invoices_as_reported();
