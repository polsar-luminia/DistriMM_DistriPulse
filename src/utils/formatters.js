import { DATE_FORMATS } from "./constants";

export const formatCurrency = (value) => {
  if (!Number.isFinite(value)) return "$0";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export const formatFullCurrency = (value) => {
  if (!Number.isFinite(value)) return "$ 0";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

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

export const formatDateShort = (dateString) => {
  if (!dateString) return "";
  const date = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    timeZone: DATE_FORMATS.TIMEZONE,
  }).format(date);
};

export const formatPercentage = (value, decimals = 1) => {
  if (value === undefined || value === null || !Number.isFinite(value)) return "0%";
  return `${value.toFixed(decimals)}%`;
};

export const formatNumber = (value) => {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("es-CO").format(value);
};

export const truncateText = (text, maxLength = 20) => {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
};

export const getShortName = (name) => {
  if (!name) return "";
  return name.split(" ").slice(0, 2).join(" ");
};

