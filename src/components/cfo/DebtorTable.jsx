/**
 * Top debtors ranking table for the CFO dashboard.
 * Displays client name, debt amount, overdue days, and optional risk badge.
 * @module components/cfo/DebtorTable
 */

import { displayCurrency, getSemaphore } from "./cfoUtils";

/**
 * @param {{ deudores: Array<{ posicion?: number, cliente?: string, nombre?: string, deuda_total?: number|string, saldo?: number|string, valor_saldo?: number|string, max_mora_dias?: number, dias_mora?: number, dias?: number, semaforo?: string, riesgo?: string }> }} props
 */
export default function DebtorTable({ deudores }) {
  if (!deudores || deudores.length === 0) return null;

  const hasSemaforo = deudores.some((d) => d.semaforo || d.riesgo);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-left py-2 px-2 font-bold text-slate-400 uppercase tracking-wider">#</th>
            <th className="text-left py-2 px-2 font-bold text-slate-400 uppercase tracking-wider">Cliente</th>
            <th className="text-right py-2 px-2 font-bold text-slate-400 uppercase tracking-wider">Deuda</th>
            <th className="text-right py-2 px-2 font-bold text-slate-400 uppercase tracking-wider">Mora</th>
            {hasSemaforo && (
              <th className="text-center py-2 px-2 font-bold text-slate-400 uppercase tracking-wider">Estado</th>
            )}
          </tr>
        </thead>
        <tbody>
          {deudores.map((d, i) => {
            const semKey = d.semaforo || d.riesgo;
            const riesgoSem = semKey ? getSemaphore(semKey) : null;
            return (
              <tr key={d.cliente || d.nombre || i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="py-2 px-2 font-bold text-slate-400">{d.posicion || i + 1}</td>
                <td className="py-2 px-2 font-semibold text-slate-700 max-w-[200px] truncate">{d.cliente || d.nombre}</td>
                <td className="py-2 px-2 text-right font-bold text-slate-900">{displayCurrency(d.deuda_total || d.saldo || d.valor_saldo)}</td>
                <td className="py-2 px-2 text-right font-semibold text-slate-600">{d.max_mora_dias ?? d.dias_mora ?? d.dias ?? "-"}d</td>
                {hasSemaforo && (
                  <td className="py-2 px-2 text-center">
                    {riesgoSem ? (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${riesgoSem.badge}`}>{riesgoSem.label}</span>
                    ) : "-"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
