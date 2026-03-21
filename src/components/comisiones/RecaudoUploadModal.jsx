import React, { useState } from "react";
import { getColombiaTodayISO } from "../../utils/formatters";
import {
  Upload,
  X,
  FileSpreadsheet,
  Calendar,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  Wallet,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { sileo } from "sileo";
import { cn } from "@/lib/utils";
import { formatFullCurrency } from "../../utils/formatters";
import { RECAUDO_THRESHOLDS } from "../../constants/thresholds";
import ConfirmDialog from "../ConfirmDialog";
import { useConfirm } from "../../hooks/useConfirm";
import {
  buildExclusionLookups,
  getExclusionInfo,
} from "../../hooks/comisiones/utils";

const { DIAS_MORA_LIMITE } = RECAUDO_THRESHOLDS;

// Cuenta CxC Clientes para filtrar líneas contables en formato RC
const CUENTA_CXC = "13050501";

// Marcadores para detectar formato "Movimiento de Comprobante RC"
const RC_MARKERS = [
  "Doc_Oficina",
  "Tipo",
  "Comprobante",
  "Mov_Cuenta",
  "Creditos",
];

/** Busca un valor en el row intentando key exacto y trimmed (headers con espacios) */
function col(row, name) {
  if (row[name] !== undefined) return row[name];
  // Fallback: buscar key trimmed
  const key = Object.keys(row).find((k) => k.trim() === name);
  return key !== undefined ? row[key] : undefined;
}

function isRCFormat(jsonData) {
  if (!jsonData.length) return false;
  const headers = Object.keys(jsonData[0]).map((h) => h.trim());
  return RC_MARKERS.filter((m) => headers.includes(m)).length >= 3;
}

// Marcadores para detectar formato "Comisiones x Cartera" (CxC)
const CXC_MARKERS = ["Fec. Abono", "Doc. CxC", "Base", "Vendedor", "Fec. CxC"];

function isCxCFormat(jsonData) {
  if (!jsonData.length) return false;
  const headers = Object.keys(jsonData[0]).map((h) => h.trim());
  return CXC_MARKERS.filter((m) => headers.includes(m)).length >= 4;
}

/**
 * Transforma filas CxC (Comisiones x Cartera) al formato plano de recaudo.
 * Todo viene directo del archivo — sin enrichment de DB.
 */
function transformCxC(jsonData) {
  return jsonData
    .filter((row) => String(col(row, "Cuenta") || "").trim() === CUENTA_CXC)
    .map((row) => ({
      comprobante: [col(row, "Tipo"), col(row, "Id Comp"), col(row, "Comprob")]
        .filter(Boolean)
        .join("-"),
      fecha_abono: parseExcelDate(col(row, "Fec. Abono")),
      cliente_nit: String(col(row, "Cliente") || "").trim(),
      cliente_nombre: String(col(row, "Nombre Cliente") || "").trim(),
      factura: String(col(row, "Doc. CxC") || "").trim(),
      fecha_cxc: parseExcelDate(col(row, "Fec. CxC")),
      fecha_vence: parseExcelDate(col(row, "Fec. Vence")),
      vendedor_codigo: String(col(row, "Vendedor") || "").trim(),
      valor_recaudo: parseFloat(col(row, "Base")) || 0,
      dias_mora: Math.max(0, parseInt(col(row, "Días")) || 0),
    }))
    .filter((r) => r.valor_recaudo > 0);
}

/**
 * Enriquece filas de recaudo con exclusiones de marca/producto.
 * Cruza factura → ventas → catálogo → exclusiones.
 */
async function enrichRecaudoExclusions(rows) {
  const facturas = [...new Set(rows.map((r) => r.factura).filter(Boolean))];
  if (facturas.length === 0) return rows;

  const facturasConPrefijo = facturas.flatMap((f) => [`FELE-${f}`, `FCI-${f}`]);

  try {
    const [ventasRows, catalogo, exclusiones] = await Promise.all([
      batchIN(
        "distrimm_comisiones_ventas",
        "factura, producto_codigo, costo",
        "factura",
        facturasConPrefijo,
      ),
      supabase
        .from("distrimm_productos_catalogo")
        .select("codigo, marca")
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        }),
      supabase
        .from("distrimm_comisiones_exclusiones")
        .select("tipo, valor")
        .eq("activa", true)
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        }),
    ]);

    if (exclusiones.length === 0) return rows;

    const { productExclusionSet, brandExclusionSet, productBrandMap } =
      buildExclusionLookups(exclusiones, catalogo);

    // Mapear factura (sin prefijo) → lista de { producto_codigo, costo }
    const facturaProductos = {};
    ventasRows.forEach((v) => {
      const num = String(v.factura || "").replace(/^(FELE|FCI)-/, "");
      if (!num || !v.producto_codigo) return;
      if (!facturaProductos[num]) facturaProductos[num] = [];
      facturaProductos[num].push({
        codigo: v.producto_codigo,
        costo: Number(v.costo) || 0,
      });
    });

    // Consultar exclusiones ya aplicadas en cargas previas
    const yaDescontadoRows =
      facturas.length > 0
        ? await batchIN(
            "distrimm_comisiones_recaudos",
            "factura, valor_excluido_marca",
            "factura",
            facturas,
          )
        : [];
    const yaDescontadoMap = {};
    yaDescontadoRows.forEach((r) => {
      const f = String(r.factura || "");
      if (!f) return;
      yaDescontadoMap[f] =
        (yaDescontadoMap[f] || 0) + Number(r.valor_excluido_marca || 0);
    });

    // Acumulador para pagos múltiples a la misma factura dentro de esta carga
    const descontadoEnEstaCarga = {};

    return rows.map((row) => {
      const productos = facturaProductos[row.factura];
      if (!productos || productos.length === 0) return row;

      let costoExcluido = 0;
      productos.forEach((p) => {
        const info = getExclusionInfo(
          p.codigo,
          productExclusionSet,
          brandExclusionSet,
          productBrandMap,
        );
        if (info.excluded) costoExcluido += p.costo;
      });

      if (costoExcluido === 0) return row;

      // Solo descontar lo que falta (DB previas + rows anteriores de esta carga)
      const previo =
        (yaDescontadoMap[row.factura] || 0) +
        (descontadoEnEstaCarga[row.factura] || 0);
      const pendiente = Math.max(0, costoExcluido - previo);
      if (pendiente === 0) return row;

      const valorExcluidoMarca = Math.min(
        Math.round(pendiente),
        row.valor_recaudo,
      );

      descontadoEnEstaCarga[row.factura] =
        (descontadoEnEstaCarga[row.factura] || 0) + valorExcluidoMarca;

      return { ...row, _valor_excluido_marca: valorExcluidoMarca };
    });
  } catch (err) {
    if (import.meta.env.DEV)
      console.warn("[enrichRecaudoExclusions] Error:", err.message);
    return rows;
  }
}

