/**
 * Constantes de umbrales y configuracion del sistema.
 * Centraliza magic numbers para mantenibilidad.
 */

// Health score tiers (used in VendedoresPage, CfoAnalysisPage)
export const HEALTH_SCORE_TIERS = {
  GOOD: 80,
  WARNING: 60,
};

// Cartera risk thresholds (used in CfoAnalysisPage)
export const CARTERA_THRESHOLDS = {
  PCT_VENCIDA_CRITICO: 50,
  PCT_VENCIDA_ALTO_RIESGO: 30,
  MORA_PROMEDIO_CRITICO: 60,
  MORA_PROMEDIO_ALTO_RIESGO: 30,
  DSO_ALTO_RIESGO: 45,
  DSO_ACEPTABLE: 30,
};

// CFO score ranges (used in CfoAnalysisPage)
export const CFO_SCORE_RANGES = {
  EXCELLENT: 80,
  GOOD: 60,
  FAIR: 40,
  POOR: 20,
};

// Aging bucket boundaries in days (used in VendedoresPage, utils/constants.js)
export const AGING_BUCKET_DAYS = {
  BUCKET_30: 30,
  BUCKET_60: 60,
  BUCKET_90: 90,
};
/** @deprecated Use AGING_BUCKET_DAYS instead */
export const AGING_BUCKETS = AGING_BUCKET_DAYS;

// Time constants in milliseconds (used in ChatbotPage)
export const TIME_UNITS_MS = {
  MINUTE: 60_000,
  HOUR: 3_600_000,
  DAY: 86_400_000,
  WEEK_DAYS: 7,
};

// Display limits
export const DISPLAY_LIMITS = {
  CUFE_PREVIEW_LENGTH: 15,
};

// Recaudo (collections) thresholds
export const RECAUDO_THRESHOLDS = {
  // ⚠️ YA NO ES LA FUENTE DE VERDAD (26/07/2026). Solo el respaldo si la base
  // no responde.
  //
  // El umbral vive en el VPS, en la fila `tipo='dias_mora'` de
  // `distrimm_comisiones_exclusiones`, y se configura desde la pantalla de
  // Exclusiones. Se movió porque el cálculo también corre en SQL: una constante
  // de JS que el servidor no puede leer obliga a escribirla dos veces, y dos
  // copias divergen en silencio (le pasa a `normalize_brand`).
  //
  // Para leerlo: `leerDiasMoraLimite(exclusiones)` en hooks/comisiones/utils.js.
  // Cambiarlo aquí NO cambia la liquidación.
  //
  // Días máximos entre emisión de factura y pago para que el recaudo comisione.
  // Se amplió de 70 a 72 (jul/2026) porque los días se cuentan desde la fecha
  // de factura y pagos legítimos quedaban por fuera por 1-2 días.
  DIAS_MORA_LIMITE: 72,
};
