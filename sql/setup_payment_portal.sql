-- 1. Add 'pago_reportado' column to existing items
ALTER TABLE distrimm_cartera_items 
ADD COLUMN IF NOT EXISTS pago_reportado BOOLEAN DEFAULT FALSE;

-- 2. Create 'reportes_pago' table
CREATE TABLE IF NOT EXISTS reportes_pago (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_id UUID REFERENCES distrimm_cartera_items(id),
    cliente_nombre TEXT, -- Stored for redundancy/easier access
    monto_reportado NUMERIC,
    comprobante_url TEXT,
    facturas_seleccionadas JSONB, -- Array of IDs that this payment covers
    estado TEXT DEFAULT 'pendiente', -- pendiente, verificado, rechazado
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create Storage Bucket (If not exists, usually manual in dashboard, but we try SQL)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('comprobantes', 'comprobantes', true)
ON CONFLICT (id) DO NOTHING;

-- 4. RLS Policies for Storage (Allow Anon Uploads)
CREATE POLICY "Public Access Select" ON storage.objects FOR SELECT USING ( bucket_id = 'comprobantes' );
CREATE POLICY "Public Access Insert" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'comprobantes' );

-- 5. RLS for reportes_pago (Allow Anon Insert)
ALTER TABLE reportes_pago ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon Insert" ON reportes_pago FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable Read for Users" ON reportes_pago FOR SELECT USING (true); -- Verify logic later

-- 6. Secure Function to Get Debt Info by UUID (Avoids opening Table RLS to public)
CREATE OR REPLACE FUNCTION get_payment_info(lookup_id UUID)
RETURNS TABLE (
    client_name TEXT,
    client_phone TEXT,
    invoices JSONB
) 
LANGUAGE plpgsql
SECURITY DEFINER -- Runs as admin
AS $$
DECLARE
    target_client TEXT;
    target_phone TEXT;
BEGIN
    -- Find client from the provided invoice ID
    SELECT cliente, telefono INTO target_client, target_phone
    FROM distrimm_cartera_items
    WHERE id = lookup_id;

    IF target_client IS NULL THEN
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
                'pago_reportado', i.pago_reportado
            )
        )
    FROM distrimm_cartera_items i
    WHERE i.cliente = target_client 
      AND i.valor_saldo > 0
      AND (i.pago_reportado IS FALSE OR i.pago_reportado IS NULL);
END;
$$;

-- 7. Trigger to update pago_reportado when a report is created
CREATE OR REPLACE FUNCTION mark_invoices_as_reported()
RETURNS TRIGGER AS $$
DECLARE
    inv_id UUID;
BEGIN
    -- Loop through the array of selected invoice IDs
    FOR inv_id IN SELECT jsonb_array_elements_text(NEW.facturas_seleccionadas)::UUID
    LOOP
        UPDATE distrimm_cartera_items
        SET pago_reportado = TRUE
        WHERE id = inv_id;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_mark_reported
AFTER INSERT ON reportes_pago
FOR EACH ROW
EXECUTE FUNCTION mark_invoices_as_reported();
