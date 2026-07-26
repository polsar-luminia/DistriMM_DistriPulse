-- ═══════════════════════════════════════════════════════════════════════════
-- Funciones que vivían SOLO en la base de producción
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Exportadas el 26/07/2026 desde el PostgreSQL 17 del VPS (puerto 5433, base
-- `distrimm`) con `pg_get_functiondef`. Ninguna estaba versionada: si se
-- recreaba la base desde el repo, se perdían todas.
--
-- CLAUDE.md documentaba 10; el inventario contra la base real encontró **11**.
-- La que faltaba en esa lista es `fn_distribot_consulta_cartera`, que respalda
-- el tool `consulta_sql_cartera` del chatbot.
--
-- De las 11, **9 se re-aplican limpio** (validado con BEGIN … ROLLBACK contra
-- la base real) y son las que están activas más abajo. Las **2 restantes están
-- ROTAS en producción** y quedan al final, comentadas — ver la nota allí.
--
-- Cómo detectar en el futuro las que falten:
--   SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname LIKE 'fn\_%' ORDER BY 1;
-- y contrastar contra `grep -rE "FUNCTION +(public\.)?fn_" sql/ supabase/`.
--
-- OJO: varias son SECURITY DEFINER. Al reaplicarlas, verificar que el
-- `search_path` siga fijado a 'public' — es lo que impide un secuestro por
-- search_path.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_actualizar_estado_envio(p_detalle_id uuid, p_lote_id uuid, p_estado text, p_error_detalle text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Update detalle record
  UPDATE distrimm_recordatorios_detalle
  SET estado_envio = p_estado,
      enviado_at = CASE WHEN p_estado = 'enviado' THEN NOW() ELSE enviado_at END,
      error_detalle = p_error_detalle
  WHERE id = p_detalle_id;

  -- Increment appropriate counter on the lote
  IF p_lote_id IS NOT NULL THEN
    IF p_estado = 'enviado' THEN
      UPDATE distrimm_recordatorios_lote
      SET enviados = enviados + 1,
          updated_at = NOW()
      WHERE id = p_lote_id;
    ELSIF p_estado = 'fallido' THEN
      UPDATE distrimm_recordatorios_lote
      SET fallidos = fallidos + 1,
          updated_at = NOW()
      WHERE id = p_lote_id;
    END IF;
  END IF;
END;
$function$
;

-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_check_upload_rate_limit(p_table_name text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_last_upload TIMESTAMPTZ;
  v_seconds_ago INT;
BEGIN
  IF p_table_name = 'ventas_cargas' THEN
    SELECT MAX(created_at) INTO v_last_upload FROM ventas_cargas;
  ELSIF p_table_name = 'rutas_distribucion' THEN
    SELECT MAX(created_at) INTO v_last_upload FROM rutas_distribucion;
  ELSE
    RETURN json_build_object('allowed', true, 'message', '');
  END IF;

  IF v_last_upload IS NULL THEN
    RETURN json_build_object('allowed', true, 'message', '');
  END IF;

  v_seconds_ago := EXTRACT(EPOCH FROM (NOW() - v_last_upload))::INT;

  IF v_seconds_ago < 30 THEN
    RETURN json_build_object('allowed', false, 'message',
      'Espera ' || (30 - v_seconds_ago) || ' segundos antes de cargar otro archivo.');
  END IF;

  RETURN json_build_object('allowed', true, 'message', '');
END;
$function$
;

-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_clientes_cartera_filtrados(p_carga_id uuid DEFAULT NULL::uuid, p_tipo_filtro text DEFAULT 'morosos'::text, p_dias_mora_min integer DEFAULT 1, p_dias_vencer_max integer DEFAULT 30, p_monto_min numeric DEFAULT 0, p_monto_max numeric DEFAULT 999999999)
 RETURNS TABLE(cliente_nombre text, cliente_nit text, celular text, telefono_1 text, telefono_2 text, municipio text, total_facturas bigint, total_deuda numeric, max_dias_mora integer, facturas_ids text[], facturas_detalle jsonb)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH facturas_base AS (
    SELECT
      ci.id,
      ci.cliente_nombre,
      ci.tercero_nit,
      ci.documento_id,
      ci.nro_factura,
      ci.fecha_vencimiento,
      GREATEST(0, CURRENT_DATE - ci.fecha_vencimiento)::integer AS dias_mora,
      ci.valor_saldo,
      CASE WHEN ci.fecha_vencimiento < CURRENT_DATE THEN true ELSE false END AS vencida,
      (ci.fecha_vencimiento - CURRENT_DATE) AS dias_para_vencer
    FROM cartera_items ci
    WHERE (p_carga_id IS NULL OR ci.carga_id = p_carga_id)
      AND ci.cliente_nombre != 'MENORES CUANTIAS'
      AND ci.valor_saldo > 0
      AND (ci.cuenta_contable IS NULL OR ci.cuenta_contable LIKE '1305%')
  ),
  facturas_filtradas AS (
    SELECT * FROM facturas_base
    WHERE
      CASE
        WHEN p_tipo_filtro = 'morosos' THEN dias_mora >= p_dias_mora_min
        WHEN p_tipo_filtro = 'por_vencer' THEN NOT vencida AND dias_para_vencer <= p_dias_vencer_max
        ELSE true
      END
  ),
  agrupado AS (
    SELECT
      f.cliente_nombre,
      f.tercero_nit,
      COUNT(*) AS total_facturas,
      SUM(f.valor_saldo) AS total_deuda,
      MAX(f.dias_mora) AS max_dias_mora,
      ARRAY_AGG(f.id::TEXT) AS facturas_ids,
      jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'documento_id', f.documento_id,
          'nro_factura', f.nro_factura,
          'fecha_vencimiento', f.fecha_vencimiento,
          'dias_mora', f.dias_mora,
          'valor_saldo', f.valor_saldo,
          'vencida', f.vencida
        ) ORDER BY f.fecha_vencimiento
      ) AS facturas_detalle
    FROM facturas_filtradas f
    GROUP BY f.cliente_nombre, f.tercero_nit
    HAVING SUM(f.valor_saldo) BETWEEN p_monto_min AND p_monto_max
  )
  SELECT
    a.cliente_nombre,
    a.tercero_nit AS cliente_nit,
    dc.celular,
    dc.telefono_1,
    dc.telefono_2,
    dc.municipio,
    a.total_facturas,
    a.total_deuda,
    a.max_dias_mora,
    a.facturas_ids,
    a.facturas_detalle
  FROM agrupado a
  LEFT JOIN distrimm_clientes dc ON dc.no_identif = a.tercero_nit
  ORDER BY a.max_dias_mora DESC, a.total_deuda DESC;