/**
 * Transforma filas RC (diario contable) al formato plano de recaudo.
 * Solo toma líneas de cuenta CxC Clientes con crédito > 0.
 */
function transformRC(jsonData) {
  return jsonData
    .filter((row) => {
      const cuenta = String(col(row, "Mov_Cuenta") || "").trim();
      const anulado = String(col(row, "Anulado") || "").toLowerCase();
      return cuenta === CUENTA_CXC && anulado !== "sí" && anulado !== "si";
    })
    .map((row) => ({
      comprobante: [
        col(row, "Tipo"),
        col(row, "Comprobante"),
        col(row, "Doc_NumDocumento"),
      ]
        .filter(Boolean)
        .join("-"),
      fecha_abono: parseExcelDate(col(row, "Fecha")),
      cliente_nit: String(col(row, "Mov_Tercero") || "").trim(),
      factura: String(col(row, "Mov_DocDetalle") || "").trim(),
      valor_recaudo: parseFloat(col(row, "Creditos")) || 0,
      cliente_nombre: "",
      vendedor_codigo: "",
      fecha_cxc: null,
      fecha_vence: null,
      dias_mora: 0,
    }))
    .filter((r) => r.valor_recaudo > 0);
}

/**
 * Enriquece filas RC con datos de clientes y cartera desde Supabase.
 * @param {Array} rows - Filas transformadas de RC
 * @returns {Promise<Array>} Filas con nombre, vendedor, mora
 */
/**
 * Ejecuta queries `.in()` en lotes de 200 para evitar límites de Supabase.
 */
async function batchIN(table, selectCols, field, ids, orderCol) {
  const BATCH = 200;
  const all = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    let q = supabase
      .from(table)
      .select(selectCols)
      .in(field, ids.slice(i, i + BATCH));
    if (orderCol) q = q.order(orderCol, { ascending: true });
    const { data, error } = await q;
    if (error) throw error;
    if (data) all.push(...data);
  }
  return all;
}

