import React, { useState } from "react";
import {
  Upload,
  X,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  Percent,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { sileo } from "sileo";
import { cn } from "@/lib/utils";
import { parseIvaRows } from "../../utils/ivaUpload";

export default function IvaUploadModal({ isOpen, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [step, setStep] = useState("select");
  const [previewData, setPreviewData] = useState([]);
  const [fullData, setFullData] = useState([]);
  const [stats, setStats] = useState({ iva5: 0, iva19: 0, unknown: 0 });
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);

  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  const reset = () => {
    setFile(null);
    setStep("select");
    setPreviewData([]);
    setFullData([]);
    setStats({ iva5: 0, iva19: 0, unknown: 0 });
    setError(null);
    setProgress(0);
  };
  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (selectedFile.size > MAX_FILE_SIZE) {
        setError("El archivo excede el tamaño maximo permitido (10MB)");
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleAnalyze = () => {
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await import("xlsx-js-style");
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        let jsonData = XLSX.utils.sheet_to_json(ws, { range: 0 });
        if (jsonData.length === 0)
          jsonData = XLSX.utils.sheet_to_json(ws, { range: 1 });
        if (jsonData.length === 0)
          throw new Error("El archivo parece estar vacio.");

        const deduped = parseIvaRows(jsonData);

        if (deduped.length === 0)
          throw new Error(
            "No se encontraron productos gravados. Verifica que el archivo tenga columnas 'Producto' y '% Iva'.",
          );

        // Verificar cuantos existen en el catalogo
        const codigos = deduped.map((r) => r.codigo);
        const batchSize = 200;
        const existingCodigos = new Set();
        for (let i = 0; i < codigos.length; i += batchSize) {
          const batch = codigos.slice(i, i + batchSize);
          const { data: rows } = await supabase
            .from("distrimm_productos_catalogo")
            .select("codigo")
            .in("codigo", batch);
          (rows || []).forEach((r) => existingCodigos.add(r.codigo));
        }

        const valid = deduped.filter((r) => existingCodigos.has(r.codigo));
        const unknownCount = deduped.length - valid.length;

        setFullData(valid);
        setPreviewData(valid.slice(0, 8));
        setStats({
          iva5: valid.filter((r) => r.pct_iva === 5).length,
          iva19: valid.filter((r) => r.pct_iva === 19).length,
          unknown: unknownCount,
        });
        setStep("preview");
      } catch (err) {
        setError("Error al leer: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUpload = async () => {
    if (uploading) return;
    setUploading(true);
    setStep("uploading");
    setProgress(20);
    try {
      const batchSize = 200;
      for (let i = 0; i < fullData.length; i += batchSize) {
        const batch = fullData.slice(i, i + batchSize).map((r) => ({
          codigo: r.codigo,
          pct_iva: r.pct_iva,
          updated_at: new Date().toISOString(),
        }));
        const { error: err } = await supabase
          .from("distrimm_productos_catalogo")
          .upsert(batch, { onConflict: "codigo" });
        if (err) throw err;
        setProgress(
          20 + Math.round(((i + batch.length) / fullData.length) * 75),
        );
      }
      setProgress(100);
      setStep("success");
      sileo.success(
        `${fullData.length} productos actualizados: ${stats.iva5} al 5%, ${stats.iva19} al 19%`,
      );
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 1500);
    } catch (err) {
      setError("Error al guardar: " + (err?.message || JSON.stringify(err)));
      setStep("preview");
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-slate-900 p-4 flex justify-between items-center text-white shrink-0">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Percent size={20} className="text-amber-400" /> Cargar Tasas de IVA
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
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {step === "select" && (
            <div className="space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
                <p className="font-bold mb-1">
                  Informe Diario de Ventas tipo de IVA
                </p>
                <p className="text-xs text-amber-500">
                  Se extraen las columnas Producto y % Iva. Solo se actualizan
                  productos que ya existen en el catalogo. Los productos no
                  incluidos en el informe se mantienen como exentos (0%).
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700">
                  Archivo Excel
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
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                    className="hidden"
                    id="iva-file"
                  />
                  <label
                    htmlFor="iva-file"
                    className="cursor-pointer flex flex-col items-center w-full"
                  >
                    {file ? (
                      <>
                        <div className="bg-amber-100 p-3 rounded-full mb-3">
                          <FileSpreadsheet
                            size={32}
                            className="text-amber-700"
                          />
                        </div>
                        <span className="text-base font-bold text-slate-900 break-all">
                          {file.name}
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
                          Haz clic para buscar el archivo
                        </span>
                      </>
                    )}
                  </label>
                </div>
              </div>

              <button
                onClick={handleAnalyze}
                disabled={!file}
                className="w-full py-3 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-amber-900/20"
              >
                Analizar y Previsualizar <ArrowRight size={18} />
              </button>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
                <Percent className="text-amber-600 shrink-0" size={24} />
                <div>
                  <h4 className="font-bold text-sm text-amber-800">
                    Tasas de IVA Detectadas
                  </h4>
                  <p className="text-sm text-amber-700">
                    <span className="font-bold">{stats.iva5}</span> productos al
                    5% y <span className="font-bold">{stats.iva19}</span> al
                    19%.
                    {stats.unknown > 0 && (
                      <span className="text-amber-500">
                        {" "}
                        {stats.unknown} productos no encontrados en el catalogo
                        (se ignoran).
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold">
                      <tr>
                        <th className="px-3 py-2">Codigo</th>
                        <th className="px-3 py-2">Nombre</th>
                        <th className="px-3 py-2 text-center">% IVA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewData.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono text-xs">
                            {r.codigo}
                          </td>
                          <td className="px-3 py-2 text-xs truncate max-w-[250px]">
                            {r.nombre}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span
                              className={cn(
                                "text-[10px] font-bold px-2 py-0.5 rounded-full",
                                r.pct_iva === 19
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-blue-100 text-blue-700",
                              )}
                            >
                              {r.pct_iva}%
                            </span>
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
                  className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="flex-[2] px-4 py-3 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-amber-900/20 flex items-center justify-center gap-2"
                >
                  <CheckCircle size={18} /> Actualizar {fullData.length}{" "}
                  productos
                </button>
              </div>
            </div>
          )}

          {step === "uploading" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={48} className="text-amber-600 animate-spin mb-4" />
              <h4 className="text-xl font-bold text-slate-900 mb-2">
                Actualizando Tasas IVA...
              </h4>
              <div className="w-full max-w-xs bg-slate-100 rounded-full h-3 overflow-hidden mt-4">
                <div
                  className="bg-amber-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: progress + "%" }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2 font-mono">
                {progress}%
              </p>
            </div>
          )}

          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-12 text-amber-600">
              <CheckCircle size={64} className="mb-4" />
              <h4 className="text-2xl font-bold mb-2">IVA Actualizado!</h4>
              <p className="text-slate-500">
                {stats.iva5} al 5%, {stats.iva19} al 19%.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
