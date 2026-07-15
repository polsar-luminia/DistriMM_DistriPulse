// Transforma documentos parseados del PDF (output de contadoPdfParser) a filas
// listas para insertar en distrimm_comisiones_recaudos como origen='contado'.
//
// Reglas de negocio (ver plan kind-herding-cascade.md):
// - Cuentas que empiezan por "1305" son crédito → ya vienen por CxC, se ignoran.
// - El "valor contado" de cada documento es la suma de líneas NO crédito.
// - Documentos 100% crédito o anulados se omiten.
// - DV → valor_recaudo negativo.
// - La atribucion de vendedor, mora y comisionable se resuelve luego contra DB.

import { RECAUDO_THRESHOLDS } from "../constants/thresholds";

const CUENTA_CREDITO_PREFIX = "1305";

function isCredito(linea) {
  return String(linea.cuenta || "").startsWith(CUENTA_CREDITO_PREFIX);
}

function sumarLineas(lineas, predicate) {
  return (lineas || [])
    .filter(predicate)
    .reduce((s, l) => s + (Number(l.valor) || 0), 0);
}

// Transforma un único documento parseado a una fila de recaudo (o null si se omite).
// `vendedoresPorFactura`: opcional, mapa { facturaSinPrefijo: vendedor_codigo }
export function hasRealVendedor(codigo) {
  const cod = String(codigo || "").trim();
  return cod !== "" && cod !== "SIN_VENDEDOR" && cod !== "SIN VENDEDOR";
}

export function getContadoBlockReason(row) {
  if (row?._sinMatchFactura || row?._sinMatchCartera) {
    return "Factura sin match en ventas/cartera";
  }
  if (!hasRealVendedor(row?.vendedor_codigo)) {
    return "Factura sin vendedor";
  }
  return null;
}

export function applyContadoCommissionRules(
  rows,
  diasMoraLimite = RECAUDO_THRESHOLDS.DIAS_MORA_LIMITE,
  opts = {},
) {
  const { allowSinVendedor = false } = opts;
  return (rows || []).map((row) => {
    const blockReason = getContadoBlockReason(row);
    const diasMora = Number(row.dias_mora);
    const diasValidos =
      Number.isFinite(diasMora) && diasMora >= 0 && diasMora <= diasMoraLimite;

    return {
      ...row,
      aplica_comision: !blockReason && diasValidos,
      _contado_block_reason: blockReason,
      // true cuando el override está activo y esta fila hubiera bloqueado la carga
      _contado_overridden: !!(blockReason && allowSinVendedor),
    };
  });
}

export function getContadoBlockingIssues(rows, opts = {}) {
  const { allowSinVendedor = false } = opts;
  if (allowSinVendedor) return [];
  return (rows || []).filter((row) => !!getContadoBlockReason(row));
}

export function transformDocumento(doc, periodoYear, periodoMonth, opts = {}) {
  if (!doc) return null;
  if (doc.anulado) return null;
  if (!doc.total || doc.total === 0) return null;

  const valorContado = sumarLineas(doc.lineas, (l) => !isCredito(l));
  if (valorContado === 0) return null; // 100% crédito → ya viene por CxC

  const valorRecaudo = doc.tipo === "DV" ? -valorContado : valorContado;

  const facturaNum = String(doc.factura || "").trim();
  const vendedor = opts.vendedoresPorFactura
    ? opts.vendedoresPorFactura[facturaNum] || ""
    : "";

  const comprobante = `${doc.tipoComprobante || ""}-${doc.numeroComprobante || ""}`
    .replace(/^-/, "")
    .replace(/-$/, "");

  return {
    vendedor_codigo: vendedor || "SIN_VENDEDOR",
    cliente_nit: doc.nit || null,
    cliente_nombre: doc.cliente || null,
    factura: facturaNum,
    comprobante: comprobante || null,
    fecha_abono: doc.fecha,
    fecha_cxc: doc.fecha,
    fecha_vence: doc.fecha,
    valor_recaudo: valorRecaudo,
    dias_mora: 0,
    aplica_comision: true,
    periodo_year: periodoYear,
    periodo_month: periodoMonth,
    // Para enriqueRcaudoExclusions
    _doc_total: doc.total,
    _doc_tipo: doc.tipo,
    _prefijo: doc.prefijo,
  };
}

// Transforma todo el resultado del parser a filas listas para enrichment + RPC.
// Devuelve { filas, ignorados } donde `ignorados` desglosa por motivo (audit).
export function transformContadoDocs(parseResult, periodoYear, periodoMonth, opts = {}) {
  const filas = [];
  const ignorados = {
    anulados: 0,
    soloCredito: 0,
    valorCero: 0,
  };
  for (const doc of parseResult.documentos || []) {
    if (doc.anulado) {
      ignorados.anulados++;
      continue;
    }
    if (!doc.total || doc.total === 0) {
      ignorados.valorCero++;
      continue;
    }
    const valorContado = sumarLineas(doc.lineas, (l) => !isCredito(l));
    if (valorContado === 0) {
      ignorados.soloCredito++;
      continue;
    }
    const fila = transformDocumento(doc, periodoYear, periodoMonth, opts);
    if (fila) filas.push(fila);
  }
  return { filas, ignorados };
}

// Suma totales por forma de pago para auditoría/UI.
export function resumenPorFormaDePago(parseResult) {
  const map = {};
  for (const doc of parseResult.documentos || []) {
    if (doc.anulado) continue;
    for (const l of doc.lineas || []) {
      const key = `${l.cuenta}-${l.fp}`;
      if (!map[key]) {
        map[key] = {
          cuenta: l.cuenta,
          fp: l.fp,
          descripcion: l.descripcion,
          ventas: 0,
          devoluciones: 0,
          esCredito: isCredito(l),
        };
      }
      if (doc.tipo === "DV") map[key].devoluciones += Number(l.valor) || 0;
      else map[key].ventas += Number(l.valor) || 0;
    }
  }
  return Object.values(map).sort((a, b) => b.ventas - a.ventas);
}

// Estadísticas para preview en el modal
export function statsContado(parseResult) {
  let totalContadoVentas = 0;
  let totalContadoDevoluciones = 0;
  let docsContado = 0;
  let docsMixtos = 0;
  let docsSoloCredito = 0;
  let docsAnulados = 0;

  for (const doc of parseResult.documentos || []) {
    if (doc.anulado) {
      docsAnulados++;
      continue;
    }
    const valorContado = sumarLineas(doc.lineas, (l) => !isCredito(l));
    const valorCredito = sumarLineas(doc.lineas, (l) => isCredito(l));
    if (valorContado === 0 && valorCredito > 0) docsSoloCredito++;
    else if (valorContado > 0 && valorCredito > 0) {
      docsMixtos++;
      if (doc.tipo === "DV") totalContadoDevoluciones += valorContado;
      else totalContadoVentas += valorContado;
    } else if (valorContado > 0) {
      docsContado++;
      if (doc.tipo === "DV") totalContadoDevoluciones += valorContado;
      else totalContadoVentas += valorContado;
    }
  }

  return {
    totalContadoVentas,
    totalContadoDevoluciones,
    totalContadoNeto: totalContadoVentas - totalContadoDevoluciones,
    docsContado,
    docsMixtos,
    docsSoloCredito,
    docsAnulados,
  };
}
