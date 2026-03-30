import React, { useState } from "react";
import {
  Upload,
  X,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  Package,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { sileo } from "sileo";
import { logAudit } from "../../services/auditService";
import { cn } from "@/lib/utils";
import { normalizeBrand } from "../../utils/brandNormalization";

export default function CatalogoUploadModal({ isOpen, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [step, setStep] = useState("select");
  const [previewData, setPreviewData] = useState([]);
  const [fullData, setFullData] = useState([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const reset = () => {
    setFile(null);
    setStep("select");
    setPreviewData([]);
    setFullData([]);
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
        setError("El archivo excede el tamaño máximo permitido (10MB)");
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
        // Headers en Row 0 (sin fila decorativa); fallback a Row 1
        let jsonData = XLSX.utils.sheet_to_json(ws, { range: 0 });
        if (jsonData.length === 0)
          jsonData = XLSX.utils.sheet_to_json(ws, { range: 1 });
        if (jsonData.length === 0)
          throw new Error("El archivo parece estar vacio.");

        // Mapeo por nombre de header (tolerante a variantes de casing)
        const col = (row, ...aliases) => {
          for (const a of aliases) {
            if (row[a] !== undefined) return row[a];
          }
          // Fallback: buscar con keys trimmed (headers con espacios)
          for (const key of Object.keys(row)) {
            const trimmed = key.trim();
            for (const a of aliases) {
              if (trimmed === a) return row[key];
            }
          }
          return "";
        };

        const processed = jsonData
          .map((row) => ({
            codigo: String(
              col(row, "Codigo", "Código", "codigo", "CODIGO"),
            ).trim(),
            nombre: String(
              col(row, "Nombre", "NombreProducto", "nombre", "NOMBRE"),
            ).trim(),
            categoria_codigo: String(
              col(row, "Categoria", "CodCategoria", "categoria", "CATEGORIA"),
            ).trim(),
            categoria_nombre: String(
              col(
                row,
                "NombreCategoria",
                "Nombre Categoria",
                "nombre_categoria",
              ),
            ).trim(),
            marca: normalizeBrand(
              String(
                col(
                  row,
                  "NombreMarca",
                  "Nombre Marca",
                  "nombre_marca",
                  "Marca",
                  "marca",
                  "MARCA",
                ),
              ).trim(),
            ),
          }))
          .filter((r) => r.codigo);

        if (processed.length === 0 && jsonData.length > 0)
          throw new Error(
            "No se reconocieron las columnas. Se esperan: Codigo, Nombre, Categoria, Marca.",
          );
        if (processed.length === 0)
          throw new Error("No se encontraron productos validos.");
        setFullData(processed);
        setPreviewData(processed.slice(0, 5));
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
        const batch = fullData.slice(i, i + batchSize);
        const { error: err } = await supabase
          .from("distrimm_productos_catalogo")
          .upsert(
            batch.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
            { onConflict: "codigo" },
          );
        if (err) throw err;
        setProgress(
          20 + Math.round(((i + batch.length) / fullData.length) * 75),
        );
      }
      setProgress(100);
      setStep("success");
      sileo.success(`${fullData.length} productos procesados`);
      logAudit("UPLOAD_CATALOGO", "distrimm_productos_catalogo", null, {
        registros: fullData.length,
      });
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
            <Package size={20} className="text-emerald-400" /> Cargar Catalogo
            de Productos
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
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-700">
                <p className="font-bold mb-1">Excel "Saldos de Productos"</p>
                <p className="text-xs text-emerald-500">
                  Se extraen: Codigo, Nombre, Categoria, Marca (por nombre de
                  columna). Productos existentes se actualizan.
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
                      ? "border-emerald-500 bg-emerald-50/50"
                      : "border-slate-300 hover:border-emerald-400 hover:bg-slate-50",
                  )}
                >
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                    className="hidden"
                    id="catalogo-file"
                  />
                  <label
                    htmlFor="catalogo-file"
                    className="cursor-pointer flex flex-col items-center w-full"
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
                      </>
                    ) : (
                      <>
                        <div className="bg-slate-100 p-3 rounded-full mb-3 group-hover:bg-emerald-100 transition-colors">
                          <Upload
                            size={32}
                            className="text-slate-400 group-hover:text-emerald-600 transition-colors"
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
                className="w-full py-3 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
              >
                Analizar y Previsualizar <ArrowRight size={18} />
              </button>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-6">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex gap-3">
                <Package className="text-emerald-600 shrink-0" size={24} />
                <div>
                  <h4 className="font-bold text-sm text-emerald-800">
                    Catalogo Detectado
                  </h4>
                  <p className="text-sm text-emerald-700">
                    {fullData.length} productos encontrados. Los existentes se
                    actualizaran.
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
                        <th className="px-3 py-2">Categoria</th>
                        <th className="px-3 py-2">Marca</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewData.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono text-xs">
                            {r.codigo}
                          </td>
                          <td className="px-3 py-2 text-xs truncate max-w-[200px]">
                            {r.nombre}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {r.categoria_nombre}
                          </td>
                          <td className="px-3 py-2 text-xs">{r.marca}</td>
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
                  className="flex-[2] px-4 py-3 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-emerald-900/20 flex items-center justify-center gap-2"
                >
                  <CheckCircle size={18} /> Guardar {fullData.length} productos
                </button>
              </div>
            </div>
          )}

          {step === "uploading" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2
                size={48}
                className="text-emerald-600 animate-spin mb-4"
              />
              <h4 className="text-xl font-bold text-slate-900 mb-2">
                Guardando Catalogo...
              </h4>
              <div className="w-full max-w-xs bg-slate-100 rounded-full h-3 overflow-hidden mt-4">
                <div
                  className="bg-emerald-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: progress + "%" }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2 font-mono">
                {progress}%
              </p>
            </div>
          )}

          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-12 text-emerald-600">
              <CheckCircle size={64} className="mb-4" />
              <h4 className="text-2xl font-bold mb-2">Catalogo Actualizado!</h4>
              <p className="text-slate-500">
                {fullData.length} productos procesados.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
