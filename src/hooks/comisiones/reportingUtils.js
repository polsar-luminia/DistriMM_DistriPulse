/**
 * Elimina filas repetidas **dentro de una misma carga**, nada más.
 *
 * La llave incluye `carga_id` a propósito: un mismo abono presente en dos
 * cargas distintas son dos filas legítimas desde el punto de vista de esta
 * función, y las conserva (hay un test que lo fija).
 *
 * OJO — esto NO protege contra sumar dos veces el mismo dinero cuando un mes
 * tiene carga manual y carga del ERP. Eso se resuelve aguas arriba, filtrando
 * `fuente='erp'` en la consulta (ver `getRecaudosByPeriodo`). El nombre viejo
 * —`dedupeRecaudosByCargaId`— sugería una garantía que nunca dio.
 *
 * @param {Object[]} rows
 * @returns {Object[]}
 */
export function dedupeRecaudosDentroDeCarga(rows) {
  const seen = new Set();
  return (rows || []).filter((r) => {
    // fecha_abono distingue varios abonos sobre la misma factura
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
  anomalyWarning = null,
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
    anomalyWarning,
  };
}
