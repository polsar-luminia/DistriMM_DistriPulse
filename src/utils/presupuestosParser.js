// Parses the CONDICION VENDEDORES PRESEPUESTO workbook into structured vendor data.
// Excel layout: col A = vendor name, col B = "MARCAS", then brand rows below.
// Brand cols: marca (B), % venta (C), presupuesto mes (F), bonificacion (I).
// Recaudo tier data in cols K-N near vendor sections.
export function parsePresupuestosExcel(workbook, vendorNameToCode, XLSX) {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  if (!ws) throw new Error("No se encontró la hoja de datos.");

  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const maxRow = range.e.r;

  // Helper to read a cell value
  const cell = (r, c) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cellObj = ws[addr];
    return cellObj ? cellObj.v : null;
  };

  const warnings = [];
  const vendors = [];

  // Scan for vendor header rows: col A has a name, col B has "MARCAS"
  for (let r = 0; r <= maxRow; r++) {
    const colA = cell(r, 0);
    const colB = cell(r, 1);

    if (!colA || !colB) continue;
    const nameStr = String(colA).trim().toUpperCase();
    const labelStr = String(colB).trim().toUpperCase();
    if (labelStr !== "MARCAS" && !labelStr.startsWith("MARCA")) continue;

    // Found a vendor header
    const vendorName = nameStr;
    const vendorCode = vendorNameToCode[vendorName];
    if (!vendorCode) {
      warnings.push(
        `Vendedor "${vendorName}" no tiene código asignado en el sistema. Se omitirá.`,
      );
      continue;
    }

    // Parse brand rows below this header until we hit an empty brand or a summary row
    const marcas = [];
    for (let br = r + 1; br <= Math.min(r + 30, maxRow); br++) {
      const marca = cell(br, 1);
      if (!marca) break; // empty brand = end of section

      const marcaStr = String(marca).trim().toUpperCase();
      if (!marcaStr || marcaStr === "MARCAS") break;

      const pctRaw = parseFloat(cell(br, 2)) || 0;
      const metaMes = parseFloat(cell(br, 5)) || 0;
      // Normalize commission percentage:
      // - pctRaw > 1 (e.g. 2): percentage form → 2/100 = 0.02
      // - pctRaw >= 0.1 (e.g. 0.5): likely 0.5% not 50% → 0.5/100 = 0.005
      // - pctRaw < 0.1 (e.g. 0.02): already decimal → keep as 0.02 (2%)
      let pctComision;
      if (pctRaw >= 0.1) {
        pctComision = pctRaw / 100;
      } else {
        pctComision = pctRaw;
      }

      // Skip text values in presupuesto_mes (some special brands have notes)
      const metaVentas = typeof metaMes === "number" ? Math.round(metaMes) : 0;

      marcas.push({
        marca: marcaStr,
        pct_comision: pctComision,
        meta_ventas: metaVentas,
      });
    }

    if (marcas.length === 0) {
      warnings.push(`Vendedor "${vendorName}" no tiene marcas detectadas.`);
      continue;
    }

    vendors.push({
      nombre: vendorName,
      codigo: vendorCode,
      marcas,
      recaudo: null, // filled below
    });
  }

  if (vendors.length === 0) {
    throw new Error(
      "No se detectaron secciones de vendedores. Verifica que el archivo tiene el formato correcto (columna A: nombre vendedor, columna B: 'MARCAS').",
    );
  }

  // Parse recaudo tiers from cols K-N (indices 10-13).
  // The pattern in the Excel for each vendor's recaudo section:
  // - One row with vendor name (col K) — identifies who this recaudo belongs to
  // - Next row: threshold multipliers (0.8, 0.9, 1, 1.4)
  // - Next row: actual $ meta values (computed from multipliers * base)
  // - Next row: percentage rates (0.005, 0.009, 0.012, 0.015)
  // We scan for rows where col K has a known vendor name
  for (let r = 0; r <= maxRow; r++) {
    const colK = cell(r, 10);
    if (!colK) continue;
    const nameK = String(colK).trim().toUpperCase();

    // Check if this is a vendor name reference
    const matchedVendor = vendors.find((v) => nameK.includes(v.nombre));
    if (!matchedVendor) continue;

    // Look at the next few rows for the recaudo pattern
    // Row r+1: threshold multipliers or values
    // Row r+2: meta values
    // Row r+3: percentage rates
    // We need to find the meta_recaudo (a large number) and the 4 percentages
    let metaRecaudo = null;
    let pcts = null;

    for (let scan = r + 1; scan <= Math.min(r + 5, maxRow); scan++) {
      const k = cell(scan, 10);
      const l = cell(scan, 11);
      const m = cell(scan, 12);
      const n = cell(scan, 13);

      // Look for the percentage row (all 4 values small decimals like 0.005-0.015)
      if (
        typeof k === "number" &&
        typeof l === "number" &&
        typeof m === "number" &&
        typeof n === "number" &&
        k < 0.1 &&
        l < 0.1 &&
        m < 0.1 &&
        n < 0.1
      ) {
        pcts = [k, l, m, n];
      }

      // Look for the meta row (contains a value >= 100M which is the collection target)
      for (const val of [k, l, m, n]) {
        if (typeof val === "number" && val >= 100000000 && !metaRecaudo) {
          metaRecaudo = val;
        }
      }
    }

    if (metaRecaudo && pcts) {
      matchedVendor.recaudo = {
        meta_recaudo: Math.round(metaRecaudo),
        tramo1_min: 0,
        tramo1_max: 89.99,
        tramo1_pct: pcts[0],
        tramo2_min: 90,
        tramo2_max: 99.99,
        tramo2_pct: pcts[1],
        tramo3_min: 100,
        tramo3_max: 139.99,
        tramo3_pct: pcts[2],
        tramo4_min: 140,
        tramo4_pct: pcts[3],
      };
    }
  }

  // Warn about vendors without recaudo data
  for (const v of vendors) {
    if (!v.recaudo) {
      warnings.push(
        `No se detectó escala de recaudo para ${v.nombre}. Se puede agregar manualmente.`,
      );
    }
  }

  return { vendors, warnings };
}
