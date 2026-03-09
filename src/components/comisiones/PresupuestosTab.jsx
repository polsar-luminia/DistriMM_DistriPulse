import { useState, useEffect, useMemo } from "react";
import { Plus, Loader2, Copy, FileSpreadsheet, Search, X, ChevronsUpDown } from "lucide-react";
import { sileo } from "sileo";
import ConfirmDialog from "../ConfirmDialog";
import { useConfirm } from "../../hooks/useConfirm";
import { MESES } from "./ComisionesShared";
import { getVendedores } from "../../services/portfolioService";
import { getNormalizedMarcasList } from "../../utils/brandNormalization";
import PresupuestosUploadModal from "./PresupuestosUploadModal";
import VendorPresupuestoSection from "./presupuestos/VendorPresupuestoSection";

const now = new Date();
const YEARS = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

const EMPTY_RECAUDO = (year, month) => ({
  _isNew: true,
  vendedor_codigo: "",
  periodo_year: year,
  periodo_month: month,
  meta_recaudo: 0,
  tramo1_min: 0,
  tramo1_max: "",
  tramo1_pct: 0,
  tramo2_min: "",
  tramo2_max: "",
  tramo2_pct: 0,
  tramo3_min: "",
  tramo3_max: "",
  tramo3_pct: 0,
  tramo4_min: "",
  tramo4_pct: 0,
  activo: true,
});

const EMPTY_MARCA = (year, month) => ({
  _isNew: true,
  vendedor_codigo: "",
  marca: "",
  periodo_year: year,
  periodo_month: month,
  meta_ventas: 0,
  pct_comision: 0,
  bono_fijo: 0,
  activo: true,
});

