import React, { useState } from "react";
import {
  Upload,
  X,
  FileSpreadsheet,
  Calendar,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  ShoppingBag,
} from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "../../lib/supabase";
import { sileo } from "sileo";
import { cn } from "@/lib/utils";
import { formatFullCurrency } from "../../utils/formatters";

export default function VentasUploadModal({ isOpen, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [fechaVentas, setFechaVentas] = useState(new Date().toISOString().split("T")[0]);
  const [step, setStep] = useState("select");
  const [previewData, setPreviewData] = useState([]);
  const [fullData, setFullData] = useState([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);

  const reset = () => {
    setFile(null);
    setStep("select");
    setPreviewData([]);
    setFullData([]);
    setError(null);
    setProgress(0);
  };

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const handleClose = () => { reset(); onClose(); };

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
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array", cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // Try range 1 first (skip decorative row), fallback to 0
        let jsonData = XLSX.utils.sheet_to_json(ws, { range: 1 });
        if (jsonData.length === 0) {
          jsonData = XLSX.utils.sheet_to_json(ws, { range: 0 });
        }
        if (jsonData.length === 0) throw new Error("El archivo parece estar vacio.");

        const processed = jsonData
          .map((row) => {
            const keys = Object.keys(row);
            const get = (idx) => row[keys[idx]];
            const num = (idx) => parseFloat(get(idx)) || 0;

            return {
              vendedor_codigo: String(get(0) || "").trim(),
              vendedor_nit: String(get(1) || "").trim(),
              vendedor_nombre: String(get(2) || "").trim(),
              producto_codigo: String(get(3) || "").trim(),
              producto_descripcion: String(get(5) || "").trim(),
              cliente_nit: String(get(6) || "").trim(),
              cliente_nombre: String(get(7) || "").trim(),
              municipio: String(get(9) || "").trim(),
              fecha_raw: get(10),
              factura: String(get(15) || "").trim(),
              precio: num(17),
              descuento: num(18),
              valor_unidad: num(19),
              cantidad: num(20),
              valor_total: num(24),
              costo: num(27),
              tipo: String(get(29) || "VE").trim().toUpperCase(),
            };
          });

        // Invertir valores para devoluciones
        processed.forEach(item => {
          if (item.tipo === "DV") {
            item.valor_total = -Math.abs(item.valor_total);
            item.costo = -Math.abs(item.costo);
          }
        });

        const filtered = processed.filter((r) => r.producto_codigo && r.valor_total !== 0);

        if (filtered.length === 0) throw new Error("No se encontraron registros validos.");
        setFullData(filtered);
        setPreviewData(filtered.slice(0, 5));
        setStep("preview");
      } catch (err) {
        setError("Error al leer el archivo: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUpload = async () => {
    if (uploading) return;
    setUploading(true);
    setStep("uploading");
    setProgress(10);
    let createdId = null;

    try {
      const totalVentas = fullData.reduce((s, r) => s + r.valor_total, 0);
      const totalCosto = fullData.reduce((s, r) => s + r.costo, 0);

      // 1. Create carga record
      const { data: carga, error: cargaErr } = await supabase
        .from("distrimm_comisiones_cargas")
        .insert({
          nombre_archivo: file.name,
          fecha_ventas: fechaVentas,
          total_registros: fullData.length,
          total_ventas: totalVentas,
          total_costo: totalCosto,
        })
        .select()
        .single();

      if (cargaErr) throw cargaErr;
      createdId = carga.id;
      setProgress(25);

      // 2. Parse fecha for each row
      const parseDate = (raw) => {
        if (!raw) return fechaVentas;
        if (typeof raw === "number") {
          const d = new Date(1899, 11, 30);
          d.setDate(d.getDate() + raw);
          return d.toISOString().split("T")[0];
        }
        // Try dd/MM/yyyy
        const parts = String(raw).split("/");
        if (parts.length === 3) {
          const [dd, mm, yyyy] = parts;
          return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
        }
        return fechaVentas;
      };

      // 3. Batch insert ventas
      const batchSize = 100;
      const rows = fullData.map((r) => ({
        carga_id: createdId,
        vendedor_codigo: r.vendedor_codigo || null,
        vendedor_nit: r.vendedor_nit || null,
        vendedor_nombre: r.vendedor_nombre || null,
        producto_codigo: r.producto_codigo,
        producto_descripcion: r.producto_descripcion || null,
        cliente_nit: r.cliente_nit || null,
        cliente_nombre: r.cliente_nombre || null,
        municipio: r.municipio || null,
        fecha: parseDate(r.fecha_raw),
        factura: r.factura || null,
        precio: r.precio,
        descuento: r.descuento,
        valor_unidad: r.valor_unidad,
        cantidad: r.cantidad,
        valor_total: r.valor_total,
        costo: r.costo,
        tipo: r.tipo || "VE",
      }));

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error: bErr } = await supabase
          .from("distrimm_comisiones_ventas")
          .insert(batch);
        if (bErr) throw bErr;
        setProgress(25 + Math.round(((i + batch.length) / rows.length) * 70));
      }

      setProgress(100);
      setStep("success");
      sileo.success("Ventas cargadas exitosamente");
      setTimeout(() => { onSuccess(); handleClose(); }, 1500);
    } catch (err) {
      if (import.meta.env.DEV) console.error("Upload ventas error:", err);
      if (createdId) {
        await supabase.from("distrimm_comisiones_cargas").delete().eq("id", createdId);
      }
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
            <Upload size={20} className="text-indigo-400" /> Cargar Ventas
          </h3>
          <button onClick={handleClose} disabled={step === "uploading"} className="p-1 hover:bg-slate-700 rounded transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {error && (
            <div className="mb-6 bg-rose-50 text-rose-700 p-4 rounded-lg flex items-start gap-3 border border-rose-200">
              <AlertCircle size={20} className="mt-0.5 shrink-0" />
              <div><p className="font-bold">Error</p><p className="text-sm">{error}</p></div>
            </div>
          )}

          {step === "select" && (
            <div className="space-y-6">
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-sm text-indigo-700">
                <p className="font-bold mb-1">Excel "Ventas de Productos por Factura"</p>
                <p className="text-xs text-indigo-500">La fila decorativa (titulo) se omite automaticamente. Se leen 30 columnas por fila.</p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700">Fecha de Ventas</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Calendar size={18} className="text-indigo-600" />
                  </div>
                  <input
                    type="date"
                    value={fechaVentas}
                    onChange={(e) => setFechaVentas(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-medium"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-700">Archivo Excel</label>
                <div className={cn("border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all group", file ? "border-indigo-500 bg-indigo-50/50" : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50")}>
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" id="ventas-file" />
                  <label htmlFor="ventas-file" className="cursor-pointer flex flex-col items-center w-full">
                    {file ? (
                      <>
                        <div className="bg-emerald-100 p-3 rounded-full mb-3"><FileSpreadsheet size={32} className="text-emerald-700" /></div>
                        <span className="text-base font-bold text-slate-900 break-all">{file.name}</span>
                        <span className="text-xs text-emerald-700 font-medium mt-1 uppercase tracking-wide">Archivo Seleccionado</span>
                      </>
                    ) : (
                      <>
                        <div className="bg-slate-100 p-3 rounded-full mb-3 group-hover:bg-indigo-100 transition-colors"><Upload size={32} className="text-slate-400 group-hover:text-indigo-600 transition-colors" /></div>
                        <span className="text-sm font-semibold text-slate-700">Haz clic para buscar el archivo</span>
                        <span className="text-xs text-slate-400 mt-2">Soporta .xlsx (Excel)</span>
                      </>
                    )}
                  </label>
                </div>
              </div>

              <button onClick={handleAnalyze} disabled={!file} className="w-full py-3 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20 transition-all">
                Analizar y Previsualizar <ArrowRight size={18} />
              </button>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
                <ShoppingBag className="text-amber-600 shrink-0" size={24} />
                <div>
                  <h4 className="font-bold text-sm uppercase tracking-wide mb-1 text-amber-800">Ventas Detectadas</h4>
                  {(() => {
                    const countVE = fullData.filter(r => r.tipo !== "DV").length;
                    const countDV = fullData.filter(r => r.tipo === "DV").length;
                    return (
                      <p className="text-sm text-amber-700">
                        Se encontraron {countVE} ventas y {countDV} devoluciones. Fecha: {fechaVentas}
                      </p>
                    );
                  })()}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500 uppercase">Primeras 5 filas</span>
                  <span className="text-xs font-mono text-slate-400">{fullData.length} registros totales</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold">
                      <tr>
                        <th className="px-3 py-2">Vendedor</th>
                        <th className="px-3 py-2">Producto</th>
                        <th className="px-3 py-2">Cliente</th>
                        <th className="px-3 py-2 text-center">Tipo</th>
                        <th className="px-3 py-2 text-right">Valor Total</th>
                        <th className="px-3 py-2 text-right">Costo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewData.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-xs">{row.vendedor_nombre || row.vendedor_codigo}</td>
                          <td className="px-3 py-2 text-xs truncate max-w-[150px]">{row.producto_descripcion || row.producto_codigo}</td>
                          <td className="px-3 py-2 text-xs truncate max-w-[150px]">{row.cliente_nombre}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded-full",
                              row.tipo === "DV"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-emerald-100 text-emerald-700"
                            )}>
                              {row.tipo === "DV" ? "Dev." : "Venta"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-right font-mono">{formatFullCurrency(row.valor_total)}</td>
                          <td className="px-3 py-2 text-xs text-right font-mono">{formatFullCurrency(row.costo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep("select")} className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors">
                  Cancelar / Corregir
                </button>
                <button onClick={handleUpload} disabled={uploading} className="flex-[2] px-4 py-3 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-indigo-900/20 flex items-center justify-center gap-2 transition-all">
                  <CheckCircle size={18} /> Guardar {fullData.length} registros
                </button>
              </div>
            </div>
          )}

          {step === "uploading" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 size={48} className="text-emerald-600 animate-spin mb-4" />
              <h4 className="text-xl font-bold text-slate-900 mb-2">Guardando Ventas...</h4>
              <p className="text-slate-500 text-sm mb-6">Por favor espera.</p>
              <div className="w-full max-w-xs bg-slate-100 rounded-full h-3 overflow-hidden">
                <div className="bg-emerald-600 h-3 rounded-full transition-all duration-300" style={{ width: progress + "%" }} />
              </div>
              <p className="text-xs text-slate-400 mt-2 font-mono">{progress}% completado</p>
            </div>
          )}

          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-12 text-emerald-600">
              <CheckCircle size={64} className="mb-4" />
              <h4 className="text-2xl font-bold mb-2">Carga Exitosa!</h4>
              <p className="text-slate-500">{fullData.length} ventas guardadas correctamente.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
