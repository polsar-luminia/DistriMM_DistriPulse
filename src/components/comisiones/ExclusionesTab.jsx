import React, { useState, useMemo } from "react";
import {
  Search,
  X,
  Loader2,
  Ban,
  Tag,
  Package,
  Clock,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { sileo } from "sileo";
import { cn } from "@/lib/utils";
import { Card } from "./ComisionesShared";
import { leerDiasMoraLimite } from "@/hooks/comisiones/utils";
import { setDiasMoraLimite } from "@/services/comisionesService";

export default function ExclusionesTab({ hook }) {
  const { exclusiones, loadingExclusiones, addExclusion, removeExclusion, toggleExclusion, marcas, catalogo, refetchExclusiones } = hook;

  const [marcaSearch, setMarcaSearch] = useState("");
  const [productoSearch, setProductoSearch] = useState("");

  // Días de mora. El valor vive en la base y llega dentro de `exclusiones`.
  //
  // Solo se guarda en estado lo que el usuario ESTÁ editando (`null` = no está
  // editando) y el resto se deriva. Así el campo refleja siempre la base cuando
  // nadie lo toca —sin efectos de sincronización que disparan renders en
  // cascada— y no le pisa lo escrito a quien sí lo está editando.
  const diasGuardados = leerDiasMoraLimite(exclusiones);
  const [diasEditado, setDiasEditado] = useState(null);
  const [guardandoDias, setGuardandoDias] = useState(false);

  const diasInput = diasEditado ?? String(diasGuardados);
  const diasSucio =
    diasEditado !== null &&
    diasEditado.trim() !== "" &&
    Number(diasEditado) !== diasGuardados;

  const handleGuardarDias = async () => {
    const n = Number(diasInput);
    if (!Number.isInteger(n) || n <= 0 || n > 9999) {
      sileo.error("Los días deben ser un número entero entre 1 y 9999");
      return;
    }
    setGuardandoDias(true);
    const { success, error } = await setDiasMoraLimite(n);
    setGuardandoDias(false);
    if (!success) {
      sileo.error(error?.message || "No se pudo guardar el límite de mora");
      return;
    }
    sileo.success(`Límite de mora: ${n} días`);
    setDiasEditado(null);
    await refetchExclusiones?.();
  };

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
    <div className="space-y-6">
      {/* Días de mora: no es una lista, es un único número que decide si un
          recaudo cobrado tarde comisiona o no. Va arriba y a lo ancho porque
          aplica a TODO, no a una marca o un producto sueltos. */}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Clock size={18} className="text-indigo-600" />
          <h3 className="font-bold text-slate-800">Días de mora para comisionar</h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Un recaudo cobrado con más días de mora que este límite no genera comisión.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-full pl-4 pr-2 py-1.5">
            <span className="text-sm font-medium text-indigo-900">Hasta</span>
            <input
              type="number"
              min="1"
              max="9999"
              value={diasInput}
              onChange={(e) => setDiasEditado(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGuardarDias()}
              disabled={guardandoDias}
              aria-label="Días de mora máximos para comisionar un recaudo"
              className="w-20 px-2 py-1 text-sm font-bold text-center text-indigo-900 bg-white border border-indigo-200 rounded-full focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50"
            />
            <span className="text-sm font-medium text-indigo-900 pr-1">días</span>
          </div>

          {diasSucio && (
            <>
              <button
                onClick={handleGuardarDias}
                disabled={guardandoDias}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
              >
                {guardandoDias && <Loader2 size={14} className="animate-spin" />}
                Guardar
              </button>
              <button
                onClick={() => setDiasEditado(null)}
                disabled={guardandoDias}
                className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50"
              >
                Cancelar
              </button>
            </>
          )}
        </div>

        {diasSucio && (
          <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Cambiar este límite altera la comisión por recaudo de todos los periodos que se
            recalculen. Los meses ya liquidados no se tocan hasta que alguien pulse
            &quot;Recalcular&quot;.
          </p>
        )}
      </Card>

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
    </div>
  );
}
