-- Helper to keep SQL brand matching aligned with src/utils/brandNormalization.js

CREATE OR REPLACE FUNCTION normalize_brand(p_brand TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_brand TEXT := upper(trim(coalesce(p_brand, '')));
BEGIN
  IF v_brand = '' THEN
    RETURN 'SIN MARCA';
  END IF;

  -- Strip common diacritics so prefix checks behave consistently.
  v_brand := translate(
    v_brand,
    'ÁÉÍÓÚÜÑÀÈÌÒÙÃÕÂÊÎÔÛÄËÏÖÜáéíóúüñàèìòùãõâêîôûäëïöü',
    'AEIOUUNAEIOUUNAEIOUAEIOUAEIOUAEIOU'
  );

  IF v_brand LIKE 'CONTEGRAL%' THEN
    RETURN 'CONTEGRAL';
  END IF;

  IF v_brand LIKE 'TECNOQUIMICA%' THEN
    RETURN 'TECNOQUIMICAS';
  END IF;

  IF v_brand LIKE 'PREMIER%' OR v_brand LIKE 'GOLDEN%' THEN
    RETURN 'GOLDEN & PREMIER';
  END IF;

  IF v_brand LIKE 'BOEH%' OR v_brand LIKE 'BOHE%' THEN
    RETURN 'BOHERINGER GANADERIA';
  END IF;

  IF v_brand LIKE 'BONHO%' THEN
    RETURN 'BONHOERFFER';
  END IF;

  IF v_brand LIKE 'VICAR%' THEN
    RETURN 'VICAR';
  END IF;

  IF v_brand LIKE 'ADAMA%' THEN
    RETURN 'ADAMA';
  END IF;

  IF v_brand LIKE 'AGROCENTRO%' THEN
    RETURN 'AGROCENTRO';
  END IF;

  IF v_brand LIKE 'OUROFINO%' THEN
    RETURN 'OUROFINO';
  END IF;

  IF v_brand LIKE 'LAQUINSA%' THEN
    RETURN 'LAQUINSA';
  END IF;

  IF v_brand LIKE 'ATREVIA%' THEN
    RETURN 'ATREVIA';
  END IF;

  IF v_brand LIKE 'DIABONO%' THEN
    RETURN 'DIABONOS';
  END IF;

  IF v_brand = 'EDO' OR v_brand LIKE 'EDO %' THEN
    RETURN 'EDO';
  END IF;

  IF v_brand LIKE 'AGROVET%' THEN
    RETURN 'AGROVET';
  END IF;

  IF v_brand LIKE 'AUROFARMA%' THEN
    RETURN 'AUROFARMA';
  END IF;

  IF v_brand LIKE 'AGROSEMILLA%' THEN
    RETURN 'AGROSEMILLAS';
  END IF;

  RETURN v_brand;
END;
$$;

