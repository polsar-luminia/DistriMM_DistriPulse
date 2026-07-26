import React from "react";
import { Search, FilterX } from "lucide-react";
import { cn } from "@/lib/utils";
import MultiSelect from "./MultiSelect";
import { CLASIFICACION_META } from "./clasificacion";
import {
  OPCIONES_ESTADO,
  OPCIONES_ULTIMA_VENTA,
  OPCIONES_STOCK,
  contarFiltrosActivos,
} from "../../utils/sugeridoFiltros";

function SelectFiltro({ value, onChange, opciones, label, activo }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={cn(
        "px-3 py-2 border rounded-lg text-sm font-medium bg-white focus:ring-2 focus:ring-indigo-500",
        activo
          ? "border-indigo-400 text-indigo-700"
          : "border-slate-300 text-slate-700",
      )}
    >
      {opciones.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Barra de filtros del Sugerido: estado (pastillas con conteo), proveedor,
 * línea, última venta, stock y búsqueda.
 *
 * @param {Object} props
 * @param {import("../../utils/sugeridoFiltros").FILTROS_INICIALES} props.filtros
 * @param {(patch: Object) => void} props.onChange - Merge parcial
 * @param {() => void} props.onLimpiar
 * @param {string[]} props.opcionesMarca
 * @param {string[]} props.opcionesCategoria
 * @param {(key: string) => number} props.contarEstado
 */
export default function SugeridoFiltros({
  filtros,
  onChange,
  onLimpiar,
  opcionesMarca,
  opcionesCategoria,
  contarEstado,
}) {
  const activos = contarFiltrosActivos(filtros);

  return (
    <div className="space-y-3">
      {/* Estado */}
      <div className="flex flex-wrap gap-1.5 bg-slate-100 rounded-xl p-1.5 w-fit">
        {OPCIONES_ESTADO.map((f) => {
          const meta = CLASIFICACION_META[f.key];
          const activo = filtros.estado === f.key;
          return (
            <button
              key={f.key}
              onClick={() => onChange({ estado: f.key })}
              aria-pressed={activo}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap",
                activo
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-200",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]",
                  activo
                    ? "bg-white/20"
                    : meta?.badge || "bg-slate-200 text-slate-500",
                )}
              >
                {contarEstado(f.key)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Proveedor / línea / última venta / stock / búsqueda */}
      <div className="flex flex-wrap items-center gap-3">
        <MultiSelect
          options={opcionesMarca}
          selected={filtros.marcas}
          onChange={(marcas) => onChange({ marcas })}
          allLabel="Todos los proveedores"
          singular="proveedor"
          plural="proveedores"
          className="w-[210px]"
        />
        <MultiSelect
          options={opcionesCategoria}
          selected={filtros.categorias}
          onChange={(categorias) => onChange({ categorias })}
          allLabel="Todas las líneas"
          singular="línea"
          plural="líneas"
          className="w-[200px]"
        />
        <SelectFiltro
          value={filtros.ultimaVenta}
          onChange={(ultimaVenta) => onChange({ ultimaVenta })}
          opciones={OPCIONES_ULTIMA_VENTA}
          label="Filtrar por última venta"
          activo={filtros.ultimaVenta !== "TODAS"}
        />
        <SelectFiltro
          value={filtros.stock}
          onChange={(stock) => onChange({ stock })}
          opciones={OPCIONES_STOCK}
          label="Filtrar por existencia"
          activo={filtros.stock !== "TODOS"}
        />

        {activos > 0 && (
          <button
            onClick={onLimpiar}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-slate-500 hover:text-rose-600 transition-colors"
          >
            <FilterX size={15} />
            Limpiar ({activos})
          </button>
        )}

        <div className="relative ml-auto">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={filtros.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Buscar producto, código o marca..."
            aria-label="Buscar producto"
            className="pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm w-64 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>
    </div>
  );
}
