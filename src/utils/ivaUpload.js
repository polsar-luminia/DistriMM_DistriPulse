import { col } from "./excelETL";

/**
 * Parsea filas del Informe Diario de Ventas tipo de IVA.
 * Retorna array deduplicado de { codigo, nombre, pct_iva } con pct_iva 0, 5 o 19.
 */
export function parseIvaRows(jsonData) {
  const processed = jsonData
    .map((row) => {
      const codigo = String(
        col(row, "Producto", "producto", "PRODUCTO", "Codigo", "codigo") ?? "",
      ).trim();
      const nombre = String(
        col(row, "Nombre", "Nombre Producto", "nombre", "NOMBRE") ?? "",
      ).trim();
      const rawIva = col(row, "% Iva", "% IVA", "Pct IVA", "PctIva", "% iva");
      const pctIva = parseInt(rawIva, 10);
      return { codigo, nombre, pct_iva: pctIva };
    })
    .filter((r) => r.codigo && [0, 5, 19].includes(r.pct_iva));

  const seen = new Set();
  return processed.filter((r) => {
    if (seen.has(r.codigo)) return false;
    seen.add(r.codigo);
    return true;
  });
}
