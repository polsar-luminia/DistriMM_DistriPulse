-- ============================================================================
-- DistriMM - Complete Database Schema
-- Dashboard de Visualizacion de Cartera para Toma de Decisiones
-- ============================================================================

-- ============================================================================
-- MODULO 1: HISTORIAL DE CARGAS (Load History)
-- Rastrea cada archivo de cartera importado
-- ============================================================================

CREATE TABLE public.historial_cargas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  nombre_archivo text NOT NULL,
  fecha_corte date NOT NULL,
  total_registros integer DEFAULT 0,
  total_valor_cartera numeric DEFAULT 0,
  deleted_at timestamp with time zone
);

ALTER TABLE public.historial_cargas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.historial_cargas FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.historial_cargas FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable delete access for all users" ON public.historial_cargas FOR DELETE USING (true);

-- ============================================================================
-- MODULO 2: CARTERA ITEMS (Portfolio Items / Invoices)
-- Facturas individuales con datos de mora, vendedor, tercero
-- ============================================================================

CREATE TABLE public.cartera_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  carga_id uuid REFERENCES public.historial_cargas(id) ON DELETE CASCADE NOT NULL,
  cliente_nombre text NOT NULL,
  documento_id text,
  fecha_emision date,
  fecha_vencimiento date,
  dias_mora integer DEFAULT 0,
  valor_saldo numeric NOT NULL,
  estado text,
  ultimo_recordatorio timestamp with time zone,
  telefono text,
  zona text,
  departamento text,
  ciudad text,
  asesor text,
  nro_factura text,
  valor_inicial numeric,
  valor_abonos numeric DEFAULT 0,
  otras_deducciones numeric DEFAULT 0,
  -- Campos enriquecidos desde Excel de Cuentas por Cobrar
  vendedor_codigo text,
  tercero_nit text,
  cuenta_contable text,
  nombre_cuenta text,
  cuota text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  deleted_at timestamp with time zone
);

CREATE INDEX idx_cartera_items_carga_id ON public.cartera_items(carga_id);
CREATE INDEX idx_cartera_items_cliente_nombre ON public.cartera_items(cliente_nombre);
CREATE INDEX idx_cartera_items_vendedor ON public.cartera_items(vendedor_codigo);
CREATE INDEX idx_cartera_items_tercero ON public.cartera_items(tercero_nit);

ALTER TABLE public.cartera_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.cartera_items FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.cartera_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable delete access for all users" ON public.cartera_items FOR DELETE USING (true);

-- ============================================================================
-- MODULO 3: CLIENTES (Master Data / Terceros)
-- Datos maestros importados del archivo de Clientes del ERP
-- ============================================================================

CREATE TABLE public.distrimm_clientes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  no_identif text NOT NULL,
  tipo_ident text DEFAULT 'NIT',
  tipo_persona text, -- 'Natural' o 'Juridica'
  primer_nombre text,
  segundo_nombre text,
  primer_apellido text,
  segundo_apellido text,
  nombre_completo text GENERATED ALWAYS AS (
    COALESCE(NULLIF(TRIM(
      COALESCE(primer_nombre, '') || ' ' ||
      COALESCE(segundo_nombre, '') || ' ' ||
      COALESCE(primer_apellido, '') || ' ' ||
      COALESCE(segundo_apellido, '')
    ), ''), 'Sin Nombre')
  ) STORED,
  fecha_nacimiento date,
  genero text,
  estado_civil text,
  direccion text,
  telefono_1 text,
  telefono_2 text,
  celular text,
  correo_electronico text,
  pagina_web text,
  clasificacion_iva text,
  profesion text,
  actividad text,
  cupo_venta numeric DEFAULT 0,
  cupo_compra numeric DEFAULT 0,
  comentario text,
  barrio text,
  municipio text,
  vendedor_codigo text,
  cobrador_codigo text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX idx_clientes_no_identif ON public.distrimm_clientes(no_identif);
