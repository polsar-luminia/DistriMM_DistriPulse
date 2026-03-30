export function dedupeRecaudosByCargaId(rows) {
  const seen = new Set();
  return (rows || []).filter((r) => {
    // Include fecha_abono to distinguish multiple payments on the same invoice
    const key = `${r.carga_id ?? ""}|${r.cliente_nit ?? ""}|${r.factura ?? ""}|${r.comprobante ?? ""}|${r.fecha_abono ?? ""}|${r.valor_recaudo ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildReporteMensualState({
  cargas,
  ventas,
  recaudos,
  presupuestosMarca,
  presupuestosRecaudo,
  liquidacion,
  snapshotTotales,
  year,
  month,
  isSnapshot,
  isStale = false,
  snapshotDate = null,
}) {
  return {
    cargas,
    ventas,
    recaudos,
    presupuestosMarca,
    presupuestosRecaudo,
    liquidacion,
    snapshotTotales,
    year,
    month,
    isSnapshot,
    isStale: isSnapshot ? isStale : false,
    snapshotDate: isSnapshot ? snapshotDate : null,
  };
}
