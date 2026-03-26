-- safe_numeric: conversión tolerante a NUMERIC que no aborta la transacción
-- Uso: safe_numeric(r->>'precio') en vez de COALESCE(NULLIF(r->>'precio', '')::NUMERIC, 0)
-- Valores como "N/A", "--", "null", espacios se convierten a 0 en vez de lanzar error.

CREATE OR REPLACE FUNCTION safe_numeric(val TEXT, fallback NUMERIC DEFAULT 0)
RETURNS NUMERIC AS $$
BEGIN
  IF val IS NULL OR val = '' THEN RETURN fallback; END IF;
  RETURN val::NUMERIC;
EXCEPTION WHEN OTHERS THEN
  RETURN fallback;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- safe_int: mismo concepto para enteros
CREATE OR REPLACE FUNCTION safe_int(val TEXT, fallback INT DEFAULT 0)
RETURNS INT AS $$
BEGIN
  IF val IS NULL OR val = '' THEN RETURN fallback; END IF;
  RETURN val::INT;
EXCEPTION WHEN OTHERS THEN
  RETURN fallback;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
