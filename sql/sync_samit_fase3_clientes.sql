-- Fase 3 de la sincronización SAMIT → VPS: directorio de clientes.
--
-- Estrategia: upsert por `no_identif`, SIN borrados. Un cliente que
-- desapareciera de G_Clientes no debe evaporarse del directorio si todavía
-- tiene cartera viva: `cartera_items.tercero_nit` cruza contra esta tabla y
-- perderíamos el nombre del deudor.
--
-- `no_identif` va SIN dígito de verificación (decisión del dueño, 26/07/2026):
-- es el formato actual de la tabla (2.126 filas, todas dígitos puros) y es como
-- cruza hoy con `cartera_items.tercero_nit`. El ERP guarda el Dv aparte, en
-- G_Clientes.Dv, y se ignora a propósito.
--
-- Verificado antes de sobrescribir: de los 2.126 clientes del dashboard, CERO
-- tienen celular, correo o teléfono que el ERP no tenga. La sincronización no
-- pierde ningún dato de contacto; suma 53 clientes, 36 celulares y 30 teléfonos.
--
-- Referencia: docs/plans/plan-sincronizacion-samit.md §3.4.

ALTER TABLE public.distrimm_clientes
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'manual';

-- `idx_clientes_no_identif` ya es UNIQUE: sirve de llave de upsert tal cual.

NOTIFY pgrst, 'reload schema';