async function enrichFromDB(rows) {
  const nits = [...new Set(rows.map((r) => r.cliente_nit).filter(Boolean))];
  const facturas = [...new Set(rows.map((r) => r.factura).filter(Boolean))];
  // Buscar con todos los prefijos de factura del ERP (FELE- y FCI-)
  const facturasConPrefijo = facturas.flatMap((f) => [`FELE-${f}`, `FCI-${f}`]);

  let clientes = [];
  let items = [];
  let ventasVendedor = [];
  try {
    [clientes, items, ventasVendedor] = await Promise.all([
      nits.length > 0
        ? batchIN(
            "distrimm_clientes",
            "no_identif, nombre_completo, vendedor_codigo",
            "no_identif",
            nits,
          )
        : [],
      facturas.length > 0
        ? batchIN(
            "cartera_items",
            "id, documento_id, tercero_nit, fecha_emision, fecha_vencimiento, dias_mora, vendedor_codigo, valor_saldo",
            "documento_id",
            facturas,
            "id",
          )
        : [],
      // Buscar vendedor y fecha en ventas por factura (FELE-XXXXX)
      facturasConPrefijo.length > 0
        ? batchIN(
            "distrimm_comisiones_ventas",
            "factura, vendedor_codigo, fecha",
            "factura",
            facturasConPrefijo,
          )
        : [],
    ]);
  } catch (err) {
    if (import.meta.env.DEV)
      console.warn("[enrichFromDB] Error cargando datos:", err.message);
  }

  const clienteMap = Object.fromEntries(
    clientes.map((c) => [String(c.no_identif), c]),
  );

  // Object.fromEntries toma el último duplicado; order ascending → más reciente gana
  const carteraMap = Object.fromEntries(
    items.map((c) => [String(c.documento_id), c]),
  );

  // Fallback: vendedor por NIT desde cartera (si una factura del mismo NIT tiene vendedor, usarlo)
  const nitVendedorCartera = {};
  items.forEach((c) => {
    const nit = String(c.tercero_nit || "").trim();
    if (nit && c.vendedor_codigo && !nitVendedorCartera[nit]) {
      nitVendedorCartera[nit] = c.vendedor_codigo;
    }
  });

  // Mapeo factura (sin prefijo) → { vendedor_codigo, fecha } de ventas
  const ventaInfoMap = {};
  ventasVendedor.forEach((v) => {
    const num = String(v.factura || "").replace(/^(FELE|FCI)-/, "");
    if (!num) return;
    // Guardar el primer match (no sobreescribir si ya existe)
    if (!ventaInfoMap[num]) {
      ventaInfoMap[num] = {
        vendedor_codigo: v.vendedor_codigo || "",
        fecha: v.fecha || null,
      };
    }
  });

  return rows.map((row) => {
    const c = clienteMap[row.cliente_nit];
    const f = carteraMap[row.factura];
    const venta = ventaInfoMap[row.factura];

    let diasMora;
    let sinMatch = !f;

    // Calcular días desde EMISIÓN hasta PAGO (no desde vencimiento)
    const fechaAbono = row.fecha_abono
      ? new Date(row.fecha_abono + "T12:00:00")
      : null;

    if (f?.fecha_emision && fechaAbono) {
      // Match en cartera → calcular días desde emisión hasta pago (mínimo 0)
      const fechaEmision = new Date(f.fecha_emision + "T12:00:00");
      diasMora = Math.max(
        0,
        Math.round((fechaAbono - fechaEmision) / 86400000),
      );
    } else if (venta?.fecha && fechaAbono) {
      // Sin match en cartera pero SÍ en ventas → calcular días desde venta hasta pago (mínimo 0)
      const fechaVenta = new Date(venta.fecha + "T12:00:00");
      diasMora = Math.max(0, Math.round((fechaAbono - fechaVenta) / 86400000));
      sinMatch = false;
    } else if (f) {
      // Match en cartera pero sin fecha_emision → fallback a dias_mora de cartera
      diasMora = f.dias_mora ?? 0;
    } else {
      // Sin match en ningún lado → desconocido
      diasMora = -1;
    }

    // Vendedor prioridad: ventas (por factura) → cartera (por factura) → cartera (por NIT) → clientes maestro
    const vendedorVenta = venta?.vendedor_codigo;
    const vendedorCarteraNit = nitVendedorCartera[row.cliente_nit];

    // Mantener valor_recaudo del RC (lo que realmente se pagó, no el saldo total de la factura)
    return {
      ...row,
      cliente_nombre: c?.nombre_completo || row.cliente_nit,
      vendedor_codigo:
        vendedorVenta ||
        f?.vendedor_codigo ||
        vendedorCarteraNit ||
        c?.vendedor_codigo ||
        "",
      fecha_cxc: f?.fecha_emision || venta?.fecha || null,
      fecha_vence: f?.fecha_vencimiento || null,
      dias_mora: diasMora,
      _sinMatchCartera: sinMatch,
    };
  });
}

