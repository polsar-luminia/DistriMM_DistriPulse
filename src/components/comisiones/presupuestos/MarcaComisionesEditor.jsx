import { Plus, Trash2 } from "lucide-react";
import CurrencyInput from "./CurrencyInput";

export default function MarcaComisionesEditor({
  marcasRows,
  marcasNormalizadas,
  onUpdateRow,
  onDeleteMarca,
  onAddMarca,
  baseInput,
  numInput,
}) {
  return (
    <>
      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-600 uppercase">
                Marca
              </th>
              <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">
                Meta Ventas $
              </th>
              <th className="px-4 py-3 text-right text-xs font-bold text-slate-600 uppercase">
                % Comision
              </th>
              <th className="px-4 py-3 w-14"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {marcasRows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-sm text-slate-400 italic"
                >
                  Sin marcas configuradas
                </td>
              </tr>
            ) : (
              marcasRows.map((row) => (
                <tr
                  key={row.id || `new-m-${row._globalIdx}`}
                  className={
                    row._isNew ? "bg-indigo-50/30" : "hover:bg-slate-50"
                  }
                >
                  <td className="px-4 py-3">
                    {marcasNormalizadas.length > 0 ? (
                      <select
                        className={baseInput}
                        value={row.marca}
                        onChange={(e) =>
                          onUpdateRow(row._globalIdx, "marca", e.target.value)
                        }
                      >
                        <option value="">— Seleccionar Marca —</option>
                        {row.marca &&
                          !marcasNormalizadas.includes(row.marca) && (
                            <option value={row.marca}>
                              {row.marca} (no en catalogo)
                            </option>
                          )}
                        {marcasNormalizadas.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className={baseInput}
                        value={row.marca}
                        onChange={(e) =>
                          onUpdateRow(row._globalIdx, "marca", e.target.value)
                        }
                        placeholder="Nombre de marca"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <CurrencyInput
                      className={numInput}
                      value={row.meta_ventas}
                      onChange={(e) =>
                        onUpdateRow(
                          row._globalIdx,
                          "meta_ventas",
                          e.target.value,
                        )
                      }
                      placeholder="0"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      className={numInput}
                      value={
                        row.pct_comision != null ? row.pct_comision * 100 : ""
                      }
                      onChange={(e) =>
                        onUpdateRow(
                          row._globalIdx,
                          "pct_comision",
                          Number(e.target.value) / 100,
                        )
                      }
                      step="0.1"
                      placeholder="2.0"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onDeleteMarca(row, row._globalIdx)}
                      className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Eliminar marca"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <button
          onClick={onAddMarca}
          className="px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-1.5"
        >
          <Plus size={14} /> Agregar Marca
        </button>
      </div>
    </>
  );
}
