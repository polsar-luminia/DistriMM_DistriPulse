-- =====================================================
-- DistriMM - Comprehensive RLS Security Policy
-- NOTE: Legacy tables use NO prefix (historial_cargas, cartera_items).
--       New tables use distrimm_ prefix. Do NOT confuse them.
-- =====================================================

-- Enable RLS on tables (if not already enabled)
ALTER TABLE public.historial_cargas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cartera_items ENABLE ROW LEVEL SECURITY;

-- 1. CLEANUP: Remove potentially conflicting policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.historial_cargas;
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.historial_cargas;
DROP POLICY IF EXISTS "Enable delete access for all users" ON public.historial_cargas;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.cartera_items;
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.cartera_items;
DROP POLICY IF EXISTS "Enable delete access for all users" ON public.cartera_items;

DROP POLICY IF EXISTS "Authenticated users can select historial_cargas" ON public.historial_cargas;
DROP POLICY IF EXISTS "Authenticated users can insert historial_cargas" ON public.historial_cargas;
DROP POLICY IF EXISTS "Authenticated users can delete historial_cargas" ON public.historial_cargas;

DROP POLICY IF EXISTS "Authenticated users can select cartera_items" ON public.cartera_items;
DROP POLICY IF EXISTS "Authenticated users can insert cartera_items" ON public.cartera_items;
DROP POLICY IF EXISTS "Authenticated users can delete cartera_items" ON public.cartera_items;

-- 2. APPLY RESTRICTIVE POLICIES (Authenticated Only)

-- Historial Cargas (legacy, no prefix)
CREATE POLICY "Authenticated users can select historial_cargas"
  ON public.historial_cargas FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert historial_cargas"
  ON public.historial_cargas FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete historial_cargas"
  ON public.historial_cargas FOR DELETE
  USING (auth.role() = 'authenticated');

-- Cartera Items (legacy, no prefix)
CREATE POLICY "Authenticated users can select cartera_items"
  ON public.cartera_items FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert cartera_items"
  ON public.cartera_items FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete cartera_items"
  ON public.cartera_items FOR DELETE
  USING (auth.role() = 'authenticated');
