// Parser del PDF "Informe de Ventas y Devoluciones por Forma de Pago" del ERP.
// Reconstruye documentos (FV/DV) con sus líneas de forma de pago para alimentar
// el flujo de comisiones de contado. Validado contra el resumen del propio PDF.

let _pdfjs = null;

async function loadPdfjs() {
  if (_pdfjs) return _pdfjs;
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const workerModule = await import(
      "pdfjs-dist/build/pdf.worker.min.mjs?url"
    );
    pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
  }
  _pdfjs = pdfjs;
  return pdfjs;
}

const Y_TOLERANCE = 2.5;

// Agrupa items de pdfjs (con coords) en líneas visuales por coordenada Y.
// Devuelve líneas en orden de lectura (top→bottom, left→right).
export function groupItemsToLines(items, pageNum = 1) {
  const valid = (items || []).filter(
    (it) => it && typeof it.str === "string" && Array.isArray(it.transform),
  );
  // Ordenar por Y descendente (PDF coords: Y crece hacia arriba)
  const sorted = [...valid].sort((a, b) => b.transform[5] - a.transform[5]);
  const groups = [];
  for (const item of sorted) {
    const y = item.transform[5];
    const x = item.transform[4];
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.y - y) <= Y_TOLERANCE) {
      last.items.push({ x, str: item.str });
      // Recalcular Y como promedio para estabilidad
      last.y = (last.y * (last.items.length - 1) + y) / last.items.length;
    } else {
      groups.push({ y, items: [{ x, str: item.str }], page: pageNum });
    }
  }
  // Ordenar items por X dentro de cada línea
  for (const g of groups) {
    g.items.sort((a, b) => a.x - b.x);
    g.text = g.items
      .map((it) => it.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return groups
    .filter((g) => g.text.length > 0)
    .map((g) => ({ text: g.text, y: g.y, page: g.page, items: g.items }));
}

// Parse un número "1,234,567.89" o "1.234.567,89" a Number
function parseAmount(s) {
  if (s == null) return NaN;
  const clean = String(s).trim().replace(/\s/g, "");
  if (!clean) return NaN;
  // Formato US (coma=miles, punto=decimal): "1,234,567.89"
  if (/^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(clean)) {
    return Number(clean.replace(/,/g, ""));
  }
  // Formato CO (punto=miles, coma=decimal): "1.234.567,89"
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(clean)) {
    return Number(clean.replace(/\./g, "").replace(",", "."));
  }
  // Solo dígitos
  if (/^-?\d+(\.\d+)?$/.test(clean)) return Number(clean);
  return NaN;
}

const RE_DOC_HEADER =
  /^([\d,]+)\s+(.+?)\s+(\d{2}\/\d{2})\s+(FV-\d|DV-\d)\s+(\d+)\s+(FELE|FCI)\s+(\d+)\s+([\d,.]+)(?:\s+(Anulado))?$/;

// Línea de FP en bloque de documento: cuenta(4-8 dígitos) fp(1-3) descripcion... cuota tercero documento valor
// Ejemplo: "13050501 3 CREDITO CLIENTES 1 222222222 22615 74,000.00"
const RE_FP_LINE =
  /^(\d{4,8})\s+(\d{1,3})\s+(.+?)\s+(\d{1,3})\s+(\d{1,15})\s+(\d{1,15})\s+([\d,.]+)$/;

// Línea de resumen por cuenta: cuenta fp descripcion valor (sin tercero/documento/cuota)
// Ejemplo: "13050501 3 CREDITO CLIENTES 1,033,867,803.00"
const RE_RESUMEN_FP = /^(\d{4,8})\s+(\d{1,3})\s+(.+?)\s+([\d,.]+)$/;

const RE_TOTALES_DOC = /^Totales\s+Documento\s*:\s*([\d,.]+)/i;
const RE_TOTAL_DEV = /^Total\s+Devoluciones\s*:?\s*([\d,.]+)/i;
const RE_TOTAL_VEN = /^Total\s+Ventas\s*:?\s*([\d,.]+)/i;
const RE_TOTAL_INFORME = /^Total\s+del\s+Informe\s*:?\s*([\d,.]+)/i;
const RE_TOTAL_FP = /^Total\s+Formas\s+de\s+Pago\s*:?\s*([\d,.]+)/i;
const RE_PERIODO =
  /Fecha\s+Desde:\s*(\d{2}\/\d{2}\/\d{4})\s+Hasta\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i;
