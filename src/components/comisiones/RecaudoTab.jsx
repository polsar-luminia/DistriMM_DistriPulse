/**
 * @fileoverview Recaudo tab — collections view with commissionability breakdown.
 * Shows per-upload KPIs and a per-salesperson expandable detail table.
 * @module components/comisiones/RecaudoTab
 */

import React, { useState, useMemo } from "react";
import ConfirmDialog from "../ConfirmDialog";
import { useConfirm } from "../../hooks/useConfirm";
import {
  Wallet,
  Upload,
  Trash2,
  Calendar,
  Loader2,
  DollarSign,
  CheckCircle,
  XCircle,
  Percent,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { sileo } from "sileo";
import { cn } from "@/lib/utils";
import { formatCurrency, formatFullCurrency, formatDateUTC } from "../../utils/formatters";
import { Card, KpiCard, EmptyState } from "./ComisionesShared";
import RecaudoUploadModal from "./RecaudoUploadModal";
import { RECAUDO_THRESHOLDS } from "../../constants/thresholds";

const { DIAS_MORA_LIMITE } = RECAUDO_THRESHOLDS;

export default function RecaudoTab({ hook }) {
  const {
    recaudoCargas,
    selectedRecaudoCargaId,
    loadingRecaudoCargas,
    selectRecaudoCarga,
    deleteRecaudoCarga,
    recaudos,
    loadingRecaudos,
  } = hook;

  const [confirmProps, confirm] = useConfirm();
  const [showModal, setShowModal] = useState(false);
  const [expandedVendedor, setExpandedVendedor] = useState(null);

  // Aggregate recaudos by vendedor_codigo
  const vendedorStats = useMemo(() => {
    if (!recaudos.length) return [];
    const map = {};
    recaudos.forEach((r) => {
      const cod = r.vendedor_codigo || "SIN VENDEDOR";
      if (!map[cod]) {
        map[cod] = { vendedor_codigo: cod, totalRecaudado: 0, totalComisionable: 0, totalExcluido: 0, items: [] };
      }
      map[cod].totalRecaudado += Number(r.valor_recaudo || 0);
      if (r.aplica_comision) {
        map[cod].totalComisionable += Number(r.valor_recaudo || 0);
      } else {
        map[cod].totalExcluido += Number(r.valor_recaudo || 0);
      }
      map[cod].items.push(r);
    });
    return Object.values(map).sort((a, b) => b.totalComisionable - a.totalComisionable);
  }, [recaudos]);

  // KPI totals
  const totals = useMemo(() => {
    const totalRecaudado = recaudos.reduce((s, r) => s + Number(r.valor_recaudo || 0), 0);
    const totalComisionable = recaudos.filter((r) => r.aplica_comision).reduce((s, r) => s + Number(r.valor_recaudo || 0), 0);
    const totalExcluido = recaudos.filter((r) => !r.aplica_comision).reduce((s, r) => s + Number(r.valor_recaudo || 0), 0);
    const pctComisionable = totalRecaudado > 0 ? (totalComisionable / totalRecaudado) * 100 : 0;
    return { totalRecaudado, totalComisionable, totalExcluido, pctComisionable };
  }, [recaudos]);

  if (loadingRecaudoCargas) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* Header controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {recaudoCargas.length > 0 ? (
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 border border-slate-200">
            <Calendar size={14} className="text-emerald-600 shrink-0" />
            <select
              value={selectedRecaudoCargaId || ""}
              onChange={(e) => selectRecaudoCarga(e.target.value)}
              className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer outline-none text-slate-700 min-w-[160px]"
            >
              {recaudoCargas.map((c) => (
                <option key={c.id} value={c.id}>
                  {formatDateUTC(c.fecha_periodo)} — {c.nombre_archivo}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <span className="text-xs text-slate-400 font-medium">Sin recaudos cargados</span>
        )}

        <div className="flex-1" />

        <button
          onClick={() => setShowModal(true)}
          className="px-3 py-2 bg-emerald-600 rounded-lg text-xs font-bold text-white hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-1.5"
        >
          <Upload size={14} /> Cargar Recaudos
        </button>

        {selectedRecaudoCargaId && (
          <button
            onClick={async () => {
              const ok = await confirm({
                title: "Eliminar carga de recaudos",
                message: "¿Estás seguro? Se eliminarán todos los recaudos de esta carga. Esta acción no se puede deshacer.",
                confirmText: "Eliminar",
                cancelText: "Cancelar",
                variant: "danger",
              });
              if (ok) {
                const result = await deleteRecaudoCarga(selectedRecaudoCargaId);
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

      {!selectedRecaudoCargaId ? (
        <EmptyState
          icon={Wallet}
          title="No hay recaudos cargados"
          subtitle="Sube el archivo 'Comisiones x Cartera' para ver el detalle de recaudos comisionables."
        />
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard title="Total Recaudado" value={formatCurrency(totals.totalRecaudado)} icon={DollarSign} type="info" />
            <KpiCard title="Comisionable (≤{DIAS_MORA_LIMITE}d)" value={formatCurrency(totals.totalComisionable)} icon={CheckCircle} type="success" />
            <KpiCard title="Excluido (>{DIAS_MORA_LIMITE}d)" value={formatCurrency(totals.totalExcluido)} icon={XCircle} type="danger" />
            <KpiCard title="% Comisionable" value={`${totals.pctComisionable.toFixed(1)}%`} icon={Percent} type="warning" />
          </div>

          {/* Vendedores table */}
          {loadingRecaudos ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="text-emerald-600 animate-spin" />
              <span className="ml-2 text-sm text-slate-500">Cargando recaudos...</span>
            </div>
          ) : vendedorStats.length === 0 ? (
            <EmptyState icon={Wallet} title="Sin resultados" subtitle="No se encontraron datos para esta carga." />
          ) : (
            <Card className="overflow-hidden !p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Vendedor</th>
                      <th className="px-4 py-3 text-right">Total Recaudado</th>
                      <th className="px-4 py-3 text-right">Comisionable</th>
                      <th className="px-4 py-3 text-right">Excluido</th>
                      <th className="px-4 py-3 text-center">Recibos</th>
                      <th className="px-4 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vendedorStats.map((v) => {
                      const isExpanded = expandedVendedor === v.vendedor_codigo;
                      return (
                        <React.Fragment key={v.vendedor_codigo}>
                          <tr
                            className="hover:bg-slate-50 cursor-pointer transition-colors"
                            onClick={() => setExpandedVendedor(isExpanded ? null : v.vendedor_codigo)}
                          >
                            <td className="px-4 py-3 font-bold text-slate-900">{v.vendedor_codigo}</td>
                            <td className="px-4 py-3 text-right font-mono text-slate-700">{formatFullCurrency(v.totalRecaudado)}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{formatFullCurrency(v.totalComisionable)}</td>
                            <td className="px-4 py-3 text-right font-mono text-rose-500">{formatFullCurrency(v.totalExcluido)}</td>
                            <td className="px-4 py-3 text-center text-xs text-slate-500">{v.items.length}</td>
                            <td className="px-4 py-3">
                              {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr>
                              <td colSpan={6} className="p-0 bg-slate-50">
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs text-left">
                                    <thead className="text-slate-400 uppercase font-bold border-b border-slate-200">
                                      <tr>
                                        <th className="px-6 py-2">Cliente</th>
                                        <th className="px-4 py-2">Factura</th>
                                        <th className="px-4 py-2">Fecha Abono</th>
                                        <th className="px-4 py-2 text-right">Base</th>
                                        <th className="px-4 py-2 text-center">Días</th>
                                        <th className="px-4 py-2 text-center">Aplica</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {v.items
                                        .sort((a, b) => Number(b.valor_recaudo) - Number(a.valor_recaudo))
                                        .map((item) => (
                                          <tr key={item.id} className="hover:bg-white">
                                            <td className="px-6 py-2 truncate max-w-[180px]">{item.cliente_nombre || item.cliente_nit}</td>
                                            <td className="px-4 py-2 font-mono">{item.factura}</td>
                                            <td className="px-4 py-2 font-mono">{item.fecha_abono}</td>
                                            <td className="px-4 py-2 text-right font-mono">{formatFullCurrency(item.valor_recaudo)}</td>
                                            <td className="px-4 py-2 text-center">
                                              <span className={item.dias_mora > DIAS_MORA_LIMITE ? "text-rose-600 font-bold" : "text-slate-600"}>
                                                {item.dias_mora}
                                              </span>
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                              <span className={cn(
                                                "text-[10px] font-bold px-2 py-0.5 rounded-full",
                                                item.aplica_comision
                                                  ? "bg-emerald-100 text-emerald-700"
                                                  : "bg-rose-100 text-rose-700"
                                              )}>
                                                {item.aplica_comision ? "Sí" : "No"}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                </div>
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

      <RecaudoUploadModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={hook.refreshRecaudos}
      />
      <ConfirmDialog {...confirmProps} />
    </>
  );
}
