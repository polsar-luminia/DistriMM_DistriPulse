import * as XLSX from "xlsx-js-style";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Genera un Excel de ventas compatible con VentasUploadModal.
 *
 * Mapeo por indice posicional (range:1 salta fila 0 decorativa):
 *   0  → vendedor_codigo
 *   1  → vendedor_nit
 *   2  → vendedor_nombre
 *   3  → producto_codigo
 *   5  → producto_descripcion
 *   6  → cliente_nit
 *   7  → cliente_nombre
 *   9  → municipio
 *   10 → fecha_raw
 *   15 → factura
 *   17 → precio
 *   18 → descuento
 *   19 → valor_unidad
 *   20 → cantidad
 *   24 → valor_total
 *   27 → costo
 *   29 → tipo
 */
export function generateVentasExcel() {
  // Header row (row 0 — decorative, skipped by range:1)
  const header = [
    "Cod Vendedor",
    "NIT Vendedor",
    "Nombre Vendedor",
    "Cod Producto",
    "",
    "Descripcion Producto",
    "NIT Cliente",
    "Nombre Cliente",
    "",
    "Municipio",
    "Fecha",
    "",
    "",
    "",
    "",
    "Factura",
    "",
    "Precio",
    "Descuento",
    "Valor Unidad",
    "Cantidad",
    "",
    "",
    "",
    "Valor Total",
    "",
    "",
    "Costo",
    "",
    "Tipo",
  ];

  // Data rows (index-based, matching VentasUploadModal column mapping)
  const row1 = [
    "9990",
    "900999000",
    "E2ETEST Vendedor Uno",
    "E2ETEST-PROD-001",
    "",
    "Producto Test",
    "9990000001",
    "E2ETEST Cliente Uno",
    "",
    "BOGOTA",
    "01/01/2025",
    "",
    "",
    "",
    "",
    "FAC-E2E-001",
    "",
    50000,
    0,
    50000,
    10,
    "",
    "",
    "",
    500000,
    "",
    "",
    300000,
    "",
    "VE",
  ];

  const row2 = [
    "9990",
    "900999000",
    "E2ETEST Vendedor Uno",
    "E2ETEST-PROD-001",
    "",
    "Producto Test",
    "9990000001",
    "E2ETEST Cliente Uno",
    "",
    "BOGOTA",
    "02/01/2025",
    "",
    "",
    "",
    "",
    "FAC-E2E-002",
    "",
    30000,
    0,
    30000,
    5,
    "",
    "",
    "",
    150000,
    "",
    "",
    90000,
    "",
    "VE",
  ];

  const ws = XLSX.utils.aoa_to_sheet([header, row1, row2]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Ventas");

  const filePath = join(tmpdir(), `e2e-ventas-${Date.now()}.xlsx`);
  writeFileSync(filePath, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  return filePath;
}