const RE_DOC_TYPE_DV = /^Devoluciones\s*$/i;
const RE_DOC_TYPE_VE = /^Ventas\s*$/i;
const RE_RESUMEN_HEADER = /Resumen\s+Forma\s+de\s+Pago\s+Agrupadas/i;
const RE_FP_HEADER =
  /^Cuenta\s+FP\s+Descripcion\s+de\s+la\s+Forma\s+de\s+Pago/i;

// Convierte dd/MM con un periodo {desdeYear} → ISO yyyy-MM-dd
function toISODate(ddmm, baseYear) {
  if (!ddmm) return null;
  const m = ddmm.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return null;
  return `${baseYear}-${m[2]}-${m[1]}`;
}

// Re-une líneas que el PDF parte por wrap visual (descripciones, nombres largos).
// La regla: si la línea no empieza con un patrón conocido (NIT con comas, número de cuenta,
// "Cuenta", "Totales", "Total ", "Devoluciones", "Ventas", "Resumen", periodo header),
// es continuación de la previa.
function isLineStarter(text) {
  if (RE_FP_HEADER.test(text)) return true;
  if (RE_TOTALES_DOC.test(text)) return true;
  if (RE_TOTAL_DEV.test(text)) return true;
  if (RE_TOTAL_VEN.test(text)) return true;
  if (RE_TOTAL_INFORME.test(text)) return true;
  if (RE_TOTAL_FP.test(text)) return true;
  if (RE_DOC_TYPE_DV.test(text)) return true;
  if (RE_DOC_TYPE_VE.test(text)) return true;
  if (RE_RESUMEN_HEADER.test(text)) return true;
  if (RE_PERIODO.test(text)) return true;
  // NIT / identificación: empieza con dígitos (con comas)
  if (/^[\d,]{4,}\s+[A-Z]/i.test(text)) return true;
  // Línea FP: empieza con cuenta numérica de 4+ dígitos seguida de espacio y dígito (FP)
  if (/^\d{4,8}\s+\d{1,3}\b/.test(text)) return true;
  // Headers de tabla
  if (/^Identificaci[oó]n/i.test(text)) return true;
  if (/^Impreso el:/i.test(text)) return true;
  if (/^Tipo de Documento\s*:/i.test(text)) return true;
  if (/^OFICINAS\s*:/i.test(text)) return true;
  if (/^TODAS LAS FORMAS DE PAGO/i.test(text)) return true;
  if (/^NIT\s*:/i.test(text)) return true;
  if (/^Informe de Ventas/i.test(text)) return true;
  return false;
}

// Re-une líneas-continuación
export function mergeWrappedLines(lines) {
  const out = [];
  for (const line of lines) {
    if (out.length === 0) {
      out.push({ ...line });
      continue;
    }
    if (isLineStarter(line.text)) {
      out.push({ ...line });
    } else {
      const last = out[out.length - 1];
      last.text = `${last.text} ${line.text}`.replace(/\s+/g, " ").trim();
    }
  }
  return out;
}

// Detecta las coordenadas X de cada columna mirando el header de la tabla FP:
// "Cuenta FP Descripcion de la Forma de Pago Cuota Tercero Documento Valor Forma Pago"
// Devuelve { cuenta, fp, descripcion, cuota, tercero, documento, valor }
function detectarColumnasFP(headerLine) {
  if (!headerLine || !headerLine.items) return null;
  const items = headerLine.items;
  const findX = (predicate) => {
    const it = items.find((i) => predicate(i.str));
    return it ? it.x : null;
  };
  // Estrategia: buscar tokens exactos. El header puede venir tokenizado en items
  // separados o juntados — usamos find por predicado.
  const cuenta = findX((s) => /^Cuenta\b/i.test(s));
  const fp = findX((s) => /^FP$/i.test(s));
  const descripcion = findX((s) => /^Descripcion/i.test(s));
  const cuota = findX((s) => /^Cuota\b/i.test(s));
  const tercero = findX((s) => /^Tercero\b/i.test(s));
  const documento = findX((s) => /^Documento\b/i.test(s));
  // El header tiene "Valor Forma Pago" al final; matcheamos "Valor" como prefix.
  const valor = findX((s) => /^Valor\b/i.test(s));
  if (
    cuenta == null ||
    fp == null ||
    descripcion == null ||
    cuota == null ||
    tercero == null ||
    documento == null ||
    valor == null
  )
    return null;
  return { cuenta, fp, descripcion, cuota, tercero, documento, valor };
}

