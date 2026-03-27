/* eslint-disable react-refresh/only-export-components */
import {
  Loader,
  Phone,
  PhoneOff,
  Plus,
  History,
  FileText,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const TABS = [
  { id: "nuevo_lote", label: "Nuevo Lote", icon: Plus },
  { id: "historial", label: "Historial", icon: History },
  { id: "plantillas", label: "Plantillas", icon: FileText },
  { id: "whatsapp", label: "WhatsApp", icon: Smartphone },
];

export const fmtCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function LoteProgressBadge({ lote }) {
  const pct =
    lote.total_destinatarios > 0
      ? Math.round(((lote.enviados + lote.fallidos) / lote.total_destinatarios) * 100)
      : 0;

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 min-w-[260px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-indigo-700 uppercase flex items-center gap-1">
          <Loader size={12} className="animate-spin" /> Procesando lote...
        </span>
        <span className="text-xs font-bold text-indigo-600">
          {lote.enviados + lote.fallidos}/{lote.total_destinatarios}
        </span>
      </div>
      <div className="w-full bg-indigo-200 rounded-full h-2">
        <div
          className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      {lote.fallidos > 0 && (
        <p className="text-[10px] text-rose-500 font-bold mt-1">
          {lote.fallidos} fallido(s)
        </p>
      )}
    </div>
  );
}

export function PhoneBadge({ phoneData }) {
  if (!phoneData || !phoneData.valid) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-500 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
        <PhoneOff size={10} /> Sin Tel
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
      <Phone size={10} /> {phoneData.phone}
    </span>
  );
}

export function EstadoBadge({ estado }) {
  const styles = {
    pendiente: "bg-amber-50 text-amber-700 border-amber-200",
    en_proceso: "bg-blue-50 text-blue-700 border-blue-200",
    completado: "bg-emerald-50 text-emerald-700 border-emerald-200",
    parcial: "bg-orange-50 text-orange-700 border-orange-200",
    cancelado: "bg-slate-100 text-slate-500 border-slate-200",
    enviado: "bg-emerald-50 text-emerald-700 border-emerald-200",
    fallido: "bg-rose-50 text-rose-700 border-rose-200",
  };

  return (
    <span
      className={cn("inline-flex items-center text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border", styles[estado] || styles.pendiente)}
    >
      {estado === "en_proceso" ? "En proceso" : estado}
    </span>
  );
}
