/**
 * Empty state displayed when no CFO analysis has been generated yet.
 * Shows a CTA to trigger the first analysis and feature tags.
 * @module components/cfo/CfoEmptyState
 */

import { Brain, Zap, AlertTriangle } from "lucide-react";
import { Card } from "../dashboard/DashboardShared";

const FEATURE_TAGS = [
  "Semaforo de Salud",
  "KPIs de Cartera",
  "Ranking Deudores",
  "Plan de Accion",
  "Analisis Vendedores",
];

/**
 * @param {{ onRun: () => void, error?: string|null }} props
 */
export default function CfoEmptyState({ onRun, error }) {
  return (
    <Card className="py-16">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center">
          <Brain size={36} className="text-indigo-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-800">
            Analisis CFO con Inteligencia Artificial
          </h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md">
            Genera un diagnostico completo de tu cartera incluyendo semaforo de salud,
            KPIs, ranking de deudores, analisis por vendedor y plan de accion.
          </p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-2 rounded-xl max-w-md">
            <AlertTriangle size={14} className="inline mr-1.5" />
            {error}
          </div>
        )}

        <button
          onClick={onRun}
          className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-md flex items-center gap-2 active:scale-95"
        >
          <Zap size={18} />
          Generar Analisis CFO
        </button>

        <div className="flex flex-wrap justify-center gap-2 mt-2">
          {FEATURE_TAGS.map((tag) => (
            <span
              key={tag}
              className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full text-[10px] font-bold"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}
