import * as XLSX from "xlsx-js-style";

// ── Color palette ──
const C = {
  primary: [30, 41, 59],       // Slate 800
  accent: [99, 102, 241],      // Indigo 500
  emerald: [16, 185, 129],     // Emerald 500
  amber: [245, 158, 11],       // Amber 500
  rose: [244, 63, 94],         // Rose 500
  white: [255, 255, 255],
  slate: [148, 163, 184],      // Slate 400
  slate500: [100, 116, 139],
  slate700: [51, 65, 85],
  slate900: [30, 41, 59],
  lightBg: [241, 245, 250],    // Slate 50
  footerBg: [248, 250, 252],   // Slate 100
  accentLight: [238, 242, 255], // Indigo 50
  accentMid: [224, 231, 255],  // Indigo 100
  border: [226, 232, 240],     // Slate 200
};

// ── Formatters ──

const $f = (v) => {
  if (v == null || isNaN(v)) return "$0";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(v);
};

const pf = (v) => {
  if (v == null || isNaN(v)) return "0,0%";
  return v.toFixed(1).replace(".", ",") + "%";
};

const ni = (v) => {
  if (v == null || isNaN(v)) return "0";
  return Math.round(v).toLocaleString("es-CO");
};

const fmtDate = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr}T12:00:00`);
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Bogota",
  }).format(d);
};

// ── autoTable default styles ──
const tableDefaults = {
  styles: {
    fontSize: 8.5,
    cellPadding: 2.5,
    font: "helvetica",
    lineWidth: 0.1,
    lineColor: C.border,
  },
  headStyles: {
    fillColor: C.accent,
    textColor: C.white,
    fontStyle: "bold",
    fontSize: 8.5,
    cellPadding: 3,
  },
  footStyles: {
    fillColor: C.lightBg,
    textColor: C.slate900,
    fontStyle: "bold",
    fontSize: 8.5,
  },
  alternateRowStyles: { fillColor: C.footerBg },
};

// ── Grouping logic ──

function buildGroups(items, groupBy) {
  const map = {};
  for (const item of items) {
    const key =
      groupBy === "vendedor"
        ? item._vendedor || "Sin Vendedor"
        : item._municipio || "SIN MUNICIPIO";

    if (!map[key]) {
      map[key] = { key, items: [], nitSet: new Set() };
    }
    map[key].items.push(item);
    if (item.tercero_nit) map[key].nitSet.add(item.tercero_nit);
  }

  const totalCarteraGlobal = items.reduce(
    (s, i) => s + Number(i.valor_saldo || 0),
    0,
  );

  return Object.values(map)
    .map((g) => {
      const carteraTotal = g.items.reduce(
        (s, i) => s + Number(i.valor_saldo || 0),
        0,
      );
      const carteraVencida = g.items
        .filter((i) => i._estado === "VENCIDA")
        .reduce((s, i) => s + Number(i.valor_saldo || 0), 0);
      const diasMoraSum = g.items.reduce(
        (s, i) => s + Math.max(0, Number(i.dias_mora || 0)),
        0,
      );
      const numClientes = g.nitSet.size;
      return {
        key: g.key,
        items: g.items,
        numClientes,
        numFacturas: g.items.length,
        carteraTotal,
        carteraVencida,
        pctVencido: carteraTotal > 0 ? (carteraVencida / carteraTotal) * 100 : 0,
        pctParticipacion:
          totalCarteraGlobal > 0
            ? Math.round((carteraTotal / totalCarteraGlobal) * 1000) / 10
            : 0,
        ticketPromedio: numClientes > 0 ? Math.round(carteraTotal / numClientes) : 0,
        moraPromedio:
          g.items.length > 0 ? Math.round(diasMoraSum / g.items.length) : 0,
      };
    })
    .sort((a, b) => b.carteraTotal - a.carteraTotal);
}

function computeGlobalSummary(items) {
  const carteraTotal = items.reduce(
    (s, i) => s + Number(i.valor_saldo || 0),
    0,
  );
  const carteraVencida = items
    .filter((i) => i._estado === "VENCIDA")
    .reduce((s, i) => s + Number(i.valor_saldo || 0), 0);
  const nitSet = new Set(items.map((i) => i.tercero_nit).filter(Boolean));
  return {
    carteraTotal,
    carteraVencida,
    pctVencido: carteraTotal > 0 ? (carteraVencida / carteraTotal) * 100 : 0,
    numClientes: nitSet.size,
    numFacturas: items.length,
  };
}

function buildFilename(groupBy, status, ext) {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `Cartera_${groupBy}_${status}_${yyyy}-${mm}-${dd}.${ext}`;
}

function statusLabel(status) {
  if (status === "VENCIDA") return "Solo Vencida";
  if (status === "AL_DIA") return "Solo Al Día";
  return "Toda la Cartera";
}

function aggregateByClient(items) {
  const map = {};
  for (const item of items) {
    const nit = item.tercero_nit || "SIN-NIT";
    if (!map[nit]) {
      map[nit] = {
        nit,
        nombre: item._nombreCompleto || item.nombre_tercero || "—",
        municipio: item._municipio || "",
        barrio: item._barrio || "",
        celular: item._celular || "",
        direccion: item._direccion || "",
        vendedor: item._vendedor || "",
        saldoTotal: 0,
        saldoVencido: 0,
        facturas: 0,
        maxMora: 0,
        invoices: [],
      };
    }
    const c = map[nit];
    const saldo = Number(item.valor_saldo || 0);
    const mora = Number(item.dias_mora || 0);
    c.saldoTotal += saldo;
    c.facturas += 1;
    if (mora > 0) c.saldoVencido += saldo;
    if (mora > c.maxMora) c.maxMora = mora;
    c.invoices.push(item);
  }
  return Object.values(map).sort((a, b) => b.saldoTotal - a.saldoTotal);
}

export async function generarCarteraPDF({ items, groupBy, filters }) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const groups = buildGroups(items, groupBy);
  const summary = computeGlobalSummary(items);
  const groupLabel = groupBy === "vendedor" ? "Vendedor" : "Municipio";

  const cx = pageW / 2;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...C.accent);
  doc.text("DistriPulse", cx, 38, { align: "center" });

  // Accent line
  doc.setDrawColor(...C.accent);
  doc.setLineWidth(0.5);
  doc.line(cx - 30, 44, cx + 30, 44);

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(18);
  doc.setTextColor(...C.slate700);
  doc.text("Informe de Cartera", cx, 56, { align: "center" });

  // Grouping label
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...C.slate900);
  doc.text(
    `Agrupado por ${groupLabel} — ${statusLabel(filters.status)}`,
    cx,
    68,
    { align: "center" },
  );

  // ── Summary box (5 KPIs) ──
  const boxX = 30;
  const boxW = pageW - 60;
  const boxY = 78;
  const boxH = 40;

  doc.setFillColor(...C.lightBg);
  doc.setDrawColor(...C.border);
  doc.roundedRect(boxX, boxY, boxW, boxH, 3, 3, "FD");

  const metrics = [
    { label: "Cartera Total", value: $f(summary.carteraTotal), color: C.slate900 },
    { label: "Cartera Vencida", value: $f(summary.carteraVencida), color: C.rose },
    {
      label: "% Vencido",
      value: pf(summary.pctVencido),
      color: summary.pctVencido > 50 ? C.rose : C.slate900,
    },
    { label: "Clientes", value: ni(summary.numClientes), color: C.accent },
    { label: "Facturas", value: ni(summary.numFacturas), color: C.slate900 },
  ];

  const colW = boxW / metrics.length;
  metrics.forEach((m, i) => {
    const mx = boxX + colW * i + colW / 2;
    const my = boxY + boxH / 2 - 3;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...m.color);
    doc.text(m.value, mx, my, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.slate);
    doc.text(m.label, mx, my + 8, { align: "center" });
  });

  // ── Filters applied ──
  let infoY = boxY + boxH + 12;
  const filterLines = [];
  if (filters.selectedVendedores?.length > 0) {
    filterLines.push(`Vendedores: ${filters.selectedVendedores.join(", ")}`);
  }
  if (filters.selectedMunicipios?.length > 0) {
    filterLines.push(`Municipios: ${filters.selectedMunicipios.join(", ")}`);
  }
  if (filterLines.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...C.slate500);
    filterLines.forEach((line, i) => {
      doc.text(line, cx, infoY + i * 6, { align: "center" });
    });
    infoY += filterLines.length * 6 + 4;
  }

  // Generation timestamp
  const genDate = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date());
  doc.setFontSize(8);
  doc.setTextColor(...C.slate);
  doc.text(`Generado: ${genDate}`, cx, pageH - 18, { align: "center" });

  if (groups.length > 0) {
    doc.addPage();
    let y = 18;

    // Section title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...C.slate900);
    doc.text(`CARTERA POR ${groupLabel.toUpperCase()}`, 15, y);
    doc.setDrawColor(...C.accent);
    doc.setLineWidth(0.5);
    doc.line(15, y + 2, 90, y + 2);
    y += 10;

    const bodyRows = groups.map((g, i) => [
      i + 1,
      g.key,
      $f(g.carteraTotal),
      pf(g.pctParticipacion),
      $f(g.carteraVencida),
      pf(g.pctVencido),
      g.numClientes,
      g.numFacturas,
      $f(g.ticketPromedio),
      g.moraPromedio,
    ]);

    const totalClientes = new Set(
      items.map((i) => i.tercero_nit).filter(Boolean),
    ).size;

    autoTable(doc, {
      startY: y,
      head: [
        [
          "#",
          groupLabel.toUpperCase(),
          "CARTERA",
          "% PART.",
          "VENCIDA",
          "% VENC.",
          "CLIENTES",
          "FACTURAS",
          "TICKET PROM.",
          "MORA PROM.",
        ],
      ],
      body: bodyRows,
      foot: [
        [
          "",
          "TOTALES",
          $f(summary.carteraTotal),
          "100%",
          $f(summary.carteraVencida),
          pf(summary.pctVencido),
          totalClientes,
          summary.numFacturas,
          totalClientes > 0
            ? $f(Math.round(summary.carteraTotal / totalClientes))
            : "$0",
          "",
        ],
      ],
      ...tableDefaults,
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 45 },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "center" },
        7: { halign: "center" },
        8: { halign: "right" },
        9: { halign: "center" },
      },
      margin: { left: 15, right: 15 },
      didParseCell(data) {
        if (data.section !== "body") return;
        // % vencido coloring
        if (data.column.index === 5) {
          const val = parseFloat(String(data.cell.raw).replace(",", "."));
          if (val > 50) data.cell.styles.textColor = C.rose;
          else if (val > 25) data.cell.styles.textColor = C.amber;
          else data.cell.styles.textColor = C.emerald;
        }
        // % participación bold for top 3
        if (data.column.index === 3 && data.row.index < 3) {
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
  }

  groups.forEach((group) => {
    doc.addPage();
    let y = 14;

    // ── Group header bar ──
    const isHighRisk = group.pctVencido > 50;
    doc.setFillColor(...(isHighRisk ? [254, 242, 242] : C.accentLight));
    doc.roundedRect(15, y, pageW - 30, 20, 2, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...(isHighRisk ? C.rose : C.accent));
    doc.text(group.key, 20, y + 7);

    // KPIs in header
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.slate500);
    const headerKPIs = [
      `Cartera: ${$f(group.carteraTotal)}`,
      `Vencida: ${$f(group.carteraVencida)} (${pf(group.pctVencido)})`,
      `Clientes: ${group.numClientes}`,
      `Facturas: ${group.numFacturas}`,
      `Ticket: ${$f(group.ticketPromedio)}`,
      `Mora Prom: ${group.moraPromedio}d`,
    ];
    doc.text(headerKPIs.join("  |  "), 20, y + 14);

    y += 26;

    // ── Client summary table ──
    const clients = aggregateByClient(group.items);

    const detailRows = clients.map((c) => [
      c.nombre.substring(0, 32),
      c.nit,
      c.celular || "—",
      c.barrio || "—",
      c.facturas,
      $f(c.saldoTotal),
      $f(c.saldoVencido),
      c.maxMora > 0 ? `${c.maxMora}d` : "Al día",
    ]);

    const groupTotalSaldo = clients.reduce((s, c) => s + c.saldoTotal, 0);
    const groupTotalVencido = clients.reduce((s, c) => s + c.saldoVencido, 0);

    autoTable(doc, {
      startY: y,
      head: [
        [
          "CLIENTE",
          "NIT",
          "TELÉFONO",
          "BARRIO",
          "FACT.",
          "SALDO TOTAL",
          "SALDO VENCIDO",
          "MORA MÁX.",
        ],
      ],
      body: detailRows,
      foot: [
        [
          `${clients.length} clientes`,
          "",
          "",
          "",
          group.numFacturas,
          $f(groupTotalSaldo),
          $f(groupTotalVencido),
          "",
        ],
      ],
      ...tableDefaults,
      columnStyles: {
        0: { cellWidth: 52 },
        1: { cellWidth: 26 },
        2: { cellWidth: 28 },
        3: { cellWidth: 30 },
        4: { halign: "center", cellWidth: 14 },
        5: { halign: "right" },
        6: { halign: "right" },
        7: { halign: "center", cellWidth: 20 },
      },
      margin: { left: 15, right: 15 },
      didParseCell(data) {
        if (data.section !== "body") return;
        if (data.column.index === 6) {
          const raw = data.cell.raw;
          if (raw && raw !== "$0") {
            data.cell.styles.textColor = C.rose;
            data.cell.styles.fontStyle = "bold";
          }
        }
        if (data.column.index === 7) {
          const raw = data.cell.raw;
          if (raw === "Al día") {
            data.cell.styles.textColor = C.emerald;
          } else {
            const val = parseInt(raw);
            if (val > 90) data.cell.styles.textColor = [127, 29, 29];
            else if (val > 30) data.cell.styles.textColor = C.rose;
            else if (val > 0) data.cell.styles.textColor = C.amber;
          }
        }
      },
    });

    y = doc.lastAutoTable.finalY + 8;

    // Section title
    if (y > pageH - 40) {
      doc.addPage();
      y = 14;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...C.slate900);
    doc.text("DETALLE DE FACTURAS POR CLIENTE", 15, y);
    doc.setDrawColor(...C.accent);
    doc.setLineWidth(0.4);
    doc.line(15, y + 2, 115, y + 2);
    y += 8;

    clients.forEach((client) => {
      // Check if we need a new page for the client header (~35mm minimum)
      if (y > pageH - 35) {
        doc.addPage();
        y = 14;
      }

      // ── Client header bar ──
      const clientOverdue = client.saldoVencido > 0;
      doc.setFillColor(...(clientOverdue ? [254, 242, 242] : [240, 253, 244]));
      doc.roundedRect(15, y, pageW - 30, 14, 1.5, 1.5, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...(clientOverdue ? C.rose : C.emerald));
      doc.text(client.nombre.substring(0, 40), 20, y + 5);

      // Client mini-KPIs on the right
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...C.slate500);
      const clientInfo = [
        `NIT: ${client.nit}`,
        client.celular ? `Tel: ${client.celular}` : "",
        `Saldo: ${$f(client.saldoTotal)}`,
        client.saldoVencido > 0 ? `Vencido: ${$f(client.saldoVencido)}` : "Al día",
        client.maxMora > 0 ? `Mora máx: ${client.maxMora}d` : "",
      ].filter(Boolean);
      doc.text(clientInfo.join("   |   "), 20, y + 11);

      y += 18;

      // ── Client's invoices table ──
      const sortedInvoices = client.invoices
        .slice()
        .sort((a, b) => Number(b.dias_mora || 0) - Number(a.dias_mora || 0));

      const invoiceRows = sortedInvoices.map((item) => [
        item.documento || "—",
        fmtDate(item.fecha_emision),
        fmtDate(item.fecha_vencimiento),
        Number(item.dias_mora || 0),
        $f(item.valor_saldo),
        item._estado === "VENCIDA" ? "VENCIDA" : "AL DÍA",
      ]);

      autoTable(doc, {
        startY: y,
        head: [["DOCUMENTO", "EMISIÓN", "VENCIMIENTO", "DÍAS MORA", "SALDO", "ESTADO"]],
        body: invoiceRows,
        foot: [
          [
            `${client.facturas} factura${client.facturas > 1 ? "s" : ""}`,
            "",
            "",
            "",
            $f(client.saldoTotal),
            "",
          ],
        ],
        ...tableDefaults,
        headStyles: {
          ...tableDefaults.headStyles,
          fillColor: C.slate700,
          fontSize: 7.5,
          cellPadding: 2,
        },
        bodyStyles: { ...tableDefaults.styles, fontSize: 7.5 },
        footStyles: {
          ...tableDefaults.footStyles,
          fontSize: 7.5,
        },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 28 },
          2: { cellWidth: 28 },
          3: { halign: "center", cellWidth: 22 },
          4: { halign: "right", fontStyle: "bold" },
          5: { halign: "center", cellWidth: 22 },
        },
        margin: { left: 20, right: 20 },
        didParseCell(data) {
          if (data.section !== "body") return;
          // Días mora coloring
          if (data.column.index === 3) {
            const val = Number(data.cell.raw);
            if (val > 90) {
              data.cell.styles.textColor = [127, 29, 29];
              data.cell.styles.fontStyle = "bold";
            } else if (val > 30) {
              data.cell.styles.textColor = C.rose;
              data.cell.styles.fontStyle = "bold";
            } else if (val > 0) {
              data.cell.styles.textColor = C.amber;
            }
          }
          // Estado
          if (data.column.index === 5) {
            if (data.cell.raw === "VENCIDA") {
              data.cell.styles.textColor = C.rose;
              data.cell.styles.fontStyle = "bold";
            } else {
              data.cell.styles.textColor = C.emerald;
            }
          }
        },
      });

      y = doc.lastAutoTable.finalY + 6;
    });
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...C.slate);
    doc.text(
      `DistriPulse \u00B7 Informe de Cartera \u00B7 P\u00E1gina ${i} de ${totalPages}`,
      pageW / 2,
      pageH - 8,
      { align: "center" },
    );
  }

  doc.save(buildFilename(groupBy, filters.status, "pdf"));
}

export function generarCarteraExcel({ items, groupBy, filters }) {
  const groups = buildGroups(items, groupBy);
  const summary = computeGlobalSummary(items);
  const groupLabel = groupBy === "vendedor" ? "Vendedor" : "Municipio";

  // ── Sheet 1: Resumen por grupo ──
  const resumenHeaders = [
    "#",
    groupLabel,
    "Cartera Total",
    "% Participación",
    "Cartera Vencida",
    "% Vencido",
    "Clientes",
    "Facturas",
    "Ticket Promedio",
    "Mora Promedio",
  ];

  const resumenData = groups.map((g, i) => [
    i + 1,
    g.key,
    g.carteraTotal,
    g.pctParticipacion,
    g.carteraVencida,
    Math.round(g.pctVencido * 10) / 10,
    g.numClientes,
    g.numFacturas,
    g.ticketPromedio,
    g.moraPromedio,
  ]);

  // Add totals row
  resumenData.push([
    "",
    "TOTALES",
    summary.carteraTotal,
    100,
    summary.carteraVencida,
    Math.round(summary.pctVencido * 10) / 10,
    summary.numClientes,
    summary.numFacturas,
    summary.numClientes > 0
      ? Math.round(summary.carteraTotal / summary.numClientes)
      : 0,
    "",
  ]);

  const resumenSheet = XLSX.utils.aoa_to_sheet([resumenHeaders, ...resumenData]);
  resumenSheet["!cols"] = [
    { wch: 5 },
    { wch: 28 },
    { wch: 18 },
    { wch: 14 },
    { wch: 18 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 18 },
    { wch: 14 },
  ];

  // ── Sheet 2: Detalle por cliente (aggregated) ──
  const clienteHeaders = [
    "Cliente",
    "NIT",
    "Vendedor",
    "Municipio",
    "Barrio",
    "Teléfono",
    "Dirección",
    "Facturas",
    "Saldo Total",
    "Saldo Vencido",
    "Mora Máxima",
  ];

  const clients = aggregateByClient(items);
  const clienteData = clients.map((c) => [
    c.nombre,
    c.nit,
    c.vendedor,
    c.municipio,
    c.barrio,
    c.celular,
    c.direccion,
    c.facturas,
    c.saldoTotal,
    c.saldoVencido,
    c.maxMora,
  ]);

  const clienteSheet = XLSX.utils.aoa_to_sheet([clienteHeaders, ...clienteData]);
  clienteSheet["!cols"] = [
    { wch: 35 },
    { wch: 15 },
    { wch: 22 },
    { wch: 20 },
    { wch: 18 },
    { wch: 15 },
    { wch: 30 },
    { wch: 10 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
  ];

  // ── Sheet 3: Detalle facturas ──
  const facturaHeaders = [
    "Cliente",
    "NIT",
    "Vendedor",
    "Municipio",
    "Barrio",
    "Teléfono",
    "Documento",
    "Emisión",
    "Vencimiento",
    "Días Mora",
    "Estado",
    "Valor Saldo",
  ];

  const facturaData = items.map((item) => [
    item._nombreCompleto || item.nombre_tercero || "",
    item.tercero_nit || "",
    item._vendedor || "",
    item._municipio || "",
    item._barrio || "",
    item._celular || "",
    item.documento || "",
    item.fecha_emision || "",
    item.fecha_vencimiento || "",
    Number(item.dias_mora || 0),
    item._estado || "",
    Number(item.valor_saldo || 0),
  ]);

  const facturaSheet = XLSX.utils.aoa_to_sheet([facturaHeaders, ...facturaData]);
  facturaSheet["!cols"] = [
    { wch: 35 },
    { wch: 15 },
    { wch: 22 },
    { wch: 20 },
    { wch: 18 },
    { wch: 15 },
    { wch: 15 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 18 },
  ];

  // ── Build workbook ──
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, resumenSheet, "Resumen");
  XLSX.utils.book_append_sheet(wb, clienteSheet, "Clientes");
  XLSX.utils.book_append_sheet(wb, facturaSheet, "Facturas");

  XLSX.writeFile(wb, buildFilename(groupBy, filters.status, "xlsx"));
}

