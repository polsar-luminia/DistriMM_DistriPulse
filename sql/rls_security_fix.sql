-- =====================================================
-- DistriMM - Script de Seguridad RLS
-- Ejecutar en Supabase SQL Editor para restringir acceso
-- =====================================================

-- ⚠️ PASO 1: ELIMINAR POLÍTICAS CLÁSICAS/PERMISIVAS
-- Eliminar políticas viejas que permiten acceso público
-- (Puede dar error si no existen, por eso el IF EXISTS)

-- Para distrimm_historial_cargas
DROP POLICY IF EXISTS "Enable read access for all users" ON public.distrimm_historial_cargas;
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.distrimm_historial_cargas;
DROP POLICY IF EXISTS "Enable delete access for all users" ON public.distrimm_historial_cargas;

-- Para distrimm_cartera_items
DROP POLICY IF EXISTS "Enable read access for all users" ON public.distrimm_cartera_items;
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.distrimm_cartera_items;
DROP POLICY IF EXISTS "Enable delete access for all users" ON public.distrimm_cartera_items;


-- ⚠️ PASO 2: ELIMINAR POLÍTICAS RESTRICTIVAS ANTERIORES
-- (Para evitar errores de "policy already exists" si re-ejecutas este script)

-- Para distrimm_historial_cargas
DROP POLICY IF EXISTS "Authenticated users can select historial_cargas" ON public.distrimm_historial_cargas;
DROP POLICY IF EXISTS "Authenticated users can insert historial_cargas" ON public.distrimm_historial_cargas;
DROP POLICY IF EXISTS "Authenticated users can delete historial_cargas" ON public.distrimm_historial_cargas;

-- Para distrimm_cartera_items
DROP POLICY IF EXISTS "Authenticated users can select cartera_items" ON public.distrimm_cartera_items;
DROP POLICY IF EXISTS "Authenticated users can insert cartera_items" ON public.distrimm_cartera_items;
DROP POLICY IF EXISTS "Authenticated users can delete cartera_items" ON public.distrimm_cartera_items;


-- =====================================================
-- PASO 3: CREAR POLÍTICAS RESTRICTIVAS NUEVAS
-- Solo usuarios autenticados pueden acceder
-- =====================================================

-- HISTORIAL CARGAS - Solo lectura/escritura para usuarios autenticados
CREATE POLICY "Authenticated users can select historial_cargas"
  ON public.distrimm_historial_cargas
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert historial_cargas"
  ON public.distrimm_historial_cargas
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete historial_cargas"
  ON public.distrimm_historial_cargas
  FOR DELETE
  USING (auth.role() = 'authenticated');


-- CARTERA ITEMS - Solo lectura/escritura para usuarios autenticados
CREATE POLICY "Authenticated users can select cartera_items"
  ON public.distrimm_cartera_items
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert cartera_items"
  ON public.distrimm_cartera_items
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete cartera_items"
  ON public.distrimm_cartera_items
  FOR DELETE
  USING (auth.role() = 'authenticated');

-- =====================================================
-- VERIFICACIÓN
-- =====================================================
-- SELECT schemaname, tablename, policyname, cmd, qual 
-- FROM pg_policies 
-- WHERE tablename LIKE 'distrimm%';
