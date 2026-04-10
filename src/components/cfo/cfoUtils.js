import {
  CheckCircle,
  Shield,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { formatCurrency } from "../dashboard/DashboardShared";

export const SEMAPHORE_CONFIG = {
  SALUDABLE: {
    bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700",
    badge: "bg-emerald-100 text-emerald-800", icon: CheckCircle, label: "Saludable",
    glow: "shadow-emerald-100",
  },
  ACEPTABLE: {
    bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700",
    badge: "bg-blue-100 text-blue-800", icon: Shield, label: "Aceptable",
    glow: "shadow-blue-100",
  },
  EN_RIESGO: {
    bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700",
    badge: "bg-amber-100 text-amber-800", icon: AlertTriangle, label: "En Riesgo",
    glow: "shadow-amber-100",
  },
  CRITICO: {
    bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700",
    badge: "bg-rose-100 text-rose-800", icon: XCircle, label: "Critico",
    glow: "shadow-rose-100",
  },
  ALERTA_MAXIMA: {
    bg: "bg-red-50", border: "border-red-300", text: "text-red-800",
    badge: "bg-red-200 text-red-900", icon: AlertTriangle, label: "Alerta Maxima",
    glow: "shadow-red-200",
  },
};

export const getSemaphore = (key) =>
  SEMAPHORE_CONFIG[key] || SEMAPHORE_CONFIG.EN_RIESGO;

// Parse "$474.803.006" or "46.7%" or 474803006 into a number.
// Currency ($): dots are thousands separators. Non-currency: dot is decimal.
export function parseNumericValue(val) {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  const str = String(val);
  let cleaned = str.replace(/[$%\s]/g, "");
  // Colombian currency or numbers with comma: dots are thousands separators
  if (str.includes("$") || cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  // Otherwise dot is decimal separator (e.g. "46.7")
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// If already a formatted string like "$474.803.006", show as-is; else format
export function displayCurrency(val) {
  if (val == null) return "$0";
  if (typeof val === "string" && val.startsWith("$")) return val;
  return formatCurrency(parseNumericValue(val));
}

// If string "46.7%", show as-is; if number, append %
export function displayPct(val) {
  if (val == null) return "0%";
  if (typeof val === "string" && val.includes("%")) return val;
  return `${val}%`;
}

// Flatten plan_accion from nested object to flat array with priorities
export function flattenPlanAccion(plan) {
  if (!plan) return [];
  if (Array.isArray(plan)) return plan;

  const priorityMap = {
    urgente_48h: "URGENTE",
    urgente: "URGENTE",
    esta_semana: "ALTA",
    corto_plazo: "ALTA",
    este_mes: "MEDIA",
    mediano_plazo: "MEDIA",
    siguiente_mes: "BAJA",
    largo_plazo: "BAJA",
  };

  const items = [];
  for (const [key, actions] of Object.entries(plan)) {
    const priority = priorityMap[key] || "MEDIA";
    if (Array.isArray(actions)) {
      actions.forEach((a) => {
        items.push({
          accion: typeof a === "string" ? a : (a.accion || a.titulo || a.descripcion || ""),
          prioridad: priority,
          detalle: typeof a === "object" ? a.detalle : undefined,
          impacto_esperado: typeof a === "object" ? a.impacto_esperado : undefined,
          responsable: typeof a === "object" ? a.responsable : undefined,
        });
      });
    }
  }
  return items;
}

// Normalize insights_clave from string[] or object[]
export function normalizeInsights(insights) {
  if (!insights || !Array.isArray(insights)) return [];
  return insights.map((ins) => {
    if (typeof ins === "string") {
      return { titulo: ins, tipo: "NEUTRAL" };
    }
    return ins;
  });
}
