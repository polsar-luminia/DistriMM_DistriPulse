import { useState, useEffect } from "react";
import {
  Upload,
  X,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  Target,
  User,
} from "lucide-react";
import { sileo } from "sileo";
import { cn } from "@/lib/utils";
import { formatFullCurrency } from "../../utils/formatters";
import { getVendedores } from "../../services/portfolioService";

// Parses the CONDICION VENDEDORES PRESEPUESTO workbook into structured vendor data.
// Excel layout: col A = vendor name, col B = "MARCAS", then brand rows below.
// Brand cols: marca (B), % venta (C), presupuesto mes (F), bonificacion (I).
// Recaudo tier data in cols K-N near vendor sections.
function parsePresupuestosExcel(workbook, vendorNameToCode, XLSX) {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  if (!ws) throw new Error("No se encontró la hoja de datos.");

  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const maxRow = range.e.r;

  // Helper to read a cell value
  const cell = (r, c) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cellObj = ws[addr];
    return cellObj ? cellObj.v : null;
  };

  const warnings = [];
  const vendors = [];

  // Scan for vendor header rows: col A has a name, col B has "MARCAS"
  for (let r = 0; r <= maxRow; r++) {
    const colA = cell(r, 0);
    const colB = cell(r, 1);

    if (!colA || !colB) continue;
    const nameStr = String(colA).trim().toUpperCase();
    const labelStr = String(colB).trim().toUpperCase();
    if (labelStr !== "MARCAS" && !labelStr.startsWith("MARCA")) continue;

    // Found a vendor header
    const vendorName = nameStr;
    const vendorCode = vendorNameToCode[vendorName];
    if (!vendorCode) {
      warnings.push(
        `Vendedor "${vendorName}" no tiene código asignado en el sistema. Se omitirá.`,
      );
      continue;
    }

    // Parse brand rows below this header until we hit an empty brand or a summary row
    const marcas = [];
    for (let br = r + 1; br <= Math.min(r + 30, maxRow); br++) {
      const marca = cell(br, 1);
      if (!marca) break; // empty brand = end of section

      const marcaStr = String(marca).trim().toUpperCase();
      if (!marcaStr || marcaStr === "MARCAS") break;

      const pctRaw = parseFloat(cell(br, 2)) || 0;
      const metaMes = parseFloat(cell(br, 5)) || 0;
      const bonificacion = parseFloat(cell(br, 8)) || 0;

      // Normalize commission percentage:
      // - pctRaw > 1 (e.g. 2): percentage form → 2/100 = 0.02
      // - pctRaw >= 0.1 (e.g. 0.5): likely 0.5% not 50% → 0.5/100 = 0.005
      // - pctRaw < 0.1 (e.g. 0.02): already decimal → keep as 0.02 (2%)
      let pctComision;
      if (pctRaw >= 0.1) {
        pctComision = pctRaw / 100;
      } else {
        pctComision = pctRaw;
      }

      // Skip text values in presupuesto_mes (some special brands have notes)
      const metaVentas = typeof metaMes === "number" ? Math.round(metaMes) : 0;
      const bonoFijo =
        typeof bonificacion === "number" ? Math.round(bonificacion) : 0;

      marcas.push({
        marca: marcaStr,
        pct_comision: pctComision,
        meta_ventas: metaVentas,
        bono_fijo: bonoFijo,
      });
    }

    if (marcas.length === 0) {
      warnings.push(`Vendedor "${vendorName}" no tiene marcas detectadas.`);
      continue;
    }

    vendors.push({
      nombre: vendorName,
      codigo: vendorCode,
      marcas,
      recaudo: null, // filled below
    });
  }

  if (vendors.length === 0) {
    throw new Error(
      "No se detectaron secciones de vendedores. Verifica que el archivo tiene el formato correcto (columna A: nombre vendedor, columna B: 'MARCAS').",
    );
  }

  // Parse recaudo tiers from cols K-N (indices 10-13).
  // The pattern in the Excel for each vendor's recaudo section:
  // - One row with vendor name (col K) — identifies who this recaudo belongs to
  // - Next row: threshold multipliers (0.8, 0.9, 1, 1.4)
  // - Next row: actual $ meta values (computed from multipliers * base)
  // - Next row: percentage rates (0.005, 0.009, 0.012, 0.015)
  // We scan for rows where col K has a known vendor name
  for (let r = 0; r <= maxRow; r++) {
    const colK = cell(r, 10);
    if (!colK) continue;
    const nameK = String(colK).trim().toUpperCase();

    // Check if this is a vendor name reference
    const matchedVendor = vendors.find((v) => nameK.includes(v.nombre));
    if (!matchedVendor) continue;

    // Look at the next few rows for the recaudo pattern
    // Row r+1: threshold multipliers or values
    // Row r+2: meta values
    // Row r+3: percentage rates
    // We need to find the meta_recaudo (a large number) and the 4 percentages
    let metaRecaudo = null;
    let pcts = null;

    for (let scan = r + 1; scan <= Math.min(r + 5, maxRow); scan++) {
      const k = cell(scan, 10);
      const l = cell(scan, 11);
      const m = cell(scan, 12);
      const n = cell(scan, 13);

      // Look for the percentage row (all 4 values small decimals like 0.005-0.015)
      if (
        typeof k === "number" &&
        typeof l === "number" &&
        typeof m === "number" &&
        typeof n === "number" &&
        k < 0.1 &&
        l < 0.1 &&
        m < 0.1 &&
        n < 0.1
      ) {
        pcts = [k, l, m, n];
      }

      // Look for the meta row (contains a value >= 100M which is the collection target)
      for (const val of [k, l, m, n]) {
        if (typeof val === "number" && val >= 100000000 && !metaRecaudo) {
          metaRecaudo = val;
        }
      }
    }

    if (metaRecaudo && pcts) {
      matchedVendor.recaudo = {
        meta_recaudo: Math.round(metaRecaudo),
        tramo1_min: 0,
        tramo1_max: 89.99,
        tramo1_pct: pcts[0],
        tramo2_min: 90,
        tramo2_max: 99.99,
        tramo2_pct: pcts[1],
        tramo3_min: 100,
        tramo3_max: 139.99,
        tramo3_pct: pcts[2],
        tramo4_min: 140,
        tramo4_pct: pcts[3],
      };
    }
  }

  // Warn about vendors without recaudo data
  for (const v of vendors) {
    if (!v.recaudo) {
      warnings.push(
        `No se detectó escala de recaudo para ${v.nombre}. Se puede agregar manualmente.`,
      );
    }
  }

  return { vendors, warnings };
}

