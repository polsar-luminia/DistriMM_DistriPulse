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
  DIAS_MORA_LIMITE: 70,
};
