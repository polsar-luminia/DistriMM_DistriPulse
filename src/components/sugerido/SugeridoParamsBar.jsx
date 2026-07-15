import React, { useState, useEffect } from "react";
import { RefreshCw, Save, Loader2 } from "lucide-react";
import { sileo } from "sileo";
import { Card } from "../comisiones/ComisionesShared";

function ParamInput({ id, label, suffix, value, onChange, min, max }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-slate-600">
        {label}
      </label>
      <input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 text-center tabular-nums focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
      />
      <span className="text-sm text-slate-500">{suffix}</span>
    </div>
  );
}

/**
 * Barra de parámetros del sugerido: cobertura, crecimiento, reserva y
 * ventana de análisis. "Recalcular" aplica; "Guardar como predeterminado"
 * persiste para toda la organización.
 */
export default function SugeridoParamsBar({
  params,
  calculando,
  onRecalcular,
  onGuardarPredeterminado,
}) {
  const [draft, setDraft] = useState(params);
  const [saving, setSaving] = useState(false);

  // Sincronizar cuando llegan los predeterminados de DB
  useEffect(() => {
    setDraft(params);
  }, [params]);

  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };

  const parsed = () => ({
    diasCobertura: Math.round(clamp(draft.diasCobertura, 1, 365, 30)),
    pctCrecimiento: clamp(draft.pctCrecimiento, 0, 100, 0),
    pctReserva: clamp(draft.pctReserva, 0, 100, 0),
    diasAnalisis: Math.round(clamp(draft.diasAnalisis, 7, 365, 90)),
  });

  const handleRecalcular = () => {
    const p = parsed();
    setDraft(p);
    onRecalcular(p);
  };

  const handleGuardar = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const p = parsed();
      setDraft(p);
      const { success } = await onGuardarPredeterminado(p);
      if (success) {
        sileo.success("Parámetros guardados como predeterminados");
        onRecalcular(p);
      } else {
        sileo.error("No se pudieron guardar los parámetros");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <ParamInput
          id="param-cobertura"
          label="Cobertura"
          suffix="días"
          value={draft.diasCobertura}
          onChange={set("diasCobertura")}
          min={1}
          max={365}
        />
        <ParamInput
          id="param-crecimiento"
          label="Crecimiento"
          suffix="%"
          value={draft.pctCrecimiento}
          onChange={set("pctCrecimiento")}
          min={0}
          max={100}
        />
        <ParamInput
          id="param-reserva"
          label="Reserva"
          suffix="%"
          value={draft.pctReserva}
          onChange={set("pctReserva")}
          min={0}
          max={100}
        />
        <ParamInput
          id="param-analisis"
          label="Análisis"
          suffix="días de venta"
          value={draft.diasAnalisis}
          onChange={set("diasAnalisis")}
          min={7}
          max={365}
        />

        <div className="flex items-center gap-3 ml-auto">
          <button
            onClick={handleRecalcular}
            disabled={calculando}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
          >
            {calculando ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            Recalcular
          </button>
          <button
            onClick={handleGuardar}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            Guardar como predeterminado
          </button>
        </div>
      </div>
    </Card>
  );
}
