import { cn } from "@/lib/utils";
import { displayCurrency, getSemaphore } from "./cfoUtils";

export default function DebtorTable({ deudores }) {
  if (!deudores || deudores.length === 0) return null;

  const hasSemaforo = deudores.some((d) => d.semaforo || d.riesgo);
  const hasCompras = deudores.some(
    (d) => d.compras_90d != null || d.dias_ultima_compra != null,
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-left py-2 px-2 font-bold text-slate-400 uppercase tracking-wider">#</th>
            <th className="text-left py-2 px-2 font-bold text-slate-400 uppercase tracking-wider">Cliente</th>
            <th className="text-right py-2 px-2 font-bold text-slate-400 uppercase tracking-wider">Deuda</th>
            <th className="text-right py-2 px-2 font-bold text-slate-400 uppercase tracking-wider">Mora</th>
            {hasCompras && (
              <th className="text-right py-2 px-2 font-bold text-slate-400 uppercase tracking-wider">Compras 90d</th>
            )}
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
              <tr
                key={d.cliente || d.nombre || `debtor-${i}`}
                className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                title={d.diagnostico || d.accion_recomendada || undefined}
              >
                <td className="py-2 px-2 font-bold text-slate-400">{d.posicion || i + 1}</td>
                <td className="py-2 px-2 font-semibold text-slate-700 max-w-[200px] truncate">
                  {d.cliente || d.nombre}
                  {d.vendedor && (
                    <span className="block text-[10px] font-normal text-slate-400 truncate">
                      {d.vendedor}
                    </span>
                  )}
                </td>
                <td className="py-2 px-2 text-right font-bold text-slate-900">{displayCurrency(d.deuda_total || d.saldo || d.valor_saldo)}</td>
                <td className="py-2 px-2 text-right font-semibold text-slate-600">{d.max_mora_dias ?? d.dias_mora ?? d.dias ?? "-"}d</td>
                {hasCompras && (
                  <td className="py-2 px-2 text-right text-slate-600">
                    {d.compras_90d != null ? (
                      <>
                        <span className="font-semibold text-slate-700">
                          {displayCurrency(d.compras_90d)}
                        </span>
                        {d.dias_ultima_compra != null && (
                          <span className="block text-[10px] text-slate-400">
                            últ. hace {d.dias_ultima_compra}d
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                )}
                {hasSemaforo && (
                  <td className="py-2 px-2 text-center">
                    {riesgoSem ? (
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", riesgoSem.badge)}>{riesgoSem.label}</span>
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