CREATE INDEX idx_clientes_municipio ON public.distrimm_clientes(municipio);
CREATE INDEX idx_clientes_vendedor ON public.distrimm_clientes(vendedor_codigo);
CREATE INDEX idx_clientes_cobrador ON public.distrimm_clientes(cobrador_codigo);
CREATE INDEX idx_clientes_tipo_persona ON public.distrimm_clientes(tipo_persona);

ALTER TABLE public.distrimm_clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.distrimm_clientes FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.distrimm_clientes FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.distrimm_clientes FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON public.distrimm_clientes FOR DELETE USING (true);

-- ============================================================================
-- MODULO 4: VENDEDORES (Sales Representatives)
-- Catalogo de vendedores referenciados en la cartera
-- ============================================================================

CREATE TABLE public.distrimm_vendedores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo text NOT NULL,
  nombre text NOT NULL DEFAULT 'Sin Nombre',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE UNIQUE INDEX idx_vendedores_codigo ON public.distrimm_vendedores(codigo);

ALTER TABLE public.distrimm_vendedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.distrimm_vendedores FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.distrimm_vendedores FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.distrimm_vendedores FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON public.distrimm_vendedores FOR DELETE USING (true);

-- ============================================================================
-- MODULO 5: HISTORIAL CARGAS CLIENTES (Client Upload History)
-- Rastrea cada carga del maestro de clientes
-- ============================================================================

CREATE TABLE public.distrimm_historial_cargas_clientes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  nombre_archivo text NOT NULL,
  total_registros integer DEFAULT 0,
  nuevos integer DEFAULT 0,
  actualizados integer DEFAULT 0
);

ALTER TABLE public.distrimm_historial_cargas_clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.distrimm_historial_cargas_clientes FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.distrimm_historial_cargas_clientes FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable delete access for all users" ON public.distrimm_historial_cargas_clientes FOR DELETE USING (true);

-- ============================================================================
-- MODULO 6: PERFILES Y SEGURIDAD
-- ============================================================================

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  nombre text,
  rol text DEFAULT 'viewer' CHECK (rol = ANY (ARRAY['admin', 'manager', 'advisor', 'viewer'])),
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.login_attempts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  attempted_at timestamp with time zone DEFAULT now(),
  success boolean DEFAULT false
);

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  table_name text,
  record_id uuid,
  details jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- MODULO 7: CFO ANALYSES (AI-Generated Portfolio Diagnostics)
-- Cached results from n8n + GPT-4o analysis pipeline
-- ============================================================================

CREATE TABLE public.distrimm_cfo_analyses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  carga_id uuid REFERENCES public.historial_cargas(id),
  mes integer,
  anio integer,
  dashboard jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_cfo_analyses_carga ON public.distrimm_cfo_analyses(carga_id);
CREATE INDEX idx_cfo_analyses_periodo ON public.distrimm_cfo_analyses(anio, mes);

ALTER TABLE public.distrimm_cfo_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.distrimm_cfo_analyses FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.distrimm_cfo_analyses FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.distrimm_cfo_analyses FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON public.distrimm_cfo_analyses FOR DELETE USING (true);

-- ============================================================================
-- RPC: fn_cfo_distrimm_dashboard
-- Aggregates cartera KPIs, aging, vendedor, municipio, and top debtors
-- Called by n8n workflow to feed GPT-4o analysis
-- ============================================================================
-- (Defined via Supabase migration - see migrations for full SQL)

-- ============================================================================
-- RELACIONES Y LLAVES
-- ============================================================================
-- cartera_items.carga_id -> historial_cargas.id (CASCADE DELETE)
-- cartera_items.tercero_nit -> distrimm_clientes.no_identif (logical, not FK)
-- cartera_items.vendedor_codigo -> distrimm_vendedores.codigo (logical, not FK)
-- distrimm_clientes.vendedor_codigo -> distrimm_vendedores.codigo (logical, not FK)
-- profiles.id -> auth.users.id (FK)
-- audit_log.user_id -> auth.users.id (FK)