export default function PresupuestosTab({ hook }) {
  const {
    presupuestosRecaudo,
    presupuestosMarca,
    loadingPresupuestos,
    fetchPresupuestos,
    savePresupuestoRecaudo,
    savePresupuestoMarca,
    removePresupuestoRecaudo,
    removePresupuestoMarca,
    copiarPresupuestos,
    marcas,
  } = hook;

  const [confirmProps, confirm] = useConfirm();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [savingId, setSavingId] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedVendors, setExpandedVendors] = useState(new Set());
  const [dirtyVendors, setDirtyVendors] = useState(new Set());
  const [selectedAvailableVendor, setSelectedAvailableVendor] = useState("");

  // Copy-from controls — default to previous month
  const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const [copyFromMonth, setCopyFromMonth] = useState(prevMonth);
  const [copyFromYear, setCopyFromYear] = useState(prevYear);
  const [copying, setCopying] = useState(false);

  // Local editable copies (kept in sync with hook data)
  const [editRecaudo, setEditRecaudo] = useState([]);
  const [editMarca, setEditMarca] = useState([]);

  // Vendor name lookup
  const [vendedoresMap, setVendedoresMap] = useState({});
  const [vendedoresCatalogo, setVendedoresCatalogo] = useState([]);

  useEffect(() => {
    getVendedores().then(({ data }) => {
      if (data) {
        const map = {};
        data.forEach((v) => { map[String(v.codigo)] = v.nombre || `Vendedor ${v.codigo}`; });
        setVendedoresMap(map);
        setVendedoresCatalogo(data);
      }
    });
  }, []);

  const getNombreVendedor = (codigo) => {
    if (!codigo) return "Nuevo Vendedor";
    return vendedoresMap[String(codigo)] || `Vendedor ${codigo}`;
  };

  // Load when period changes
  useEffect(() => {
    fetchPresupuestos(selectedYear, selectedMonth);
  }, [fetchPresupuestos, selectedYear, selectedMonth]);

  // Sync local state from hook data
  useEffect(() => {
    setEditRecaudo(presupuestosRecaudo.map((r) => ({ ...r })));
    setDirtyVendors(new Set());
  }, [presupuestosRecaudo]);

  useEffect(() => {
    setEditMarca(presupuestosMarca.map((m) => ({ ...m })));
    setDirtyVendors(new Set());
  }, [presupuestosMarca]);

  // Group both arrays by vendedor_codigo for per-vendor card rendering
  const vendedoresAgrupados = useMemo(() => {
    const codigosSet = new Set();
    editRecaudo.forEach((r) => codigosSet.add(r.vendedor_codigo));
    editMarca.forEach((m) => codigosSet.add(m.vendedor_codigo));

    return Array.from(codigosSet)
      .filter((c) => c !== null && c !== undefined)
      .map((codigo) => {
        const recaudoIdx = editRecaudo.findIndex((r) => r.vendedor_codigo === codigo);
        const marcasConIdx = editMarca
          .map((m, globalIdx) => ({ ...m, _globalIdx: globalIdx }))
          .filter((m) => m.vendedor_codigo === codigo);
        return {
          codigo,
          nombre: getNombreVendedor(codigo),
          recaudo: recaudoIdx !== -1 ? editRecaudo[recaudoIdx] : null,
          recaudoIdx,
          marcas: marcasConIdx,
          key: String(codigo || `new-${recaudoIdx}`),
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRecaudo, editMarca, vendedoresMap]);

  useEffect(() => {
    setExpandedVendors(new Set(vendedoresAgrupados.map((v) => v.key)));
  }, [vendedoresAgrupados]);

  const vendedoresFiltrados = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return vendedoresAgrupados;
    return vendedoresAgrupados.filter((v) =>
      v.nombre.toLowerCase().includes(q) || String(v.codigo || "").toLowerCase().includes(q)
    );
  }, [vendedoresAgrupados, searchTerm]);

  const resumen = useMemo(() => ({
    vendedores: vendedoresAgrupados.length,
    conRecaudo: vendedoresAgrupados.filter((v) => !!v.recaudo).length,
    marcas: editMarca.length,
  }), [vendedoresAgrupados, editMarca.length]);

  const codigosConfigurados = useMemo(() => {
    return new Set(
      vendedoresAgrupados
        .map((v) => String(v.codigo ?? "").trim())
        .filter(Boolean)
    );
  }, [vendedoresAgrupados]);

  const vendedoresDisponibles = useMemo(() => {
    return vendedoresCatalogo.filter((v) => !codigosConfigurados.has(String(v.codigo)));
  }, [vendedoresCatalogo, codigosConfigurados]);

  // Marcas normalizadas para el dropdown de presupuestos
  const marcasNormalizadas = useMemo(() => {
    return getNormalizedMarcasList(marcas);
  }, [marcas]);

  const updateRecaudoRow = (idx, field, value) => {
    setEditRecaudo((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      const next = { ...r, [field]: value };
      const key = String(next.vendedor_codigo || r.vendedor_codigo || "");
      if (key) setDirtyVendors((d) => new Set(d).add(key));
      return next;
    }));
  };

  const updateMarcaRow = (idx, field, value) => {
    setEditMarca((prev) => prev.map((m, i) => {
      if (i !== idx) return m;
      const next = { ...m, [field]: value };
      const key = String(next.vendedor_codigo || m.vendedor_codigo || "");
      if (key) setDirtyVendors((d) => new Set(d).add(key));
      return next;
    }));
  };

  // ── Save entire vendor (recaudo + all marcas) ──
  const handleGuardarVendedor = async (vendedorCodigo) => {
    if (!String(vendedorCodigo).trim()) {
      sileo.error("El codigo de vendedor es requerido");
      return;
    }
    setSavingId(`v-${vendedorCodigo}`);
    let hasError = false;

    // 1. Save recaudo
    const recaudoIdx = editRecaudo.findIndex((r) => r.vendedor_codigo === vendedorCodigo);
    if (recaudoIdx !== -1) {
      const recaudoRow = editRecaudo[recaudoIdx];
      const { _isNew, ...rest } = recaudoRow;
      const payload = {
        ...rest,
        periodo_year: selectedYear,
        periodo_month: selectedMonth,
        meta_recaudo: Number(recaudoRow.meta_recaudo) || 0,
        tramo1_min: Number(recaudoRow.tramo1_min) || 0,
        tramo1_max: recaudoRow.tramo1_max !== "" && recaudoRow.tramo1_max != null ? Number(recaudoRow.tramo1_max) : null,
        tramo1_pct: Number(recaudoRow.tramo1_pct) || 0,
        tramo2_min: recaudoRow.tramo2_min !== "" && recaudoRow.tramo2_min != null ? Number(recaudoRow.tramo2_min) : null,
        tramo2_max: recaudoRow.tramo2_max !== "" && recaudoRow.tramo2_max != null ? Number(recaudoRow.tramo2_max) : null,
        tramo2_pct: Number(recaudoRow.tramo2_pct) || 0,
        tramo3_min: recaudoRow.tramo3_min !== "" && recaudoRow.tramo3_min != null ? Number(recaudoRow.tramo3_min) : null,
        tramo3_max: recaudoRow.tramo3_max !== "" && recaudoRow.tramo3_max != null ? Number(recaudoRow.tramo3_max) : null,
        tramo3_pct: Number(recaudoRow.tramo3_pct) || 0,
        tramo4_min: recaudoRow.tramo4_min !== "" && recaudoRow.tramo4_min != null ? Number(recaudoRow.tramo4_min) : null,
        tramo4_pct: Number(recaudoRow.tramo4_pct) || 0,
      };
      const { error } = await savePresupuestoRecaudo(payload);
      if (error) { if (import.meta.env.DEV) console.error("Error saving recaudo:", error); hasError = true; }
    }

    // 2. Save all marcas for this vendor
    for (const row of editMarca.filter((m) => m.vendedor_codigo === vendedorCodigo)) {
      if (!String(row.marca).trim()) continue;
      const { _isNew, ...rest } = row;
      const payload = {
        ...rest,
        periodo_year: selectedYear,
        periodo_month: selectedMonth,
        meta_ventas: Number(row.meta_ventas) || 0,
        pct_comision: Number(row.pct_comision) || 0,
        bono_fijo: Number(row.bono_fijo) || 0,
      };
      const { error } = await savePresupuestoMarca(payload);
      if (error) { if (import.meta.env.DEV) console.error("Error saving marca:", error); hasError = true; }
    }

    setSavingId(null);
    if (hasError) {
      sileo.error("Algunos datos no pudieron guardarse");
    } else {
      sileo.success(`Presupuestos de ${getNombreVendedor(vendedorCodigo)} guardados`);
      setDirtyVendors((prev) => {
        const next = new Set(prev);
        next.delete(String(vendedorCodigo));
        return next;
      });
    }
    fetchPresupuestos(selectedYear, selectedMonth);
  };

  // ── Delete entire vendor ──
  const handleDeleteVendedor = async (vendedorCodigo) => {
    const nombre = getNombreVendedor(vendedorCodigo);
    const ok = await confirm({
      title: "Eliminar vendedor",
      message: `¿Eliminar todos los presupuestos de ${nombre}${vendedorCodigo ? ` (${vendedorCodigo})` : ""} para ${MESES[selectedMonth - 1]} ${selectedYear}?`,
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;

    let hasError = false;
    const recaudoRow = editRecaudo.find((r) => r.vendedor_codigo === vendedorCodigo);
    if (recaudoRow && !recaudoRow._isNew) {
      const success = await removePresupuestoRecaudo(recaudoRow.id);
      if (!success) hasError = true;
    }
    for (const row of editMarca.filter((m) => m.vendedor_codigo === vendedorCodigo && !m._isNew)) {
      const success = await removePresupuestoMarca(row.id);
      if (!success) hasError = true;
    }
    if (hasError) {
      sileo.error("Algunos registros no pudieron eliminarse");
    } else {
      sileo.success(`Presupuestos de ${nombre} eliminados`);
    }
    fetchPresupuestos(selectedYear, selectedMonth);
  };

  // ── Delete individual marca row ──
  const handleDeleteMarca = async (row, globalIdx) => {
    if (row._isNew) {
      setEditMarca((prev) => prev.filter((_, i) => i !== globalIdx));
      setDirtyVendors((d) => new Set(d).add(String(row.vendedor_codigo || "")));
      return;
    }
    const ok = await confirm({
      title: "Eliminar comision",
      message: `¿Eliminar comision de marca "${row.marca}"?`,
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    const success = await removePresupuestoMarca(row.id);
    if (success) {
      sileo.success("Eliminado");
      fetchPresupuestos(selectedYear, selectedMonth);
    } else {
      sileo.error("Error al eliminar");
    }
  };

  // ── Add new vendor (empty recaudo row) ──
  const handleAgregarVendedor = () => {
    setEditRecaudo((prev) => [...prev, EMPTY_RECAUDO(selectedYear, selectedMonth)]);
  };

  const handleAgregarVendedorDisponible = () => {
    if (!selectedAvailableVendor) return;
    const codigoNum = Number(selectedAvailableVendor);
    const codigo = Number.isNaN(codigoNum) ? selectedAvailableVendor : codigoNum;
    const yaExiste = editRecaudo.some((r) => String(r.vendedor_codigo) === String(codigo))
      || editMarca.some((m) => String(m.vendedor_codigo) === String(codigo));
    if (yaExiste) {
      sileo.info("Ese vendedor ya está en el periodo actual");
      return;
    }
    setEditRecaudo((prev) => [...prev, { ...EMPTY_RECAUDO(selectedYear, selectedMonth), vendedor_codigo: codigo }]);
    setExpandedVendors((prev) => new Set(prev).add(String(codigo)));
    setDirtyVendors((prev) => new Set(prev).add(String(codigo)));
    setSelectedAvailableVendor("");
    sileo.success("Vendedor agregado. Ya puedes configurar su presupuesto.");
  };

  // ── Add new marca row pre-filled with vendor code ──
  const handleAgregarMarcaVendedor = (vendedorCodigo) => {
    setEditMarca((prev) => [
      ...prev,
      { ...EMPTY_MARCA(selectedYear, selectedMonth), vendedor_codigo: vendedorCodigo },
    ]);
    setDirtyVendors((d) => new Set(d).add(String(vendedorCodigo || "")));
  };

  // ── Add recaudo for vendor that doesn't have one ──
  const handleAddRecaudo = (vendedorCodigo) => {
    setEditRecaudo((prev) => [
      ...prev,
      { ...EMPTY_RECAUDO(selectedYear, selectedMonth), vendedor_codigo: vendedorCodigo },
    ]);
    setDirtyVendors((d) => new Set(d).add(String(vendedorCodigo || "")));
  };

  const toggleVendor = (key) => {
    setExpandedVendors((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllVendors = () => {
    setExpandedVendors((prev) => {
      if (prev.size === vendedoresFiltrados.length) return new Set();
      return new Set(vendedoresFiltrados.map((v) => v.key));
    });
  };

  // ── Copy from month ──
  const handleCopy = async () => {
    const ok = await confirm({
      title: "Copiar presupuestos",
      message: `¿Copiar todos los presupuestos de ${MESES[copyFromMonth - 1]} ${copyFromYear} a ${MESES[selectedMonth - 1]} ${selectedYear}? Los registros existentes en el mes destino serán reemplazados.`,
      confirmText: "Copiar",
      cancelText: "Cancelar",
      variant: "warning",
    });
    if (!ok) return;
    setCopying(true);
    const { error } = await copiarPresupuestos(copyFromYear, copyFromMonth, selectedYear, selectedMonth);
    setCopying(false);
    if (error) {
      sileo.error("Error al copiar presupuestos");
    } else {
      sileo.success(`Presupuestos copiados de ${MESES[copyFromMonth - 1]} ${copyFromYear}`);
      fetchPresupuestos(selectedYear, selectedMonth);
    }
  };

  const handleUploadSave = async (type, payload) => {
    if (type === "marca") {
      return await savePresupuestoMarca(payload);
    }
    return await savePresupuestoRecaudo(payload);
  };

  const handleUploadSuccess = () => {
    setShowUploadModal(false);
    fetchPresupuestos(selectedYear, selectedMonth);
  };

  // Input style tokens
  const baseInput = "w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white transition-colors";
  const numInput = `${baseInput} text-right tabular-nums font-medium`;

  return (
    <>
      {/* ── Period selector + copy controls ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 border border-slate-200">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer outline-none text-slate-700"
          >
            {MESES.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 border border-slate-200">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer outline-none text-slate-700"
          >
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div className="flex-1" />

        {/* Copy from */}
        <span className="text-xs text-slate-500 font-medium">Copiar de:</span>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg px-3 py-2 border border-slate-200">
          <select
            value={copyFromMonth}
            onChange={(e) => setCopyFromMonth(Number(e.target.value))}
            className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer outline-none text-slate-700"
          >
            {MESES.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={copyFromYear}
            onChange={(e) => setCopyFromYear(Number(e.target.value))}
            className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer outline-none text-slate-700 ml-1"
          >
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button
          onClick={handleCopy}
          disabled={copying}
          className="px-3 py-2 bg-slate-700 rounded-lg text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
        >
          {copying ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
          Copiar
        </button>
        <button
          onClick={() => setShowUploadModal(true)}
          className="px-3 py-2 bg-indigo-600 rounded-lg text-xs font-bold text-white hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-1.5"
        >
          <FileSpreadsheet size={14} />
          Importar Excel
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[11px] text-slate-500 font-semibold uppercase">Vendedores</p>
          <p className="text-2xl font-black text-slate-800">{resumen.vendedores}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[11px] text-slate-500 font-semibold uppercase">Escalas Recaudo</p>
          <p className="text-2xl font-black text-emerald-700">{resumen.conRecaudo}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <p className="text-[11px] text-slate-500 font-semibold uppercase">Marcas Configuradas</p>
          <p className="text-2xl font-black text-indigo-700">{resumen.marcas}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-9 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder="Buscar vendedor por nombre o codigo..."
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:bg-slate-100"
              title="Limpiar busqueda"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={toggleAllVendors}
          className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-1.5"
        >
          <ChevronsUpDown size={14} />
          {expandedVendors.size === vendedoresFiltrados.length ? "Colapsar todos" : "Expandir todos"}
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[280px] flex-1">
            <p className="text-xs font-bold text-slate-500 uppercase mb-1">
              Vendedores disponibles
            </p>
            <p className="text-xs text-slate-400">
              Selecciona un vendedor del maestro para asignarle presupuesto en {MESES[selectedMonth - 1]} {selectedYear}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedAvailableVendor}
              onChange={(e) => setSelectedAvailableVendor(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium min-w-[260px] focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              <option value="">Seleccionar vendedor...</option>
              {vendedoresDisponibles.map((v) => (
                <option key={v.codigo} value={v.codigo}>
                  {v.nombre || `Vendedor ${v.codigo}`} ({v.codigo})
                </option>
              ))}
            </select>
            <button
              onClick={handleAgregarVendedorDisponible}
              disabled={!selectedAvailableVendor}
              className="px-3 py-2 bg-indigo-600 rounded-lg text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
            >
              <Plus size={14} />
              Agregar
            </button>
          </div>
        </div>
      </div>

      {loadingPresupuestos ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="text-indigo-600 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Empty state banner ── */}
          {editRecaudo.length === 0 && editMarca.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-amber-800">
                  No hay presupuestos para {MESES[selectedMonth - 1]} {selectedYear}
                </h4>
                <p className="text-xs text-amber-600 mt-1">
                  Importa desde el Excel de condiciones o carga los datos base como punto de partida.
                </p>
              </div>
              <button
                onClick={() => setShowUploadModal(true)}
                className="px-4 py-2 bg-indigo-600 rounded-lg text-xs font-bold text-white hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet size={14} />
                Importar desde Excel
              </button>
            </div>
          )}

          {/* ── Per-vendor cards ── */}
          {vendedoresFiltrados.map((vendedor) => (
            <VendorPresupuestoSection
              key={vendedor.key}
              vendedor={vendedor}
              savingId={savingId}
              marcasNormalizadas={marcasNormalizadas}
              onUpdateRecaudoRow={updateRecaudoRow}
              onUpdateMarcaRow={updateMarcaRow}
              onDeleteVendedor={handleDeleteVendedor}
              onDeleteMarca={handleDeleteMarca}
              onAddRecaudo={handleAddRecaudo}
              onAddMarca={handleAgregarMarcaVendedor}
              onGuardar={handleGuardarVendedor}
              baseInput={baseInput}
              numInput={numInput}
              collapsed={!expandedVendors.has(vendedor.key)}
              onToggleCollapse={() => toggleVendor(vendedor.key)}
              hasUnsavedChanges={dirtyVendors.has(String(vendedor.codigo || ""))}
            />
          ))}

          {!loadingPresupuestos && vendedoresFiltrados.length === 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
              No hay vendedores que coincidan con la busqueda.
            </div>
          )}

          {/* ── Add new vendor ── */}
          <button
            onClick={handleAgregarVendedor}
            className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-sm font-bold text-slate-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={18} /> Agregar Nuevo Vendedor
          </button>
        </div>
      )}

      <ConfirmDialog {...confirmProps} />
      <PresupuestosUploadModal
        isOpen={showUploadModal}
        onClose={handleUploadSuccess}
        onSave={handleUploadSave}
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
      />
    </>
  );
}
