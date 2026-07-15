-- ============================================================================
-- Deduplicación de ventas — vista canónica distrimm_ventas_vigentes
-- Applied via Supabase MCP on 2026-07-15 (migración ventas_vigentes_dedup)
--
-- CONTEXTO: los archivos "Ventas de Productos por Factura" que sube gerencia
-- son ACUMULADOS del mes (cada archivo trae del día 1 hasta su fecha) y
-- fn_upload_ventas solo reemplaza cargas con la MISMA fecha_ventas. Un mes
-- termina con ~20 cargas solapadas: agregar sobre distrimm_comisiones_ventas
-- directo multiplica los totales (~10x medido en jun/2026: $8.611M crudos
-- vs $818M reales).
--
-- REGLA: toda agregación global de ventas debe leer de esta vista, que toma
-- SOLO la última carga de cada mes. Los módulos que ya seleccionan una carga
-- específica (VentasTab, snapshots de comisiones) no la necesitan.
--
-- En esta migración también se re-aplicaron con la vista:
--   fn_mcp_resumen, fn_mcp_ventas, fn_mcp_buscar, fn_mcp_ficha
--   (cuerpos actuales en sql/mcp_server_rpcs.sql)
--   fn_sugerido_pedidos (cuerpo actual en sql/sugerido_pedidos_schema.sql)
--   — esto corrigió también el módulo web Sugerido de Pedidos, que estaba
--   calculando la demanda ~10x inflada.
-- ============================================================================

CREATE OR REPLACE VIEW distrimm_ventas_vigentes AS
SELECT v.*
FROM distrimm_comisiones_ventas v
JOIN (
  SELECT DISTINCT ON (date_trunc('month', fecha_ventas)) id
  FROM distrimm_comisiones_cargas
  ORDER BY date_trunc('month', fecha_ventas), fecha_ventas DESC, created_at DESC
) ultima_del_mes ON ultima_del_mes.id = v.carga_id;

REVOKE ALL ON distrimm_ventas_vigentes FROM anon;
GRANT SELECT ON distrimm_ventas_vigentes TO authenticated, service_role;
