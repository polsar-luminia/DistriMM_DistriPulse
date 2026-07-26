import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useId,
} from "react";
import { ChevronDown, Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Desplegable con casillas para seleccionar varias opciones.
 * Selección vacía = "todas" (no hay estado "ninguna seleccionada": filtrar por
 * cero opciones dejaría la tabla vacía sin que se note por qué).
 *
 * @param {Object} props
 * @param {string[]} props.options - Valores disponibles
 * @param {string[]} props.selected - Valores seleccionados ([] = todos)
 * @param {(next: string[]) => void} props.onChange
 * @param {string} props.allLabel - Texto cuando no hay selección
 * @param {string} props.singular - Sustantivo en singular ("proveedor")
 * @param {string} props.plural - Sustantivo en plural ("proveedores")
 * @param {string} [props.className]
 */
export default function MultiSelect({
  options,
  selected,
  onChange,
  allLabel,
  singular,
  plural,
  className,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);
  const searchRef = useRef(null);
  const listId = useId();

  // La búsqueda se limpia al cerrar, no al abrir: así el panel nunca se abre
  // con un filtro de texto heredado que oculte opciones
  const cerrar = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  // Cerrar al hacer clic fuera o con Escape
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (!containerRef.current?.contains(e.target)) cerrar();
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, cerrar]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (value) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  const resumen =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? selected[0]
        : `${selected.length} ${plural}`;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => (open ? cerrar() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-label={`Filtrar por ${singular}`}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium bg-white text-left transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-indigo-500",
          selected.length > 0
            ? "border-indigo-400 text-indigo-700"
            : "border-slate-300 text-slate-700 hover:border-slate-400",
        )}
      >
        <span className="truncate flex-1">{resumen}</span>
        {selected.length > 0 && (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Quitar filtro de ${singular}`}
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onChange([]);
              }
            }}
            className="shrink-0 text-indigo-400 hover:text-indigo-700 rounded"
          >
            <X size={14} />
          </span>
        )}
        <ChevronDown
          size={14}
          className={cn(
            "shrink-0 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-30 mt-1 w-full min-w-[220px] bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-900/10 overflow-hidden"
        >
          {options.length > 8 && (
            <div className="relative border-b border-slate-100">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Buscar ${singular}...`}
                aria-label={`Buscar ${singular}`}
                className="w-full pl-8 pr-3 py-2 text-sm focus:outline-none"
              />
            </div>
          )}

          <div className="max-h-64 overflow-y-auto py-1">
            {visibles.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-400 text-center">
                Sin coincidencias
              </p>
            ) : (
              visibles.map((value) => {
                const activo = selected.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    role="option"
                    aria-selected={activo}
                    onClick={() => toggle(value)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50 transition-colors"
                  >
                    <span
                      className={cn(
                        "w-4 h-4 shrink-0 rounded border flex items-center justify-center",
                        activo
                          ? "bg-indigo-600 border-indigo-600"
                          : "border-slate-300",
                      )}
                    >
                      {activo && <Check size={11} className="text-white" />}
                    </span>
                    <span
                      className={cn(
                        "truncate",
                        activo
                          ? "font-semibold text-slate-900"
                          : "text-slate-600",
                      )}
                    >
                      {value}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 bg-slate-50">
            <span className="text-[11px] text-slate-500 font-medium">
              {selected.length === 0
                ? allLabel
                : `${selected.length} de ${options.length}`}
            </span>
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={selected.length === 0}
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 disabled:text-slate-300 transition-colors"
            >
              Limpiar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
