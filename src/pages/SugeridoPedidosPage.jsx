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
  Trash2,
  FileDown,
  PackageX,
  PackageCheck,
  Skull,
  Turtle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { sileo } from "sileo";
import { useSugeridoPedidos } from "../hooks/useSugeridoPedidos";
import { formatCurrency, formatDateUTC } from "../utils/formatters";
import { Card, KpiCard, EmptyState } from "../components/comisiones/ComisionesShared";
import SugeridoParamsBar from "../components/sugerido/SugeridoParamsBar";
import SugeridoTable from "../components/sugerido/SugeridoTable";
import SugeridoFiltros from "../components/sugerido/SugeridoFiltros";
import SugeridoExportModal from "../components/sugerido/SugeridoExportModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { useConfirm } from "../hooks/useConfirm";
import { generarSugeridoExcel } from "../utils/sugeridoExcelExport";
import {
  FILTROS_INICIALES,
  aplicarAlcance,
  aplicarEstado,
  aplicarBusqueda,
} from "../utils/sugeridoFiltros";

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
  } = hook;

  const [confirmProps, confirm] = useConfirm();
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [exportOpen, setExportOpen] = useState(false);

  const setFiltro = useCallback(
    (patch) => setFiltros((f) => ({ ...f, ...patch })),
    [],
  );
  const limpiarFiltros = useCallback(() => setFiltros(FILTROS_INICIALES), []);

  // Opciones de proveedor (marca) y línea (categoría) presentes en la carga
  const opcionesMarca = useMemo(
    () =>
      [...new Set(rows.map((r) => r.marca).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "es"),
      ),
    [rows],
  );
  const opcionesCategoria = useMemo(
    () =>
      [...new Set(rows.map((r) => r.categoria_nombre).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, "es"),
      ),
    [rows],
  );

  // Reset de filtros al cambiar de carga: un proveedor de la carga anterior
  // puede no existir en la nueva y dejaría la tabla vacía sin explicación.
  // Ajuste en render (no en efecto) para no pintar un frame con los filtros
  // viejos aplicados sobre las filas nuevas.
  const [cargaFiltrada, setCargaFiltrada] = useState(selectedCargaId);
  if (cargaFiltrada !== selectedCargaId) {
    setCargaFiltrada(selectedCargaId);
    setFiltros(FILTROS_INICIALES);
  }

  const selectedCarga = cargas.find((c) => c.id === selectedCargaId);

  // Universo tras los filtros de alcance (proveedor, línea, última venta,
  // stock) — base de los KPIs y de los contadores de las pastillas de estado
  const rowsScoped = useMemo(() => aplicarAlcance(rows, filtros), [rows, filtros]);

  const stats = useMemo(() => {
    const porClasificacion = {};
    let porPedir = 0;
    let costoPedido = 0;
    let valorMuerto = 0;
    let valorLento = 0;
    for (const r of rowsScoped) {
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
  }, [rowsScoped]);

  const filteredRows = useMemo(
    () =>
      aplicarBusqueda(
        aplicarEstado(rowsScoped, filtros.estado),
        filtros.search,
      ),
    [rowsScoped, filtros.estado, filtros.search],
  );

  const filtroCount = useCallback(
    (key) => {
      if (key === "TODOS") return rowsScoped.length;
      if (key === "POR_PEDIR") return stats.porPedir;
      return stats.porClasificacion[key] || 0;
    },
    [rowsScoped, stats],
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

  /**
   * El recorte lo decide el modal (proveedor, línea, estado…), no lo que esté
   * filtrado en pantalla: exportar la orden de un proveedor no debería
   * obligar a cambiar la vista.
   */
  const handleExport = async (rowsExport, opciones) => {
    try {
      await generarSugeridoExcel(rowsExport, params, selectedCarga, opciones);
      sileo.success("Excel generado");
    } catch (err) {
      if (import.meta.env.DEV) console.error("Export sugerido error:", err);
      sileo.error("Error generando el Excel");
      // Se relanza para que el modal siga abierto y se pueda reintentar
      throw err;
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
                onClick={() => setExportOpen(true)}
                disabled={calculando || rows.length === 0}
                className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <FileDown size={16} />
                Exportar
              </button>
            </>
          )}
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
              <SugeridoFiltros
                filtros={filtros}
                onChange={setFiltro}
                onLimpiar={limpiarFiltros}
                opcionesMarca={opcionesMarca}
                opcionesCategoria={opcionesCategoria}
                contarEstado={filtroCount}
              />

              {/* Tabla */}
              <SugeridoTable
                rows={filteredRows}
                diasAnalisis={params?.diasAnalisis}
              />
            </>
          )}
        </>
      )}

      <SugeridoExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        rows={rows}
        filtrosPantalla={filtros}
        opcionesMarca={opcionesMarca}
        opcionesCategoria={opcionesCategoria}
        onExportar={handleExport}
      />
    </div>
  );
}