END;
$function$
;

-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_delete_all_rutas()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM rutas_distribucion;
END;
$function$
;

-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_delete_ventas_carga(p_carga_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM ventas_cargas WHERE id = p_carga_id;
END;
$function$
;

-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_distribot_consulta_cartera(consulta_sql text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE resultado json; consulta_lower text; BEGIN consulta_sql := rtrim(trim(consulta_sql), ';'); consulta_lower := lower(consulta_sql); IF NOT (consulta_lower LIKE 'select%' OR consulta_lower LIKE 'with%') THEN RAISE EXCEPTION 'Solo se permiten consultas SELECT o CTE (WITH)'; END IF; IF consulta_lower ~ '(insert|update|delete|drop|alter|create|truncate|grant|revoke)' THEN RAISE EXCEPTION 'Consulta no permitida'; END IF; IF NOT (consulta_lower LIKE '%distrimm_cartera_items%' OR consulta_lower LIKE '%distrimm_cartera_ultima%' OR consulta_lower LIKE '%distrimm_cartera_historico%') THEN RAISE EXCEPTION 'La consulta debe referenciar las vistas de cartera'; END IF; EXECUTE 'SELECT json_agg(t) FROM (' || consulta_sql || ') t' INTO resultado; IF resultado IS NULL THEN resultado := '[]'::json; END IF; RETURN resultado; END; $function$
;

-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_finalizar_lote_envio(p_lote_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enviados integer;
  v_fallidos integer;
  v_estado text;
BEGIN
  SELECT enviados, fallidos INTO v_enviados, v_fallidos
  FROM distrimm_recordatorios_lote
  WHERE id = p_lote_id;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF v_fallidos > 0 AND v_enviados > 0 THEN
    v_estado := 'parcial';
  ELSIF v_fallidos > 0 AND v_enviados = 0 THEN
    v_estado := 'fallido';
  ELSE
    v_estado := 'completado';
  END IF;

  UPDATE distrimm_recordatorios_lote
  SET estado = v_estado,
      updated_at = NOW()
  WHERE id = p_lote_id;

  RETURN v_estado;
END;
$function$
;

-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_log_upload(p_action text, p_table_name text, p_record_id uuid DEFAULT NULL::uuid, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO public.audit_log (id, user_id, action, table_name, record_id, details, created_at)
    VALUES (
        gen_random_uuid(),
        COALESCE(auth.uid(), '00000000-0000-0000-0000-demo00000001'::uuid),
        p_action,
        p_table_name,
        p_record_id,
        p_details,
        now()
    );
END;
$function$
;

-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT rol FROM public.profiles WHERE id = auth.uid()),
    'viewer'
  );
$function$

;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROTAS EN PRODUCCIÓN — se conservan como registro histórico, NO ejecutar
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `fn_get_wa_instance` y `fn_get_wa_instance_name` referencian columnas que ya
-- no existen: `instance_name`, `instance_token`, `phone` y `connected_at`. La
-- tabla `distrimm_whatsapp_instances` se rehízo para el flujo de Embedded
-- Signup y hoy tiene `waba_id`, `phone_number_id`, `phone_display`,
-- `business_name`, `coexistence` y `meta_business_id`.
--
-- Siguen existiendo en la base sólo porque el cuerpo de una función SQL se
-- valida al crearla, no después: se crearon antes del cambio de tabla y nadie
-- volvió a recrearlas. Al invocarlas hoy fallan con
-- `column "instance_name" does not exist`.
--
-- Verificado el 26/07/2026: **ningún** archivo de `src/`, `supabase/`,
-- `mcp-server/` ni `sql/` las llama. Son código muerto.
--
-- Quedan comentadas a propósito: descomentarlas haría fallar la re-aplicación
-- de este archivo. Pendiente de decisión del dueño si se hace `DROP FUNCTION`
-- de las dos en la base — son SECURITY DEFINER, y aunque erroran de inmediato
-- (no hay ruta de explotación), no deberían seguir ahí.
--
-- CREATE OR REPLACE FUNCTION public.fn_get_wa_instance(p_user_id uuid)
--  RETURNS json
--  LANGUAGE sql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
--   SELECT COALESCE(
--     (SELECT json_build_object(
--       'found', true,
--       'id', id::text,
--       'instance_name', instance_name,
--       'instance_token', instance_token,
--       'phone', phone,
--       'status', status,
--       'connected_at', connected_at,
--       'created_at', created_at
--     )
--     FROM public.distrimm_whatsapp_instances
--     WHERE user_id = p_user_id
--     LIMIT 1),
--     json_build_object(
--       'found', false,
--       'id', null,
--       'instance_name', null,
--       'instance_token', null,
--       'phone', null,
--       'status', 'disconnected',
--       'connected_at', null,
--       'created_at', null
--     )
--   );
-- $function$
-- ;
-- 
-- CREATE OR REPLACE FUNCTION public.fn_get_wa_instance_name()
--  RETURNS json
--  LANGUAGE sql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
--   SELECT json_build_object(
--     'instance_name', COALESCE(
--       (SELECT instance_name FROM public.distrimm_whatsapp_instances WHERE status = 'connected' LIMIT 1),
--       'DistriMM'
--     )
--   );
-- $function$
-- 
