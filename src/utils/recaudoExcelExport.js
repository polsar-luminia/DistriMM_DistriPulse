import { sileo } from "sileo";

/**
 * Clasifica un recaudo según lo que la vista `distrimm_recaudos_comisionables`
 * realmente evaluó. `dias_mora_comision` cuenta desde la EMISIÓN de la factura
 * (la medida del umbral de mora), mientras que `dias_mora` viene del ERP
 * contado desde el vencimiento y no sirve para explicar la exclusión.
 * @param {object} r - Fila de recaudo
 * @returns {"comisionable"|"mora"|"marca"|"parcial"|"sin_factura"}
 */
export function getMotivoRecaudo(r) {
  const exclMarca = Number(r.valor_excluido_marca || 0);
  if (!r.aplica_comision) {
    const dias = r.dias_mora_comision ?? r.dias_mora;
    return dias == null ? "sin_factura" : "mora";
  }
  if (exclMarca > 0 && exclMarca >= Number(r.valor_recaudo || 0)) return "marca";
  if (exclMarca > 0) return "parcial";
  return "comisionable";
}

function motivoLabel(motivo, diasMoraLimite) {
  switch (motivo) {
    case "mora":
      return `Excluido mora >${diasMoraLimite}d`;
    case "marca":
      return "100% marca excluida";
    case "parcial":
      return "Marca parcial";
    case "sin_factura":
      return "Sin factura";
    default:
      return "Comisionable";
  }
}

/**
 * Valor que efectivamente comisiona un recaudo: base menos exclusión de marca
 * e IVA cuando aplica, cero cuando quedó excluido por mora o sin factura.
 */
function valorComisionable(r) {
  if (!r.aplica_comision) return 0;
  return (
    Number(r.valor_recaudo || 0) -
    Number(r.valor_excluido_marca || 0) -
    Number(r.valor_iva || 0)
  );
}

export function buildResumenRows(vendedorStats, totals, vendedorNombres) {
  const rows = vendedorStats.map((v) => ({
    Vendedor: vendedorNombres[v.vendedor_codigo] || v.vendedor_codigo,
    "Cod Vendedor": v.vendedor_codigo,
    "Total Recaudado": v.totalRecaudado,
    Comisionable: v.totalComisionable,
    "Excluido Mora": v.excluidoMora,
    "Excluido Marca": v.excluidoMarca,
    "IVA Descontado": v.excluidoIva,
    "Recibos Mora": v.countMora,
    "Recibos Marca": v.countMarca,
    Recibos: v.items.length,
  }));
  rows.push({
    Vendedor: "TOTALES",
    "Cod Vendedor": "",
    "Total Recaudado": totals.totalRecaudado,
    Comisionable: totals.totalComisionable,
    "Excluido Mora": totals.totalExcluidoMora,
    "Excluido Marca": totals.totalExcluidoMarca,
    "IVA Descontado": totals.totalExcluidoIva,
    "Recibos Mora": totals.countMora,
    "Recibos Marca": totals.countMarca,
    Recibos: vendedorStats.reduce((s, v) => s + v.items.length, 0),
  });
  return rows;
}

export function buildDetalleRows(recaudos, vendedorNombres, diasMoraLimite) {
  return recaudos.map((r) => ({
    Vendedor:
      vendedorNombres[r.vendedor_codigo] || r.vendedor_codigo || "SIN VENDEDOR",
    "Cod Vendedor": r.vendedor_codigo || "",
    "NIT Cliente": r.cliente_nit || "",
    Cliente: r.cliente_nombre || "",
    Origen: r.origen === "contado" ? "Contado" : "Crédito",
    Factura: r.factura || "",
    Comprobante: r.comprobante || "",
    "Fecha Abono": r.fecha_abono || "",
    "Fecha Vence": r.fecha_vence || "",
    "Valor Recaudo": Number(r.valor_recaudo || 0),
    "Excluido Marca": Number(r.valor_excluido_marca || 0),
    IVA: Number(r.valor_iva || 0),
    Comisionable: valorComisionable(r),
    "Dias Mora": r.dias_mora_comision ?? r.dias_mora ?? "",
    Estado: motivoLabel(getMotivoRecaudo(r), diasMoraLimite),
  }));
}

/**
 * Genera y descarga el informe de recaudos en Excel: resumen por vendedor,
 * detalle recibo a recibo y los parámetros/filtros con que se generó.
 * @param {object} params
 * @param {object[]} params.recaudos - Recaudos YA filtrados (lo que se ve es lo que se exporta)
 * @param {object[]} params.vendedorStats - Agregado por vendedor sobre esos recaudos
 * @param {object} params.totals - Totales del periodo filtrado
 * @param {Record<string,string>} params.vendedorNombres - Mapa codigo → nombre
 * @param {string} params.periodoLabel - Ej. "Julio-2026"
 * @param {number} params.diasMoraLimite - Umbral de mora vigente
 * @param {{vendedor: string, origen: string, estado: string}} params.filtros - Etiquetas de los filtros aplicados
 */
export async function exportRecaudoExcel({
  recaudos,
  vendedorStats,
  totals,
  vendedorNombres,
  periodoLabel,
  diasMoraLimite,
  filtros,
}) {
  const XLSX = await import("xlsx-js-style");

  const resumenRows = buildResumenRows(vendedorStats, totals, vendedorNombres);
  const detalleRows = buildDetalleRows(
    recaudos,
    vendedorNombres,
    diasMoraLimite,
  );
  const parametrosRows = [
    { Parametro: "Periodo", Valor: periodoLabel },
    { Parametro: "Vendedor", Valor: filtros.vendedor },
    { Parametro: "Origen", Valor: filtros.origen },
    { Parametro: "Estado", Valor: filtros.estado },
    { Parametro: "Umbral de mora (dias)", Valor: diasMoraLimite },
    { Parametro: "Recibos exportados", Valor: recaudos.length },
    {
      Parametro: "Generado",
      Valor: new Date().toLocaleString("es-CO", {
        timeZone: "America/Bogota",
      }),
    },
  ];

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(resumenRows);
  const ws2 = XLSX.utils.json_to_sheet(detalleRows);
  const ws3 = XLSX.utils.json_to_sheet(parametrosRows);

  ws1["!cols"] = [
    { wch: 30 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
  ];
  ws2["!cols"] = [
    { wch: 28 },
    { wch: 12 },
    { wch: 14 },
    { wch: 32 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 14 },
    { wch: 10 },
    { wch: 22 },
  ];
  ws3["!cols"] = [{ wch: 24 }, { wch: 30 }];

  XLSX.utils.book_append_sheet(wb, ws1, "Resumen por Vendedor");
  XLSX.utils.book_append_sheet(wb, ws2, "Detalle de Recaudos");
  XLSX.utils.book_append_sheet(wb, ws3, "Parametros");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  XLSX.writeFile(wb, `Recaudos_${periodoLabel}_${timestamp}.xlsx`);
  sileo.success("Informe de recaudos exportado");
}
