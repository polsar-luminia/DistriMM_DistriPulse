import { col, parseNumeric, parseFlexibleDate } from "./excelETL";
import { format } from "date-fns";

// Re-exportar para mantener compatibilidad con imports existentes
export { col };

// Cuenta CxC Clientes para filtrar líneas contables
export const CUENTA_CXC = "13050501";

// Marcadores para detectar formato "Movimiento de Comprobante RC"
const RC_MARKERS = [
  "Doc_Oficina",
  "Tipo",
  "Comprobante",
  "Mov_Cuenta",
  "Creditos",
];

// Marcadores para detectar formato "Comisiones x Cartera" (CxC)
const CXC_MARKERS = ["Fec. Abono", "Doc. CxC", "Base", "Vendedor", "Fec. CxC"];

export function isRCFormat(jsonData) {
  if (!jsonData.length) return false;
  const headers = Object.keys(jsonData[0]).map((h) => h.trim());
  return RC_MARKERS.filter((m) => headers.includes(m)).length >= 4;
}

export function isCxCFormat(jsonData) {
  if (!jsonData.length) return false;
  const headers = Object.keys(jsonData[0]).map((h) => h.trim());
  return CXC_MARKERS.filter((m) => headers.includes(m)).length >= 4;
}

/** Wrapper de parseFlexibleDate que retorna string ISO (compatibilidad) */
export function parseExcelDate(raw) {
  const d = parseFlexibleDate(raw);
  return d ? format(d, "yyyy-MM-dd") : null;
}

/**
 * Transforma filas CxC (Comisiones x Cartera) al formato plano de recaudo.
 */
export function transformCxC(jsonData) {
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
      valor_recaudo: parseNumeric(col(row, "Base")),
      dias_mora: Math.max(0, parseInt(col(row, "Días")) || 0),
    }))
    .filter((r) => r.valor_recaudo > 0);
}

/**
 * Transforma filas RC (Movimiento de Comprobante) al formato plano de recaudo.
 */
export function transformRC(jsonData) {
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
      valor_recaudo: parseNumeric(col(row, "Creditos")),
      cliente_nombre: "",
      vendedor_codigo: "",
      fecha_cxc: null,
      fecha_vence: null,
      dias_mora: 0,
    }))
    .filter((r) => r.valor_recaudo > 0);
}

/**
 * Calcula el IVA contenido en un pago de recaudo, proporcionalmente al peso
 * de los productos gravados en la factura.
 */
export function calcularIvaFactura(productos, valorRecaudo, catalogoIvaMap) {
  let costoTotal = 0;
  let costoGravado5 = 0;
  let costoGravado19 = 0;

  productos.forEach(({ codigo, costo }) => {
    const pctIva = catalogoIvaMap[codigo] || 0;
    costoTotal += costo;
    if (pctIva === 5) costoGravado5 += costo;
    else if (pctIva === 19) costoGravado19 += costo;
  });

  if (costoTotal === 0) return 0;

  const peso5 = costoGravado5 / costoTotal;
  const peso19 = costoGravado19 / costoTotal;

  const iva5 = (valorRecaudo * peso5 * 0.05) / 1.05;
  const iva19 = (valorRecaudo * peso19 * 0.19) / 1.19;

  return Math.round(iva5 + iva19);
}
