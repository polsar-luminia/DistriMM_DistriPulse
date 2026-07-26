import React, { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, PackageSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFullCurrency, formatDateUTC } from "../../utils/formatters";
import { EmptyState } from "../comisiones/ComisionesShared";
import { CLASIFICACION_META } from "./clasificacion";

const PAGE_SIZE = 100;

const COLUMNS = [
  { key: "producto_codigo", label: "Código", align: "left" },
  { key: "producto_nombre", label: "Producto", align: "left" },
  { key: "marca", label: "Marca", align: "left" },
  {
    key: "costo_unitario",
    label: "Costo unit.",
    align: "right",
    title: "Último valor de compra del producto",
  },
  { key: "stock", label: "Stock", align: "right" },
  {
    key: "stock_valor",
    label: "Valor stock",
    align: "right",
    title: "Existencia valorizada en bodegas 1, 5 y 6",
  },
  { key: "venta_diaria", label: "Venta/día", align: "right" },
  { key: "cobertura_dias", label: "Cobertura", align: "right" },
  { key: "ultima_venta", label: "Últ. venta", align: "center" },
  { key: "clasificacion", label: "Estado", align: "center" },
  { key: "sugerido_cantidad", label: "Sugerido", align: "right" },
  { key: "sugerido_costo", label: "Costo est.", align: "right" },
];

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls al final
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "es");
}

/**
 * Tabla del sugerido con ordenamiento por columna y paginación client-side.
 */
export default function SugeridoTable({ rows }) {
  const [sort, setSort] = useState({ key: "sugerido_costo", dir: "desc" });
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const cmp = compareValues(a[sort.key], b[sort.key]);
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE,
  );

  const handleSort = (key) => {
    setPage(0);
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={PackageSearch}
        title="Sin resultados"
        subtitle="No hay productos que coincidan con el filtro actual."
      />
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold">
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  title={c.title}
                  className={cn(
                    "px-3 py-2.5 cursor-pointer select-none whitespace-nowrap hover:text-slate-800 transition-colors",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                  )}
                  onClick={() => handleSort(c.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {sort.key === c.key &&
                      (sort.dir === "asc" ? (
                        <ChevronUp size={12} />
                      ) : (
                        <ChevronDown size={12} />
                      ))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.map((row) => {
              const meta =
                CLASIFICACION_META[row.clasificacion] ||
                CLASIFICACION_META.NORMAL;
              const sugerido = Number(row.sugerido_cantidad) || 0;
              return (
                <tr key={row.producto_codigo} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-xs font-mono text-slate-500">
                    {row.producto_codigo}
                  </td>
                  <td className="px-3 py-2 text-xs font-medium text-slate-800 truncate max-w-[220px]">
                    {row.producto_nombre}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500 truncate max-w-[120px]">
                    {row.marca}
                  </td>
                  <td className="px-3 py-2 text-xs text-right font-mono tabular-nums text-slate-600">
                    {Number(row.costo_unitario) > 0
                      ? formatFullCurrency(row.costo_unitario)
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-right font-mono tabular-nums">
                    {Number(row.stock)}
                    {Number(row.transito) > 0 && (
                      <span
                        className="text-indigo-500"
                        title={`+${Number(row.transito)} en tránsito`}
                      >
                        {" "}
                        +{Number(row.transito)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-right font-mono tabular-nums text-slate-600">
                    {Number(row.stock_valor) > 0
                      ? formatFullCurrency(row.stock_valor)
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-right font-mono tabular-nums">
                    {Number(row.venta_diaria).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-xs text-right font-mono tabular-nums">
                    {row.cobertura_dias != null
                      ? `${Number(row.cobertura_dias)}d`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-center font-mono text-slate-500">
                    {row.ultima_venta ? formatDateUTC(row.ultima_venta) : "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap",
                        meta.badge,
                      )}
                    >
                      {meta.label}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-sm text-right font-mono tabular-nums font-bold",
                      sugerido > 0 ? "text-indigo-700" : "text-slate-300",
                    )}
                  >
                    {sugerido}
                  </td>
                  <td className="px-3 py-2 text-xs text-right font-mono tabular-nums text-slate-600">
                    {sugerido > 0 ? formatFullCurrency(row.sugerido_costo) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-200 bg-slate-50">
          <span className="text-xs text-slate-500 font-medium">
            {sorted.length} productos — página {safePage + 1} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="px-3 py-1 text-xs font-bold border border-slate-300 rounded-lg hover:bg-white disabled:opacity-40 transition-colors"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="px-3 py-1 text-xs font-bold border border-slate-300 rounded-lg hover:bg-white disabled:opacity-40 transition-colors"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