export default function PresupuestosUploadModal({
  isOpen,
  onClose,
  onSave,
  selectedYear,
  selectedMonth,
}) {
  const [file, setFile] = useState(null);
  const [step, setStep] = useState("select"); // select | preview | saving | success
  const [parsedVendors, setParsedVendors] = useState([]);
  const [parseWarnings, setParseWarnings] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 });
  const [vendorNameToCode, setVendorNameToCode] = useState({});

  useEffect(() => {
    getVendedores().then(({ data }) => {
      if (data) {
        const map = {};
        data.forEach((v) => {
          map[v.nombre.toUpperCase()] = v.codigo;
        });
        setVendorNameToCode(map);
      }
    });
  }, []);

  const reset = () => {
    setFile(null);
    setStep("select");
    setParsedVendors([]);
    setParseWarnings([]);
    setError(null);
    setSaving(false);
    setSaveProgress({ done: 0, total: 0 });
  };

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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
        const { vendors, warnings } = parsePresupuestosExcel(
          wb,
          vendorNameToCode,
          XLSX,
        );
        setParsedVendors(vendors);
        setParseWarnings(warnings);
        setStep("preview");
      } catch (err) {
        setError("Error al leer el archivo: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSave = async () => {
    setStep("saving");
    setSaving(true);

    const totalOps = parsedVendors.reduce(
      (sum, v) => sum + v.marcas.length + (v.recaudo ? 1 : 0),
      0,
    );
    setSaveProgress({ done: 0, total: totalOps });

    let done = 0;
    let hasError = false;

    for (const vendor of parsedVendors) {
      // Save brand rows
      for (const marca of vendor.marcas) {
        const { error: err } = await onSave("marca", {
          vendedor_codigo: vendor.codigo,
          marca: marca.marca,
          pct_comision: marca.pct_comision,
          meta_ventas: marca.meta_ventas,
          bono_fijo: marca.bono_fijo,
          periodo_year: selectedYear,
          periodo_month: selectedMonth,
          activo: true,
        });
        if (err) {
          if (import.meta.env.DEV) console.error("Error saving marca:", err);
          hasError = true;
        }
        done++;
        setSaveProgress({ done, total: totalOps });
      }

      // Save recaudo
      if (vendor.recaudo) {
        const { error: err } = await onSave("recaudo", {
          vendedor_codigo: vendor.codigo,
          periodo_year: selectedYear,
          periodo_month: selectedMonth,
          ...vendor.recaudo,
          activo: true,
        });
        if (err) {
          if (import.meta.env.DEV) console.error("Error saving recaudo:", err);
          hasError = true;
        }
        done++;
        setSaveProgress({ done, total: totalOps });
      }
    }

    setSaving(false);

    if (hasError) {
      sileo.error("Algunos datos no pudieron guardarse — revisa la consola");
      setStep("preview");
    } else {
      setStep("success");
      sileo.success("Presupuestos importados exitosamente");
      setTimeout(() => handleClose(), 1500);
    }
  };

  if (!isOpen) return null;

  const totalMarcas = parsedVendors.reduce((s, v) => s + v.marcas.length, 0);
  const totalRecaudo = parsedVendors.filter((v) => v.recaudo).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 p-4 flex justify-between items-center text-white shrink-0">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Upload size={20} className="text-amber-400" /> Importar
            Presupuestos desde Excel
          </h3>
          <button
            onClick={handleClose}
            disabled={saving}
            className="p-1 hover:bg-slate-700 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {/* Error banner */}
          {error && (
            <div className="mb-6 bg-rose-50 text-rose-700 p-4 rounded-lg flex items-start gap-3 border border-rose-200">
              <AlertCircle size={20} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-bold">Error</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* ── Step: Select file ── */}
          {step === "select" && (
            <div className="space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
                <p className="font-bold mb-1">
                  Excel &quot;CONDICION VENDEDORES PRESEPUESTO AÑO&quot;
                </p>
                <p className="text-xs text-amber-600">
                  Se detectan secciones de vendedores automáticamente. Se
                  extraen marcas con % comisión, meta mensual y bonificación,
                  más la escala de recaudo.
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
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    className="hidden"
                    id="presupuestos-file"
                  />
                  <label
                    htmlFor="presupuestos-file"
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
                          Haz clic para buscar el archivo
                        </span>
                        <span className="text-xs text-slate-400 mt-2">
                          Soporta .xlsx (Excel)
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
                Analizar y Previsualizar <ArrowRight size={18} />
              </button>
            </div>
          )}

          {/* ── Step: Preview ── */}
          {step === "preview" && (
            <div className="space-y-6">
              {/* Warnings */}
              {parseWarnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h4 className="text-sm font-bold text-amber-800 mb-2">
                    Advertencias
                  </h4>
                  <ul className="text-xs text-amber-700 space-y-1">
                    {parseWarnings.map((w, i) => (
                      <li key={i}>- {w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Summary banner */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 flex gap-3">
                <Target className="text-indigo-600 shrink-0" size={24} />
                <div>
                  <h4 className="font-bold text-sm text-indigo-800">
                    Datos Detectados
                  </h4>
                  <p className="text-sm text-indigo-700">
                    {parsedVendors.length} vendedor
                    {parsedVendors.length !== 1 ? "es" : ""}, {totalMarcas}{" "}
                    comisiones por marca, {totalRecaudo} escala
                    {totalRecaudo !== 1 ? "s" : ""} de recaudo.
                  </p>
                </div>
              </div>

              {/* Per-vendor preview cards */}
              {parsedVendors.map((vendor) => (
                <div
                  key={vendor.codigo}
                  className="border border-slate-200 rounded-lg overflow-hidden"
                >
                  {/* Vendor header */}
                  <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 py-3 flex items-center gap-2">
                    <User size={16} className="text-white" />
                    <span className="text-white font-bold text-sm">
                      {vendor.nombre} (Código: {vendor.codigo})
                    </span>
                    <span className="text-indigo-200 text-xs ml-auto">
                      {vendor.marcas.length} marcas
                      {vendor.recaudo ? " + recaudo" : ""}
                    </span>
                  </div>

                  {/* Brand table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold">
                        <tr>
                          <th className="px-3 py-2">Marca</th>
                          <th className="px-3 py-2 text-right">% Comisión</th>
                          <th className="px-3 py-2 text-right">
                            Meta Ventas Mes
                          </th>
                          <th className="px-3 py-2 text-right">Bonificación</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {vendor.marcas.map((m) => (
                          <tr
                            key={`${vendor.codigo}-${m.marca}`}
                            className="hover:bg-slate-50"
                          >
                            <td className="px-3 py-2 text-xs font-medium">
                              {m.marca}
                            </td>
                            <td className="px-3 py-2 text-xs text-right font-mono">
                              {(m.pct_comision * 100).toFixed(1)}%
                            </td>
                            <td className="px-3 py-2 text-xs text-right font-mono">
                              {m.meta_ventas > 0
                                ? formatFullCurrency(m.meta_ventas)
                                : "-"}
                            </td>
                            <td className="px-3 py-2 text-xs text-right font-mono">
                              {m.bono_fijo > 0
                                ? formatFullCurrency(m.bono_fijo)
                                : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Recaudo preview */}
                  {vendor.recaudo && (
                    <div className="border-t border-slate-200 px-4 py-3 bg-emerald-50/50">
                      <h5 className="text-xs font-bold text-emerald-800 uppercase mb-2">
                        Escala de Recaudo
                      </h5>
                      <div className="flex flex-wrap gap-3 text-xs">
                        <span className="text-slate-700">
                          <span className="font-bold">Meta:</span>{" "}
                          {formatFullCurrency(vendor.recaudo.meta_recaudo)}
                        </span>
                        <span className="text-emerald-700">
                          T1: {(vendor.recaudo.tramo1_pct * 100).toFixed(1)}%
                        </span>
                        <span className="text-sky-700">
                          T2: {(vendor.recaudo.tramo2_pct * 100).toFixed(1)}%
                        </span>
                        <span className="text-amber-700">
                          T3: {(vendor.recaudo.tramo3_pct * 100).toFixed(1)}%
                        </span>
                        <span className="text-rose-700">
                          T4: {(vendor.recaudo.tramo4_pct * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => setStep("select")}
                  className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors"
                >
                  Cancelar / Corregir
                </button>
                <button
                  onClick={handleSave}
                  className="flex-[2] px-4 py-3 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-xl shadow-indigo-900/20 flex items-center justify-center gap-2 transition-all"
                >
                  <CheckCircle size={18} /> Guardar {totalMarcas} marcas +{" "}
                  {totalRecaudo} recaudo
                </button>
              </div>
            </div>
          )}

          {/* ── Step: Saving ── */}
          {step === "saving" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2
                size={48}
                className="text-indigo-600 animate-spin mb-4"
              />
              <h4 className="text-xl font-bold text-slate-900 mb-2">
                Guardando Presupuestos...
              </h4>
              <p className="text-slate-500 text-sm mb-6">Por favor espera.</p>
              <div className="w-full max-w-xs bg-slate-100 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-indigo-600 h-3 rounded-full transition-all duration-300"
                  style={{
                    width:
                      saveProgress.total > 0
                        ? Math.round(
                            (saveProgress.done / saveProgress.total) * 100,
                          ) + "%"
                        : "0%",
                  }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2 font-mono">
                {saveProgress.done} / {saveProgress.total}
              </p>
            </div>
          )}

          {/* ── Step: Success ── */}
          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-12 text-emerald-600">
              <CheckCircle size={64} className="mb-4" />
              <h4 className="text-2xl font-bold mb-2">Importación Exitosa!</h4>
              <p className="text-slate-500">
                {totalMarcas} comisiones por marca y {totalRecaudo} escalas de
                recaudo guardadas.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
