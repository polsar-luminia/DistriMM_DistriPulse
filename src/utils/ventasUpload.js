const VENTAS_FORMAT_ERROR =
  "Formato no reconocido. Se esperaba 'Ventas de Productos por Factura'.";

const VENTAS_REQUIRED_HEADERS = [
  "Vend",
  "Producto",
  "Cliente",
  "Factura",
  "ValorTotal",
  "Costo",
  "Tipo",
];

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function col(row, name) {
  if (!row || typeof row !== "object") return undefined;
  if (row[name] !== undefined) return row[name];

  const wanted = normalizeHeader(name);
  const key = Object.keys(row).find((k) => normalizeHeader(k) === wanted);
  return key !== undefined ? row[key] : undefined;
}

function hasVentasHeaders(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return false;

  const headers = new Set(Object.keys(rows[0]).map(normalizeHeader));
  return VENTAS_REQUIRED_HEADERS.every((h) => headers.has(normalizeHeader(h)));
}

function parseNumeric(value) {
  if (value === null || value === undefined || value === "") return 0;
  let s = String(value).trim();
  // Formato colombiano: 1.234.567,89 (puntos = miles, coma = decimal)
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(",", ".");
  }
  const parsed = Number.parseFloat(s);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseVentaRow(row) {
  const item = {
    vendedor_codigo: String(col(row, "Vend") || "").trim(),
    vendedor_nit: String(col(row, "Nit Vendedor") || "").trim(),
    vendedor_nombre: String(col(row, "Nombre Vendedor") || "").trim(),
    producto_codigo: String(col(row, "Producto") || "").trim(),
    producto_descripcion: String(col(row, "Descripcion Producto") || "").trim(),
    cliente_nit: String(col(row, "Cliente") || "").trim(),
    cliente_nombre: String(col(row, "Nombre Cliente") || "").trim(),
    municipio: String(col(row, "Municipio") || "").trim(),
    fecha_raw: col(row, "Fecha"),
    factura: String(col(row, "Factura") || "").trim(),
    precio: parseNumeric(col(row, "Precio")),
    descuento: parseNumeric(col(row, "Descto")),
    valor_unidad: parseNumeric(col(row, "Val Unidad")),
    cantidad: parseNumeric(col(row, "Cant")),
    valor_total: parseNumeric(col(row, "ValorTotal")),
    costo: parseNumeric(col(row, "Costo")),
    tipo: String(col(row, "Tipo") || "VE")
      .trim()
      .toUpperCase(),
  };

  if (item.tipo === "DV") {
    item.valor_total = -Math.abs(item.valor_total);
    item.costo = -Math.abs(item.costo);
  }

  return item;
}

export function parseVentasRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(VENTAS_FORMAT_ERROR);
  }

  if (!hasVentasHeaders(rows)) {
    throw new Error(VENTAS_FORMAT_ERROR);
  }

  const processed = rows.map(parseVentaRow);
  const filtered = processed.filter(
    (r) => r.producto_codigo && r.valor_total !== 0,
  );

  if (filtered.length === 0) {
    throw new Error("No se encontraron registros validos.");
  }

  return filtered;
}

export function parseVentasWorkbookRows(primaryRows, fallbackRows) {
  const candidates = [primaryRows, fallbackRows].filter(
    (rows) => Array.isArray(rows) && rows.length > 0,
  );

  let formatError = null;

  for (const rows of candidates) {
    try {
      return parseVentasRows(rows);
    } catch (err) {
      if (err instanceof Error && err.message === VENTAS_FORMAT_ERROR) {
        formatError = err;
        continue;
      }
      throw err;
    }
  }

  throw formatError || new Error(VENTAS_FORMAT_ERROR);
}

export { VENTAS_FORMAT_ERROR };
