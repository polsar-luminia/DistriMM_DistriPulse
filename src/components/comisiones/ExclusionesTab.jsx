import React, { useState, useMemo } from "react";
import {
  Search,
  X,
  Loader2,
  Ban,
  Tag,
  Package,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { sileo } from "sileo";
import { cn } from "@/lib/utils";
import { Card } from "./ComisionesShared";

export default function ExclusionesTab({ hook }) {
  const { exclusiones, loadingExclusiones, addExclusion, removeExclusion, toggleExclusion, marcas, catalogo } = hook;

  const [marcaSearch, setMarcaSearch] = useState("");
  const [productoSearch, setProductoSearch] = useState("");

  const marcaExclusiones = exclusiones.filter((e) => e.tipo === "marca");
  const productoExclusiones = exclusiones.filter((e) => e.tipo === "producto");

  // Filter available brands (not already excluded)
  const availableMarcas = useMemo(() => {
    const excluded = new Set(marcaExclusiones.map((e) => e.valor));
    return marcas.filter((m) => !excluded.has(m) && m.toLowerCase().includes(marcaSearch.toLowerCase()));
  }, [marcas, marcaExclusiones, marcaSearch]);

  // Filter products for search
  const filteredProducts = useMemo(() => {
    if (productoSearch.length < 2) return [];
    const excluded = new Set(productoExclusiones.map((e) => e.valor));
    return catalogo
      .filter(
        (p) =>
          !excluded.has(p.codigo) &&
          (p.codigo.includes(productoSearch) || p.nombre?.toLowerCase().includes(productoSearch.toLowerCase())),
      )
      .slice(0, 10);
  }, [catalogo, productoExclusiones, productoSearch]);

  const handleAddMarca = async (marca) => {
    const { error } = await addExclusion({ tipo: "marca", valor: marca, descripcion: marca });
    if (error) sileo.error("Error al agregar exclusion");
    else sileo.success(`Marca "${marca}" excluida`);
  };

  const handleAddProducto = async (producto) => {
    const { error } = await addExclusion({
      tipo: "producto",
      valor: producto.codigo,
      descripcion: producto.nombre || producto.codigo,
    });
    if (error) sileo.error("Error al agregar exclusion");
    else {
      sileo.success(`Producto "${producto.codigo}" excluido`);
      setProductoSearch("");
    }
  };

  const handleRemove = async (id) => {
    const ok = await removeExclusion(id);
    if (ok) sileo.success("Exclusion removida");
  };

  const handleToggle = async (id, currentState) => {
    await toggleExclusion(id, !currentState);
  };

  if (loadingExclusiones) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* LEFT: Marcas */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Tag size={18} className="text-indigo-600" />
          <h3 className="font-bold text-slate-800">Excluir por Marca</h3>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar marca..."
            value={marcaSearch}
            onChange={(e) => setMarcaSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {/* Available brands dropdown */}
        {marcaSearch && availableMarcas.length > 0 && (
          <div className="mb-4 border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
            {availableMarcas.slice(0, 10).map((m) => (
              <button
                key={m}
                onClick={() => { handleAddMarca(m); setMarcaSearch(""); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center justify-between"
              >
                <span>{m}</span>
                <Ban size={14} className="text-slate-300" />
              </button>
            ))}
          </div>
        )}

        {/* Excluded brands list */}
        <div className="space-y-2">
          {marcaExclusiones.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No hay marcas excluidas</p>
          ) : (
            marcaExclusiones.map((e) => (
              <div key={e.id} className="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => handleToggle(e.id, e.activa)} className="text-slate-400 hover:text-slate-600">
                    {e.activa ? <ToggleRight size={20} className="text-rose-500" /> : <ToggleLeft size={20} className="text-slate-300" />}
                  </button>
                  <span className={cn("text-sm font-medium", e.activa ? "text-rose-800" : "text-slate-400 line-through")}>{e.valor}</span>
                </div>
                <button onClick={() => handleRemove(e.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-100 rounded transition-colors">
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* RIGHT: Productos */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Package size={18} className="text-indigo-600" />
          <h3 className="font-bold text-slate-800">Excluir por Producto</h3>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por codigo o nombre (min 2 caracteres)..."
            value={productoSearch}
            onChange={(e) => setProductoSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {/* Search results */}
        {filteredProducts.length > 0 && (
          <div className="mb-4 border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
            {filteredProducts.map((p) => (
              <button
                key={p.codigo}
                onClick={() => handleAddProducto(p)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center justify-between"
              >
                <span>
                  <span className="font-mono text-xs text-slate-400 mr-2">{p.codigo}</span>
                  {p.nombre}
                </span>
                <Ban size={14} className="text-slate-300" />
              </button>
            ))}
          </div>
        )}

        {/* Excluded products list */}
        <div className="space-y-2">
          {productoExclusiones.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No hay productos excluidos</p>
          ) : (
            productoExclusiones.map((e) => (
              <div key={e.id} className="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => handleToggle(e.id, e.activa)} className="text-slate-400 hover:text-slate-600">
                    {e.activa ? <ToggleRight size={20} className="text-rose-500" /> : <ToggleLeft size={20} className="text-slate-300" />}
                  </button>
                  <span className={cn("text-sm", e.activa ? "text-rose-800" : "text-slate-400 line-through")}>
                    <span className="font-mono text-xs mr-1">{e.valor}</span>
                    {e.descripcion && e.descripcion !== e.valor && <span className="font-medium"> — {e.descripcion}</span>}
                  </span>
                </div>
                <button onClick={() => handleRemove(e.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-100 rounded transition-colors">
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
