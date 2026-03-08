/**
 * @fileoverview Normalización de marcas — mapeo de nombres del catálogo a nombres de presupuesto.
 *
 * Los nombres en el catálogo de productos (distrimm_productos_catalogo) vienen del archivo
 * de saldos y pueden diferir de los nombres simplificados usados en los presupuestos de
 * comisiones. Este módulo unifica ambos mundos.
 *
 * @module utils/brandNormalization
 */

/**
 * Reglas de normalización de marcas.
 *
 * Cada regla tiene:
 * - `presupuesto`: el nombre EXACTO que se usa en los presupuestos de comisiones
 * - `match`: función que recibe el nombre del catálogo y retorna true si pertenece a este grupo
 *
 * IMPORTANTE: Las reglas se evalúan en orden. La primera que haga match gana.
 * Poner las reglas de prefijo (como CONTEGRAL) PRIMERO para que agrupen correctamente.
 */
const BRAND_RULES = [
  // ── Agrupaciones por prefijo ──
  // CONTEGRAL agrupa todas las submarcas (CONTEGRAL AVES, CONTEGRAL GANADO, etc.)
  {
    presupuesto: "CONTEGRAL",
    match: (catalogBrand) => catalogBrand.toUpperCase().startsWith("CONTEGRAL"),
  },

  // ── Coincidencias exactas/parciales ──
  // TECNOQUIMICAS puede venir como "TECNOQUIMICAS", "TECNOQUIMICAS S.A.", "TECNOQUÍMICAS", etc.
  {
    presupuesto: "TECNOQUIMICAS",
    match: (catalogBrand) =>
      catalogBrand
        .toUpperCase()
        .replace(/[ÍI]/g, "I")
        .startsWith("TECNOQUIMICA"),
  },

  // GOLDEN & PREMIER — en el catálogo aparecen como marcas separadas: "PREMIER" y "GOLDEN"
  // El presupuesto las agrupa bajo un solo nombre
  {
    presupuesto: "GOLDEN & PREMIER",
    match: (catalogBrand) => {
      const upper = catalogBrand.toUpperCase();
      return upper.startsWith("PREMIER") || upper.startsWith("GOLDEN");
    },
  },

  // BOHERINGER GANADERIA puede venir como "BOEHRINGER INGELHEIM", "BOEHRINGER", "BOHERINGER", etc.
  {
    presupuesto: "BOHERINGER GANADERIA",
    match: (catalogBrand) => {
      const upper = catalogBrand.toUpperCase();
      return upper.startsWith("BOEH") || upper.startsWith("BOHE");
    },
  },

  // BONHOERFFER puede venir como "BONHOEFFER", "BONHOERFFER", "BONHÖFFER"
  {
    presupuesto: "BONHOERFFER",
    match: (catalogBrand) => {
      const upper = catalogBrand.toUpperCase();
      return upper.startsWith("BONHO") || upper.startsWith("BONHÖ");
    },
  },

  // VICAR puede venir como "VICAR FARMACEUTICA", "VICAR S.A.", etc.
  {
    presupuesto: "VICAR",
    match: (catalogBrand) => catalogBrand.toUpperCase().startsWith("VICAR"),
  },

  // ADAMA puede venir como "ADAMA ANDINA", "ADAMA COLOMBIA", etc.
  {
    presupuesto: "ADAMA",
    match: (catalogBrand) => catalogBrand.toUpperCase().startsWith("ADAMA"),
  },

  // AGROCENTRO puede venir con variaciones
  {
    presupuesto: "AGROCENTRO",
    match: (catalogBrand) => catalogBrand.toUpperCase().startsWith("AGROCENTRO"),
  },

  // OUROFINO
  {
    presupuesto: "OUROFINO",
    match: (catalogBrand) => catalogBrand.toUpperCase().startsWith("OUROFINO"),
  },

  // LAQUINSA
  {
    presupuesto: "LAQUINSA",
    match: (catalogBrand) => catalogBrand.toUpperCase().startsWith("LAQUINSA"),
  },

  // ATREVIA
  {
    presupuesto: "ATREVIA",
    match: (catalogBrand) => catalogBrand.toUpperCase().startsWith("ATREVIA"),
  },

  // DIABONOS
  {
    presupuesto: "DIABONOS",
    match: (catalogBrand) => catalogBrand.toUpperCase().startsWith("DIABONO"),
  },

  // EDO
  {
    presupuesto: "EDO",
    match: (catalogBrand) =>
      catalogBrand.toUpperCase() === "EDO" || catalogBrand.toUpperCase().startsWith("EDO "),
  },

  // AGROVET
  {
    presupuesto: "AGROVET",
    match: (catalogBrand) => catalogBrand.toUpperCase().startsWith("AGROVET"),
  },

  // AUROFARMA
  {
    presupuesto: "AUROFARMA",
    match: (catalogBrand) => catalogBrand.toUpperCase().startsWith("AUROFARMA"),
  },

  // AGROSEMILLAS
  {
    presupuesto: "AGROSEMILLAS",
    match: (catalogBrand) => catalogBrand.toUpperCase().startsWith("AGROSEMILLA"),
  },
];

/**
 * Normaliza un nombre de marca del catálogo al nombre del presupuesto.
 * Si no matchea con ninguna regla, retorna el nombre original (en mayúsculas, trimmed).
 *
 * @param {string} catalogBrand — nombre de marca tal como viene en distrimm_productos_catalogo
 * @returns {string} — nombre normalizado (el del presupuesto, o el original si no matchea)
 */
export function normalizeBrand(catalogBrand) {
  if (!catalogBrand) return "SIN MARCA";
  const trimmed = catalogBrand.trim();
  if (!trimmed) return "SIN MARCA";

  for (const rule of BRAND_RULES) {
    if (rule.match(trimmed)) {
      return rule.presupuesto;
    }
  }

  // Sin regla → retornar en mayúsculas para consistencia
  return trimmed.toUpperCase();
}

/**
 * Genera la lista de marcas para el dropdown de presupuestos.
 * Normaliza marcas del catálogo para el dropdown de presupuestos.
 * Retorna valores únicos ordenados.
 *
 * @param {string[]} catalogMarcas — marcas únicas del catálogo (sin normalizar)
 * @returns {string[]} — marcas normalizadas únicas, ordenadas
 */
export function getNormalizedMarcasList(catalogMarcas) {
  const set = new Set();
  (catalogMarcas || []).forEach((m) => {
    set.add(normalizeBrand(m));
  });
  return Array.from(set).sort();
}