// Asigna cada item (con X) a la columna más cercana.
function asignarPorColumnas(items, cols) {
  const buckets = {
    cuenta: [],
    fp: [],
    descripcion: [],
    cuota: [],
    tercero: [],
    documento: [],
    valor: [],
  };
  const colNames = Object.keys(cols);
  for (const it of items) {
    let best = null;
    let bestDist = Infinity;
    for (const name of colNames) {
      const d = Math.abs(it.x - cols[name]);
      if (d < bestDist) {
        bestDist = d;
        best = name;
      }
    }
    if (best) buckets[best].push(it);
  }
  return buckets;
}

// Construye una línea FP a partir de buckets por columna.
// Devuelve null si no es válida (ej. sin cuenta).
function buildFpFromBuckets(buckets) {
  const join = (arr) =>
    arr
      .map((it) => it.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  const cuenta = join(buckets.cuenta);
  const fpStr = join(buckets.fp);
  const desc = join(buckets.descripcion);
  const cuotaStr = join(buckets.cuota);
  const terceroStr = join(buckets.tercero).replace(/\s+/g, ""); // re-unir NIT partido
  const documentoStr = join(buckets.documento);
  const valorStr = join(buckets.valor);

  if (!cuenta || !/^\d{4,8}$/.test(cuenta)) return null;
  if (!fpStr || !/^\d{1,3}$/.test(fpStr)) return null;
  if (!valorStr) return null;

  return {
    cuenta,
    fp: Number(fpStr),
    descripcion: desc,
    cuota: Number(cuotaStr) || 1,
    tercero: terceroStr,
    documento: documentoStr,
    valor: parseAmount(valorStr),
  };
}

function fpLineIdentity(linea) {
  return [
    linea.cuenta,
    linea.fp,
    linea.cuota,
    linea.documento,
    Math.round((Number(linea.valor) || 0) * 100),
  ].join("|");
}

function sumFpLines(lineas) {
  return (lineas || []).reduce((s, l) => s + (Number(l.valor) || 0), 0);
}

function dedupeRepeatedFpLines(doc) {
  if (!doc?.lineas || doc.lineas.length < 2) return;

  const seen = new Set();
  const deduped = [];
  for (const linea of doc.lineas) {
    const key = fpLineIdentity(linea);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(linea);
  }

  if (deduped.length === doc.lineas.length) return;

  // El ERP repite algunas filas FP en saltos de pagina. Solo descartamos
  // duplicados si eso acerca la suma FP al total confirmado del documento.
  const originalDiff = Math.abs(sumFpLines(doc.lineas) - doc.total);
  const dedupedDiff = Math.abs(sumFpLines(deduped) - doc.total);
  if (dedupedDiff <= originalDiff) {
    doc._lineasDuplicadasOmitidas = doc.lineas.length - deduped.length;
    doc.lineas = deduped;
  }
}

// Procesa líneas RAW (sin mergear) usando coordenadas X de columnas para las
// líneas FP. Esto soluciona el caso del NIT partido visualmente en 2 líneas
// y la descripción partida ("CONTADO BANCOLOMBIA / EMPRESA").
export function parseLines(rawLines) {
  let baseYear = new Date().getFullYear();
  let periodoDesde = null;
  let periodoHasta = null;

  // Extraer periodo
  for (const l of rawLines) {
    const m = l.text.match(RE_PERIODO);
    if (m) {
      const desde = m[1].split("/");
      periodoDesde = `${desde[2]}-${desde[1]}-${desde[0]}`;
      const hasta = m[2].split("/");
      periodoHasta = `${hasta[2]}-${hasta[1]}-${hasta[0]}`;
      baseYear = Number(desde[2]);
      break;
    }
  }

  // Detectar columnas FP del primer header de tabla "Cuenta FP Descripcion..."
  let cols = null;
  for (const l of rawLines) {
    if (RE_FP_HEADER.test(l.text)) {
      cols = detectarColumnasFP(l);
      if (cols) break;
    }
  }

  const documentos = [];
  const resumen = {
    totalDevoluciones: null,
    totalVentas: null,
    totalInforme: null,
    porCuentaVentas: {},
    porCuentaDevoluciones: {},
  };

  let currentSection = "header"; // header | dv | ve | resumen | end
  let currentDoc = null;
  let inFpBlock = false;
  let currentFpBuckets = null;
  let resumenSubseccion = null;
  let pendingHeader = null; // para reunir doc header con cliente partido en 2 líneas

  const pushFpRow = () => {
    if (!currentFpBuckets || !currentDoc) {
      currentFpBuckets = null;
      return;
    }
    const linea = buildFpFromBuckets(currentFpBuckets);
    if (linea) currentDoc.lineas.push(linea);
    currentFpBuckets = null;
  };

  const pushDocumento = (doc) => {
    if (!doc) return;
    dedupeRepeatedFpLines(doc);
    documentos.push(doc);
  };

  const tryParseDocHeader = (text, page) => {
    const dh = text.match(RE_DOC_HEADER);
    if (!dh) return null;
    const tipoComp = dh[4];
    const tipo = tipoComp.startsWith("DV") ? "DV" : "FV";
    return {
      tipo,
      tipoComprobante: tipoComp,
      nit: dh[1].replace(/,/g, ""),
      cliente: dh[2].trim(),
      fechaCorta: dh[3],
      fecha: toISODate(dh[3], baseYear),
      numeroComprobante: dh[5],
      prefijo: dh[6],
      factura: dh[7],
      total: parseAmount(dh[8]),
      anulado: !!dh[9],
      lineas: [],
      page,
    };
  };

  const flushPendingHeader = () => {
    if (!pendingHeader) return;
    const built = tryParseDocHeader(pendingHeader.text, pendingHeader.page);
    if (built) {
      if (currentDoc) pushDocumento(currentDoc);
      currentDoc = built;
    }
    pendingHeader = null;
  };

  const closeCurrentDoc = (totalConfirmado = null) => {
    pushFpRow();
    if (currentDoc) {
      if (totalConfirmado != null)
        currentDoc.totalConfirmado = totalConfirmado;
      pushDocumento(currentDoc);
      currentDoc = null;
    }
    inFpBlock = false;
  };

  const tryParseFpTextLine = (text) => {
    const fp = text.match(RE_FP_LINE);
    if (!fp) return null;
    return {
      cuenta: fp[1],
      fp: Number(fp[2]),
      descripcion: fp[3].trim(),
      cuota: Number(fp[4]) || 1,
      tercero: fp[5],
      documento: fp[6],
      valor: parseAmount(fp[7]),
    };
  };

  for (const line of rawLines) {
    const text = line.text;

    // Headers que se ignoran (aparecen en cada página)
    if (/^Identificaci[oó]n/i.test(text)) continue;
    if (/^Impreso el:/i.test(text)) continue;
    if (/^OFICINAS\s*:/i.test(text)) continue;
    if (/^TODAS LAS FORMAS DE PAGO/i.test(text)) continue;
    if (/^Informe de Ventas/i.test(text)) continue;
    if (/^NIT\s*:/i.test(text)) continue;
    if (RE_PERIODO.test(text)) continue;
    // Nombre del titular del informe ("JAVIER ANDRES MOLINA GALINDEZ")
    if (/^[A-ZÁÉÍÓÚÑ ]+$/.test(text) && text.length > 10 && !RE_DOC_TYPE_DV.test(text) && !RE_DOC_TYPE_VE.test(text)) {
      // Es un nombre en mayúsculas suelto — pero NO si es una sección
      // Solo lo skip si no estamos en un contexto donde podría ser data válida.
      if (currentSection === "header") continue;
    }

    // Cambios de sección
    if (RE_DOC_TYPE_DV.test(text)) {
      flushPendingHeader();
      closeCurrentDoc();
      currentSection = "dv";
      continue;
    }
    if (RE_DOC_TYPE_VE.test(text)) {
      flushPendingHeader();
      closeCurrentDoc();
      currentSection = "ve";
      continue;
    }
    if (RE_RESUMEN_HEADER.test(text)) {
      flushPendingHeader();
      closeCurrentDoc();
      currentSection = "resumen";
      resumenSubseccion = null;
      continue;
    }

    // Totales finales del informe
    let m;
    if ((m = text.match(RE_TOTAL_DEV))) {
      if (currentSection === "resumen") {
        resumen.totalDevoluciones =
          resumen.totalDevoluciones ?? parseAmount(m[1]);
      } else {
        resumen.totalDevoluciones = parseAmount(m[1]);
      }
      continue;
    }
    if ((m = text.match(RE_TOTAL_VEN))) {
      if (currentSection === "resumen") {
        resumen.totalVentas = resumen.totalVentas ?? parseAmount(m[1]);
      } else {
        resumen.totalVentas = parseAmount(m[1]);
      }
      continue;
    }
    if ((m = text.match(RE_TOTAL_INFORME))) {
      resumen.totalInforme = parseAmount(m[1]);
      continue;
    }
    if (RE_TOTAL_FP.test(text)) {
      currentSection = "end";
      continue;
    }

    // Resumen
    if (currentSection === "resumen") {
      const tdMatch = text.match(
        /^Tipo de Documento\s*:\s*(Ventas|Devoluciones)/i,
      );
      if (tdMatch) {
        resumenSubseccion = /Devoluciones/i.test(tdMatch[1])
          ? "devoluciones"
          : "ventas";
        continue;
      }
      const r = text.match(RE_RESUMEN_FP);
      if (r) {
        const cuenta = r[1];
        const fp = Number(r[2]);
        const descripcion = r[3].trim();
        const valor = parseAmount(r[4]);
        const target =
          resumenSubseccion === "devoluciones"
            ? resumen.porCuentaDevoluciones
            : resumen.porCuentaVentas;
        target[`${cuenta}-${fp}`] = { cuenta, fp, descripcion, valor };
      }
      continue;
    }

    if (currentSection !== "dv" && currentSection !== "ve") continue;

    // Header de tabla FP: marca inicio del bloque FP del documento actual
    if (RE_FP_HEADER.test(text)) {
      flushPendingHeader();
      pushFpRow();
      inFpBlock = true;
      continue;
    }

    // Totales Documento: cierra el doc actual
    const td = text.match(RE_TOTALES_DOC);
    if (td) {
      flushPendingHeader();
      closeCurrentDoc(parseAmount(td[1]));
      continue;
    }

    // Fallback para tests y PDFs donde no se puedan detectar columnas X.
    // En produccion se prefiere la ruta por coordenadas cuando esta disponible.
    if (currentDoc && (!cols || !line.items || line.items.length === 0)) {
      const fallbackFp = tryParseFpTextLine(text);
      if (fallbackFp) {
        pushFpRow();
        currentDoc.lineas.push(fallbackFp);
        inFpBlock = true;
        continue;
      }
    }

    // En bloque FP: asignar items a columnas X
    if (inFpBlock && cols && line.items && line.items.length > 0) {
      const buckets = asignarPorColumnas(line.items, cols);
      const cuentaJoin = buckets.cuenta
        .map((it) => it.str.replace(/\s/g, ""))
        .join("");
      const tieneCuentaValida = /^\d{4,8}$/.test(cuentaJoin);

      if (tieneCuentaValida) {
        // Nueva fila FP
        pushFpRow();
        currentFpBuckets = buckets;
      } else {
        // Continuación de la fila actual (NIT partido o desc partida)
        if (!currentFpBuckets) {
          // Caso raro: continuación sin fila previa. Ignorar.
          continue;
        }
        for (const k of Object.keys(buckets)) {
          currentFpBuckets[k].push(...buckets[k]);
        }
      }
      continue;
    }

    // Encabezado de documento
    const dh = tryParseDocHeader(text, line.page);
    if (dh) {
      flushPendingHeader();
      if (currentDoc) {
        pushDocumento(currentDoc);
        currentDoc = null;
      }
      // Doc partido entre páginas: el PDF imprime el doc header al final de
      // una página Y al inicio de la siguiente. El primero queda vacío.
      // Si el último doc agregado es idéntico y está sin líneas, descartarlo.
      const last = documentos[documentos.length - 1];
      if (
        last &&
        (!last.lineas || last.lineas.length === 0) &&
        last.tipo === dh.tipo &&
        last.factura === dh.factura &&
        last.fecha === dh.fecha &&
        last.numeroComprobante === dh.numeroComprobante &&
        Math.abs(last.total - dh.total) < 0.01
      ) {
        documentos.pop();
      }
      currentDoc = dh;
      pendingHeader = null;
      continue;
    }

    // Si la línea empieza con NIT (con comas) pero no matchea doc header completo,
    // es probablemente un doc header con cliente partido en dos líneas visuales.
    if (/^[\d,]{4,}\s+[A-Z]/i.test(text)) {
      flushPendingHeader();
      pendingHeader = { text, page: line.page };
      continue;
    }

    // Si tenemos un pendingHeader y esta línea no es starter, podría ser
    // continuación del cliente.
    if (pendingHeader) {
      pendingHeader.text = `${pendingHeader.text} ${text}`
        .replace(/\s+/g, " ")
        .trim();
      // Intentar parsear ahora
      if (tryParseDocHeader(pendingHeader.text, pendingHeader.page)) {
        flushPendingHeader();
      }
      continue;
    }
  }

  // Cerrar pendientes
  flushPendingHeader();
  closeCurrentDoc();

  return {
    periodoDesde,
    periodoHasta,
    documentos,
    resumen,
  };
}

// Valida los checksums internos del PDF: suma documentos vs totales declarados.
// Tolerancia 0.01% para evitar falsos negativos por redondeos.
export function validateChecksums(parseResult) {
  const { documentos, resumen } = parseResult;
  const TOL = 0.0001; // 0.01%
  const issues = [];

  const sumDV = documentos
    .filter((d) => d.tipo === "DV" && !d.anulado)
    .reduce((s, d) => s + (Number(d.total) || 0), 0);
  const sumFV = documentos
    .filter((d) => d.tipo === "FV" && !d.anulado)
    .reduce((s, d) => s + (Number(d.total) || 0), 0);

  if (resumen.totalDevoluciones != null) {
    const diff = Math.abs(sumDV - resumen.totalDevoluciones);
    const denom = Math.max(1, Math.abs(resumen.totalDevoluciones));
    if (diff / denom > TOL) {
      issues.push({
        tipo: "totalDevoluciones",
        esperado: resumen.totalDevoluciones,
        calculado: sumDV,
        diff,
      });
    }
  } else {
    issues.push({ tipo: "totalDevoluciones", missing: true });
  }

  if (resumen.totalVentas != null) {
    const diff = Math.abs(sumFV - resumen.totalVentas);
    const denom = Math.max(1, Math.abs(resumen.totalVentas));
    if (diff / denom > TOL) {
      issues.push({
        tipo: "totalVentas",
        esperado: resumen.totalVentas,
        calculado: sumFV,
        diff,
      });
    }
  } else {
    issues.push({ tipo: "totalVentas", missing: true });
  }

  // Verificar que cada doc cierre coherente (totalConfirmado vs total declarado)
  let docsInconsistentes = 0;
  for (const d of documentos) {
    if (d.totalConfirmado != null) {
      const diff = Math.abs(d.total - d.totalConfirmado);
      const denom = Math.max(1, Math.abs(d.total));
      if (diff / denom > TOL) docsInconsistentes++;
    }
  }
  if (docsInconsistentes > 0) {
    issues.push({ tipo: "docsInconsistentes", count: docsInconsistentes });
  }

  // Verificar suma de líneas FP por documento vs total documento
  let docsFPInconsistentes = 0;
  for (const d of documentos) {
    if (d.anulado) continue;
    if (!d.lineas || d.lineas.length === 0) continue;
    const sumLineas = d.lineas.reduce(
      (s, l) => s + (Number(l.valor) || 0),
      0,
    );
    const diff = Math.abs(sumLineas - d.total);
    const denom = Math.max(1, Math.abs(d.total));
    if (diff / denom > TOL) docsFPInconsistentes++;
  }
  if (docsFPInconsistentes > 0) {
    issues.push({
      tipo: "docsFPInconsistentes",
      count: docsFPInconsistentes,
    });
  }

  return {
    ok: issues.length === 0,
    issues,
    sumDV,
    sumFV,
    documentosCount: documentos.length,
    documentosFV: documentos.filter((d) => d.tipo === "FV").length,
    documentosDV: documentos.filter((d) => d.tipo === "DV").length,
    documentosAnulados: documentos.filter((d) => d.anulado).length,
  };
}

export async function parseContadoPdf(file) {
  const pdfjsLib = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const allLines = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageLines = groupItemsToLines(textContent.items, pageNum);
    allLines.push(...pageLines);
  }
  return parseLines(allLines);
}

// Helpers expuestos para tests
export const _internal = {
  parseAmount,
  isLineStarter,
  RE_DOC_HEADER,
  RE_FP_LINE,
  RE_RESUMEN_FP,
  RE_TOTALES_DOC,
};
