import React, { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { sileo } from "sileo";
import { formatDateUTC } from "../utils/formatters";
import {
  Search,
  Filter,
  Send,
  Loader,
  CheckCircle,
  ListChecks,
  Clock,
  History,
  AlertCircle,
} from "lucide-react";
import { timeAgo, hoursAgo } from "../utils/timeAgo";
import {
  Card,
  formatFullCurrency,
} from "../components/dashboard/DashboardShared";

export default function RemindersPage() {
  const context = useOutletContext();
  const { data = {} } = context || {};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const clients = data.aggregatedClients || [];

  const [forceSend, setForceSend] = useState(false);

  // Advanced Filter State
  const [config, setConfig] = useState({
    target: "all", // 'all', 'overdue', 'upcoming'
    daysRange: { min: 0, max: 15 },
    amountRange: { min: "", max: "" },
    timeSinceRange: { min: "", max: "" },
    enabled: { days: true, amount: false, timeSince: false },
    sentStatus: "all", // 'all', 'sent', 'not_sent'
    searchQuery: "",
  });

  const toggleFilter = (key) => {
    setConfig((prev) => ({
      ...prev,
      enabled: { ...prev.enabled, [key]: !prev.enabled[key] },
    }));
  };

  // Helper: check if a reminder was already sent today
  const isSentToday = (ultimoRecordatorio) => {
    if (!ultimoRecordatorio) return false;
    const sentDate = new Date(ultimoRecordatorio);
    const todayDate = new Date();
    return (
      sentDate.getFullYear() === todayDate.getFullYear() &&
      sentDate.getMonth() === todayDate.getMonth() &&
      sentDate.getDate() === todayDate.getDate()
    );
  };

  // Filter Logic
  const expiringInvoices = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return clients.flatMap((client) =>
      (client.items || [])
        .filter((item) => {
          // Null guard: skip items without required identifiers
          if (!item.documento_id && !item.id) return false;
          if (item.pago_reportado === true) return false;

          const vencimiento = new Date(item.fecha_vencimiento);
          vencimiento.setHours(0, 0, 0, 0);

          const diffTime = vencimiento - today;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          const daysUntilDue = diffDays;
          const isOverdue = item.dias_mora > 0 || diffDays < 0;

          if (config.searchQuery) {
            if (
              !client.name
                ?.toLowerCase()
                .includes(config.searchQuery.toLowerCase())
            )
              return false;
          }

          if (config.target === "overdue" && !isOverdue) return false;
          if (config.target === "upcoming" && isOverdue) return false;

          if (config.enabled.days) {
            if (!isOverdue) {
              if (
                daysUntilDue < config.daysRange.min ||
                daysUntilDue > config.daysRange.max
              )
                return false;
            }
          }

          if (config.enabled.amount) {
            const val = item.valor_saldo;
            const min = config.amountRange.min
              ? Number(config.amountRange.min)
              : 0;
            const max = config.amountRange.max
              ? Number(config.amountRange.max)
              : Infinity;
            if (val < min || val > max) return false;
          }

          const alreadySentToday = isSentToday(item.ultimo_recordatorio);

          if (config.sentStatus === "sent" && !alreadySentToday) return false;
          if (config.sentStatus === "not_sent" && alreadySentToday)
            return false;

          if (config.enabled.timeSince) {
            const hours = hoursAgo(item.ultimo_recordatorio);
            const min = config.timeSinceRange.min
              ? Number(config.timeSinceRange.min)
              : 0;
            const max = config.timeSinceRange.max
              ? Number(config.timeSinceRange.max)
              : Infinity;
            if (hours < min || hours > max) return false;
          }

          return true;
        })
        .map((item) => ({
          ...item,
          cliente_nombre: client.name,
          cliente_obj: client,
          alreadySentToday: isSentToday(item.ultimo_recordatorio),
          days_until_due:
            item.days_until_due ||
            Math.ceil(
              (new Date(item.fecha_vencimiento).setHours(0, 0, 0, 0) -
                today) /
              (1000 * 60 * 60 * 24),
            ),
        })),
    );
  }, [clients, config]);

  const handleBulkSend = async () => {
    sileo.info({ title: "Proximamente", description: "Esta funcion esta en desarrollo." });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header Card */}
      <div className="bg-white p-6 md:p-10 rounded-3xl shadow-xl shadow-indigo-900/5 border border-indigo-50 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Send size={120} className="text-indigo-600 rotate-12" />
        </div>

        <div className="relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 text-center md:text-left">
            <div>
              <h1 className="text-3xl font-black text-slate-900 flex flex-col md:flex-row items-center gap-3">
                <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-600/20">
                  <Clock size={32} />
                </div>
                <span className="mt-2 md:mt-0 uppercase tracking-tight">
                  Centro de Notificaciones
                </span>
              </h1>
              <p className="text-slate-500 font-medium mt-3 max-w-lg">
                Automatice sus cobranzas enviando recordatorios personalizados
                vía WhatsApp a sus clientes de forma masiva.
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl w-full md:w-auto shadow-inner">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                Destinatarios Activos
              </span>
              <span className="text-4xl font-black text-indigo-600 leading-none">
                {expiringInvoices.length}
              </span>
            </div>
          </div>

          {/* Filters Section */}
          <div className="grid grid-cols-1 gap-4">
            <div className="flex flex-col xl:flex-row gap-4">
              <div className="relative flex-grow group">
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors"
                  size={20}
                />
                <input
                  type="text"
                  placeholder="Buscar por cliente o factura..."
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-transparent focus:bg-white focus:border-indigo-200 focus:ring-4 focus:ring-indigo-500/10 rounded-2xl font-medium text-slate-700 transition-all outline-none"
                  value={config.searchQuery}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      searchQuery: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="flex p-1.5 bg-slate-100 rounded-2xl h-[60px] xl:w-[400px]">
                {["all", "not_sent", "sent"].map((status) => (
                  <button
                    key={status}
                    onClick={() =>
                      setConfig((prev) => ({ ...prev, sentStatus: status }))
                    }
                    className={`flex-1 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${config.sentStatus === status ? "bg-white shadow-md text-indigo-600" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    {status === "all"
                      ? "Todos"
                      : status === "not_sent"
                        ? "Pendientes"
                        : "Enviados"}
                  </button>
                ))}
              </div>
            </div>

            {/* Chip Filters Row */}
            <div className="flex flex-wrap gap-3 items-center mt-2">
              {/* Target Selector */}
              <div className="relative min-w-[180px]">
                <select
                  className="w-full pl-4 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 appearance-none cursor-pointer focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
                  value={config.target}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, target: e.target.value }))
                  }
                >
                  <option value="all">Filtro: Cualquier Estado</option>
                  <option value="overdue">Filtro: Solo Vencidos</option>
                  <option value="upcoming">Filtro: Solo Por Vencer</option>
                </select>
                <Filter
                  size={14}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
              </div>

              {/* Days Range Chip */}
              <div
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${config.enabled.days ? "bg-white border-indigo-200 shadow-sm ring-1 ring-indigo-50" : "bg-slate-50/50 border-transparent opacity-50"}`}
              >
                <input
                  type="checkbox"
                  checked={config.enabled.days}
                  onChange={() => toggleFilter("days")}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
                <span className="text-xs font-black text-slate-700 uppercase tracking-tight">
                  Rango Días:
                </span>
                {config.enabled.days && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      className="w-14 bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-xs font-bold text-center"
                      value={config.daysRange.min}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          daysRange: {
                            ...prev.daysRange,
                            min: Number(e.target.value),
                          },
                        }))
                      }
                    />
                    <span className="text-slate-300 font-bold">~</span>
                    <input
                      type="number"
                      className="w-14 bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-xs font-bold text-center"
                      value={config.daysRange.max}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          daysRange: {
                            ...prev.daysRange,
                            max: Number(e.target.value),
                          },
                        }))
                      }
                    />
                  </div>
                )}
              </div>

              {/* Options */}
              <label className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={forceSend}
                  onChange={(e) => setForceSend(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-500 focus:ring-rose-500 border-slate-300"
                />
                <div className="flex items-center gap-2">
                  <AlertCircle
                    size={14}
                    className={forceSend ? "text-rose-500" : "text-slate-400"}
                  />
                  <span
                    className={`text-xs font-black uppercase tracking-tight ${forceSend ? "text-rose-600" : "text-slate-600"}`}
                  >
                    Modo Reenvío
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Action Section */}
      <div className="flex flex-col md:flex-row justify-between items-center px-4 gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-100 rounded-2xl text-slate-400">
            <ListChecks size={24} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800">
              Cola de Selección
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              {expiringInvoices.length} facturas seleccionadas para notificación
            </p>
          </div>
        </div>

        <button
          onClick={handleBulkSend}
          disabled={true}
          className="w-full md:w-auto bg-slate-300 text-slate-500 px-10 py-5 rounded-3xl font-black flex items-center justify-center gap-4 cursor-not-allowed"
        >
          <Send size={20} />
          <span className="uppercase tracking-widest text-sm">
            Proximamente
          </span>
        </button>
      </div>

      {/* Table Detail */}
      <Card className="p-0 overflow-hidden border-2 border-slate-100/50 shadow-2xl shadow-indigo-900/5">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase font-black tracking-[0.2em] sticky top-0 z-20">
              <tr>
                <th className="px-8 py-6">Cliente</th>
                <th className="px-8 py-6">Factura</th>
                <th className="px-8 py-6">Estado / Vence</th>
                <th className="px-8 py-6 text-right">Monto</th>
                <th className="px-8 py-6 text-center">Último Aviso</th>
                <th className="px-8 py-6 text-center">Status Hoy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {expiringInvoices.length > 0 ? (
                expiringInvoices.map((item) => (
                  <tr
                    key={item.documento_id || item.id}
                    className="hover:bg-indigo-50/50 transition-all duration-200 group"
                  >
                    <td className="px-8 py-5">
                      <p className="font-black text-slate-800 group-hover:text-indigo-700 transition-colors uppercase text-xs">
                        {item.cliente_nombre}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono mt-1">
                        CUFE: {(item.documento_id || item.id || "N/A").substring(0, 15)}...
                      </p>
                    </td>
                    <td className="px-8 py-5 font-black font-mono text-slate-600 text-xs">
                      {item.documento_id || item.id || "N/A"}
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2 h-2 rounded-full ${item.dias_mora > 0 ? "bg-rose-500 animate-pulse" : "bg-emerald-500"}`}
                        ></div>
                        <div>
                          <p className="font-bold text-slate-700 text-xs">
                            {formatDateUTC(item.fecha_vencimiento)}
                          </p>
                          <p
                            className={`text-[10px] font-black uppercase ${item.dias_mora > 0 ? "text-rose-600" : "text-emerald-600"}`}
                          >
                            {item.dias_mora > 0
                              ? `${item.dias_mora} días mora`
                              : `${Math.abs(item.days_until_due)} días`}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right font-black font-mono text-slate-800 text-lg">
                      {formatFullCurrency(item.valor_saldo)}
                    </td>
                    <td className="px-8 py-5 text-center">
                      {item.ultimo_recordatorio ? (
                        <div className="flex flex-col items-center">
                          <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-3 py-1 rounded-lg flex items-center gap-1.5 border border-indigo-100">
                            <History size={10} />{" "}
                            {timeAgo(item.ultimo_recordatorio)}
                          </span>
                          <span className="text-[9px] text-slate-400 mt-1.5 font-bold uppercase tracking-tighter">
                            {new Date(
                              item.ultimo_recordatorio,
                            ).toLocaleDateString()}{" "}
                            @{" "}
                            {new Date(
                              item.ultimo_recordatorio,
                            ).toLocaleTimeString()}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-black text-slate-300 uppercase italic">
                          Nunca Notificado
                        </span>
                      )}
                    </td>
                    <td className="px-8 py-5 text-center">
                      {item.alreadySentToday ? (
                        <div className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-xl shadow-slate-900/20">
                          <CheckCircle size={14} className="text-emerald-400" />
                          Listo
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl text-[10px] font-black uppercase border border-emerald-100">
                          <Send size={12} /> Pendiente
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="px-8 py-32 text-center">
                    <div className="flex flex-col items-center gap-4 max-w-xs mx-auto">
                      <div className="p-6 bg-slate-50 rounded-full text-slate-300">
                        <Search size={48} />
                      </div>
                      <h4 className="font-black text-slate-800 uppercase text-xs tracking-widest">
                        Sin coincidencias
                      </h4>
                      <p className="text-slate-400 text-sm font-medium">
                        Ajuste los filtros para encontrar facturas que requieran
                        recordatorios.
                      </p>
                    </div>
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
