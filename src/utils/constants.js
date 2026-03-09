import { AGING_BUCKET_DAYS } from "../constants/thresholds";

export const COLORS = {
  // Semantic
  SUCCESS: "emerald",
  DANGER: "rose",
  WARNING: "amber",
  INFO: "indigo",
  NEUTRAL: "slate",

  // Chart colors (hex for Recharts)
  CHART: {
    PRIMARY: "#10B981", // Emerald-500 �?" "Al Día" / success
    SECONDARY: "#6366F1", // Indigo-500 �?" primary brand
    DANGER: "#EF4444", // Rose-500 �?" "Vencida" / overdue
    WARNING: "#F59E0B", // Amber-500 �?" moderate risk
    NEUTRAL: "#64748B", // Slate-500 �?" axis labels
    // 10-color palette for pie/bar charts with multiple series
    PALETTE: [
      "#6366F1", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
      "#EC4899", "#14B8A6", "#F97316", "#06B6D4", "#84CC16",
    ],
  },

  // Aging bucket colors
  AGING: {
    AL_DIA: "#10B981",
    DIAS_1_30: "#FBBF24",
    DIAS_31_60: "#F59E0B",
    DIAS_61_90: "#EF4444",
    DIAS_90_PLUS: "#7F1D1D",
  },
};

export const DEFAULT_FILTERS = {
  search: "",
  status: "ALL",
  minMora: "",
  maxMora: "",
};

export const DEFAULT_REMINDER_CONFIG = {
  target: "all",
  daysRange: { min: 0, max: 15 },
  amountRange: { min: "", max: "" },
  enabled: { days: true, amount: false },
  sentStatus: "all",
  searchQuery: "",
};

export const THRESHOLDS = {
  /** Days overdue considered "high risk" */
  HIGH_RISK_DAYS: 30,

  /** Days overdue for legal action */
  LEGAL_ACTION_DAYS: 90,

  /** Days overdue considered unrecoverable (audit threshold) */
  UNRECOVERABLE_DAYS: 360,

  /** Pareto percentage (80/20 rule) */
  PARETO_PERCENTAGE: 0.8,

  /** High risk portfolio percentage */
  HIGH_RISK_PERCENTAGE: 20,
};

export const AGING_BUCKETS = [
  { key: "Al Día", min: -Infinity, max: 0, color: COLORS.AGING.AL_DIA },
  { key: "1-30 Días", min: 1, max: AGING_BUCKET_DAYS.BUCKET_30, color: COLORS.AGING.DIAS_1_30 },
  { key: "31-60 Días", min: AGING_BUCKET_DAYS.BUCKET_30 + 1, max: AGING_BUCKET_DAYS.BUCKET_60, color: COLORS.AGING.DIAS_31_60 },
  { key: "61-90 Días", min: AGING_BUCKET_DAYS.BUCKET_60 + 1, max: AGING_BUCKET_DAYS.BUCKET_90, color: COLORS.AGING.DIAS_61_90 },
  { key: "+90 Días", min: AGING_BUCKET_DAYS.BUCKET_90 + 1, max: Infinity, color: COLORS.AGING.DIAS_90_PLUS },
];

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  PAGE_SIZE_OPTIONS: [10, 25, 50, 100],
};

export const DATE_FORMATS = {
  DISPLAY: "dd/MM/yyyy",
  ISO: "yyyy-MM-dd",
  TIMEZONE: "America/Bogota",
};

export const UPLOAD_TYPES = {
  CARTERA: "cartera",
  CLIENTES: "clientes",
};

export const VENDEDOR_THRESHOLDS = {
  /** % vencida above which vendedor is high risk */
  HIGH_RISK_PCT: 30,
  /** % vencida above which vendedor is medium risk */
  MEDIUM_RISK_PCT: 15,
};

export const COVERAGE_THRESHOLDS = {
  /** Min % of clients with celular for "good" status */
  CELULAR_GOOD: 70,
  /** Min % of clients with email for "good" status */
  CORREO_GOOD: 50,
};

