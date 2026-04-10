-- Secure RLS Policies for DistriMM (Idempotent Version)
-- NOTE: Legacy tables use NO prefix (historial_cargas, cartera_items).
--       New tables use distrimm_ prefix. Do NOT confuse them.

-- 1. Drop ALL existing policies to ensure a clean slate
DROP POLICY IF EXISTS "Enable read access for all users" ON public.historial_cargas;
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.historial_cargas;
DROP POLICY IF EXISTS "Enable delete access for all users" ON public.historial_cargas;
DROP POLICY IF EXISTS "Allow authenticated read access" ON public.historial_cargas;
DROP POLICY IF EXISTS "Allow authenticated insert access" ON public.historial_cargas;
DROP POLICY IF EXISTS "Allow authenticated delete access" ON public.historial_cargas;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.cartera_items;
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.cartera_items;
DROP POLICY IF EXISTS "Enable delete access for all users" ON public.cartera_items;
DROP POLICY IF EXISTS "Allow authenticated read access" ON public.cartera_items;
DROP POLICY IF EXISTS "Allow authenticated insert access" ON public.cartera_items;
DROP POLICY IF EXISTS "Allow authenticated delete access" ON public.cartera_items;

-- 2. Create STRICT policies for Authenticated Users Only

-- Policy for historial_cargas (legacy, no prefix)
CREATE POLICY "Allow authenticated read access"
ON public.historial_cargas
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated insert access"
ON public.historial_cargas
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated delete access"
ON public.historial_cargas
FOR DELETE
TO authenticated
USING (true);

-- Policy for cartera_items (legacy, no prefix)
CREATE POLICY "Allow authenticated read access"
ON public.cartera_items
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated insert access"
ON public.cartera_items
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated delete access"
ON public.cartera_items
FOR DELETE
TO authenticated
USING (true);

-- 3. Ensure RLS is enabled
ALTER TABLE public.historial_cargas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cartera_items ENABLE ROW LEVEL SECURITY;
