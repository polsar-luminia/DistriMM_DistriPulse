/**
 * @fileoverview Excel export for the Reporte Mensual tab.
 * Mirrors reportePDF.js pattern — pure export utility, no React.
 * @module utils/reporteExcelMensual
 */

import * as XLSX from "xlsx-js-style";

const MESES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

/**
 * Generates and downloads a multi-sheet Excel workbook for the monthly report.
 */
export function generarReporteExcelMensual({
  vendedorData,
  classifiedVentas,
  cargas,
  grandTotals,
  selectedMonth,
  selectedYear,
}) {
  // Sheet 1: Resumen Mensual
  const resumenRows = vendedorData.map((v) => ({
    Vendedor: `${v.vendedor_nombre || "Sin nombre"} (#${v.vendedor_codigo})`,
    "Dias Trabajados": v.diasTrabajados,
    "Total Ventas": v.totalVentas,
    "Ventas Excluidas": v.ventasExcluidas,
    "Ventas Comisionables": v.ventasComisionables,
    "Margen $": v.margenComisionable,
    "Margen %": Number((v.margenPct || 0).toFixed(1)),
    "Facturas Comisionables": v.numFacturas,
  }));
  resumenRows.push({
    Vendedor: "TOTALES",
    "Dias Trabajados": "",
    "Total Ventas": grandTotals.totalVentas,
    "Ventas Excluidas": grandTotals.ventasExcluidas,
    "Ventas Comisionables": grandTotals.ventasComisionables,
    "Margen $": grandTotals.margenComisionable,
    "Margen %": Number((grandTotals.margenPct || 0).toFixed(1)),
    "Facturas Comisionables": "",
  });

  // Sheet 2: Detalle Comisionable
  const comisionableRows = classifiedVentas
    .filter((v) => !v.excluded)
    .map((v) => ({
      Vendedor: v.vendedor_nombre || v.vendedor_codigo,
      Fecha: v.fecha,
      Factura: v.factura,
      "Cod Producto": v.producto_codigo,
      Descripcion: v.producto_descripcion,
      Cliente: v.cliente_nombre,
      Cantidad: Number(v.cantidad || 0),
      "Valor Total": Number(v.valor_total || 0),
      Costo: Number(v.costo || 0),
      "Margen $": Number(v.margen_valor || 0),
      "Margen %": Number(v.margen_pct || 0),
    }));

  // Sheet 3: Detalle Excluido
  const excluidoRows = classifiedVentas
    .filter((v) => v.excluded)
    .map((v) => ({
      Vendedor: v.vendedor_nombre || v.vendedor_codigo,
      Fecha: v.fecha,
      Factura: v.factura,
      "Cod Producto": v.producto_codigo,
      Descripcion: v.producto_descripcion,
      Cliente: v.cliente_nombre,
      Cantidad: Number(v.cantidad || 0),
      "Valor Total": Number(v.valor_total || 0),
      Costo: Number(v.costo || 0),
      "Margen $": Number(v.margen_valor || 0),
      "Margen %": Number(v.margen_pct || 0),
      "Motivo Exclusion": v.reason || "",
    }));

  // Sheet 4: Resumen por Dia
  const diaMap = {};
  cargas.forEach((c) => {
    diaMap[c.fecha_ventas] = c.nombre_archivo;
  });
  const ventasPorDia = {};
  classifiedVentas.forEach((v) => {
    const d = v.fecha || "sin-fecha";
    if (!ventasPorDia[d]) ventasPorDia[d] = { total: 0, comisionable: 0, excluido: 0 };
    const val = Number(v.valor_total || 0);
    ventasPorDia[d].total += val;
    if (v.excluded) ventasPorDia[d].excluido += val;
    else ventasPorDia[d].comisionable += val;
  });
  const diaRows = Object.entries(ventasPorDia)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, vals]) => ({
      Fecha: fecha,
      "Archivo Cargado": diaMap[fecha] || "",
      "Total Ventas": vals.total,
      Comisionables: vals.comisionable,
      Excluidas: vals.excluido,
    }));

  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.json_to_sheet(resumenRows);
  ws1["!cols"] = [{ wch: 35 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 10 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Resumen Mensual");

  const ws2 = XLSX.utils.json_to_sheet(comisionableRows.length > 0 ? comisionableRows : [{}]);
  ws2["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 25 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws2, "Detalle Comisionable");

  const ws3 = XLSX.utils.json_to_sheet(excluidoRows.length > 0 ? excluidoRows : [{}]);
  ws3["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 25 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws3, "Detalle Excluido");

  const ws4 = XLSX.utils.json_to_sheet(diaRows.length > 0 ? diaRows : [{}]);
  ws4["!cols"] = [{ wch: 12 }, { wch: 35 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws4, "Resumen por Dia");

  XLSX.writeFile(wb, `Reporte_Comisiones_${MESES[selectedMonth - 1]}_${selectedYear}.xlsx`);
}
