/**
 * Metadatos de las clasificaciones de stock del Sugerido de Pedidos.
 * En archivo propio (no en el componente) para poder importarse desde
 * utils/exports sin romper fast-refresh.
 */
export const CLASIFICACION_META = {
  AGOTADO: { label: "Agotado", badge: "bg-rose-100 text-rose-700" },
  CRITICO: { label: "Crítico", badge: "bg-amber-100 text-amber-700" },
  NORMAL: { label: "Normal", badge: "bg-emerald-100 text-emerald-700" },
  LENTO: { label: "Lento", badge: "bg-blue-100 text-blue-700" },
  MUERTO: { label: "Muerto", badge: "bg-slate-200 text-slate-600" },
};
