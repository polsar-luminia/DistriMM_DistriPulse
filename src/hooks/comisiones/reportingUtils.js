export function dedupeRecaudosByCargaId(rows) {
  const seen = new Set();
  return (rows || []).filter((r) => {
    const key = `${r.carga_id ?? ""}|${r.cliente_nit ?? ""}|${r.factura ?? ""}|${r.valor_recaudo ?? ""}`;
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
