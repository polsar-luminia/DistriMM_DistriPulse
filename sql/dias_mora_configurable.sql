-- ═══════════════════════════════════════════════════════════════════════════
-- El umbral de mora deja de ser una constante de JavaScript
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Aplicado el 26/07/2026 (decisión del dueño: que viva en el VPS y se configure
-- desde la pantalla de Exclusiones).
--
-- QUÉ ES. Un recaudo cobrado con más de N días de mora no comisiona. N valía 72
-- y vivía SOLO en `src/constants/thresholds.js:57`, invisible para el SQL. Ese
-- es justo el problema que ya tiene `normalize_brand` —definido dos veces, en JS
-- y en SQL— y que puede divergir en silencio. Aquí hay una sola copia, y manda
-- la base.
--
-- POR QUÉ EN LA TABLA DE EXCLUSIONES Y NO EN UNA DE CONFIGURACIÓN. Es una
-- exclusión más: "no comisionar lo cobrado tarde", junto a "no comisionar estas
-- marcas". Además `buildInputHash` ya toma huella de esta tabla, así que cambiar
-- el umbral invalida los snapshots de comisiones automáticamente — con una tabla
-- aparte habría que acordarse de incluirla, y nadie se acuerda.
--
-- SEGURO PARA LOS CONSUMIDORES: se auditaron todos antes de tocar el CHECK.
-- `buildExclusionLookups` (utils.js:34) y `fn_calcular_comisiones` filtran con
-- `tipo = 'marca'` / `tipo = 'producto'` explícito, así que un tipo nuevo se
-- ignora solo. Ninguno hace `ELSE` ni asume dos tipos.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE distrimm_comisiones_exclusiones
  DROP CONSTRAINT distrimm_comisiones_exclusiones_tipo_check;

ALTER TABLE distrimm_comisiones_exclusiones
  ADD CONSTRAINT distrimm_comisiones_exclusiones_tipo_check
  CHECK (tipo = ANY (ARRAY['marca'::text, 'producto'::text, 'dias_mora'::text]));

-- `dias_mora` guarda un entero en `valor`, que es text como el resto de la tabla.
-- Sin esto, un valor basura rompería el cálculo de comisiones en silencio.
ALTER TABLE distrimm_comisiones_exclusiones
  ADD CONSTRAINT chk_dias_mora_entero
  CHECK (tipo <> 'dias_mora' OR (valor ~ '^[0-9]{1,4}$' AND valor::int > 0));

-- UNA sola fila de dias_mora, se edita en sitio.
-- El índice que ya existe es sobre (tipo, valor) WHERE activa, que dejaría
-- convivir un '72' y un '60' activos a la vez — dos umbrales y ningún criterio
-- para elegir. Este lo impide, activa o no.
CREATE UNIQUE INDEX uq_exclusiones_dias_mora
  ON distrimm_comisiones_exclusiones (tipo)
  WHERE tipo = 'dias_mora';

INSERT INTO distrimm_comisiones_exclusiones (tipo, valor, descripcion, motivo, activa)
VALUES ('dias_mora', '72', 'Días de mora máximos para comisionar un recaudo',
        'Migrado desde src/constants/thresholds.js (DIAS_MORA_LIMITE)', true)
ON CONFLICT DO NOTHING;

COMMIT;
