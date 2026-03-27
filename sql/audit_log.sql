-- Audit log para trazabilidad de cambios en tablas críticas de comisiones
-- Captura automáticamente INSERT/UPDATE/DELETE con user_id y datos old/new

CREATE TABLE IF NOT EXISTS distrimm_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE distrimm_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read audit log"
  ON distrimm_audit_log FOR SELECT TO authenticated USING (true);

-- Trigger function genérica reutilizable
CREATE OR REPLACE FUNCTION fn_audit_trigger() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO distrimm_audit_log (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id::TEXT, OLD.id::TEXT),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers en tablas críticas
CREATE OR REPLACE TRIGGER audit_comisiones_cargas
  AFTER INSERT OR UPDATE OR DELETE ON distrimm_comisiones_cargas
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE OR REPLACE TRIGGER audit_comisiones_cargas_recaudo
  AFTER INSERT OR UPDATE OR DELETE ON distrimm_comisiones_cargas_recaudo
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE OR REPLACE TRIGGER audit_presupuestos_marca
  AFTER INSERT OR UPDATE OR DELETE ON distrimm_comisiones_presupuestos_marca
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE OR REPLACE TRIGGER audit_presupuestos_recaudo
  AFTER INSERT OR UPDATE OR DELETE ON distrimm_comisiones_presupuestos_recaudo
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE OR REPLACE TRIGGER audit_snapshots
  AFTER INSERT OR UPDATE OR DELETE ON distrimm_comisiones_snapshots
  FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
