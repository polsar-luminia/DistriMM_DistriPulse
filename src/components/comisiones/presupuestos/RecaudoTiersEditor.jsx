/**
 * @fileoverview Recaudo tiers editor — 4-tramo grid for collection commission scales.
 * Extracted from PresupuestosTab for readability.
 * @module components/comisiones/presupuestos/RecaudoTiersEditor
 */

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const TRAMO_CONFIGS = [
  {
    key: 1,
    label: "Tramo 1",
    color: "emerald",
    fields: [
      { label: "Hasta % cumplimiento", field: "tramo1_max", placeholder: "89.99" },
      { label: "% Comision", field: "tramo1_pct", placeholder: "0.5", isPct: true },
    ],
  },
  {
    key: 2,
    label: "Tramo 2",
    color: "sky",
    fields: [
      { label: "Desde % cumplimiento", field: "tramo2_min", placeholder: "90" },
      { label: "Hasta % cumplimiento", field: "tramo2_max", placeholder: "99.99" },
      { label: "% Comision", field: "tramo2_pct", placeholder: "0.9", isPct: true },
    ],
  },
  {
    key: 3,
    label: "Tramo 3",
    color: "amber",
    fields: [
      { label: "Desde % cumplimiento", field: "tramo3_min", placeholder: "100" },
      { label: "Hasta % cumplimiento", field: "tramo3_max", placeholder: "139.99" },
      { label: "% Comision", field: "tramo3_pct", placeholder: "1.2", isPct: true },
    ],
  },
  {
    key: 4,
    label: "Tramo 4",
    color: "rose",
    fields: [
      { label: "Desde % cumplimiento", field: "tramo4_min", placeholder: "140" },
      { label: "% Comision", field: "tramo4_pct", placeholder: "1.5", isPct: true },
    ],
  },
];

const COLOR_MAP = {
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", title: "text-emerald-800", label: "text-emerald-600" },
  sky:     { bg: "bg-sky-50",     border: "border-sky-200",     title: "text-sky-800",     label: "text-sky-600" },
  amber:   { bg: "bg-amber-50",   border: "border-amber-200",   title: "text-amber-800",   label: "text-amber-600" },
  rose:    { bg: "bg-rose-50",    border: "border-rose-200",     title: "text-rose-800",    label: "text-rose-600" },
};

/**
 * @param {object} props
 * @param {object|null} props.recaudo - Current recaudo row data (null if not configured)
 * @param {number} props.recaudoIdx - Index in the editRecaudo array
 * @param {function} props.onUpdateRow - (idx, field, value) => void
 * @param {function} props.onAddRecaudo - () => void — called when vendor has no recaudo to add one
 * @param {string} props.vendedorCodigo - Vendor code for pre-filling new rows
 * @param {string} props.numInput - Tailwind class string for number inputs
 */
export default function RecaudoTiersEditor({
  recaudo,
  recaudoIdx,
  onUpdateRow,
  onAddRecaudo,
  numInput,
}) {
  if (!recaudo) {
    return (
      <div className="flex items-center gap-3">
        <p className="text-sm text-slate-400 italic">Sin escala de recaudo configurada</p>
        <button
          onClick={onAddRecaudo}
          className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center gap-1.5"
        >
          <Plus size={12} /> Agregar Escala
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Prominent meta input */}
      <div className="mb-5">
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          Meta de Recaudo
        </label>
        <div className="flex items-center gap-2 max-w-xs">
          <span className="text-sm text-slate-500 font-medium">$</span>
          <input
            type="number"
            className={numInput}
            value={recaudo.meta_recaudo}
            onChange={(e) => onUpdateRow(recaudoIdx, "meta_recaudo", e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      {/* 4-tramo grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {TRAMO_CONFIGS.map((tramo) => {
          const colors = COLOR_MAP[tramo.color];
          return (
            <div key={tramo.key} className={cn(colors.bg, colors.border, "border rounded-lg p-4")}>
              <h4 className={cn("text-xs font-black uppercase mb-3", colors.title)}>{tramo.label}</h4>
              <div className="space-y-3">
                {tramo.fields.map((f) => (
                  <div key={f.field}>
                    <label className={cn("text-xs font-medium", colors.label)}>{f.label}</label>
                    <input
                      type="number"
                      className={cn(numInput, "mt-1")}
                      value={
                        f.isPct
                          ? (recaudo[f.field] ? recaudo[f.field] * 100 : "")
                          : (recaudo[f.field] ?? "")
                      }
                      onChange={(e) =>
                        onUpdateRow(
                          recaudoIdx,
                          f.field,
                          f.isPct ? Number(e.target.value) / 100 : e.target.value
                        )
                      }
                      step={f.isPct ? "0.1" : undefined}
                      placeholder={f.placeholder}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
