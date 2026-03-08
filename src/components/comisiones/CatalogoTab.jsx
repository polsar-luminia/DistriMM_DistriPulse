/**
 * @fileoverview Catalogo tab — product master data browser with exclusion status.
 * @module components/comisiones/CatalogoTab
 */

import React, { useState, useMemo } from "react";
import {
  Search,
  Loader2,
  BookOpen,
  Filter,
  Trash2,
} from "lucide-react";
import { sileo } from "sileo";
import { cn } from "@/lib/utils";
import {
  formatNumber,
} from "../../utils/formatters";
import { Card, EmptyState } from "./ComisionesShared";
import ConfirmDialog from "../ConfirmDialog";
import { useConfirm } from "../../hooks/useConfirm";

export default function CatalogoTab({ hook }) {
  const { catalogo, loadingCatalogo, marcas, exclusiones, clearCatalogo } = hook;
  const [search, setSearch] = useState("");
  const [filterMarca, setFilterMarca] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("");
  const [clearing, setClearing] = useState(false);
  const [confirmProps, confirm] = useConfirm();

  const categorias = useMemo(
    () => [...new Set(catalogo.map((p) => p.categoria_nombre).filter(Boolean))].sort(),
    [catalogo],
  );

  // Build exclusion lookup
  const excludedProducts = useMemo(() => {
    const set = new Set();
    exclusiones.forEach((e) => {
      if (e.tipo === "producto") set.add(e.valor);
    });
    return set;
  }, [exclusiones]);

  const excludedBrands = useMemo(() => {
    const set = new Set();
    exclusiones.forEach((e) => {
      if (e.tipo === "marca") set.add(e.valor);
    });
    return set;
  }, [exclusiones]);

  const filtered = useMemo(() => {
    return catalogo.filter((p) => {
      if (search && !p.codigo.includes(search) && !p.nombre?.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterMarca && p.marca !== filterMarca) return false;
      if (filterCategoria && p.categoria_nombre !== filterCategoria) return false;
      return true;
    });
  }, [catalogo, search, filterMarca, filterCategoria]);

  const excludedCount = useMemo(
    () => filtered.filter((p) => excludedProducts.has(p.codigo) || excludedBrands.has(p.marca)).length,
    [filtered, excludedProducts, excludedBrands],
  );

  if (loadingCatalogo) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (catalogo.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="Catalogo vacio"
        subtitle="Sube el Excel de 'Saldos de Productos' desde el tab de Ventas para cargar el catalogo."
      />
    );
  }

  const handleClear = async () => {
    const ok = await confirm({
      title: "Limpiar catálogo",
      message: `¿Eliminar los ${formatNumber(catalogo.length)} productos del catálogo? Esta acción no se puede deshacer.`,
      confirmText: "Eliminar todo",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    setClearing(true);
    const success = await clearCatalogo();
    setClearing(false);
    if (success) {
      sileo.success("Catálogo eliminado");
    } else {
      sileo.error("Error al limpiar el catálogo");
    }
  };

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por codigo o nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar producto en catalogo"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-2 py-1.5 border border-slate-200">
          <Filter size={14} className="text-slate-500 shrink-0" />
          <select value={filterMarca} onChange={(e) => setFilterMarca(e.target.value)} className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer outline-none text-slate-700">
            <option value="">Todas las marcas</option>
            {marcas.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-2 py-1.5 border border-slate-200">
          <Filter size={14} className="text-slate-500 shrink-0" />
          <select value={filterCategoria} onChange={(e) => setFilterCategoria(e.target.value)} className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer outline-none text-slate-700">
            <option value="">Todas las categorias</option>
            {categorias.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleClear}
          disabled={clearing}
          className="px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 transition-colors flex items-center gap-1.5"
        >
          {clearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Limpiar Catálogo
        </button>
      </div>

      {/* Counter */}
      <p className="text-xs text-slate-500 mb-4">
        {formatNumber(filtered.length)} de {formatNumber(catalogo.length)} productos
        {excludedCount > 0 && <span className="text-rose-500 font-bold ml-1"> · {excludedCount} excluidos</span>}
      </p>

      {/* Table */}
      <Card className="overflow-hidden !p-0">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold border-b border-slate-200 sticky top-0">
              <tr>
                <th className="px-4 py-3">Codigo</th>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Marca</th>
                <th className="px-4 py-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.slice(0, 200).map((p) => {
                const isExcl = excludedProducts.has(p.codigo) || excludedBrands.has(p.marca);
                return (
                  <tr key={p.id} className={cn("hover:bg-slate-50", isExcl && "bg-rose-50/30")}>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{p.codigo}</td>
                    <td className="px-4 py-2.5 text-slate-800 truncate max-w-[250px]">{p.nombre}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{p.categoria_nombre}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{p.marca}</td>
                    <td className="px-4 py-2.5 text-center">
                      {isExcl ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">Excluido</span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">Activo</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 200 && (
          <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 text-xs text-slate-400 text-center">
            Mostrando 200 de {formatNumber(filtered.length)} productos. Usa los filtros para refinar.
          </div>
        )}
      </Card>

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}
