import React, { useMemo } from "react";
import { TrendingUp, Ban } from "lucide-react";
import { formatFullCurrency, formatDateUTC } from "../../utils/formatters";

export default function ReporteVendedorDetail({ vendedor }) {
  const ventas = vendedor.ventas;

  // Group by factura
  const facturaGroups = useMemo(() => {
    const map = {};
    ventas.forEach((v) => {
      const key = v.factura || `sin-factura-${v.id}`;
      if (!map[key]) {
        map[key] = {
          factura: v.factura,
          fecha: v.fecha,
          cliente: v.cliente_nombre,
          lineas: [],
          totalComisionable: 0,
          totalExcluido: 0,
          costoComisionable: 0,
          hasComisionable: false,
          allExcluded: true,
          motivos: new Set(),
        };
      }
      const g = map[key];
      g.lineas.push(v);
      const val = Number(v.valor_total || 0);
      const costo = Number(v.costo || 0);
      if (v.excluded) {
        g.totalExcluido += val;
        if (v.reason) g.motivos.add(v.reason);
      } else {
        g.totalComisionable += val;
        g.costoComisionable += costo;
        g.hasComisionable = true;
        g.allExcluded = false;
      }
    });
    return Object.values(map).sort((a, b) =>
      (a.fecha || "").localeCompare(b.fecha || ""),
    );
  }, [ventas]);

  const facturasComisionables = facturaGroups.filter((f) => f.hasComisionable);
  const facturasExcluidas = facturaGroups.filter((f) => f.allExcluded);

  return (
    <div className="bg-slate-50 border-t border-b border-slate-200">
      {/* Section: Facturas Comisionables */}
      <div className="px-6 pt-4 pb-2">
        <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
          <TrendingUp size={14} /> Facturas Comisionables (
          {facturasComisionables.length})
        </h4>
      </div>

      {facturasComisionables.length === 0 ? (
        <p className="px-6 pb-4 text-xs text-slate-400">
          Sin facturas comisionables
        </p>
      ) : (
        <div className="px-6 pb-4 max-h-[350px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="text-slate-400 uppercase font-bold sticky top-0 bg-slate-50">
              <tr>
                <th className="px-2 py-1.5 text-left">Fecha</th>
                <th className="px-2 py-1.5 text-left">Factura</th>
                <th className="px-2 py-1.5 text-left">Cliente</th>
                <th className="px-2 py-1.5 text-center">Lineas</th>
                <th className="px-2 py-1.5 text-right">Valor Comisionable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {facturasComisionables.map((f, idx) => {
                const hasExcludedLines = f.totalExcluido > 0;
                return (
                  <React.Fragment key={`${f.factura}-${idx}`}>
                    <tr className="hover:bg-white">
                      <td className="px-2 py-1.5 text-slate-600">
                        {formatDateUTC(f.fecha)}
                      </td>
                      <td className="px-2 py-1.5 font-mono font-bold text-slate-800">
                        {f.factura}
                      </td>
                      <td className="px-2 py-1.5 text-slate-600 truncate max-w-[160px]">
                        {f.cliente}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className="text-slate-600">
                          {f.lineas.filter((l) => !l.excluded).length}
                        </span>
                        {hasExcludedLines && (
                          <span className="text-rose-400 ml-0.5">
                            +{f.lineas.filter((l) => l.excluded).length}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono font-bold text-emerald-700">
                        {formatFullCurrency(f.totalComisionable)}
                      </td>
                    </tr>
                    {/* Show excluded lines within mixed factura tachadas */}
                    {hasExcludedLines &&
                      f.lineas
                        .filter((l) => l.excluded)
                        .map((line) => (
                          <tr key={line.id} className="bg-[#fafafa]">
                            <td className="px-2 py-1 text-slate-300"></td>
                            <td className="px-2 py-1 text-slate-300 font-mono line-through">
                              {line.producto_codigo}
                            </td>
                            <td
                              colSpan={2}
                              className="px-2 py-1 text-slate-400 line-through text-[11px] truncate max-w-[200px]"
                            >
                              {line.producto_descripcion}
                            </td>
                            <td className="px-2 py-1 text-right font-mono text-slate-400 line-through">
                              {formatFullCurrency(line.valor_total)}
                            </td>
                            <td className="px-2 py-1 text-right">
                              <span className="inline-flex px-1 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-600">
                                {line.reason}
                              </span>
                            </td>
                          </tr>
                        ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Section: Facturas Excluidas */}
      {facturasExcluidas.length > 0 && (
        <>
          <div className="px-6 pt-3 pb-2 border-t border-slate-200">
            <h4 className="text-xs font-bold text-rose-500 uppercase tracking-wider flex items-center gap-1.5">
              <Ban size={14} /> Facturas Excluidas ({facturasExcluidas.length})
            </h4>
          </div>
          <div className="px-6 pb-4 max-h-[250px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-400 uppercase font-bold sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-2 py-1.5 text-left">Fecha</th>
                  <th className="px-2 py-1.5 text-left">Factura</th>
                  <th className="px-2 py-1.5 text-left">Cliente</th>
                  <th className="px-2 py-1.5 text-center">Lineas</th>
                  <th className="px-2 py-1.5 text-right">Valor</th>
                  <th className="px-2 py-1.5 text-left">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {facturasExcluidas.map((f, idx) => (
                  <tr
                    key={`excl-${f.factura}-${idx}`}
                    className="bg-slate-100/50 text-slate-400"
                  >
                    <td className="px-2 py-1.5">{formatDateUTC(f.fecha)}</td>
                    <td className="px-2 py-1.5 font-mono">{f.factura}</td>
                    <td className="px-2 py-1.5 truncate max-w-[160px]">
                      {f.cliente}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {f.lineas.length}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {formatFullCurrency(f.totalExcluido)}
                    </td>
                    <td className="px-2 py-1.5">
                      {[...f.motivos].map((m) => (
                        <span
                          key={m}
                          className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-600 mr-1"
                        >
                          {m}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
