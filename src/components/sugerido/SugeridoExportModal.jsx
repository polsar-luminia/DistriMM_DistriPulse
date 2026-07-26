import React, { useState, useEffect, useMemo } from "react";
import {
  FileDown,
  Loader2,
  ClipboardList,
  Table2,
  Layers,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import MultiSelect from "./MultiSelect";
import { formatCurrency } from "../../utils/formatters";
import {
  FILTROS_INICIALES,
  OPCIONES_ESTADO,
  OPCIONES_ULTIMA_VENTA,
  OPCIONES_STOCK,
  aplicarAlcance,
  aplicarEstado,
} from "../../utils/sugeridoFiltros";

/** Qué hojas lleva el archivo. */
const ALCANCES = [
  {
    key: "POR_PEDIR",
    label: "Orden de compra",
    descripcion: "Solo los productos con sugerido mayor a cero",
    icon: ClipboardList,
  },
  {
    key: "COMPLETO",
    label: "Análisis completo",
    descripcion: "Todos los productos, con su clasificación de stock",
    icon: Table2,
  },
  {
    key: "AMBOS",
    label: "Ambas hojas",
    descripcion: "Orden de compra y análisis completo en un mismo archivo",
    icon: Layers,
  },
];

/** El alcance ya resuelve "por pedir": ofrecerlo también aquí confunde. */
const ESTADOS_MODAL = OPCIONES_ESTADO.filter((o) => o.key !== "POR_PEDIR");

function CampoSelect({ id, label, value, onChange, opciones }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-bold text-slate-500 uppercase">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium bg-white focus:ring-2 focus:ring-indigo-500"
      >
        {opciones.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Modal previo a la exportación: define qué se lleva el Excel sin depender de
 * lo que esté filtrado en pantalla (aunque puede partir de ahí con un clic).
 *
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {Object[]} props.rows - Resultado completo del cálculo, sin filtrar
 * @param {Object} props.filtrosPantalla - Filtros activos en la pantalla
 * @param {string[]} props.opcionesMarca
 * @param {string[]} props.opcionesCategoria
 * @param {(rows: Object[], opciones: Object) => Promise<void>} props.onExportar
 */
export default function SugeridoExportModal({
  open,
  onClose,
  rows,
  filtrosPantalla,
  opcionesMarca,
  opcionesCategoria,
  onExportar,
}) {
  const [alcance, setAlcance] = useState("POR_PEDIR");
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [exportando, setExportando] = useState(false);

  // Cada apertura arranca limpia: el modal define su propio recorte
  useEffect(() => {
    if (open) {
      setAlcance("POR_PEDIR");
      setFiltros(FILTROS_INICIALES);
    }
  }, [open]);

  const set = (patch) => setFiltros((f) => ({ ...f, ...patch }));

  const copiarFiltrosPantalla = () => {
    setFiltros({
      ...FILTROS_INICIALES,
      marcas: [...(filtrosPantalla.marcas || [])],
      categorias: [...(filtrosPantalla.categorias || [])],
      ultimaVenta: filtrosPantalla.ultimaVenta,
      stock: filtrosPantalla.stock,
      // El estado no se copia si es "por pedir": eso lo decide el alcance
      estado:
        filtrosPantalla.estado === "POR_PEDIR" ? "TODOS" : filtrosPantalla.estado,
    });
    if (filtrosPantalla.estado === "POR_PEDIR") setAlcance("POR_PEDIR");
  };

  // Vista previa: mismas reglas que usará el generador del Excel
  const seleccion = useMemo(
    () => aplicarEstado(aplicarAlcance(rows, filtros), filtros.estado),
    [rows, filtros],
  );

  const resumen = useMemo(() => {
    let porPedir = 0;
    let costo = 0;
    for (const r of seleccion) {
      if (Number(r.sugerido_cantidad) > 0) {
        porPedir++;
        costo += Number(r.sugerido_costo) || 0;
      }
    }
    return { porPedir, costo };
  }, [seleccion]);

  // Filas que realmente van al archivo según el alcance elegido
  const totalArchivo =
    alcance === "POR_PEDIR" ? resumen.porPedir : seleccion.length;

  const handleExportar = async () => {
    if (exportando || totalArchivo === 0) return;
    setExportando(true);
    try {
      await onExportar(seleccion, { alcance, filtros });
      onClose();
    } catch {
      // El aviso al usuario lo da quien exporta; aquí solo se deja el modal
      // abierto para reintentar
    } finally {
      setExportando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900">
            Exportar sugerido
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Elige qué se lleva el archivo. Puedes acotarlo a un proveedor o a
            una línea para mandar la orden de compra por separado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Alcance */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-500 uppercase">
              Qué exportar
            </p>
            <div className="grid sm:grid-cols-3 gap-2">
              {ALCANCES.map((a) => {
                const Icon = a.icon;
                const activo = alcance === a.key;
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => setAlcance(a.key)}
                    aria-pressed={activo}
                    className={cn(
                      "text-left p-3 rounded-xl border-2 transition-all",
                      activo
                        ? "border-indigo-600 bg-indigo-50"
                        : "border-slate-200 hover:border-slate-300 bg-white",
                    )}
                  >
                    <Icon
                      size={18}
                      className={cn(
                        "mb-1.5",
                        activo ? "text-indigo-600" : "text-slate-400",
                      )}
                    />
                    <p
                      className={cn(
                        "text-sm font-bold",
                        activo ? "text-indigo-900" : "text-slate-700",
                      )}
                    >
                      {a.label}
                    </p>
                    <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                      {a.descripcion}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recorte */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500 uppercase">
                Acotar a
              </p>
              <button
                type="button"
                onClick={copiarFiltrosPantalla}
                className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                <Copy size={13} />
                Usar los filtros de la pantalla
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase block">
                  Proveedor
                </label>
                <MultiSelect
                  options={opcionesMarca}
                  selected={filtros.marcas}
                  onChange={(marcas) => set({ marcas })}
                  allLabel="Todos los proveedores"
                  singular="proveedor"
                  plural="proveedores"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase block">
                  Línea de producto
                </label>
                <MultiSelect
                  options={opcionesCategoria}
                  selected={filtros.categorias}
                  onChange={(categorias) => set({ categorias })}
                  allLabel="Todas las líneas"
                  singular="línea"
                  plural="líneas"
                />
              </div>
              <CampoSelect
                id="export-estado"
                label="Estado"
                value={filtros.estado}
                onChange={(estado) => set({ estado })}
                opciones={ESTADOS_MODAL}
              />
              <CampoSelect
                id="export-ultima-venta"
                label="Última venta"
                value={filtros.ultimaVenta}
                onChange={(ultimaVenta) => set({ ultimaVenta })}
                opciones={OPCIONES_ULTIMA_VENTA}
              />
              <CampoSelect
                id="export-stock"
                label="Existencia"
                value={filtros.stock}
                onChange={(stock) => set({ stock })}
                opciones={OPCIONES_STOCK}
              />
            </div>
          </div>

          {/* Vista previa */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <div>
              <p className="text-[11px] text-slate-500 font-semibold uppercase">
                Productos en el archivo
              </p>
              <p className="text-lg font-black text-slate-900 tabular-nums">
                {totalArchivo}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-semibold uppercase">
                Por pedir
              </p>
              <p className="text-lg font-black text-indigo-700 tabular-nums">
                {resumen.porPedir}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500 font-semibold uppercase">
                Costo estimado
              </p>
              <p className="text-lg font-black text-slate-900 tabular-nums">
                {formatCurrency(resumen.costo)}
              </p>
            </div>
          </div>

          {totalArchivo === 0 && (
            <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Con estas opciones no queda ningún producto por exportar. Ajusta
              el recorte o cambia el alcance.
            </p>
          )}
        </div>

        <DialogFooter className="flex flex-row gap-3 sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleExportar}
            disabled={exportando || totalArchivo === 0}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {exportando ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FileDown size={16} />
            )}
            Exportar Excel
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
