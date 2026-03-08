/**
 * @fileoverview HistorialLotesTab + LoteDetalleView - Batch history and drill-down.
 * @module components/messages/HistorialTab
 */

import React, { useState, useEffect } from "react";
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  Loader,
  ChevronDown,
  Package,
  RefreshCw,
  Ban,
  RotateCcw,
  ArrowLeft,
} from "lucide-react";
import { sileo } from "sileo";
import { Card } from "../dashboard/DashboardShared";
import { EstadoBadge, PhoneBadge } from "./MessagesShared";
import { timeAgo } from "../../utils/timeAgo";

// ════════════════════════════════════════════════════════════════════════════
// LOTE DETALLE VIEW (Drill-down)
// ════════════════════════════════════════════════════════════════════════════

function LoteDetalleView({ loteId, messaging, onBack }) {
  useEffect(() => {
    messaging.loadLoteDetalle(loteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loteId]);

  const lote = messaging.activeLote;
  const detalle = messaging.activeLoteDetalle;

  const handleRetry = async () => {
    const { success, error } = await messaging.handleRetryFailed(loteId);
    if (success) {
      sileo.success({ title: "Reintentando mensajes fallidos..." });
    } else {
      sileo.error({ title: "Error", description: error });
    }
  };

  const handleCancel = async () => {
    const { success, error } = await messaging.handleCancelLote(loteId);
    if (success) {
      sileo.success({ title: "Lote cancelado" });
    } else {
      sileo.error({ title: "Error", description: error });
    }
  };

  if (messaging.loadingDetalle && !lote) {
    return (
      <Card className="p-10 flex items-center justify-center">
        <Loader size={24} className="animate-spin text-slate-300" />
      </Card>
    );
  }

  if (!lote) return null;

  const enviados = detalle.filter((d) => d.estado_envio === "enviado").length;
  const fallidos = detalle.filter((d) => d.estado_envio === "fallido").length;
  const pendientes = detalle.filter((d) => d.estado_envio === "pendiente").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onBack}
            className="text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1"
          >
            <ArrowLeft size={14} /> Volver al historial
          </button>

          <div className="flex items-center gap-2">
            {fallidos > 0 && lote.estado !== "cancelado" && (
              <button
                onClick={handleRetry}
                className="px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors flex items-center gap-1"
              >
                <RotateCcw size={12} /> Reintentar ({fallidos})
              </button>
            )}
            {(lote.estado === "pendiente" || lote.estado === "en_proceso") && (
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors flex items-center gap-1"
              >
                <Ban size={12} /> Cancelar
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <EstadoBadge estado={lote.estado} />
          <span className="text-xs font-bold text-slate-800 uppercase">
            Lote {lote.tipo}
          </span>
          <span className="text-xs text-slate-400">
            {new Date(lote.created_at).toLocaleDateString("es-CO")}{" "}
            {new Date(lote.created_at).toLocaleTimeString("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-xl font-black text-slate-800">
              {lote.total_destinatarios}
            </p>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Total</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-3 text-center">
            <p className="text-xl font-black text-emerald-600">{enviados}</p>
            <p className="text-[10px] font-bold text-emerald-500 uppercase">
              Enviados
            </p>
          </div>
          <div className="bg-rose-50 rounded-xl p-3 text-center">
            <p className="text-xl font-black text-rose-600">{fallidos}</p>
            <p className="text-[10px] font-bold text-rose-500 uppercase">Fallidos</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 text-center">
            <p className="text-xl font-black text-amber-600">{pendientes}</p>
            <p className="text-[10px] font-bold text-amber-500 uppercase">
              Pendientes
            </p>
          </div>
        </div>

        {/* Progress bar */}
        {lote.total_destinatarios > 0 && (
          <div className="mt-4 w-full bg-slate-100 rounded-full h-2">
            <div className="flex h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 transition-all duration-500"
                style={{
                  width: `${(enviados / lote.total_destinatarios) * 100}%`,
                }}
              />
              <div
                className="bg-rose-400 transition-all duration-500"
                style={{
                  width: `${(fallidos / lote.total_destinatarios) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </Card>

      {/* Detail Table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-800 text-slate-400 text-[10px] uppercase font-bold tracking-wider sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3">Enviado</th>
                <th className="px-4 py-3">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {detalle.length > 0 ? (
                detalle.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-xs font-bold text-slate-800 uppercase">
                        {d.cliente_nombre}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {d.cliente_nit}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-slate-500">
                      {d.telefono}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <EstadoBadge estado={d.estado_envio} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {d.enviado_at
                        ? new Date(d.enviado_at).toLocaleTimeString("es-CO", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      {d.error_detalle && (
                        <p className="text-[10px] text-rose-500 truncate">
                          {d.error_detalle}
                        </p>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="px-8 py-16 text-center">
                    <Loader size={24} className="animate-spin text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-400">
                      Cargando detalle...
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// HISTORIAL LOTES TAB
// ════════════════════════════════════════════════════════════════════════════

export default function HistorialLotesTab({ messaging }) {
  const [viewingLoteId, setViewingLoteId] = useState(null);

  // If viewing a lote detail
  if (viewingLoteId) {
    return (
      <LoteDetalleView
        loteId={viewingLoteId}
        messaging={messaging}
        onBack={() => {
          setViewingLoteId(null);
          messaging.stopPolling();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 uppercase flex items-center gap-2">
            <Package size={16} className="text-indigo-600" />
            Lotes de Envío
          </h3>
          <button
            onClick={() => messaging.refreshLotes()}
            disabled={messaging.loadingLotes}
            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            <RefreshCw
              size={16}
              className={messaging.loadingLotes ? "animate-spin" : ""}
            />
          </button>
        </div>
      </Card>

      {messaging.loadingLotes ? (
        <Card className="p-10 flex items-center justify-center">
          <Loader size={24} className="animate-spin text-slate-300" />
        </Card>
      ) : messaging.lotes.length === 0 ? (
        <Card className="p-10 text-center">
          <Package size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-400">
            No hay lotes de envío todavía
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Cree un nuevo lote en la pestaña &quot;Nuevo Lote&quot;
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {messaging.lotes.map((lote) => (
            <Card
              key={lote.id}
              className="p-4 cursor-pointer hover:border-indigo-300 transition-all"
              onClick={() => {
                setViewingLoteId(lote.id);
                messaging.loadLoteDetalle(lote.id);
                if (lote.estado === "en_proceso" || lote.estado === "pendiente") {
                  messaging.startPolling(lote.id);
                }
              }}
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div className="flex items-center gap-4">
                  <div
                    className={`p-2.5 rounded-xl ${
                      lote.estado === "completado"
                        ? "bg-emerald-50 text-emerald-600"
                        : lote.estado === "en_proceso"
                          ? "bg-blue-50 text-blue-600"
                          : lote.estado === "parcial"
                            ? "bg-orange-50 text-orange-600"
                            : lote.estado === "cancelado"
                              ? "bg-slate-100 text-slate-400"
                              : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {lote.estado === "en_proceso" ? (
                      <Loader size={18} className="animate-spin" />
                    ) : lote.estado === "completado" ? (
                      <CheckCircle size={18} />
                    ) : lote.estado === "parcial" ? (
                      <AlertTriangle size={18} />
                    ) : lote.estado === "cancelado" ? (
                      <Ban size={18} />
                    ) : (
                      <Clock size={18} />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 uppercase">
                      Lote {lote.tipo} — {lote.total_destinatarios} destinatarios
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(lote.created_at).toLocaleDateString("es-CO")}{" "}
                      {new Date(lote.created_at).toLocaleTimeString("es-CO", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      • {timeAgo(new Date(lote.created_at))}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-emerald-600 font-bold">
                      ✓ {lote.enviados}
                    </span>
                    <span className="text-rose-500 font-bold">
                      ✗ {lote.fallidos}
                    </span>
                    <span className="text-slate-400 font-bold">
                      / {lote.total_destinatarios}
                    </span>
                  </div>

                  <EstadoBadge estado={lote.estado} />

                  <ChevronDown size={16} className="text-slate-400 -rotate-90" />
                </div>
              </div>

              {/* Progress bar for in-process lotes */}
              {(lote.estado === "en_proceso" || lote.estado === "parcial") && (
                <div className="mt-3 w-full bg-slate-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      lote.estado === "parcial" ? "bg-orange-500" : "bg-indigo-600"
                    }`}
                    style={{
                      width: `${
                        lote.total_destinatarios > 0
                          ? Math.round(
                              ((lote.enviados + lote.fallidos) /
                                lote.total_destinatarios) *
                                100,
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
