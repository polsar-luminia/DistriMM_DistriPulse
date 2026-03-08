/**
 * @fileoverview Centralized formatting utilities for the DistriPulse Analytics application.
 * Consolidates duplicated formatting functions from multiple components.
 * @module utils/formatters
 */

import { DATE_FORMATS } from "./constants";

// ============================================================================
// CURRENCY FORMATTERS
// ============================================================================

/**
 * Formats a number as Colombian Pesos (COP) with full precision.
 * Example: 1500000 -> "$\u00A01.500.000"
 * @param {number|null|undefined} value - The value to format
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (value) => {
  if (value === undefined || value === null) return "$0";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

/**
 * Formats a number as Colombian Pesos (COP) with full precision.
 * Example: 1500000 -> "$ 1.500.000"
 * @param {number|null|undefined} value - The value to format
 * @returns {string} Formatted currency string
 */
export const formatFullCurrency = (value) => {
  if (value === undefined || value === null) return "$ 0";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

// ============================================================================
// DATE FORMATTERS
// ============================================================================

/**
 * Formats a date string to Colombian locale (dd/MM/yyyy) with timezone handling.
 * Prevents timezone shift issues by forcing noon time.
 * @param {string|null|undefined} dateString - Date in YYYY-MM-DD format
 * @returns {string} Formatted date string or 'N/A'
 */
export const formatDateUTC = (dateString) => {
  if (!dateString) return "N/A";

  // Force noon time to avoid timezone day-shift issues
  const date = new Date(`${dateString}T12:00:00`);

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: DATE_FORMATS.TIMEZONE,
  }).format(date);
};

/**
 * Formats a date for display in charts (short format).
 * Example: "2024-01-15" -> "15/01"
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {string} Short date string
 */
export const formatDateShort = (dateString) => {
  if (!dateString) return "";
  const date = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    timeZone: DATE_FORMATS.TIMEZONE,
  }).format(date);
};

// ============================================================================
// NUMBER FORMATTERS
// ============================================================================

/**
 * Formats a percentage value with specified decimal places.
 * @param {number} value - The percentage value
 * @param {number} [decimals=1] - Number of decimal places
 * @returns {string} Formatted percentage string
 */
export const formatPercentage = (value, decimals = 1) => {
  if (value === undefined || value === null || !isFinite(value)) return "0%";
  return `${value.toFixed(decimals)}%`;
};

/**
 * Formats a number with thousand separators (Colombian locale).
 * @param {number} value - The number to format
 * @returns {string} Formatted number string
 */
export const formatNumber = (value) => {
  if (value === undefined || value === null) return "0";
  return new Intl.NumberFormat("es-CO").format(value);
};

// ============================================================================
// TEXT FORMATTERS
// ============================================================================

/**
 * Truncates a string to a maximum length with ellipsis.
 * @param {string} text - The text to truncate
 * @param {number} [maxLength=20] - Maximum length before truncation
 * @returns {string} Truncated string
 */
export const truncateText = (text, maxLength = 20) => {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
};

/**
 * Gets a short version of a client name (first two words).
 * @param {string} name - Full client name
 * @returns {string} Short name
 */
export const getShortName = (name) => {
  if (!name) return "";
  return name.split(" ").slice(0, 2).join(" ");
};