// Parses a date value from Excel (serial number or dd/MM/yyyy string).
function parseExcelDate(raw) {
  if (!raw) return null;
  if (typeof raw === "number") {
    const d = new Date(1899, 11, 30);
    d.setDate(d.getDate() + raw);
    return d.toISOString().split("T")[0];
  }
  const s = String(raw).trim();
  const parts = s.split("/");
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  // ISO fallback
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

export default function RecaudoUploadModal({ isOpen, onClose, onSuccess }) {
  const [confirmProps, confirm] = useConfirm();
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [fechaPeriodo, setFechaPeriodo] = useState(getColombiaTodayISO);
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
      setFileName(selectedFile.name);
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
        const wb = XLSX.read(data, { type: "array", cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];

        // Headers en Row 0 (RC) o Row 1 (plano con fila decorativa)
        let jsonData = XLSX.utils.sheet_to_json(ws, { range: 0 });
        if (jsonData.length === 0)
          jsonData = XLSX.utils.sheet_to_json(ws, { range: 1 });
        if (jsonData.length === 0)
          throw new Error("El archivo parece estar vacio.");

        const periodoDate = new Date(fechaPeriodo + "T00:00:00");
        const periodoYear = periodoDate.getFullYear();
        const periodoMonth = periodoDate.getMonth() + 1;

        let processed;

        if (isRCFormat(jsonData)) {
          // Formato "Movimiento de Comprobante RC" (diario contable)
          const transformed = transformRC(jsonData);
          if (transformed.length === 0)
            throw new Error(
              "No se encontraron líneas de CxC (cuenta " +
                CUENTA_CXC +
                ") en el archivo.",
            );
          const enriched = await enrichFromDB(transformed);
          // Enriquecer con exclusiones de marca (CRÍTICO #3: RC necesita valor_excluido_marca)
          const withExclusions = await enrichRecaudoExclusions(enriched);
          processed = withExclusions
            .map((row) => ({
              ...row,
              // dias_mora negativo = factura vigente (pagada antes de vencer) → comisionable
              // _sinMatchCartera = desconocido → no comisionable (política conservadora)
              // CRÍTICO #4: rechazar dias_mora = -1 (desconocido) junto con _sinMatchCartera
              // RC: requiere match en cartera porque sin él no sabemos mora real
              aplica_comision:
                !row._sinMatchCartera &&
                row.dias_mora >= 0 &&
                row.dias_mora <= DIAS_MORA_LIMITE,
              periodo_year: periodoYear,
              periodo_month: periodoMonth,
            }))
            .filter((r) => r.valor_recaudo > 0);
        } else if (isCxCFormat(jsonData)) {
          // Formato "Comisiones x Cartera" (datos directos del ERP)
          const transformed = transformCxC(jsonData);
          if (transformed.length === 0)
            throw new Error(
              "No se encontraron líneas de CxC (cuenta " +
                CUENTA_CXC +
                ") en el archivo.",
            );
          const withExclusions = await enrichRecaudoExclusions(transformed);
          processed = withExclusions
            .map((row) => ({
              ...row,
              // CRÍTICO #4: rechazar dias_mora = -1 (desconocido)
              // CxC: confiamos en mora del ERP; excluimos si 100% costo es de marca excluida
              aplica_comision:
                row.dias_mora >= 0 &&
                row.dias_mora <= DIAS_MORA_LIMITE &&
                (row._valor_excluido_marca || 0) < row.valor_recaudo,
              periodo_year: periodoYear,
              periodo_month: periodoMonth,
            }))
            .filter((r) => r.valor_recaudo > 0);
        } else {
          // Intentar CxC con row 1 (fila decorativa en row 0)
          const retryData = XLSX.utils.sheet_to_json(ws, { range: 1 });
          if (retryData.length > 0 && isCxCFormat(retryData)) {
            const transformed = transformCxC(retryData);
            if (transformed.length === 0)
              throw new Error(
                "No se encontraron líneas de CxC (cuenta " +
                  CUENTA_CXC +
                  ") en el archivo.",
              );
            // CRÍTICO #1: enriquecer con exclusiones ANTES de calcular aplica_comision
            const withExclusions = await enrichRecaudoExclusions(transformed);
            processed = withExclusions
              .map((row) => ({
                ...row,
                // Usar _valor_excluido_marca (asignado por enrichRecaudoExclusions)
                // no _excluded (variable que nunca se asigna)
                // CRÍTICO #4: rechazar dias_mora = -1 (desconocido)
                aplica_comision:
                  row.dias_mora >= 0 &&
                  row.dias_mora <= DIAS_MORA_LIMITE &&
                  (row._valor_excluido_marca || 0) < row.valor_recaudo,
                periodo_year: periodoYear,
                periodo_month: periodoMonth,
              }))
              .filter((r) => r.valor_recaudo > 0);
          } else {
            throw new Error(
              "Formato no reconocido. Se esperaba 'Comisiones x Cartera' o 'Movimiento de Comprobante RC'.",
            );
          }
        }

        if (processed.length === 0)
          throw new Error("No se encontraron registros validos.");
        setFullData(processed);
        setPreviewData(processed.slice(0, 5));
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

    try {
      const totalRecaudado = fullData.reduce((s, r) => s + r.valor_recaudo, 0);
      const totalComisionable = fullData
        .filter((r) => r.aplica_comision)
        .reduce((s, r) => s + r.valor_recaudo, 0);
      const excluidos = fullData.filter((r) => !r.aplica_comision).length;

      // 0. Verificar duplicados por periodo
      const { data: existing } = await supabase
        .from("distrimm_comisiones_cargas_recaudo")
        .select("id, nombre_archivo")
        .eq("fecha_periodo", fechaPeriodo);

      if (existing?.length > 0) {
        const nombres = existing.map((e) => e.nombre_archivo).join(", ");
        const ok = await confirm({
          title: "Carga duplicada",
          message: `Ya existe${existing.length > 1 ? "n" : ""} ${existing.length} carga${existing.length > 1 ? "s" : ""} de recaudos para esta fecha (${nombres}). ¿Deseas reemplazarla${existing.length > 1 ? "s" : ""}?`,
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
        dias_mora: r.dias_mora,
        aplica_comision: r.aplica_comision,
        periodo_year: r.periodo_year,
        periodo_month: r.periodo_month,
      }));

      setProgress(30);

      // Atomic RPC: insert carga + recaudos + cleanup duplicados en una transacción
      const { error: rpcErr } = await supabase.rpc("fn_upload_recaudos", {
        p_carga: {
          nombre_archivo: fileName || "Recaudo",
          fecha_periodo: fechaPeriodo,
          total_registros: fullData.length,
          total_recaudado: totalRecaudado,
          total_comisionable: totalComisionable,
          registros_excluidos_mora: excluidos,
        },
        p_recaudos: rows,
      });

      if (rpcErr) throw rpcErr;

      setProgress(100);
      setStep("success");
      sileo.success("Recaudos cargados exitosamente");
      setTimeout(() => {
        onSuccess();
        handleClose();
      }, 1500);
    } catch (err) {
      if (import.meta.env.DEV) console.error("Upload recaudos error:", err);
      setError("Error al guardar: " + (err?.message || JSON.stringify(err)));
      setStep("preview");
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  // Banner stats
  const countSinMatch = fullData.filter((r) => r._sinMatchCartera).length;
  const countConExclMarca = fullData.filter(
    (r) => (r._valor_excluido_marca || 0) > 0,
  ).length;
  const countExcluidoMora = fullData.filter(
    (r) => !r.aplica_comision && r.dias_mora > DIAS_MORA_LIMITE,
  ).length;
  const totalRecaudado = fullData.reduce((s, r) => s + r.valor_recaudo, 0);
  const totalExcluidoMarca = fullData.reduce(
    (s, r) => s + (r._valor_excluido_marca || 0),
    0,
  );
  const totalExcluidoMora = fullData
    .filter((r) => !r.aplica_comision && r.dias_mora > DIAS_MORA_LIMITE)
    .reduce((s, r) => s + r.valor_recaudo, 0);
  const totalComisionable =
    totalRecaudado - totalExcluidoMarca - totalExcluidoMora;

  return (
    <>
      <ConfirmDialog {...confirmProps} />
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
          <div className="bg-slate-900 p-4 flex justify-between items-center text-white shrink-0">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Upload size={20} className="text-emerald-400" /> Cargar Recaudos
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
                  <p className="font-bold mb-1">
                    Excel de Recaudos (Comisiones x Cartera o Movimiento RC)
                  </p>
                  <p className="text-xs text-emerald-600">
                    Detecta automáticamente el formato. Filas con dias_mora &gt;{" "}
                    {DIAS_MORA_LIMITE} se marcan como no comisionables.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">
                    Periodo de Recaudo
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Calendar size={18} className="text-emerald-600" />
                    </div>
                    <input
                      type="date"
                      value={fechaPeriodo}
                      onChange={(e) => setFechaPeriodo(e.target.value)}
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm font-medium"
                    />
                  </div>
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
                      id="recaudo-file"
                    />
                    <label
                      htmlFor="recaudo-file"
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
                          <span className="text-xs text-emerald-700 font-medium mt-1 uppercase tracking-wide">
                            Archivo Seleccionado
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
                          <span className="text-xs text-slate-400 mt-2">
                            Soporta .xls / .xlsx
                          </span>
                        </>
                      )}
                    </label>
                  </div>
                </div>

                <button
                  onClick={handleAnalyze}
                  disabled={!file}
                  className="w-full py-3 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 transition-all"
                >
                  Analizar y Previsualizar <ArrowRight size={18} />
                </button>
              </div>
            )}

            {step === "preview" && (
              <div className="space-y-6">
                {/* Banner */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
                  <Wallet className="text-amber-600 shrink-0" size={24} />
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm uppercase tracking-wide mb-1 text-amber-800">
                      Recaudos Detectados
                    </h4>
                    <p className="text-sm text-amber-700">
                      {fullData.length} recibos — Comisionable:{" "}
                      {formatFullCurrency(totalComisionable)}
                      {countExcluidoMora > 0 &&
                        ` · Mora >${DIAS_MORA_LIMITE}d: ${formatFullCurrency(totalExcluidoMora)} (${countExcluidoMora} recibos)`}
                      {totalExcluidoMarca > 0 &&
                        ` · Marca: ${formatFullCurrency(totalExcluidoMarca)} (${countConExclMarca} facturas)`}
                      {countSinMatch > 0 &&
                        ` · ${countSinMatch} sin match en cartera`}
                      . Total: {formatFullCurrency(totalRecaudado)}
                    </p>
                  </div>
                </div>

                {/* Preview table */}
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
                          <th className="px-3 py-2">Fecha Abono</th>
                          <th className="px-3 py-2 text-right">Base</th>
                          <th className="px-3 py-2 text-center">Días</th>
                          <th className="px-3 py-2 text-center">Aplica</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewData.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-xs font-medium">
                              {row.vendedor_codigo}
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
                            <td className="px-3 py-2 text-xs text-right font-mono">
                              {formatFullCurrency(row.valor_recaudo)}
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
                            <td className="px-3 py-2 text-center">
                              <span
                                className={cn(
                                  "text-[10px] font-bold px-2 py-0.5 rounded-full",
                                  row.aplica_comision
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-rose-100 text-rose-700",
                                )}
                              >
                                {row.aplica_comision ? "Sí" : "No"}
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
                    className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors"
                  >
                    Cancelar / Corregir
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="flex-[2] px-4 py-3 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-emerald-900/20 flex items-center justify-center gap-2 transition-all"
                  >
                    <CheckCircle size={18} /> Guardar {fullData.length} recaudos
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
                  Guardando Recaudos...
                </h4>
                <p className="text-slate-500 text-sm mb-6">Por favor espera.</p>
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
              <div className="flex flex-col items-center justify-center py-12 text-emerald-600">
                <CheckCircle size={64} className="mb-4" />
                <h4 className="text-2xl font-bold mb-2">Carga Exitosa!</h4>
                <p className="text-slate-500">
                  {fullData.length} recaudos guardados correctamente.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
