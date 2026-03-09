import React, { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import {
  formatCurrency,
  formatFullCurrency,
  formatNumber,
} from "../../utils/formatters";

const DONUT_COLORS = ["#34d399", "#d1d5db"];

export default function VendedorDetail({ vendedor, ventas, loading, getExclusionInfo }) {
  const v = vendedor;

  // Classify each sale
  const classified = useMemo(() => {
    return ventas.map((item) => {
      const info = getExclusionInfo(item.producto_codigo);
      return { ...item, ...info };
    });
  }, [ventas, getExclusionInfo]);

  const comisionables = classified.filter((i) => !i.excluded);
  const excluidos = classified.filter((i) => i.excluded);
  const devoluciones = classified.filter((i) => i.tipo === "DV");

  // Donut data
  const donutData = useMemo(() => [
    { name: "Comisionable", value: Number(v.ventas_comisionables || 0) },
    { name: "Excluido", value: Number(v.ventas_excluidas || 0) },
  ], [v]);

  // Top 3 products by valor_total (comisionables)
  const topProducts = useMemo(() => {
    return [...comisionables]
      .sort((a, b) => Number(b.valor_total) - Number(a.valor_total))
      .slice(0, 3);
  }, [comisionables]);

  // Top 3 excluded products by valor_total
  const topExcluded = useMemo(() => {
    return [...excluidos]
      .sort((a, b) => Number(b.valor_total) - Number(a.valor_total))
      .slice(0, 3);
  }, [excluidos]);

  if (loading) {
    return (
      <div className="bg-slate-50 border-t border-b border-slate-200 flex items-center justify-center py-12">
        <Loader2 size={20} className="text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-slate-50 border-t border-b border-slate-200">
      {/* Header */}
      <div className="px-6 pt-4 pb-2">
        <h4 className="text-sm font-bold text-slate-800">
          Detalle de ventas de {v.vendedor_nombre || "Vendedor"}{" "}
          <span className="font-normal text-slate-500">
            — {classified.length} items ({comisionables.length} comisionables, {excluidos.length} excluidos{devoluciones.length > 0 ? `, ${devoluciones.length} DV` : ""})
          </span>
        </h4>
      </div>

      {/* Visual summary row */}
      <div className="px-6 pb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Donut chart */}
        <div className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-3">
          <div className="w-16 h-16 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={18}
                  outerRadius={30}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {donutData.map((_, idx) => (
                    <Cell key={idx} fill={DONUT_COLORS[idx]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="text-xs">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-slate-600">Comisionable: <strong>{formatCurrency(v.ventas_comisionables)}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-slate-300" />
              <span className="text-slate-500">Excluido: <strong>{formatCurrency(v.ventas_excluidas)}</strong></span>
            </div>
          </div>
        </div>

        {/* Top 3 productos comisionables */}
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-2">Top 3 Comisionables</p>
          {topProducts.length === 0 ? (
            <p className="text-xs text-slate-400">Sin productos</p>
          ) : (
            <div className="space-y-1">
              {topProducts.map((p, i) => (
                <div key={p.id} className="flex justify-between text-xs">
                  <span className="text-slate-600 truncate max-w-[140px]">{i + 1}. {p.producto_descripcion || p.producto_codigo}</span>
                  <span className="font-mono font-bold text-slate-700 shrink-0 ml-2">{formatCurrency(p.valor_total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top 3 excluidos */}
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-2">Top 3 Excluidos</p>
          {topExcluded.length === 0 ? (
            <p className="text-xs text-slate-400">Sin excluidos</p>
          ) : (
            <div className="space-y-1">
              {topExcluded.map((p, i) => (
                <div key={p.id} className="flex justify-between text-xs">
                  <span className="text-slate-500 truncate max-w-[140px]">{i + 1}. {p.producto_descripcion || p.producto_codigo}</span>
                  <span className="font-mono text-rose-500 shrink-0 ml-2">{formatCurrency(p.valor_total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Detail table */}
      <div className="px-6 pb-4 max-h-[400px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-400 uppercase font-bold sticky top-0 bg-slate-50">
            <tr>
              <th className="px-2 py-1.5 text-center">Tipo</th>
              <th className="px-2 py-1.5 text-left">Producto</th>
              <th className="px-2 py-1.5 text-left">Descripcion</th>
              <th className="px-2 py-1.5 text-left">Cliente</th>
              <th className="px-2 py-1.5 text-left">Factura</th>
              <th className="px-2 py-1.5 text-right">Cantidad</th>
              <th className="px-2 py-1.5 text-right">Valor Total</th>
              <th className="px-2 py-1.5 text-right">Costo</th>
              <th className="px-2 py-1.5 text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {classified.map((item) => (
              <tr key={item.id} className={item.excluded ? "bg-[#f8f8f8] opacity-60" : "hover:bg-white"}>
                <td className="px-2 py-1.5 text-center">
                  {item.tipo === "DV" ? (
                    <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">DV</span>
                  ) : (
                    <span className="text-[10px] text-slate-400">VE</span>
                  )}
                </td>
                <td className={cn("px-2 py-1.5 font-mono", item.excluded ? "line-through text-slate-400" : "text-slate-700")}>{item.producto_codigo}</td>
                <td className={cn("px-2 py-1.5 truncate max-w-[180px]", item.excluded ? "line-through text-slate-400" : "text-slate-600")}>{item.producto_descripcion}</td>
                <td className="px-2 py-1.5 text-slate-500 truncate max-w-[120px]">{item.cliente_nombre}</td>
                <td className="px-2 py-1.5 text-slate-400 font-mono">{item.factura}</td>
                <td className="px-2 py-1.5 text-right font-mono">{formatNumber(item.cantidad)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{formatFullCurrency(item.valor_total)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{formatFullCurrency(item.costo)}</td>
                <td className="px-2 py-1.5 text-center">
                  {item.excluded ? (
                    <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700" title={item.reason}>
                      {item.reason}
                    </span>
                  ) : (
                    <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">Comisionable</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
