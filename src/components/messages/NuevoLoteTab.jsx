/**
 * @fileoverview NuevoLoteTab - Create a new messaging batch (3-step wizard).
 * @module components/messages/NuevoLoteTab
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  Search,
  Filter,
  Send,
  CheckCircle,
  Clock,
  AlertTriangle,
  Loader,
  ChevronDown,
  Phone,
  PhoneOff,
  FileText,
  ArrowLeft,
  Zap,
  AlertCircle,
} from "lucide-react";
import { sileo } from "sileo";
import { Card } from "../dashboard/DashboardShared";
import { PhoneBadge, fmtCOP } from "./MessagesShared";

export default function NuevoLoteTab({ currentLoadId, messaging }) {
  // ── Step state ──
  const [step, setStep] = useState(1); // 1: Segmentar, 2: Componer, 3: Confirmar

  // ── Segmentation filters ──
  const [tipoFiltro, setTipoFiltro] = useState("morosos");
  const [diasMoraMin, setDiasMoraMin] = useState(1);
  const [diasVencerMax, setDiasVencerMax] = useState(30);
  const [montoMin, setMontoMin] = useState("");
  const [montoMax, setMontoMax] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Selected clients ──
  const [selectedNits, setSelectedNits] = useState(new Set());

  // ── Template ──
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);

  // Load segmented clients
  const handleSegment = async () => {
    if (!currentLoadId) {
      sileo.error({ title: "No hay una carga activa", description: "Suba un archivo primero." });
      return;
    }

    const filters = {
      cargaId: currentLoadId,
      tipoFiltro,
      diasMoraMin: Number(diasMoraMin) || 1,
      diasVencerMax: Number(diasVencerMax) || 30,
      montoMin: montoMin ? Number(montoMin) : 0,
      montoMax: montoMax ? Number(montoMax) : 999999999,
    };

    await messaging.fetchSegmentedClients(filters);
    setSelectedNits(new Set());
  };

  // Extract stable references from messaging to avoid broken memoization
  // (messaging object is recreated each render; using it as dep defeats useMemo)
  const { segmentedClients, resolveClientPhone, templates, buildInvoiceDetail, renderTemplate } = messaging;

  // Enrich segmented clients with phone data (RPC already returns celular/telefono_1)
  const enrichedClients = useMemo(() => {
    return (segmentedClients || []).map((client) => {
      const phoneResult = resolveClientPhone({
        celular: client.celular,
        telefono_1: client.telefono_1,
      });

      return {
        ...client,
        nit: client.cliente_nit,
        phone: phoneResult,
        municipio: client.municipio || "—",
      };
    });
  }, [segmentedClients, resolveClientPhone]);

  // Apply search filter
  const filteredClients = useMemo(() => {
    if (!searchQuery) return enrichedClients;
    const q = searchQuery.toLowerCase();
    return enrichedClients.filter(
      (c) =>
        c.cliente_nombre?.toLowerCase().includes(q) ||
        c.cliente_nit?.includes(q) ||
        c.municipio?.toLowerCase().includes(q),
    );
  }, [enrichedClients, searchQuery]);

  // Stats
  const withPhoneCount = filteredClients.filter((c) => c.phone?.valid).length;
  const selectedCount = selectedNits.size;

  // Selection handlers
  const toggleSelect = (nit) => {
    setSelectedNits((prev) => {
      const next = new Set(prev);
      if (next.has(nit)) next.delete(nit);
      else next.add(nit);
      return next;
    });
  };

  const selectAllWithPhone = () => {
    const validNits = filteredClients.filter((c) => c.phone?.valid).map((c) => c.cliente_nit);
    setSelectedNits(new Set(validNits));
  };

  const clearSelection = () => setSelectedNits(new Set());

  // Get selected template
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  // Render message for a client
  const renderMessageForClient = useCallback(
    (client) => {
      if (!selectedTemplate) return "";
      // RPC returns facturas_detalle as jsonb array
      const invoiceItems = (client.facturas_detalle || []).map((f) => ({
        documento_id: f.documento_id,
        nro_factura: f.nro_factura,
        fecha_vencimiento: f.fecha_vencimiento,
        dias_mora: f.dias_mora,
        valor_saldo: f.valor_saldo,
      }));
      const { detalle_facturas, total } = buildInvoiceDetail(invoiceItems);
      return renderTemplate(selectedTemplate.contenido, {
        cliente: client.cliente_nombre || "Cliente",
        detalle_facturas,
        total,
        municipio: client.municipio || "",
      });
    },
    [selectedTemplate, buildInvoiceDetail, renderTemplate],
  );

  // Build recipients for selected clients
  const selectedRecipients = useMemo(() => {
    return filteredClients
      .filter((c) => selectedNits.has(c.cliente_nit) && c.phone?.valid)
      .map((c) => ({
        cliente_nombre: c.cliente_nombre,
        cliente_nit: c.cliente_nit,
        telefono: c.phone.phone,
        mensaje_personalizado: renderMessageForClient(c),
        facturas_ids: (c.facturas_ids || []).map(String),
      }));
  }, [filteredClients, selectedNits, renderMessageForClient]);

  // Confirm and send lote
  const handleCreateLote = async () => {
    if (!selectedTemplate) {
      sileo.error({ title: "Seleccione una plantilla" });
      return;
    }
    if (selectedRecipients.length === 0) {
      sileo.error({ title: "No hay destinatarios válidos seleccionados" });
      return;
    }

    const loteHeader = {
      tipo: tipoFiltro,
      mensaje_plantilla: selectedTemplate.contenido,
      plantilla_id: selectedTemplateId,
      filtros_aplicados: {
        tipoFiltro,
        diasMoraMin,
        diasVencerMax,
        montoMin: montoMin || 0,
        montoMax: montoMax || 999999999,
      },
    };

    const { success, error } = await messaging.createAndSendLote(
      loteHeader,
      selectedRecipients,
    );

    if (success) {
      sileo.success({ title: "Lote creado", description: `${selectedRecipients.length} destinatarios. Enviando...` });
      setStep(1);
      setSelectedNits(new Set());
    } else {
      sileo.error({ title: "Error", description: error });
    }
  };

  return (
    <div className="space-y-4">
      {/* Step Indicator */}
      <div className="flex items-center gap-2 px-2">
        {[
          { num: 1, label: "Segmentar" },
          { num: 2, label: "Componer" },
          { num: 3, label: "Confirmar" },
        ].map((s) => (
          <React.Fragment key={s.num}>
            <button
              onClick={() => s.num < step && setStep(s.num)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                step === s.num
                  ? "bg-indigo-600 text-white shadow"
                  : step > s.num
                    ? "bg-indigo-100 text-indigo-600 cursor-pointer hover:bg-indigo-200"
                    : "bg-slate-100 text-slate-400"
              }`}
              disabled={s.num > step}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                  step === s.num
                    ? "bg-white text-indigo-600"
                    : step > s.num
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-300 text-white"
                }`}
              >
                {step > s.num ? "✓" : s.num}
              </span>
              {s.label}
            </button>
            {s.num < 3 && (
              <div
                className={`flex-1 h-0.5 rounded ${step > s.num ? "bg-indigo-400" : "bg-slate-200"}`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* STEP 1: Segmentation */}
      {step === 1 && (
        <Card className="p-5 space-y-5">
          <h3 className="text-sm font-bold text-slate-800 uppercase flex items-center gap-2">
            <Filter size={16} className="text-indigo-600" />
            Segmentar Destinatarios
          </h3>

          {!currentLoadId && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-800">
                  Sin carga activa
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Suba un archivo de cartera primero para poder segmentar clientes.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Tipo de filtro */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
                Tipo de filtro
              </label>
              <select
                value={tipoFiltro}
                onChange={(e) => setTipoFiltro(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 appearance-none cursor-pointer focus:ring-2 focus:ring-indigo-500 shadow-sm"
              >
                <option value="morosos">Morosos (vencidos)</option>
                <option value="por_vencer">Por vencer</option>
                <option value="todos">Todos</option>
              </select>
            </div>

            {/* Dias mora min */}
            {tipoFiltro === "morosos" && (
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
                  Días mora mínimo
                </label>
                <input
                  type="number"
                  value={diasMoraMin}
                  onChange={(e) => setDiasMoraMin(e.target.value)}
                  min={1}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
              </div>
            )}

            {/* Dias por vencer max */}
            {tipoFiltro === "por_vencer" && (
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
                  Días hasta vencimiento
                </label>
                <input
                  type="number"
                  value={diasVencerMax}
                  onChange={(e) => setDiasVencerMax(e.target.value)}
                  min={1}
                  max={90}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
              </div>
            )}

            {/* Monto min */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
                Monto mínimo
              </label>
              <input
                type="number"
                value={montoMin}
                onChange={(e) => setMontoMin(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />
            </div>

            {/* Monto max */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
                Monto máximo
              </label>
              <input
                type="number"
                value={montoMax}
                onChange={(e) => setMontoMax(e.target.value)}
                placeholder="Sin límite"
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSegment}
              disabled={!currentLoadId || messaging.loadingSegmentation}
              className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              {messaging.loadingSegmentation ? (
                <Loader size={14} className="animate-spin" />
              ) : (
                <Search size={14} />
              )}
              Buscar Clientes
            </button>

            {enrichedClients.length > 0 && (
              <span className="text-xs font-bold text-slate-500">
                {enrichedClients.length} clientes encontrados •{" "}
                <span className="text-emerald-600">{withPhoneCount}</span> con teléfono
              </span>
            )}
          </div>

          {/* Results Table */}
          {enrichedClients.length > 0 && (
            <>
              {/* Search + Selection Controls */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <div className="relative flex-grow max-w-md group">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500"
                    size={14}
                  />
                  <input
                    type="text"
                    placeholder="Filtrar por nombre, NIT o municipio..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-transparent focus:bg-white focus:border-indigo-200 focus:ring-2 focus:ring-indigo-500/10 rounded-lg text-xs font-medium outline-none transition-all"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-indigo-600">{selectedCount}</span>
                  <span className="text-xs text-slate-400">seleccionados</span>
                  <button
                    onClick={selectAllWithPhone}
                    className="px-2.5 py-1.5 text-[10px] font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors uppercase"
                  >
                    Todos
                  </button>
                  <button
                    onClick={clearSelection}
                    className="px-2.5 py-1.5 text-[10px] font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors uppercase"
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              {/* Client List */}
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-800 text-slate-400 text-[10px] uppercase font-bold tracking-wider sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-3 w-8">
                        <input
                          type="checkbox"
                          checked={selectedCount > 0 && selectedCount === withPhoneCount}
                          onChange={(e) =>
                            e.target.checked ? selectAllWithPhone() : clearSelection()
                          }
                          className="w-3 h-3 rounded text-indigo-600 border-slate-500"
                        />
                      </th>
                      <th className="px-3 py-3">Cliente</th>
                      <th className="px-3 py-3">Teléfono</th>
                      <th className="px-3 py-3">Municipio</th>
                      <th className="px-3 py-3 text-right">Saldo</th>
                      <th className="px-3 py-3 text-center">Mora</th>
                      <th className="px-3 py-3 text-center">Facturas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredClients.map((c) => (
                      <tr
                        key={c.cliente_nit}
                        className={`hover:bg-indigo-50/30 transition-colors ${
                          selectedNits.has(c.cliente_nit) ? "bg-indigo-50/50" : ""
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={selectedNits.has(c.cliente_nit)}
                            onChange={() => toggleSelect(c.cliente_nit)}
                            disabled={!c.phone?.valid}
                            className="w-3 h-3 rounded text-indigo-600 border-slate-300 disabled:opacity-30"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-bold text-slate-800 text-xs uppercase truncate max-w-[200px]">
                            {c.cliente_nombre}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {c.cliente_nit}
                          </p>
                        </td>
                        <td className="px-3 py-2.5">
                          <PhoneBadge phoneData={c.phone} />
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-600">
                          {c.municipio}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-slate-800 text-xs font-mono">
                          {fmtCOP.format(c.total_deuda || 0)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                              (c.max_dias_mora || 0) > 30
                                ? "bg-rose-100 text-rose-700"
                                : (c.max_dias_mora || 0) > 0
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {c.max_dias_mora || 0}d
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                            {c.total_facturas || 0}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Next step button */}
              {selectedCount > 0 && (
                <div className="flex justify-end">
                  <button
                    onClick={() => setStep(2)}
                    className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-sm"
                  >
                    Continuar con {selectedCount} clientes
                    <ChevronDown size={14} className="-rotate-90" />
                  </button>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* STEP 2: Compose Message */}
      {step === 2 && (
        <Card className="p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 uppercase flex items-center gap-2">
              <FileText size={16} className="text-indigo-600" />
              Componer Mensaje
            </h3>
            <button
              onClick={() => setStep(1)}
              className="text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1"
            >
              <ArrowLeft size={12} /> Volver
            </button>
          </div>

          <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
            <span className="font-bold text-indigo-600">{selectedRecipients.length}</span>{" "}
            destinatarios con teléfono válido seleccionados
          </div>

          {/* Template Selector */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
              Plantilla de Mensaje
            </label>
            <select
              value={selectedTemplateId || ""}
              onChange={(e) => setSelectedTemplateId(e.target.value || null)}
              className="w-full pl-4 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 appearance-none cursor-pointer focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm"
            >
              <option value="">Seleccionar Plantilla...</option>
              {templates
                .filter((t) => t.tipo === "recordatorio" || t.tipo === tipoFiltro)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre} ({t.tipo})
                  </option>
                ))}
            </select>
          </div>

          {/* Preview */}
          {selectedTemplate && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">
                Vista Previa (ejemplo con primer cliente)
              </p>
              <div className="bg-[#DCF8C6] rounded-xl rounded-tl-sm p-4 text-sm text-slate-800 whitespace-pre-wrap shadow-sm max-h-64 overflow-y-auto">
                {selectedRecipients.length > 0
                  ? selectedRecipients[0].mensaje_personalizado
                  : "Seleccione clientes para ver la vista previa"}
              </div>
            </div>
          )}

          {/* Variables info */}
          {selectedTemplate?.variables?.length > 0 && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
              <p className="text-[10px] font-bold text-indigo-600 uppercase mb-1">
                Variables automáticas
              </p>
              <div className="flex flex-wrap gap-1">
                {selectedTemplate.variables.map((v) => (
                  <span
                    key={v}
                    className="text-[10px] bg-white text-indigo-700 px-2 py-0.5 rounded border border-indigo-200 font-mono"
                  >
                    {`{{${v}}}`}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Continue to confirm */}
          <div className="flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
            >
              Atrás
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!selectedTemplate || selectedRecipients.length === 0}
              className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              Revisar y Enviar
              <ChevronDown size={14} className="-rotate-90" />
            </button>
          </div>
        </Card>
      )}

      {/* STEP 3: Confirm and Send */}
      {step === 3 && (
        <Card className="p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 uppercase flex items-center gap-2">
              <Zap size={16} className="text-indigo-600" />
              Confirmar Envío
            </h3>
            <button
              onClick={() => setStep(2)}
              className="text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1"
            >
              <ArrowLeft size={12} /> Volver
            </button>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-black text-indigo-600">
                {selectedRecipients.length}
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                Destinatarios
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-black text-slate-800">
                {selectedTemplate?.nombre || "—"}
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                Plantilla
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-black text-slate-800 capitalize">
                {tipoFiltro}
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                Segmento
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <p className="text-lg font-black text-amber-600">
                ~{Math.max(1, Math.ceil(selectedRecipients.length * 5 / 60))} min
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                Tiempo Estimado
              </p>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-800">
                Los mensajes se enviarán vía Meta Cloud API oficial.
              </p>
              <p className="text-xs text-amber-600 mt-1">
                El proceso continuará en segundo plano. Puede ver el progreso en el historial.
              </p>
            </div>
          </div>

          {/* Recipients preview list */}
          <div className="max-h-[200px] overflow-y-auto space-y-1 border border-slate-200 rounded-xl p-2">
            {selectedRecipients.slice(0, 30).map((r) => (
              <div
                key={r.cliente_nit}
                className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-50 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Phone size={10} className="text-emerald-500" />
                  <span className="font-bold text-slate-700 uppercase truncate max-w-[200px]">
                    {r.cliente_nombre}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  {r.telefono}
                </span>
              </div>
            ))}
            {selectedRecipients.length > 30 && (
              <p className="text-xs text-slate-400 text-center py-1">
                ...y {selectedRecipients.length - 30} más
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex justify-between pt-2">
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
            >
              Atrás
            </button>
            <button
              onClick={handleCreateLote}
              disabled={messaging.creatingLote}
              className="px-6 py-3 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-emerald-600/20"
            >
              {messaging.creatingLote ? (
                <Loader size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
              Confirmar y Enviar Lote
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
