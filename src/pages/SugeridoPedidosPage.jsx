/**
 * @fileoverview Sugerido de Pedidos — módulo para gerencia.
 * Cruza el inventario (Excel "Saldos de Productos", bodegas confiables 1/5/6)
 * con la velocidad de venta para sugerir cantidades de compra y clasificar
 * el stock (agotado, crítico, normal, lento, muerto).
 * @module pages/SugeridoPedidosPage
 */
import React, { useState, useMemo, useCallback } from "react";
import {
  ShoppingCart,
  Upload,
  Trash2,
  FileDown,
  Search,
  PackageX,
  PackageCheck,
  Skull,
  Turtle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { sileo } from "sileo";
import { cn } from "@/lib/utils";
import { useSugeridoPedidos } from "../hooks/useSugeridoPedidos";
import { formatCurrency, formatDateUTC } from "../utils/formatters";
import { Card, KpiCard, EmptyState } from "../components/comisiones/ComisionesShared";
import InventarioUploadModal from "../components/sugerido/InventarioUploadModal";
import SugeridoParamsBar from "../components/sugerido/SugeridoParamsBar";
import SugeridoTable from "../components/sugerido/SugeridoTable";
import { CLASIFICACION_META } from "../components/sugerido/clasificacion";
import ConfirmDialog from "../components/ConfirmDialog";
import { useConfirm } from "../hooks/useConfirm";
import { generarSugeridoExcel } from "../utils/sugeridoExcelExport";

const FILTROS = [
  { key: "TODOS", label: "Todos" },
  { key: "POR_PEDIR", label: "Por pedir" },
  { key: "AGOTADO", label: "Agotados" },
  { key: "CRITICO", label: "Críticos" },
  { key: "NORMAL", label: "Normales" },
  { key: "LENTO", label: "Lentos" },
  { key: "MUERTO", label: "Muertos" },
];

export default function SugeridoPedidosPage() {
  const hook = useSugeridoPedidos();
  const {
    cargas,
    selectedCargaId,
    setSelectedCargaId,
    params,
    rows,
    loading,
    calculando,
    error,
    recalcular,
    guardarPredeterminado,
    deleteCarga,
    fetchCargas,
  } = hook;

  const [confirmProps, confirm] = useConfirm();
  const [showUpload, setShowUpload] = useState(false);
  const [filtro, setFiltro] = useState("TODOS");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  const selectedCarga = cargas.find((c) => c.id === selectedCargaId);

  const stats = useMemo(() => {
    const porClasificacion = {};
    let porPedir = 0;
    let costoPedido = 0;
    let valorMuerto = 0;
    let valorLento = 0;
    for (const r of rows) {
      porClasificacion[r.clasificacion] =
        (porClasificacion[r.clasificacion] || 0) + 1;
      if (Number(r.sugerido_cantidad) > 0) {
        porPedir++;
        costoPedido += Number(r.sugerido_costo) || 0;
      }
      if (r.clasificacion === "MUERTO") valorMuerto += Number(r.stock_valor) || 0;
      if (r.clasificacion === "LENTO") valorLento += Number(r.stock_valor) || 0;
    }
    return { porClasificacion, porPedir, costoPedido, valorMuerto, valorLento };
  }, [rows]);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (filtro === "POR_PEDIR") {
      result = result.filter((r) => Number(r.sugerido_cantidad) > 0);
    } else if (filtro !== "TODOS") {
      result = result.filter((r) => r.clasificacion === filtro);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (r) =>
          r.producto_codigo?.toLowerCase().includes(q) ||
          r.producto_nombre?.toLowerCase().includes(q) ||
          r.marca?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [rows, filtro, search]);

  const filtroCount = useCallback(
    (key) => {
      if (key === "TODOS") return rows.length;
      if (key === "POR_PEDIR") return stats.porPedir;
      return stats.porClasificacion[key] || 0;
    },
    [rows, stats],
  );

  const handleDeleteCarga = async () => {
    if (!selectedCarga) return;
    const ok = await confirm({
      title: "Eliminar carga de inventario",
      message: `Se eliminará la carga "${selectedCarga.nombre_archivo}" del ${formatDateUTC(selectedCarga.fecha_saldos)} con todos sus registros. Esta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    const { success } = await deleteCarga(selectedCargaId);
    if (success) sileo.success("Carga eliminada");
    else sileo.error("No se pudo eliminar la carga");
  };

  const handleExport = async () => {
    if (exporting || rows.length === 0) return;
    setExporting(true);
    try {
      await generarSugeridoExcel(rows, params, selectedCarga);
      sileo.success("Excel generado");
    } catch (err) {
      if (import.meta.env.DEV) console.error("Export sugerido error:", err);
      sileo.error("Error generando el Excel");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog {...confirmProps} />

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Sugerido de Pedidos
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Sugerido de compra según velocidad de venta e inventario de
            bodegas 1, 5 y 6
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {cargas.length > 0 && (
            <>
              <select
                value={selectedCargaId || ""}
                onChange={(e) => setSelectedCargaId(e.target.value)}
                aria-label="Carga de inventario"
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium bg-white focus:ring-2 focus:ring-indigo-500 max-w-[280px]"
              >
                {cargas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {formatDateUTC(c.fecha_saldos)} — {c.nombre_archivo}
                  </option>
                ))}
              </select>
              <button
                onClick={handleDeleteCarga}
                aria-label="Eliminar carga seleccionada"
                className="p-2 border border-slate-300 text-slate-400 rounded-lg hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 transition-colors"
              >
                <Trash2 size={16} />
              </button>
              <button
                onClick={handleExport}
                disabled={exporting || rows.length === 0}
                className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                {exporting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <FileDown size={16} />
                )}
                Exportar
              </button>
            </>
          )}
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-900/20 transition-all"
          >
            <Upload size={16} /> Cargar Saldos
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 text-rose-700 p-4 rounded-lg flex items-start gap-3 border border-rose-200">
          <AlertTriangle size={20} className="mt-0.5 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {cargas.length === 0 ? (
        <Card>
          <EmptyState
            icon={ShoppingCart}
            title="Sin inventario cargado"
            subtitle='Sube el reporte "Saldos de Productos" del ERP para calcular el sugerido de compra y el análisis de stock.'
          />
        </Card>
      ) : (
        <>
          {/* Parámetros (cobertura / crecimiento / reserva) */}
          {params && (
            <SugeridoParamsBar
              params={params}
              calculando={calculando}
              onRecalcular={recalcular}
              onGuardarPredeterminado={guardarPredeterminado}
            />
          )}

          {calculando ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 size={32} className="text-indigo-600 animate-spin mb-3" />
              <p className="text-sm text-slate-500 font-medium">
                Calculando sugerido...
              </p>
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <KpiCard
                  title="Por Pedir"
                  value={stats.porPedir}
                  subtitle={`Costo estimado: ${formatCurrency(stats.costoPedido)}`}
                  icon={PackageCheck}
                  type="info"
                />
                <KpiCard
                  title="Agotados"
                  value={stats.porClasificacion.AGOTADO || 0}
                  subtitle="Con demanda y sin stock"
                  icon={PackageX}
                  type="danger"
                />
                <KpiCard
                  title="Críticos"
                  value={stats.porClasificacion.CRITICO || 0}
                  subtitle="Cobertura muy baja"
                  icon={AlertTriangle}
                  type="warning"
                />
                <KpiCard
                  title="Stock Lento"
                  value={stats.porClasificacion.LENTO || 0}
                  subtitle={`Inmovilizado: ${formatCurrency(stats.valorLento)}`}
                  icon={Turtle}
                  type="neutral"
                />
                <KpiCard
                  title="Stock Muerto"
                  value={stats.porClasificacion.MUERTO || 0}
                  subtitle={`Inmovilizado: ${formatCurrency(stats.valorMuerto)}`}
                  icon={Skull}
                  type="neutral"
                />
              </div>

              {/* Filtros + búsqueda */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-wrap gap-1.5 bg-slate-100 rounded-xl p-1.5 w-fit">
                  {FILTROS.map((f) => {
                    const meta = CLASIFICACION_META[f.key];
                    return (
                      <button
                        key={f.key}
                        onClick={() => setFiltro(f.key)}
                        className={cn(
                          "px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap",
                          filtro === f.key
                            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20"
                            : "text-slate-500 hover:text-slate-800 hover:bg-slate-200",
                        )}
                      >
                        {f.label}
                        <span
                          className={cn(
                            "ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]",
                            filtro === f.key
                              ? "bg-white/20"
                              : meta?.badge || "bg-slate-200 text-slate-500",
                          )}
                        >
                          {filtroCount(f.key)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="relative ml-auto">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar producto, código o marca..."
                    aria-label="Buscar producto"
                    className="pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm w-64 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Tabla */}
              <SugeridoTable rows={filteredRows} />
            </>
          )}
        </>
      )}

      <InventarioUploadModal
        isOpen={showUpload}
        onClose={() => setShowUpload(false)}
        onSuccess={(cargaId) => {
          fetchCargas({ autoSelect: false }).then(() => {
            if (cargaId) setSelectedCargaId(cargaId);
          });
        }}
      />
    </div>
  );
}
