import { Zap, Plus } from "lucide-react";
import CurrencyInput from "./CurrencyInput";

/**
 * Editor controlado para la regla de comisión de marcas no listadas.
 * Sin estado interno — todo sube al padre vía onUpdateRow.
 * Patrón idéntico a MarcaComisionesEditor.jsx.
 */
export default function ReglaNoListadaEditor({
  regla,
  onUpdateRow,
  onAdd,
  baseInput,
  numInput,
}) {
  if (!regla) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-4 bg-slate-50/50">
        <p className="text-xs text-slate-500 mb-3">
          Sin regla configurada para marcas no listadas.
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-amber-700 hover:bg-amber-100 transition-colors inline-flex items-center gap-1"
        >
          <Plus size={14} />
          Agregar Regla
        </button>
      </div>
    );
  }

  const { _globalIdx, activa } = regla;
  const pctDisplay =
    regla.pct_comision != null
      ? parseFloat((Number(regla.pct_comision) * 100).toFixed(4))
      : "";

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        activa
          ? "border-amber-200 bg-amber-50/30"
          : "border-slate-200 bg-slate-50/50"
      }`}
    >
      {/* Toggle activo/inactivo */}
      <div className="flex items-center gap-3 mb-3">
        <button
          type="button"
          onClick={() => onUpdateRow(_globalIdx, "activa", !activa)}
          className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
            activa ? "bg-indigo-600" : "bg-slate-300"
          }`}
          aria-label={activa ? "Desactivar regla" : "Activar regla"}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              activa ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
        <span className="text-sm font-medium text-slate-700">
          {activa ? "Regla activa" : "Regla inactiva"}
        </span>
      </div>

      {/* Campos — solo visibles cuando activa */}
      {activa && (
        <div className="flex gap-4 mb-3">
          <div className="flex-1">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Umbral total resto de marcas (COP)
            </label>
            <CurrencyInput
              value={regla.umbral ?? 0}
              onChange={(e) =>
                onUpdateRow(
                  _globalIdx,
                  "umbral",
                  parseFloat(e.target.value) || 0,
                )
              }
              className={baseInput}
              placeholder="0"
            />
          </div>
          <div className="w-32">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              % Comisión
            </label>
            <input
              type="number"
              className={numInput}
              value={pctDisplay}
              min={0}
              max={100}
              step={0.01}
              placeholder="0"
              onChange={(e) =>
                onUpdateRow(
                  _globalIdx,
                  "pct_comision",
                  (parseFloat(e.target.value) || 0) / 100,
                )
              }
            />
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 flex items-start gap-1">
        <Zap size={11} className="text-amber-400 mt-0.5 flex-shrink-0" />
        Si la sumatoria de ventas de todas las marcas no listadas en sus cuotas
        alcanza el umbral, el vendedor gana el % de comisión sobre ese total.
      </p>
    </div>
  );
}
