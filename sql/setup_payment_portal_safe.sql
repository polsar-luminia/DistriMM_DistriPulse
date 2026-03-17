-- 1. Add 'pago_reportado' column to existing items
ALTER TABLE distrimm_cartera_items 
ADD COLUMN IF NOT EXISTS pago_reportado BOOLEAN DEFAULT FALSE;

-- 2. Create 'reportes_pago' table
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

-- 3. Create Storage Bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('comprobantes', 'comprobantes', true)
ON CONFLICT (id) DO NOTHING;

-- 4. RLS Policies for Storage (Skip if exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname = 'Public Access Select'
    ) THEN
        CREATE POLICY "Public Access Select" ON storage.objects 
        FOR SELECT USING ( bucket_id = 'comprobantes' );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname = 'Public Access Insert'
    ) THEN
        CREATE POLICY "Public Access Insert" ON storage.objects 
        FOR INSERT WITH CHECK ( bucket_id = 'comprobantes' );
    END IF;
END $$;

-- 5. RLS for reportes_pago
ALTER TABLE reportes_pago ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'reportes_pago' 
        AND policyname = 'Anon Insert'
    ) THEN
        CREATE POLICY "Anon Insert" ON reportes_pago 
        FOR INSERT WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'reportes_pago' 
        AND policyname = 'Enable Read for Users'
    ) THEN
        CREATE POLICY "Enable Read for Users" ON reportes_pago 
        FOR SELECT USING (true);
    END IF;
END $$;

-- 6. Function to Get Debt Info
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

-- 7. Trigger to mark invoices as reported
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

DROP TRIGGER IF EXISTS trigger_mark_reported ON reportes_pago;
CREATE TRIGGER trigger_mark_reported
AFTER INSERT ON reportes_pago
FOR EACH ROW
EXECUTE FUNCTION mark_invoices_as_reported();
