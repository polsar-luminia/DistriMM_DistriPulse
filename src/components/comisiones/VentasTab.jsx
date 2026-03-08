/**
 * @fileoverview Ventas tab — daily sales view with vendor commissions breakdown.
 * Includes VendedorDetail expanded row component.
 * @module components/comisiones/VentasTab
 */

import React, { useState, useMemo, useCallback } from "react";
import ConfirmDialog from "../ConfirmDialog";
import { useConfirm } from "../../hooks/useConfirm";
import {
  Receipt,
  Upload,
  Trash2,
  ChevronDown,
  ChevronUp,
  Calendar,
  Loader2,
  DollarSign,
  Ban,
  TrendingUp,
  Package,
  Download,
  Undo2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { sileo } from "sileo";
import {
  getExclusionInfo,
  buildExclusionLookups,
} from "../../hooks/useComisiones";
import {
  formatCurrency,
  formatFullCurrency,
  formatDateUTC,
} from "../../utils/formatters";
import { Card, KpiCard, EmptyState } from "./ComisionesShared";
import VentasUploadModal from "./VentasUploadModal";
import CatalogoUploadModal from "./CatalogoUploadModal";
import VendedorDetail from "./VendedorDetail";

export default function VentasTab({ hook }) {
  const {
    cargas, selectedCargaId, selectedCarga, loadingCargas, selectCarga, deleteCarga,
    comisiones, loadingComisiones, totals,
    ventasDetail, loadingVentas,
  } = hook;

  const [confirmProps, confirm] = useConfirm();
  const [expandedVendedor, setExpandedVendedor] = useState(null);
  const [showVentasModal, setShowVentasModal] = useState(false);
  const [showCatalogoModal, setShowCatalogoModal] = useState(false);

  // Build exclusion lookup maps (shared utility)
  const lookups = useMemo(
    () => buildExclusionLookups(hook.exclusiones, hook.catalogo),
    [hook.exclusiones, hook.catalogo],
  );

  // Returns { excluded: boolean, reason: string|null }
  const checkExclusion = useCallback(
    (productoCode) =>
      getExclusionInfo(
        productoCode,
        lookups.productExclusionSet,
        lookups.brandExclusionSet,
        lookups.productBrandMap,
      ),
    [lookups],
  );

  // DV (devolucion) summary across all items in this carga
  const dvTotals = useMemo(() => {
    const dvItems = ventasDetail.filter((v) => v.tipo === "DV");
    const totalDevoluciones = dvItems.reduce((s, v) => s + Math.abs(Number(v.valor_total || 0)), 0);
    return { count: dvItems.length, total: totalDevoluciones };
  }, [ventasDetail]);

  // Vendor sales sorted by valor_total desc
  const vendedorVentas = useMemo(() => {
    if (!expandedVendedor || !ventasDetail.length) return [];
    return ventasDetail
      .filter((v) => v.vendedor_codigo === expandedVendedor)
      .sort((a, b) => Number(b.valor_total) - Number(a.valor_total));
  }, [expandedVendedor, ventasDetail]);

  // ── Export to Excel ──
  const handleExport = useCallback(() => {
    if (!comisiones.length || !ventasDetail.length) return;
    const fechaLabel = selectedCarga?.fecha_ventas || "sin-fecha";

    // Sheet 1: Resumen por Vendedor
    const resumenRows = comisiones.map((v) => ({
      Vendedor: `${v.vendedor_nombre || "Sin nombre"} (#${v.vendedor_codigo})`,
      "Ventas Totales": Number(v.total_ventas || 0),
      Excluidas: Number(v.ventas_excluidas || 0),
      Comisionables: Number(v.ventas_comisionables || 0),
      "Items Total": Number(v.items_total || 0),
      "Items Excluidos": Number(v.items_excluidos || 0),
      "Items Comisionables": Number(v.items_comisionables || 0),
    }));
    resumenRows.push({
      Vendedor: "TOTALES",
      "Ventas Totales": totals.totalVentas,
      Excluidas: totals.ventasExcluidas,
      Comisionables: totals.ventasComisionables,
      "Items Total": comisiones.reduce((s, v) => s + Number(v.items_total || 0), 0),
      "Items Excluidos": comisiones.reduce((s, v) => s + Number(v.items_excluidos || 0), 0),
      "Items Comisionables": comisiones.reduce((s, v) => s + Number(v.items_comisionables || 0), 0),
    });

    // Sheet 2: Detalle de Ventas
    const detalleRows = ventasDetail.map((item) => {
      const info = checkExclusion(item.producto_codigo);
      return {
        Vendedor: item.vendedor_nombre || item.vendedor_codigo,
        "Cod Vendedor": item.vendedor_codigo,
        "Cod Producto": item.producto_codigo,
        "Descripcion Producto": item.producto_descripcion,
        "NIT Cliente": item.cliente_nit,
        Cliente: item.cliente_nombre,
        Factura: item.factura,
        Municipio: item.municipio,
        Fecha: item.fecha,
        Cantidad: Number(item.cantidad || 0),
        Precio: Number(item.precio || 0),
        Descuento: Number(item.descuento || 0),
        "Valor Unidad": Number(item.valor_unidad || 0),
        "Valor Total": Number(item.valor_total || 0),
        Costo: Number(item.costo || 0),
        Comisionable: info.excluded ? "NO" : "SI",
        "Motivo Exclusion": info.reason || "",
      };
    });

    // Sheet 3: Exclusiones Activas
    const exclusionesRows = (hook.exclusiones || []).map((e) => ({
      Tipo: e.tipo === "marca" ? "Marca" : "Producto",
      Valor: e.valor,
      Descripcion: e.descripcion || "",
      Motivo: e.motivo || "",
    }));

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(resumenRows);
    const ws2 = XLSX.utils.json_to_sheet(detalleRows);
    const ws3 = XLSX.utils.json_to_sheet(exclusionesRows.length > 0 ? exclusionesRows : [{ Tipo: "", Valor: "", Descripcion: "", Motivo: "" }]);

    // Set column widths
    ws1["!cols"] = [{ wch: 35 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 16 }];
    ws2["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 25 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 20 }];
    ws3["!cols"] = [{ wch: 12 }, { wch: 25 }, { wch: 35 }, { wch: 25 }];

    XLSX.utils.book_append_sheet(wb, ws1, "Resumen por Vendedor");
    XLSX.utils.book_append_sheet(wb, ws2, "Detalle de Ventas");
    XLSX.utils.book_append_sheet(wb, ws3, "Exclusiones Activas");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    XLSX.writeFile(wb, `Comisiones_${fechaLabel}_${timestamp}.xlsx`);
    sileo.success("Reporte exportado");
  }, [comisiones, ventasDetail, totals, selectedCarga, hook.exclusiones, checkExclusion]);

  if (loadingCargas) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* Header controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {cargas.length > 0 ? (
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 border border-slate-200">
            <Calendar size={14} className="text-indigo-600 shrink-0" />
            <select
              value={selectedCargaId || ""}
              onChange={(e) => selectCarga(e.target.value)}
              className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer outline-none text-slate-700 min-w-[140px]"
            >
              {cargas.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatDateUTC(c.fecha_ventas)} — {c.nombre_archivo}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <span className="text-xs text-slate-400 font-medium">Sin ventas cargadas</span>
        )}

        <div className="flex-1" />

        {selectedCargaId && comisiones.length > 0 && (
          <button
            onClick={handleExport}
            className="px-3 py-2 bg-slate-700 rounded-lg text-xs font-bold text-white hover:bg-slate-800 transition-colors shadow-sm flex items-center gap-1.5"
          >
            <Download size={14} /> Exportar Reporte
          </button>
        )}
        <button
          onClick={() => setShowCatalogoModal(true)}
          className="px-3 py-2 bg-emerald-600 rounded-lg text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-1.5"
        >
          <Package size={14} /> Cargar Catalogo
        </button>
        <button
          onClick={() => setShowVentasModal(true)}
          className="px-3 py-2 bg-indigo-600 rounded-lg text-xs font-bold text-white hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-1.5"
        >
          <Upload size={14} /> Cargar Ventas
        </button>

        {selectedCargaId && (
          <button
            onClick={async () => {
              const ok = await confirm({
                title: "Eliminar carga de ventas",
                message: "¿Estás seguro de que deseas eliminar esta carga? Se eliminarán todas sus ventas. Esta acción no se puede deshacer.",
                confirmText: "Eliminar",
                cancelText: "Cancelar",
                variant: "danger",
              });
              if (ok) {
                const result = await deleteCarga(selectedCargaId);
                if (result) sileo.success("Carga eliminada");
              }
            }}
            className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
            title="Eliminar carga"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {!selectedCargaId ? (
        <EmptyState
          icon={Receipt}
          title="No hay ventas cargadas"
          subtitle="Sube un archivo Excel de ventas diarias para comenzar a calcular comisiones."
        />
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard title="Total Ventas" value={formatCurrency(totals.totalVentas)} icon={DollarSign} type="info" />
            <KpiCard title="Comisionables" value={formatCurrency(totals.ventasComisionables)} icon={TrendingUp} type="success" />
            <KpiCard title="Excluidas" value={formatCurrency(totals.ventasExcluidas)} icon={Ban} type="danger" />
            <KpiCard
              title={`Devoluciones (${dvTotals.count})`}
              value={formatCurrency(dvTotals.total)}
              icon={Undo2}
              type="danger"
            />
          </div>

          {/* Vendedores table */}
          {loadingComisiones ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="text-indigo-600 animate-spin" />
              <span className="ml-2 text-sm text-slate-500">Calculando comisiones...</span>
            </div>
          ) : comisiones.length === 0 ? (
            <EmptyState icon={Receipt} title="Sin resultados" subtitle="No se encontraron datos para esta carga." />
          ) : (
            <Card className="overflow-hidden !p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Vendedor</th>
                      <th className="px-4 py-3 text-right">Ventas Totales</th>
                      <th className="px-4 py-3 text-right">Excluidas</th>
                      <th className="px-4 py-3 text-right">Comisionables</th>
                      <th className="px-4 py-3 text-center">Items</th>
                      <th className="px-4 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {comisiones.map((v) => {
                      const isExpanded = expandedVendedor === v.vendedor_codigo;
                      return (
                        <React.Fragment key={v.vendedor_codigo}>
                          <tr
                            className="hover:bg-slate-50 cursor-pointer transition-colors"
                            onClick={() => setExpandedVendedor(isExpanded ? null : v.vendedor_codigo)}
                          >
                            <td className="px-4 py-3">
                              <span className="font-bold text-slate-900">{v.vendedor_nombre || "Sin nombre"}</span>
                              <span className="text-xs text-slate-400 ml-2">#{v.vendedor_codigo}</span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-slate-700">{formatFullCurrency(v.total_ventas)}</td>
                            <td className="px-4 py-3 text-right font-mono text-rose-500">{formatFullCurrency(v.ventas_excluidas)}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{formatFullCurrency(v.ventas_comisionables)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-xs text-slate-500">
                                {v.items_comisionables}<span className="text-slate-300">/{v.items_total}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                            </td>
                          </tr>

                          {/* Expanded detail with visual summary */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={6} className="p-0">
                                <VendedorDetail
                                  vendedor={v}
                                  ventas={vendedorVentas}
                                  loading={loadingVentas}
                                  getExclusionInfo={checkExclusion}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      <VentasUploadModal isOpen={showVentasModal} onClose={() => setShowVentasModal(false)} onSuccess={hook.refreshAfterUpload} />
      <CatalogoUploadModal isOpen={showCatalogoModal} onClose={() => setShowCatalogoModal(false)} onSuccess={hook.fetchCatalogo} />
      <ConfirmDialog {...confirmProps} />
    </>
  );
}
