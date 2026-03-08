import React, { useState, useEffect } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { useConfirm } from "../hooks/useConfirm";
import {
  Upload,
  X,
  FileSpreadsheet,
  Calendar,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  ShieldAlert,
  Users,
  FileText,
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";
import { sileo } from "sileo";
import { validateExcelMIME } from "../utils/fileValidation";
import { CARTERA_BATCH_SIZE, CLIENTES_BATCH_SIZE } from "../constants";
import {
  UPLOAD_TYPES,
  detectFileType,
  processCarteraData,
  processClientesData,
} from "../utils/excelETL";

export default function UploadModal({ isOpen, onClose, onUploadSuccess }) {
  const [confirmProps, confirm] = useConfirm();
  const [file, setFile] = useState(null);
  const [cutOffDate, setCutOffDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  // States for new flow
  const [step, setStep] = useState("select"); // 'select', 'preview', 'uploading', 'success'
  const [previewData, setPreviewData] = useState([]);
  const [fullData, setFullData] = useState([]); // Data ready to upload
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [detectedType, setDetectedType] = useState(null); // 'cartera' | 'clientes'

  const resetState = () => {
    setFile(null);
    setStep("select");
    setPreviewData([]);
    setFullData([]);
    setError(null);
    setProgress(0);
    setDetectedType(null);
  };

  // --- CONNECTION DIAGNOSTIC ---
  useEffect(() => {
    if (!isOpen) return;

    const checkConnection = async () => {
      const { error: connError } = await supabase
        .from("historial_cargas")
        .select("count", { count: "exact", head: true });

      if (connError) {
        if (import.meta.env.DEV) console.error("Connection Check Failed:", connError);
        if (connError.message === "FetchError: Failed to fetch") {
          setError(
            "Error de conexion: No se pudo contactar con Supabase. Revisa tu internet o la URL del proyecto.",
          );
        } else if (connError.code === "42P01") {
          setError(
            "Error Critico: La tabla 'historial_cargas' NO EXISTE. Ejecuta el SQL script.",
          );
        } else if (connError.code === "42501") {
          setError(
            "Error de Permisos: RLS activo pero sin politicas en 'historial_cargas'.",
          );
        } else {
          setError(
            `Error de Conexion: ${connError.message || JSON.stringify(connError)}`,
          );
        }
      }
    };

    checkConnection();
  }, [isOpen]);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleAnalyzeFile = async () => {
    if (!file) return;
    setError(null);

    // Validate magic bytes before processing
    const { valid } = await validateExcelMIME(file);
    if (!valid) {
      sileo.error({ title: "Archivo invalido", description: "El archivo no es un Excel valido (.xlsx o .xls). Verifica que no sea un archivo renombrado." });
      setError("El archivo no tiene un formato Excel valido. Solo se aceptan archivos .xlsx y .xls reales.");
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: "array", cellDates: false });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          // Get raw headers from row 1 (some files have headers at row 0, some at row 1)
          const rawData0 = XLSX.utils.sheet_to_json(worksheet, { range: 0 });
          const rawData1 = XLSX.utils.sheet_to_json(worksheet, { range: 1 });

          // Detect type from both ranges
          const headers0 = rawData0.length > 0 ? Object.keys(rawData0[0]) : [];
          const headers1 = rawData1.length > 0 ? Object.keys(rawData1[0]) : [];

          let fileType = detectFileType(headers0);
          let jsonData = rawData0;

          if (!fileType) {
            fileType = detectFileType(headers1);
            jsonData = rawData1;
          }

          if (!fileType && headers1.length > headers0.length) {
            // Try with more columns
            jsonData = rawData1;
            fileType = detectFileType(Object.keys(rawData1[0] || {}));
          }

          if (!fileType) {
            setError("No se pudo determinar el tipo de archivo. Verifique que sea un Excel de Cartera o Clientes.");
            return;
          }

          if (jsonData.length === 0)
            throw new Error("El archivo parece estar vacio.");

          setDetectedType(fileType);

          let processed;
          if (fileType === UPLOAD_TYPES.CLIENTES) {
            processed = processClientesData(jsonData);
          } else {
            processed = processCarteraData(jsonData);
          }

          if (processed.length === 0)
            throw new Error("No se encontraron registros validos en el archivo.");

          setFullData(processed);
          setPreviewData(processed.slice(0, 5));
          setStep("preview");
        } catch (err) {
          if (import.meta.env.DEV) console.error(err);
          setError("Error al leer el archivo: " + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      setError(err.message);
    }
  };

  // --- UPLOAD: CARTERA ---
  const handleConfirmUploadCartera = async () => {
    setStep("uploading");
    setProgress(10);
    let createdLoadId = null;

    try {
      const totalValor = fullData.reduce(
        (sum, item) => sum + (item.valor_saldo || 0),
        0,
      );

      // 1. Create Load Record
      const { data: loadData, error: loadError } = await supabase
        .from("historial_cargas")
        .insert([
          {
            nombre_archivo: file.name,
            fecha_corte: cutOffDate,
            total_registros: fullData.length,
            total_valor_cartera: totalValor,
          },
        ])
        .select()
        .single();

      if (loadError) throw loadError;
      createdLoadId = loadData.id;
      setProgress(30);

      // 2. Extract unique vendedores and upsert
      const vendedorCodes = [...new Set(fullData.map(i => i.vendedor_codigo).filter(Boolean))];
      if (vendedorCodes.length > 0) {
        const vendedorRows = vendedorCodes.map(code => ({
          codigo: code,
          nombre: `Vendedor ${code}`,
        }));
        await supabase
          .from("distrimm_vendedores")
          .upsert(vendedorRows, { onConflict: "codigo", ignoreDuplicates: true });
      }

      // 3. Prepare Final Batch
      const batchSize = CARTERA_BATCH_SIZE;
      const itemsToInsert = fullData.map((item) => ({
        carga_id: createdLoadId,
        cliente_nombre: item.cliente_nombre,
        documento_id: item.documento_id,
        fecha_emision: item.fecha_emision,
        fecha_vencimiento: item.fecha_vencimiento,
        dias_mora: item.dias_mora,
        valor_saldo: item.valor_saldo,
        estado: item.estado || (item.dias_mora > 0 ? "VENCIDA" : "POR VENCER"),
        vendedor_codigo: item.vendedor_codigo,
        tercero_nit: item.tercero_nit,
        cuenta_contable: item.cuenta_contable,
        nombre_cuenta: item.nombre_cuenta,
        cuota: item.cuota,
      }));

      // 4. Batch Insert
      for (let i = 0; i < itemsToInsert.length; i += batchSize) {
        const batch = itemsToInsert.slice(i, i + batchSize);
        const { error: batchError } = await supabase
          .from("cartera_items")
          .insert(batch);

        if (batchError) throw batchError;

        const currentProgress =
          30 + Math.round(((i + batch.length) / itemsToInsert.length) * 70);
        setProgress(currentProgress);
      }

      setStep("success");
      setTimeout(() => {
        onUploadSuccess();
        handleClose();
      }, 2000);
    } catch (err) {
      if (import.meta.env.DEV) console.error("Upload Error (Raw):", err);

      if (createdLoadId) {
        if (import.meta.env.DEV) console.warn("Rolling back load:", createdLoadId);
        await supabase
          .from("historial_cargas")
          .delete()
          .eq("id", createdLoadId);
      }

      let errorMsg = "Error desconocido";
      if (err?.message) errorMsg = err.message;
      else if (err?.error_description) errorMsg = err.error_description;
      else if (typeof err === "object" && Object.keys(err).length === 0) {
        errorMsg =
          "Error vacio (Posiblemente la tabla no existe o hay problemas de red).";
      } else {
        errorMsg = JSON.stringify(err);
      }

      setError("Error al guardar en base de datos: " + errorMsg);
      setStep("preview");
    }
  };

  // --- UPLOAD: CLIENTES ---
  const handleConfirmUploadClientes = async () => {
    setStep("uploading");
    setProgress(10);

    const processedNits = []; // Track NITs for rollback
    let preExistingNits = new Set();

    try {
      const batchSize = CLIENTES_BATCH_SIZE;
      let nuevos = 0;
      let actualizados = 0;

      // Batch pre-fetch to avoid URL length limits (PostgREST .in() uses query params)
      const allNitsInUpload = fullData.map((item) => item.no_identif);
      const prefetchedNits = [];
      for (let i = 0; i < allNitsInUpload.length; i += 200) {
        const batch = allNitsInUpload.slice(i, i + 200);
        const { data: batchRows, error: prefetchError } = await supabase
          .from("distrimm_clientes")
          .select("no_identif")
          .in("no_identif", batch);
        if (prefetchError) throw prefetchError;
        if (batchRows) prefetchedNits.push(...batchRows.map((r) => r.no_identif));
      }
      preExistingNits = new Set(prefetchedNits);

      for (let i = 0; i < fullData.length; i += batchSize) {
        const batch = fullData.slice(i, i + batchSize);

        const rowsToUpsert = batch.map((item) => ({
          no_identif: item.no_identif,
          tipo_ident: item.tipo_ident,
          tipo_persona: item.tipo_persona,
          primer_nombre: item.primer_nombre,
          segundo_nombre: item.segundo_nombre,
          primer_apellido: item.primer_apellido,
          segundo_apellido: item.segundo_apellido,
          fecha_nacimiento: item.fecha_nacimiento,
          genero: item.genero,
          estado_civil: item.estado_civil,
          direccion: item.direccion,
          telefono_1: item.telefono_1,
          telefono_2: item.telefono_2,
          celular: item.celular,
          correo_electronico: item.correo_electronico,
          pagina_web: item.pagina_web,
          clasificacion_iva: item.clasificacion_iva,
          profesion: item.profesion,
          actividad: item.actividad,
          cupo_venta: item.cupo_venta,
          cupo_compra: item.cupo_compra,
          comentario: item.comentario,
          barrio: item.barrio,
          municipio: item.municipio,
          vendedor_codigo: item.vendedor_codigo,
          cobrador_codigo: item.cobrador_codigo,
          updated_at: new Date().toISOString(),
        }));

        const { error: batchError } = await supabase
          .from("distrimm_clientes")
          .upsert(rowsToUpsert, { onConflict: "no_identif" })
          .select("id");

        if (batchError) throw batchError;

        // Track processed NITs for potential rollback
        batch.forEach((item) => processedNits.push(item.no_identif));

        // Count new vs updated using pre-fetched existing NITs
        batch.forEach((item) => {
          if (preExistingNits.has(item.no_identif)) {
            actualizados++;
          } else {
            nuevos++;
          }
        });

        const currentProgress =
          10 + Math.round(((i + batch.length) / fullData.length) * 80);
        setProgress(currentProgress);
      }

      // Log the upload
      await supabase.from("distrimm_historial_cargas_clientes").insert([
        {
          nombre_archivo: file.name,
          total_registros: fullData.length,
          nuevos,
          actualizados,
        },
      ]);

      setProgress(100);
      setStep("success");
      setTimeout(() => {
        onUploadSuccess();
        handleClose();
      }, 2000);
    } catch (err) {
      if (import.meta.env.DEV) console.error("Upload Clientes Error:", err);

      // Rollback: delete only NEW records introduced by this upload (protect pre-existing)
      const newNitsToRollback = processedNits.filter((nit) => !preExistingNits.has(nit));
      if (newNitsToRollback.length > 0) {
        if (import.meta.env.DEV) console.warn(`Rolling back ${newNitsToRollback.length} client records`);
        // Delete in batches to avoid query size limits
        for (let i = 0; i < newNitsToRollback.length; i += 100) {
          const nitBatch = newNitsToRollback.slice(i, i + 100);
          await supabase
            .from("distrimm_clientes")
            .delete()
            .in("no_identif", nitBatch);
        }
        sileo.error({
          title: "Error en carga",
          description: "Todos los datos parciales fueron eliminados",
        });
      }

      let errorMsg = "Error desconocido";
      if (err?.message) errorMsg = err.message;
      else errorMsg = JSON.stringify(err);

      setError("Error al guardar clientes: " + errorMsg);
      setStep("preview");
    }
  };

  const handleConfirmUpload = async () => {
    if (detectedType === UPLOAD_TYPES.CLIENTES) {
      // Clientes use upsert on no_identif — duplicates are updated automatically
      handleConfirmUploadClientes();
      return;
    }

    // Cartera: check for existing load with same fecha_corte
    try {
      const { data: existing } = await supabase
        .from("historial_cargas")
        .select("id, nombre_archivo, fecha_corte")
        .eq("fecha_corte", cutOffDate)
        .limit(1);

      if (existing && existing.length > 0) {
        const displayDate = new Date(cutOffDate + "T12:00:00").toLocaleDateString("es-CO", {
          day: "2-digit", month: "2-digit", year: "numeric",
        });
        const ok = await confirm({
          title: "Carga duplicada",
          message: `Ya existe una carga con fecha de corte ${displayDate} ("${existing[0].nombre_archivo}"). ¿Deseas reemplazarla? La carga anterior y todos sus registros serán eliminados.`,
          confirmText: "Reemplazar",
          cancelText: "Cancelar",
          variant: "warning",
        });
        if (!ok) return;

        // Delete the old load (CASCADE deletes cartera_items)
        await supabase
          .from("historial_cargas")
          .delete()
          .eq("id", existing[0].id);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error("Error checking duplicates:", err);
      // Continue with upload even if duplicate check fails
    }

    handleConfirmUploadCartera();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 p-4 flex justify-between items-center text-white shrink-0">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Upload size={20} className="text-indigo-400" /> Carga de Datos
          </h3>
          <button
            onClick={handleClose}
            disabled={step === "uploading"}
            className="p-1 hover:bg-slate-700 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto">
          {error && (
            <div className="mb-6 bg-rose-50 text-rose-700 p-4 rounded-lg flex items-start gap-3 border border-rose-200 shadow-sm animate-in slide-in-from-top-2">
              <AlertCircle size={20} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-bold">Error</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {step === "select" && (
            <div className="space-y-6 animate-in fade-in">
              {/* Info Banner */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-sm text-indigo-700">
                <p className="font-bold mb-1">Tipos de archivo soportados:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-indigo-500" />
                    <span><strong>Cartera</strong> - Cuentas por cobrar</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-indigo-500" />
                    <span><strong>Clientes</strong> - Maestro de terceros</span>
                  </div>
                </div>
                <p className="text-xs text-indigo-500 mt-2">
                  El tipo se detecta automaticamente por las columnas del archivo.
                </p>
              </div>

              {/* Date Input (only for cartera) */}
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700">
                  Fecha de Corte (para archivos de Cartera)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Calendar size={18} className="text-indigo-600" />
                  </div>
                  <input
                    type="date"
                    required
                    value={cutOffDate}
                    onChange={(e) => setCutOffDate(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-medium"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Selecciona la fecha real de los datos del archivo.
                  </p>
                </div>
              </div>

              {/* File Dropzone */}
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700">
                  Archivo Excel
                </label>
                <div
                  className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all duration-200 group ${file ? "border-indigo-500 bg-indigo-50/50" : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50"}`}
                >
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer flex flex-col items-center w-full h-full"
                  >
                    {file ? (
                      <>
                        <div className="bg-emerald-100 p-3 rounded-full mb-3">
                          <FileSpreadsheet
                            size={32}
                            className="text-emerald-700"
                          />
                        </div>
                        <span className="text-base font-bold text-slate-900 break-all">
                          {file.name}
                        </span>
                        <span className="text-xs text-emerald-700 font-medium mt-1 uppercase tracking-wide">
                          Archivo Seleccionado
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="bg-slate-100 p-3 rounded-full mb-3 group-hover:bg-indigo-100 transition-colors">
                          <Upload
                            size={32}
                            className="text-slate-400 group-hover:text-indigo-600 transition-colors"
                          />
                        </div>
                        <span className="text-sm font-semibold text-slate-700">
                          Haz clic para buscar el archivo
                        </span>
                        <span className="text-xs text-slate-400 mt-2">
                          Soporta .xlsx (Excel) y .csv
                        </span>
                      </>
                    )}
                  </label>
                </div>
              </div>

              <button
                onClick={handleAnalyzeFile}
                disabled={!file}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20 transition-all hover:translate-y-[-1px]"
              >
                Analizar y Previsualizar <ArrowRight size={18} />
              </button>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-6 animate-in slide-in-from-right-4">
              {/* Type Badge */}
              <div className={`rounded-lg p-4 flex gap-3 ${detectedType === UPLOAD_TYPES.CLIENTES ? "bg-blue-50 border border-blue-200" : "bg-amber-50 border border-amber-200"}`}>
                {detectedType === UPLOAD_TYPES.CLIENTES ? (
                  <Users className="text-blue-600 shrink-0" size={24} />
                ) : (
                  <ShieldAlert className="text-amber-600 shrink-0" size={24} />
                )}
                <div>
                  <h4 className={`font-bold text-sm uppercase tracking-wide mb-1 ${detectedType === UPLOAD_TYPES.CLIENTES ? "text-blue-800" : "text-amber-800"}`}>
                    {detectedType === UPLOAD_TYPES.CLIENTES
                      ? "Maestro de Clientes Detectado"
                      : "Archivo de Cartera Detectado"}
                  </h4>
                  <p className={`text-sm leading-relaxed ${detectedType === UPLOAD_TYPES.CLIENTES ? "text-blue-700" : "text-amber-700"}`}>
                    {detectedType === UPLOAD_TYPES.CLIENTES
                      ? `Se encontraron ${fullData.length} clientes. Los existentes se actualizaran automaticamente.`
                      : `Se encontraron ${fullData.length} registros de cartera. Verifica las fechas antes de guardar.`}
                  </p>
                </div>
              </div>

              {/* Preview Table */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500 uppercase">
                    Primeras 5 filas detectadas
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    {fullData.length} registros totales
                  </span>
                </div>
                <div className="overflow-x-auto">
                  {detectedType === UPLOAD_TYPES.CLIENTES ? (
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold">
                        <tr>
                          <th className="px-4 py-2">NIT</th>
                          <th className="px-4 py-2">Nombre</th>
                          <th className="px-4 py-2">Tipo</th>
                          <th className="px-4 py-2">Municipio</th>
                          <th className="px-4 py-2">Celular</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewData.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-4 py-2 font-mono text-slate-700 text-xs">
                              {row.no_identif}
                            </td>
                            <td className="px-4 py-2 font-medium text-slate-900 truncate max-w-[200px]">
                              {row.nombreCompleto}
                            </td>
                            <td className="px-4 py-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${row.tipo_persona === "Juridica" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>
                                {row.tipo_persona || "N/A"}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-slate-500 text-xs">
                              {row.municipio || "-"}
                            </td>
                            <td className="px-4 py-2 text-slate-500 text-xs">
                              {row.celular || row.telefono_1 || "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold">
                        <tr>
                          <th className="px-4 py-2">Cliente</th>
                          <th className="px-4 py-2">Original (Excel)</th>
                          <th className="px-4 py-2 text-indigo-700">
                            Interpretacion
                          </th>
                          <th className="px-4 py-2">Vendedor</th>
                          <th className="px-4 py-2 text-center">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewData.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-4 py-2 font-medium text-slate-900 truncate max-w-[150px]">
                              {row.cliente_nombre}
                            </td>
                            <td className="px-4 py-2 font-mono text-slate-500 text-xs">
                              {String(row.rawFecha)}
                            </td>
                            <td className="px-4 py-2 font-bold text-slate-800">
                              {row.fecha_emision
                                ? row.fecha_emision.toLocaleDateString("es-CO", {
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric",
                                })
                                : "-"}
                            </td>
                            <td className="px-4 py-2 text-xs text-slate-500">
                              {row.vendedor_codigo || "-"}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {row.fecha_emision ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800">
                                  OK
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">
                                  ERROR
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setStep("select");
                    setDetectedType(null);
                  }}
                  className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors"
                >
                  Cancelar / Corregir
                </button>
                <button
                  onClick={handleConfirmUpload}
                  className="flex-[2] px-4 py-3 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-xl shadow-indigo-900/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                >
                  <CheckCircle size={18} /> Los datos se ven bien, Guardar
                </button>
              </div>
            </div>
          )}

          {step === "uploading" && (
            <div className="flex flex-col items-center justify-center py-12 animate-in fade-in">
              <Loader2
                size={48}
                className="text-emerald-600 animate-spin mb-4"
              />
              <h4 className="text-xl font-bold text-slate-900 mb-2">
                {detectedType === UPLOAD_TYPES.CLIENTES
                  ? "Guardando Clientes..."
                  : "Guardando en Base de Datos..."}
              </h4>
              <p className="text-slate-500 text-sm mb-6">
                Por favor espera, esto puede tardar unos segundos.
              </p>

              <div className="w-full max-w-xs bg-slate-100 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-emerald-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: progress + "%" }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2 font-mono">
                {progress}% completado
              </p>
            </div>
          )}

          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-12 text-emerald-600 animate-in zoom-in-95 duration-300">
              <CheckCircle size={64} className="mb-4" />
              <h4 className="text-2xl font-bold mb-2">Carga Exitosa!</h4>
              <p className="text-slate-500 text-center max-w-xs">
                {detectedType === UPLOAD_TYPES.CLIENTES
                  ? `Se han procesado ${fullData.length} clientes correctamente.`
                  : `Se han procesado y guardado ${fullData.length} registros correctamente.`}
              </p>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog {...confirmProps} />
    </div>
  );
}
