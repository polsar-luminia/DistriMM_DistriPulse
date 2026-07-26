-- Fase 0 de la sincronización automática SAMIT → VPS.
-- Prepara el destino: tabla de observabilidad, llaves de idempotencia y columnas
-- de procedencia. No mueve datos. Idempotente: se puede correr varias veces.
--
-- Referencia: docs/plans/plan-sincronizacion-samit.md §4, §7, §11 (Fase 0).

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Observabilidad
--
-- Sin una marca visible de "última sincronización exitosa", un agente caído se
-- ve igual que un día sin ventas. Una fila por dataset y por corrida.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.distrimm_sync_estado (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset         text        NOT NULL,   -- catalogos | inventario | clientes | cartera | ventas | recaudos
  inicio          timestamptz NOT NULL DEFAULT now(),
  fin             timestamptz,
  estado          text        NOT NULL,   -- ok | error | parcial | sospechoso
  filas_leidas    integer,
  filas_escritas  integer,
  control_erp     numeric,                -- cifra de control leída del ERP
  control_destino numeric,                -- lo que quedó en el VPS
  diferencia      numeric GENERATED ALWAYS AS (control_destino - control_erp) STORED,
  mensaje_error   text,
  duracion_ms     integer,
  CONSTRAINT distrimm_sync_estado_estado_chk
    CHECK (estado IN ('ok','error','parcial','sospechoso'))
);

CREATE INDEX IF NOT EXISTS idx_sync_estado_dataset_inicio
  ON public.distrimm_sync_estado (dataset, inicio DESC);

COMMENT ON TABLE public.distrimm_sync_estado IS
  'Bitácora de la sincronización SAMIT→VPS. Una fila por dataset y corrida.';
COMMENT ON COLUMN public.distrimm_sync_estado.estado IS
  'sospechoso = los datos se escribieron pero la reconciliación contra el ERP no cuadró; no apagar la carga manual.';

ALTER TABLE public.distrimm_sync_estado ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='distrimm_sync_estado'
      AND policyname='distrimm_sync_estado_lectura'
  ) THEN
    CREATE POLICY distrimm_sync_estado_lectura ON public.distrimm_sync_estado
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

GRANT SELECT ON public.distrimm_sync_estado TO authenticated;
GRANT ALL    ON public.distrimm_sync_estado TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Llaves de idempotencia
--
-- La línea de factura del ERP tiene identidad propia y estable:
-- (IN_Movimiento.Documento, IN_Movimiento.Item). Es la ÚNICA llave segura —
-- `factura` no lo es (una devolución DV reutiliza el número de la VE original)
-- y (Documento, Producto) tampoco (697 combinaciones se repiten).
--
-- Con esta llave, correr la sincronización 1 vez o 50 produce el mismo estado,
-- y desaparece de raíz la duplicación de ventas (110.107 filas → ~22.400).
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.distrimm_comisiones_ventas
  ADD COLUMN IF NOT EXISTS erp_documento integer,
  ADD COLUMN IF NOT EXISTS erp_item      smallint;

ALTER TABLE public.distrimm_comisiones_recaudos
  ADD COLUMN IF NOT EXISTS erp_documento integer,
  ADD COLUMN IF NOT EXISTS erp_item      smallint;

-- Índice parcial: las filas históricas (cargadas por Excel) no tienen estas
-- columnas y deben poder convivir sin chocar entre sí.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ventas_erp_linea
  ON public.distrimm_comisiones_ventas (erp_documento, erp_item)
  WHERE erp_documento IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_recaudos_erp_linea
  ON public.distrimm_comisiones_recaudos (erp_documento, erp_item)
  WHERE erp_documento IS NOT NULL;

COMMENT ON COLUMN public.distrimm_comisiones_ventas.erp_documento IS
  'IN_Documento.Secuencial del ERP. NULL en las filas históricas cargadas por Excel.';
COMMENT ON COLUMN public.distrimm_comisiones_ventas.erp_item IS
  'IN_Movimiento.Item. Junto a erp_documento forma la llave de upsert idempotente.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Procedencia
--
-- Durante la convivencia conviven filas cargadas a mano y filas sincronizadas.
-- distrimm_comisiones_recaudos ya tenía `origen`; se extiende el patrón.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.distrimm_comisiones_ventas
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'distrimm_comisiones_ventas_origen_chk'
  ) THEN
    ALTER TABLE public.distrimm_comisiones_ventas
      ADD CONSTRAINT distrimm_comisiones_ventas_origen_chk
      CHECK (origen IN ('manual','erp'));
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Catálogos: llaves de upsert y campos que hoy no existen
--
-- distrimm_vendedores solo guarda (codigo, nombre). El ERP trae además
-- identificación, zona y estado, que sirven para cartera y comisiones.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.distrimm_vendedores
  ADD COLUMN IF NOT EXISTS nit        text,
  ADD COLUMN IF NOT EXISTS zona       text,
  ADD COLUMN IF NOT EXISTS estado     text,      -- 'V' vigente / 'I' inactivo
  ADD COLUMN IF NOT EXISTS origen     text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.distrimm_productos_catalogo
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'manual';

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendedores_codigo
  ON public.distrimm_vendedores (codigo);

CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_catalogo_codigo
  ON public.distrimm_productos_catalogo (codigo);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Refrescar la caché de esquema de PostgREST
--
-- Sin esto, PostgREST sigue sirviendo el esquema viejo y rechaza las columnas
-- recién creadas con "Could not find the 'x' column in the schema cache".
-- ───────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
