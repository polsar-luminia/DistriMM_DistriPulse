/**
 * @fileoverview ETL del Excel "Saldos de Productos" (inventario por bodega)
 * para el módulo Sugerido de Pedidos.
 * @module utils/inventarioUpload
 */
import { col, normalizeHeader, parseNumeric } from "./excelETL";
import { parseExcelDate } from "./recaudoUpload";

/** Bodegas con existencias confiables según gerencia (ago/2026) */
export const BODEGAS_CONFIABLES = [3, 5, 6];

const SALDOS_MARKERS = ["Codigo", "Bodega", "Nombre Producto", "Cantidad"];

/**
 * Detecta si el archivo es el reporte "Saldos de Productos" del ERP.
 * @param {Object[]} jsonData - Filas de sheet_to_json
 * @returns {boolean}
 */
export function isSaldosFormat(jsonData) {
  if (!jsonData?.length) return false;
  const headers = Object.keys(jsonData[0]).map(normalizeHeader);
  return SALDOS_MARKERS.every((m) => headers.includes(normalizeHeader(m)));
}

/**
 * Normaliza el código de producto al formato de 5 dígitos con ceros a la
 * izquierda usado en distrimm_comisiones_ventas. Excel puede entregar la
 * celda como número (7 en vez de "00007") si la columna pierde el formato texto.
 * @param {*} raw
 * @returns {string}
 */
export function normalizeProductoCodigo(raw) {
  const s = String(raw ?? "").trim();
  if (/^\d+$/.test(s) && s.length < 5) return s.padStart(5, "0");
  return s;
}

/**
 * El ERP usa 01/01/1900 como "nunca ha comprado" — se traduce a null.
 * @param {*} raw
 * @returns {string|null} fecha ISO o null
 */
export function parseUltCompra(raw) {
  const iso = parseExcelDate(raw);
  return iso && iso > "1950-01-01" ? iso : null;
}

/**
 * Transforma las filas del Excel de saldos al formato plano de
 * distrimm_inventario_items. Guarda TODAS las bodegas (el filtro de
 * bodegas confiables se aplica en el RPC de cálculo).
 * @param {Object[]} jsonData - Filas de sheet_to_json
 * @returns {Object[]}
 */
export function transformSaldos(jsonData) {
  return jsonData
    .map((row) => ({
      producto_codigo: normalizeProductoCodigo(col(row, "Codigo")),
      producto_nombre: String(col(row, "Nombre Producto") || "").trim(),
      bodega: parseInt(col(row, "Bodega"), 10) || 0,
      cantidad: parseNumeric(col(row, "Cantidad")),
      valor: parseNumeric(col(row, "Valor")),
      transito: parseNumeric(col(row, "Transito")),
      categoria_codigo: String(col(row, "Cat") ?? "").trim(),
      categoria_nombre: String(col(row, "Nombre Categoria") || "").trim(),
      marca: String(col(row, "Marca") || "").trim(),
      ult_compra: parseUltCompra(col(row, "Ult Compra")),
      ult_val_compra: parseNumeric(col(row, "Ult. Val. Compra")),
      ult_val_venta: parseNumeric(col(row, "Ult. Val. Venta")),
      precio_medio: parseNumeric(col(row, "PrecioMedio")),
    }))
    .filter(
      (r) =>
        r.producto_codigo &&
        r.bodega > 0 &&
        (r.cantidad !== 0 || r.transito !== 0),
    );
}
