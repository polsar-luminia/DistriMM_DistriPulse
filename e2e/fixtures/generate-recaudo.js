import * as XLSX from "xlsx-js-style";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Genera un Excel de recaudo (formato plano) compatible con RecaudoUploadModal.
 *
 * Mapeo por indice posicional (formato plano, range:1 salta fila decorativa):
 *   4  → comprobante
 *   5  → fecha_abono
 *   7  → cliente_nit
 *   8  → cliente_nombre
 *   10 → factura
 *   12 → fecha_cxc
 *   13 → fecha_vence
 *   14 → vendedor_codigo
 *   15 → valor_recaudo
 *   16 → dias_mora
 */
export function generateRecaudoExcel() {
  // Header row (row 0 — decorative, skipped)
  const header = [
    "Tipo",
    "Comprobante",
    "Consecutivo",
    "Tercero_NIT",
    "Comprobante_RC",
    "Fecha_Abono",
    "Tipo_Cuenta",
    "NIT_Cliente",
    "Nombre_Cliente",
    "Sucursal",
    "Factura",
    "Fecha_Factura",
    "Fecha_CXC",
    "Fecha_Vencimiento",
    "Cod_Vendedor",
    "Valor_Recaudo",
    "Dias_Mora",
  ];

  const row1 = [
    "RC",
    "RC001",
    "1",
    "9990000001",
    "RC001",
    "15/01/2025",
    "CXC",
    "9990000001",
    "E2ETEST Cliente Uno",
    "001",
    "FAC-E2E-001",
    "01/01/2025",
    "01/01/2025",
    "31/01/2025",
    "9990",
    250000,
    0,
  ];

  const row2 = [
    "RC",
    "RC002",
    "2",
    "9990000001",
    "RC002",
    "20/01/2025",
    "CXC",
    "9990000001",
    "E2ETEST Cliente Uno",
    "001",
    "FAC-E2E-002",
    "02/01/2025",
    "02/01/2025",
    "28/02/2025",
    "9990",
    150000,
    0,
  ];

  const ws = XLSX.utils.aoa_to_sheet([header, row1, row2]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Recaudo");

  const filePath = join(tmpdir(), `e2e-recaudo-${Date.now()}.xlsx`);
  writeFileSync(filePath, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  return filePath;
}
