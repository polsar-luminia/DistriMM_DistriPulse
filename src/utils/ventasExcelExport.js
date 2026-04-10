import { sileo } from "sileo";

export function buildResumenRows(comisiones, totals) {
  const rows = comisiones.map((v) => ({
    Vendedor: `${v.vendedor_nombre || "Sin nombre"} (#${v.vendedor_codigo})`,
    "Ventas Totales": Number(v.total_ventas || 0),
    "Costo Total": Number(v.total_costo || 0),
    "Sin Comision": Number(v.ventas_excluidas || 0),
    "Ventas Comisionables": Number(v.ventas_comisionables || 0),
    "Items Total": Number(v.items_total || 0),
    "Items Sin Comision": Number(v.items_excluidos || 0),
    "Items Comisionables": Number(v.items_comisionables || 0),
  }));
  rows.push({
    Vendedor: "TOTALES",
    "Ventas Totales": totals.totalVentas,
    "Costo Total": totals.totalCosto,
    "Sin Comision": totals.ventasExcluidas,
    "Ventas Comisionables": totals.ventasComisionables,
    "Items Total": comisiones.reduce(
      (s, v) => s + Number(v.items_total || 0),
      0,
    ),
    "Items Sin Comision": comisiones.reduce(
      (s, v) => s + Number(v.items_excluidos || 0),
      0,
    ),
    "Items Comisionables": comisiones.reduce(
      (s, v) => s + Number(v.items_comisionables || 0),
      0,
    ),
  });
  return rows;
}

export function buildDetalleRows(ventasDetail, checkExclusion) {
  return ventasDetail.map((item) => {
    const info = checkExclusion(item.producto_codigo);
    return {
      Vendedor: item.vendedor_nombre || item.vendedor_codigo,
      "Cod Vendedor": item.vendedor_codigo,
      "Cod Producto": item.producto_codigo,
      "Descripcion Producto": item.producto_descripcion,
      "NIT Cliente": item.cliente_nit,
      Cliente: item.cliente_nombre,
      Factura: item.factura,
      Municipio: item.municipio,
      Fecha: item.fecha,
      Cantidad: Number(item.cantidad || 0),
      Precio: Number(item.precio || 0),
      Descuento: Number(item.descuento || 0),
      "Valor Unidad": Number(item.valor_unidad || 0),
      "Valor Total": Number(item.valor_total || 0),
      Costo: Number(item.costo || 0),
      "Con Comision": info.excluded ? "NO" : "SI",
      Motivo: info.excluded ? info.reason || "Sin presupuesto" : "",
    };
  });
}

export function buildExclusionesRows(exclusiones) {
  return (exclusiones || []).map((e) => ({
    Tipo: e.tipo === "marca" ? "Marca" : "Producto",
    Valor: e.valor,
    Descripcion: e.descripcion || "",
    Motivo: e.motivo || "",
  }));
}

export async function exportVentasExcel({
  comisiones,
  ventasDetail,
  totals,
  selectedCarga,
  exclusiones,
  checkExclusion,
}) {
  const XLSX = await import("xlsx-js-style");
  const fechaLabel = selectedCarga?.fecha_ventas || "sin-fecha";

  const resumenRows = buildResumenRows(comisiones, totals);
  const detalleRows = buildDetalleRows(ventasDetail, checkExclusion);
  const exclusionesRows = buildExclusionesRows(exclusiones);

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(resumenRows);
  const ws2 = XLSX.utils.json_to_sheet(detalleRows);
  const ws3 = XLSX.utils.json_to_sheet(
    exclusionesRows.length > 0
      ? exclusionesRows
      : [{ Tipo: "", Valor: "", Descripcion: "", Motivo: "" }],
  );

  // Set column widths
  ws1["!cols"] = [
    { wch: 35 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
    { wch: 14 },
    { wch: 16 },
  ];
  ws2["!cols"] = [
    { wch: 20 },
    { wch: 10 },
    { wch: 12 },
    { wch: 30 },
    { wch: 14 },
    { wch: 25 },
    { wch: 12 },
    { wch: 15 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 20 },
  ];
  ws3["!cols"] = [{ wch: 12 }, { wch: 25 }, { wch: 35 }, { wch: 25 }];

  XLSX.utils.book_append_sheet(wb, ws1, "Resumen por Vendedor");
  XLSX.utils.book_append_sheet(wb, ws2, "Detalle de Ventas");
  XLSX.utils.book_append_sheet(wb, ws3, "Exclusiones Activas");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  XLSX.writeFile(wb, `Comisiones_${fechaLabel}_${timestamp}.xlsx`);
  sileo.success("Reporte exportado");
}
