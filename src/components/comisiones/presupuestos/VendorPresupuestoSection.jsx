import { Trash2, Save, Loader2, Target, Tag, User, ChevronDown, ChevronUp, CircleAlert } from "lucide-react";
import RecaudoTiersEditor from "./RecaudoTiersEditor";
import MarcaComisionesEditor from "./MarcaComisionesEditor";

export default function VendorPresupuestoSection({
  vendedor,
  savingId,
  marcasNormalizadas,
  onUpdateRecaudoRow,
  onUpdateMarcaRow,
  onDeleteVendedor,
  onDeleteMarca,
  onAddRecaudo,
  onAddMarca,
  onGuardar,
  baseInput,
  numInput,
  collapsed,
  onToggleCollapse,
  hasUnsavedChanges,
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Vendor header */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 rounded-full p-2">
            <User size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white">{vendedor.nombre}</h2>
            <p className="text-indigo-200 text-xs font-medium">
              {vendedor.codigo ? `Codigo: ${vendedor.codigo}` : "Ingresa el codigo de vendedor abajo"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 rounded-full text-[11px] font-bold bg-white/15 text-white">
            {vendedor.marcas.length} marcas
          </span>
          {vendedor.recaudo && (
            <span className="px-2 py-1 rounded-full text-[11px] font-bold bg-emerald-200/30 text-emerald-100">
              Recaudo OK
            </span>
          )}
          {hasUnsavedChanges && (
            <span className="px-2 py-1 rounded-full text-[11px] font-bold bg-amber-200/30 text-amber-100 flex items-center gap-1">
              <CircleAlert size={12} />
              Cambios
            </span>
          )}
          <button
            onClick={onToggleCollapse}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            title={collapsed ? "Expandir seccion" : "Colapsar seccion"}
          >
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          <button
            onClick={() => onDeleteVendedor(vendedor.codigo)}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            title="Eliminar vendedor"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {!collapsed && (
      <div className="p-6 space-y-8">
        {/* Code input for new (unsaved) vendors */}
        {!vendedor.codigo && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <label className="block text-sm font-semibold text-amber-800 mb-2">
              Codigo de Vendedor
            </label>
            <input
              className="border border-amber-300 rounded-lg px-4 py-2.5 text-sm font-bold w-48 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
              value={vendedor.recaudo?.vendedor_codigo || ""}
              onChange={(e) => onUpdateRecaudoRow(vendedor.recaudoIdx, "vendedor_codigo", e.target.value)}
              placeholder="Ej: 14"
              autoFocus
            />
          </div>
        )}

        {/* Recaudo scale section */}
        <div>
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-4">
            <Target size={16} className="text-emerald-600" />
            Escala de Comision por Recaudo
          </h3>
          <RecaudoTiersEditor
            recaudo={vendedor.recaudo}
            recaudoIdx={vendedor.recaudoIdx}
            onUpdateRow={onUpdateRecaudoRow}
            onAddRecaudo={() => onAddRecaudo(vendedor.codigo)}
            vendedorCodigo={vendedor.codigo}
            numInput={numInput}
          />
        </div>

        {/* Marcas section */}
        <div>
          <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-4">
            <Tag size={16} className="text-indigo-600" />
            Comisiones por Marca
          </h3>
          <MarcaComisionesEditor
            marcasRows={vendedor.marcas}
            marcasNormalizadas={marcasNormalizadas}
            onUpdateRow={onUpdateMarcaRow}
            onDeleteMarca={onDeleteMarca}
            onAddMarca={() => onAddMarca(vendedor.codigo)}
            baseInput={baseInput}
            numInput={numInput}
          />
        </div>

        {/* Guardar button */}
        <div className="flex justify-end pt-4 border-t border-slate-100">
          <button
            onClick={() => onGuardar(vendedor.codigo)}
            disabled={savingId === `v-${vendedor.codigo}`}
            className="px-6 py-3 bg-indigo-600 rounded-lg text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm flex items-center gap-2"
          >
            {savingId === `v-${vendedor.codigo}` ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            Guardar {vendedor.nombre.split(" ")[0]}
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
