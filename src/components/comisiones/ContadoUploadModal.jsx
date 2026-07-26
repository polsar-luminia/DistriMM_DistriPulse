import React, { useState } from "react";
import { getColombiaTodayISO } from "../../utils/formatters";
import {
  Upload,
  X,
  FileText,
  Calendar,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  Banknote,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { sileo } from "sileo";
import { cn } from "@/lib/utils";
import { formatFullCurrency } from "../../utils/formatters";
import ConfirmDialog from "../ConfirmDialog";
import { useConfirm } from "../../hooks/useConfirm";
import {
  parseContadoPdf,
  validateChecksums,
} from "../../utils/contadoPdfParser";
import {
  transformContadoDocs,
  statsContado,
  applyContadoCommissionRules,
  getContadoBlockingIssues,
  hasRealVendedor,
} from "../../utils/contadoTransform";
import {
  enrichFromDB,
  enrichRecaudoExclusions,
} from "../../utils/recaudoEnrichment";
import { RECAUDO_THRESHOLDS } from "../../constants/thresholds";
import { logAudit } from "../../services/auditService";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const { DIAS_MORA_LIMITE } = RECAUDO_THRESHOLDS;

export default function ContadoUploadModal({ isOpen, onClose, onSuccess }) {
  const [confirmProps, confirm] = useConfirm();
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [fechaPeriodo, setFechaPeriodo] = useState(getColombiaTodayISO);
  const [step, setStep] = useState("select");
  const [previewData, setPreviewData] = useState([]);
  const [fullData, setFullData] = useState([]);
  const [stats, setStats] = useState(null);
  const [checksum, setChecksum] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [ventasGapWarning, setVentasGapWarning] = useState(null);
  const [overrideSinVendedor, setOverrideSinVendedor] = useState(false);

  const reset = () => {
    setFile(null);
    setStep("select");
    setPreviewData([]);
    setFullData([]);
    setStats(null);
    setChecksum(null);
    setError(null);
    setProgress(0);
    setVentasGapWarning(null);
    setOverrideSinVendedor(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (selectedFile.size > MAX_FILE_SIZE) {
        setError("El archivo excede el tamaño máximo permitido (10MB)");
        return;
      }
      if (!selectedFile.name.toLowerCase().endsWith(".pdf")) {
        setError("Solo se aceptan archivos PDF");
        return;
      }
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setError(null);
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setError(null);
    try {
      const periodoDate = new Date(fechaPeriodo + "T00:00:00");
      const periodoYear = periodoDate.getFullYear();
      const periodoMonth = periodoDate.getMonth() + 1;

      const parseResult = await parseContadoPdf(file);

      // 1. Validar checksums internos del PDF (suma docs vs totales declarados)
      const ck = validateChecksums(parseResult);
      setChecksum(ck);
      if (!ck.ok) {
        const mensajes = ck.issues.map((i) => {
          if (i.missing) return `Falta ${i.tipo} en el PDF`;
          if (i.tipo === "docsInconsistentes")
            return `${i.count} documentos con totales inconsistentes`;
          if (i.tipo === "docsFPInconsistentes")
            return `${i.count} documentos cuyas líneas FP no suman el total`;
          return `${i.tipo}: esperado ${formatFullCurrency(i.esperado)} vs calculado ${formatFullCurrency(i.calculado)}`;
        });
        setError(
          "Checksums del PDF no válidos: " + mensajes.join(" · "),
        );
        return;
      }

      // 2. Verificar coherencia de periodo: el PDF debe corresponder al mes seleccionado
      if (parseResult.periodoDesde && parseResult.periodoHasta) {
        const desde = new Date(parseResult.periodoDesde + "T12:00:00");
        if (
          desde.getFullYear() !== periodoYear ||
          desde.getMonth() + 1 !== periodoMonth
        ) {
          setError(
            `El PDF cubre ${parseResult.periodoDesde} → ${parseResult.periodoHasta} pero el periodo seleccionado es ${periodoYear}-${String(periodoMonth).padStart(2, "0")}.`,
          );
          return;
        }
      }

      // 3. Transformar a filas de recaudo
      const { filas } = transformContadoDocs(
        parseResult,
        periodoYear,
        periodoMonth,
      );
      if (filas.length === 0) {
        setError(
          "No se encontraron registros de contado válidos en el PDF (todo es crédito o anulado).",
        );
        return;
      }

      // 3.5 Pre-check: detectar si el PDF cubre fechas más recientes que las ventas cargadas
      setVentasGapWarning(null);
      setOverrideSinVendedor(false);
      try {
        const fechaMaxPdf = filas.reduce(
          (max, f) => (f.fecha_abono > max ? f.fecha_abono : max),
          "",
        );
        const { data: lastVenta } = await supabase
          .from("distrimm_comisiones_ventas")
          .select("fecha, factura")
          .order("fecha", { ascending: false })
          .limit(1);
        const fechaMaxVentas = lastVenta?.[0]?.fecha;
        if (fechaMaxVentas && fechaMaxPdf > fechaMaxVentas) {
          setVentasGapWarning({
            fechaMaxPdf,
            fechaMaxVentas,
            ultimaFactura: lastVenta[0].factura,
          });
        }
      } catch (_) {
        // El warning de cobertura no es bloqueante; si falla, continuar normal
      }

      // 4. Enriquecer por factura exacta y aplicar la misma regla de 70 días
      const matched = await enrichFromDB(filas, {
        strictInvoiceMatch: true,
        failOnError: true,
      });
      const withRules = applyContadoCommissionRules(
        matched,
        DIAS_MORA_LIMITE,
      );

      // 5. Enriquecer con exclusiones de marca (proporcional, igual que CxC)
      const enriched = await enrichRecaudoExclusions(withRules);
      if (enriched.some((r) => r._enrichment_failed)) {
        setError(
          "No se pudieron calcular exclusiones de marca. Verifica la conexión e intenta de nuevo.",
        );
        return;
      }

      const s = statsContado(parseResult);
      setStats(s);
      setFullData(enriched);
      setPreviewData(enriched.slice(0, 5));
      setStep("preview");
    } catch (err) {
      if (import.meta.env.DEV)
        console.error("[ContadoUploadModal] Error analizando:", err);
      setError("Error al analizar PDF: " + (err?.message || "desconocido"));
    }
  };

  const handleUpload = async () => {
    if (uploading) return;
    setUploading(true);
    setStep("uploading");
    setProgress(10);

    try {
      const blockingIssues = getContadoBlockingIssues(fullData, {
        allowSinVendedor: overrideSinVendedor,
      });
      if (blockingIssues.length > 0) {
        setError(
          `No se puede guardar contado: ${blockingIssues.length} factura${blockingIssues.length === 1 ? "" : "s"} siguen sin vendedor atribuible por match exacto.`,
        );
        setStep("preview");
        return;
      }

      const totalRecaudado = fullData.reduce((s, r) => s + r.valor_recaudo, 0);
      const totalComisionable = fullData
        .filter((r) => r.aplica_comision)
        .reduce(
          (s, r) =>
            s +
            r.valor_recaudo -
            (r._valor_excluido_marca || 0) -
            (r._valor_iva || 0),
          0,
        );
      const excluidos = fullData.filter((r) => !r.aplica_comision).length;

      // Verificar duplicados de carga CONTADO del mismo mes
      const periodoDate = new Date(fechaPeriodo + "T12:00:00");
      const pYear = periodoDate.getFullYear();
      const pMonth = periodoDate.getMonth() + 1;
      const startOfMonth = `${pYear}-${String(pMonth).padStart(2, "0")}-01`;
      const endOfMonth =
        pMonth === 12
          ? `${pYear + 1}-01-01`
          : `${pYear}-${String(pMonth + 1).padStart(2, "0")}-01`;

      const { data: existingMes } = await supabase
        .from("distrimm_comisiones_cargas_recaudo")
        .select("id, nombre_archivo, fecha_periodo")
        .eq("origen", "contado")
        .gte("fecha_periodo", startOfMonth)
        .lt("fecha_periodo", endOfMonth);

      if (existingMes?.length > 0) {
        const nombres = existingMes.map((e) => e.nombre_archivo).join(", ");
        const ok = await confirm({
          title: "Carga de contado existente",
          message: `Ya existe${existingMes.length > 1 ? "n" : ""} ${existingMes.length} carga${existingMes.length > 1 ? "s" : ""} de CONTADO para este mes (${nombres}). La nueva carga reemplazará las anteriores. La carga de crédito (CxC/RC) NO se afecta.`,
          confirmText: "Reemplazar",
          cancelText: "Cancelar",
          variant: "warning",
        });
        if (!ok) {
          setStep("preview");
          setUploading(false);
          return;
        }
      }

      const rows = fullData.map((r) => ({
        vendedor_codigo: r.vendedor_codigo || "SIN_VENDEDOR",
        cliente_nit: r.cliente_nit || null,
        cliente_nombre: r.cliente_nombre || null,
        factura: r.factura || null,
        comprobante: r.comprobante || null,
        fecha_abono: r.fecha_abono || null,
        fecha_cxc: r.fecha_cxc || null,
        fecha_vence: r.fecha_vence || null,
        valor_recaudo: r.valor_recaudo,
        valor_excluido_marca: r._valor_excluido_marca || 0,
        valor_iva: r._valor_iva || 0,
        dias_mora: r.dias_mora,
        aplica_comision: r.aplica_comision,
        periodo_year: r.periodo_year,
        periodo_month: r.periodo_month,
      }));

      setProgress(40);

      const { error: rpcErr } = await supabase.rpc("fn_upload_recaudos", {
        p_carga: {
          nombre_archivo: fileName || "Contado",
          fecha_periodo: fechaPeriodo,
          total_registros: fullData.length,
          total_recaudado: totalRecaudado,
          total_comisionable: totalComisionable,
          registros_excluidos_mora: excluidos,
          total_iva: fullData.reduce((s, r) => s + (r._valor_iva || 0), 0),
        },
        p_recaudos: rows,
        p_origen: "contado",
      });

      if (rpcErr) throw rpcErr;

      setProgress(100);
      setStep("success");
      sileo.success("Recaudos de contado cargados exitosamente");
      const facturasOverrideadas = overrideSinVendedor
        ? fullData
            .filter((r) => r._contado_block_reason)
            .map((r) => r.factura)
            .filter(Boolean)
        : [];
      logAudit(
        "UPLOAD_RECAUDO_CONTADO",
        "distrimm_comisiones_recaudos",
        null,
        {
          archivo: fileName,
          registros: fullData.length,
          total_recaudado: totalRecaudado,
          total_comisionable: totalComisionable,
          excluidos_mora: excluidos,
          fecha_periodo: fechaPeriodo,
          ...(overrideSinVendedor && {
            override_sin_vendedor: true,
            facturas_sin_match: facturasOverrideadas,
          }),
        },
      );
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 1500);
    } catch (err) {
      if (import.meta.env.DEV)
        console.error("[ContadoUploadModal] Upload error:", err);
      setError("Error al guardar: " + (err?.message || JSON.stringify(err)));
      setStep("preview");
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  const totalConExclMarca = fullData.filter(
    (r) => (r._valor_excluido_marca || 0) > 0,
  ).length;
  const totalExcluidoMarca = fullData.reduce(
    (s, r) => s + (r._valor_excluido_marca || 0),
    0,
  );
  const sumValorRecaudo = fullData.reduce((s, r) => s + r.valor_recaudo, 0);
  const sumPositivos = fullData
    .filter((r) => r.valor_recaudo > 0)
    .reduce((s, r) => s + r.valor_recaudo, 0);
  const sumDV = fullData
    .filter((r) => r.valor_recaudo < 0)
    .reduce((s, r) => s + r.valor_recaudo, 0);
  const blockingIssues = getContadoBlockingIssues(fullData, {
    allowSinVendedor: overrideSinVendedor,
  });
  // Facturas que tienen bloqueo pero el usuario decidió ignorar (para mostrar advertencia)
  const facturasConBloqueo = getContadoBlockingIssues(fullData);
  const tieneBloqueos = blockingIssues.length > 0;
  const sinVendedor = fullData.filter(
    (r) => !hasRealVendedor(r.vendedor_codigo),
  ).length;
  const sinMatch = fullData.filter(
    (r) => r._sinMatchFactura || r._sinMatchCartera,
  ).length;
  const countExcluidoMora = fullData.filter(
    (r) => !r.aplica_comision && r.dias_mora > DIAS_MORA_LIMITE,
  ).length;
  const totalExcluidoMora = fullData
    .filter((r) => !r.aplica_comision && r.dias_mora > DIAS_MORA_LIMITE)
    .reduce((s, r) => s + r.valor_recaudo, 0);
  const totalComisionable = fullData
    .filter((r) => r.aplica_comision)
    .reduce(
      (s, r) =>
        s +
        r.valor_recaudo -
        (r._valor_excluido_marca || 0) -
        (r._valor_iva || 0),
      0,
    );

  return (
    <>
      <ConfirmDialog {...confirmProps} />
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
          <div className="bg-slate-900 p-4 flex justify-between items-center text-white shrink-0">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Banknote size={20} className="text-amber-400" /> Cargar Recaudos
              de Contado (PDF)
            </h3>
            <button
              onClick={handleClose}
              disabled={step === "uploading"}
              className="p-1 hover:bg-slate-700 rounded transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-6 overflow-y-auto">
            {error && (
              <div className="mb-6 bg-rose-50 text-rose-700 p-4 rounded-lg flex items-start gap-3 border border-rose-200">
                <AlertCircle size={20} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold">Error</p>
                  <p className="text-sm whitespace-pre-wrap">{error}</p>
                </div>
              </div>
            )}

            {step === "select" && (
              <div className="space-y-6">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                  <p className="font-bold mb-1">
                    Informe de Ventas y Devoluciones por Forma de Pago (PDF)
                  </p>
                  <p className="text-xs text-amber-700">
                    Extrae las facturas de contado (Mostrador, Nequi,
                    Bancolombia, BBVA, Tarjeta) e ignora las de crédito (que
                    vienen por CxC). Las DV de contado restan del comisionable.
                    Se valida la integridad del PDF antes de cargar.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">
                    Periodo de Recaudo
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Calendar size={18} className="text-amber-600" />
                    </div>
                    <input
                      type="date"
                      value={fechaPeriodo}
                      onChange={(e) => setFechaPeriodo(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">
                    Archivo PDF
                  </label>
                  <div
                    className={cn(
                      "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all group",
                      file
                        ? "border-amber-500 bg-amber-50/50"
                        : "border-slate-300 hover:border-amber-400 hover:bg-slate-50",
                    )}
                  >
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                      id="contado-file"
                    />
                    <label
                      htmlFor="contado-file"
                      className="cursor-pointer flex flex-col items-center w-full"
                    >
                      {file ? (
                        <>
                          <div className="bg-amber-100 p-3 rounded-full mb-3">
                            <FileText size={32} className="text-amber-700" />
                          </div>
                          <span className="text-base font-bold text-slate-900 break-all">
                            {file.name}
                          </span>
                          <span className="text-xs text-amber-700 font-medium mt-1 uppercase tracking-wide">
                            Archivo Seleccionado
                          </span>
                        </>
                      ) : (
                        <>
                          <div className="bg-slate-100 p-3 rounded-full mb-3 group-hover:bg-amber-100 transition-colors">
                            <Upload
                              size={32}
                              className="text-slate-400 group-hover:text-amber-600 transition-colors"
                            />
                          </div>
                          <span className="text-sm font-semibold text-slate-700">
                            Haz clic para buscar el PDF
                          </span>
                          <span className="text-xs text-slate-400 mt-2">
                            Solo .pdf — máximo 10MB
                          </span>
                        </>
                      )}
                    </label>
                  </div>
                </div>

                <button
                  onClick={handleAnalyze}
                  disabled={!file}
                  className="w-full py-3 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-amber-900/20 transition-all"
                >
                  Analizar y Validar PDF <ArrowRight size={18} />
                </button>
              </div>
            )}

            {step === "preview" && (
              <div className="space-y-6">
                {/* Banner checksum + stats */}
                {checksum?.ok && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex gap-3">
                    <ShieldCheck
                      className="text-emerald-600 shrink-0"
                      size={24}
                    />
                    <div className="min-w-0 text-sm text-emerald-700">
                      <h4 className="font-bold uppercase tracking-wide mb-1 text-emerald-800">
                        Integridad del PDF verificada
                      </h4>
                      <p className="text-xs">
                        {checksum.documentosFV} ventas (
                        {formatFullCurrency(checksum.sumFV)}) +{" "}
                        {checksum.documentosDV} devoluciones (
                        {formatFullCurrency(checksum.sumDV)}){" "}
                        {checksum.documentosAnulados > 0 &&
                          `· ${checksum.documentosAnulados} anuladas omitidas `}
                        — coincide con el resumen del propio PDF.
                      </p>
                    </div>
                  </div>
                )}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
                  <Banknote className="text-amber-600 shrink-0" size={24} />
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm uppercase tracking-wide mb-1 text-amber-800">
                      Recaudos de Contado a Cargar
                    </h4>
                    <p className="text-sm text-amber-700">
                      {fullData.length} filas — Neto:{" "}
                      {formatFullCurrency(sumValorRecaudo)} (
                      {formatFullCurrency(sumPositivos)} ventas{" "}
                      {sumDV < 0 &&
                        `− ${formatFullCurrency(Math.abs(sumDV))} devoluciones`}
                      )
                      {` Â· Comisionable: ${formatFullCurrency(totalComisionable)}`}
                      {countExcluidoMora > 0 &&
                        ` Â· Mora >${DIAS_MORA_LIMITE}d: ${formatFullCurrency(totalExcluidoMora)} (${countExcluidoMora})`}
                      {totalExcluidoMarca > 0 &&
                        ` · Marca excluida: ${formatFullCurrency(totalExcluidoMarca)} (${totalConExclMarca} facturas)`}
                      {sinMatch > 0 && ` Â· ${sinMatch} sin match exacto`}
                      {sinVendedor > 0 &&
                        ` · ${sinVendedor} sin vendedor resoluble`}
                      .
                    </p>
                    {stats && (
                      <p className="text-xs text-amber-600 mt-1">
                        Documentos del PDF: {stats.docsContado} contado puro ·{" "}
                        {stats.docsMixtos} mixtos · {stats.docsSoloCredito}{" "}
                        solo crédito (omitidos) · {stats.docsAnulados} anulados
                      </p>
                    )}
                  </div>
                </div>

                {facturasConBloqueo.length > 0 && (
                  <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 space-y-3">
                    <div className="flex gap-2 text-amber-800">
                      <AlertCircle size={18} className="shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-bold">
                          {facturasConBloqueo.length} factura{facturasConBloqueo.length === 1 ? "" : "s"} sin match en ventas
                        </p>
                        {ventasGapWarning ? (
                          <p className="mt-1 text-xs text-amber-700">
                            Probable causa: el Excel de ventas más reciente solo cubre hasta{" "}
                            <span className="font-mono font-bold">{ventasGapWarning.ultimaFactura}</span>{" "}
                            ({ventasGapWarning.fechaMaxVentas}) pero el PDF incluye facturas del{" "}
                            <span className="font-mono font-bold">{ventasGapWarning.fechaMaxPdf}</span>.
                            Reexporta ventas del ERP hasta esa fecha y vuelve a analizar.
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-amber-700">
                            Carga primero las ventas del periodo o corrige la factura en el ERP.
                          </p>
                        )}
                        <p className="mt-2 font-mono text-[11px] break-words text-amber-600">
                          {facturasConBloqueo
                            .slice(0, 15)
                            .map((r) => r.factura || "sin factura")
                            .join(", ")}
                          {facturasConBloqueo.length > 15 ? "..." : ""}
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-amber-200 pt-3">
                      <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={overrideSinVendedor}
                          onChange={(e) => setOverrideSinVendedor(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                        />
                        <div className="text-xs text-amber-800">
                          <span className="font-bold">Cargar igualmente</span> — las facturas sin match quedarán como{" "}
                          <span className="font-mono">SIN_VENDEDOR</span> y no generarán comisión.
                        </div>
                      </label>
                    </div>
                  </div>
                )}

                {facturasConBloqueo.length === 0 && sinVendedor > 0 && sinVendedor / fullData.length > 0.05 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-xs text-amber-700">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    <p>
                      Más del 5 % de los recaudos no tienen vendedor resoluble
                      ({sinVendedor} de {fullData.length}). Verifica que las
                      ventas del periodo ya estén cargadas; si no, esos
                      recaudos quedarán en SIN_VENDEDOR.
                    </p>
                  </div>
                )}

                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-500 uppercase">
                      Primeras 5 filas
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      {fullData.length} registros totales
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold">
                        <tr>
                          <th className="px-3 py-2">Vendedor</th>
                          <th className="px-3 py-2">Cliente</th>
                          <th className="px-3 py-2">Factura</th>
                          <th className="px-3 py-2">Fecha</th>
                          <th className="px-3 py-2 text-center">Días</th>
                          <th className="px-3 py-2 text-right">Valor</th>
                          <th className="px-3 py-2 text-center">Estado</th>
                          <th className="px-3 py-2 text-right">Excl. Marca</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewData.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-xs font-medium">
                              {hasRealVendedor(row.vendedor_codigo)
                                ? row.vendedor_codigo
                                : "SIN_VENDEDOR"}
                            </td>
                            <td className="px-3 py-2 text-xs truncate max-w-[140px]">
                              {row.cliente_nombre || row.cliente_nit}
                            </td>
                            <td className="px-3 py-2 text-xs font-mono">
                              {row.factura}
                            </td>
                            <td className="px-3 py-2 text-xs font-mono">
                              {row.fecha_abono}
                            </td>
                            <td className="px-3 py-2 text-xs text-center font-mono">
                              <span
                                className={
                                  row.dias_mora > DIAS_MORA_LIMITE
                                    ? "text-rose-600 font-bold"
                                    : "text-slate-600"
                                }
                              >
                                {row.dias_mora}
                              </span>
                            </td>
                            <td
                              className={cn(
                                "px-3 py-2 text-xs text-right font-mono",
                                row.valor_recaudo < 0
                                  ? "text-rose-600 font-bold"
                                  : "",
                              )}
                            >
                              {formatFullCurrency(row.valor_recaudo)}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span
                                className={cn(
                                  "text-[10px] font-bold px-2 py-0.5 rounded-full",
                                  row._contado_block_reason
                                    ? "bg-rose-100 text-rose-700"
                                    : row.aplica_comision
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-amber-100 text-amber-700",
                                )}
                              >
                                {row._contado_block_reason ||
                                  (row.aplica_comision
                                    ? "Comisionable"
                                    : `Mora >${DIAS_MORA_LIMITE}d`)}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs text-right font-mono text-slate-500">
                              {row._valor_excluido_marca > 0
                                ? formatFullCurrency(row._valor_excluido_marca)
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep("select")}
                    className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors"
                  >
                    Cancelar / Corregir
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={uploading || tieneBloqueos}
                    className="flex-[2] px-4 py-3 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-amber-900/20 flex items-center justify-center gap-2 transition-all"
                  >
                    <CheckCircle size={18} /> Guardar {fullData.length} recaudos
                    de contado
                  </button>
                </div>
              </div>
            )}

            {step === "uploading" && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2
                  size={48}
                  className="text-amber-600 animate-spin mb-4"
                />
                <h4 className="text-xl font-bold text-slate-900 mb-2">
                  Guardando Recaudos de Contado...
                </h4>
                <p className="text-slate-500 text-sm mb-6">Por favor espera.</p>
                <div className="w-full max-w-xs bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-amber-600 h-3 rounded-full transition-all duration-300"
                    style={{ width: progress + "%" }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-2 font-mono">
                  {progress}% completado
                </p>
              </div>
            )}

            {step === "success" && (
              <div className="flex flex-col items-center justify-center py-12 text-amber-600">
                <CheckCircle size={64} className="mb-4" />
                <h4 className="text-2xl font-bold mb-2">¡Carga Exitosa!</h4>
                <p className="text-slate-500">
                  {fullData.length} recaudos de contado guardados correctamente.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
