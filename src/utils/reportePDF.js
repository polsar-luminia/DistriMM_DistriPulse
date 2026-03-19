// -- Color palette --
const INDIGO = [79, 70, 229];
const EMERALD = [16, 185, 129];
const ROSE = [239, 68, 68];
const AMBER = [245, 158, 11];
const SLATE_900 = [30, 41, 59];
const SLATE_700 = [51, 65, 85];
const SLATE_500 = [100, 116, 139];
const SLATE_400 = [148, 163, 184];
const SLATE_300 = [203, 213, 225];
const SLATE_50 = [248, 250, 252];
const INDIGO_50 = [238, 242, 255];
const INDIGO_100 = [224, 231, 255];

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const formatCOP = (value) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatDate = (dateStr) => {
  if (!dateStr) return "N/A";
  const d = new Date(`${dateStr}T12:00:00`);
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Bogota",
  }).format(d);
};

// -- Section title helper --
function drawSectionTitle(doc, text, y, color = SLATE_900) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...color);
  doc.text(text, 15, y);
  doc.setDrawColor(...INDIGO);
  doc.setLineWidth(0.5);
  doc.line(15, y + 2, 80, y + 2);
  return y + 10;
}

function drawInfoRow(doc, label, value, x, y, valueColor = SLATE_900) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...SLATE_500);
  doc.text(label, x, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...valueColor);
  doc.text(value, x + 55, y);
  return y + 6;
}

export async function generarReportePDF({
  vendedores,
  periodo,
  cargas,
  filtroVendedor,
  totals,
  daysInMonth,
  liquidacion,
}) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const mesNombre = MESES[periodo.month - 1];

  // Title block - centered
  const cx = pageW / 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...INDIGO);
  doc.text("DistriPulse", cx, 40, { align: "center" });

  // Accent line
  doc.setDrawColor(...INDIGO);
  doc.setLineWidth(0.5);
  doc.line(cx - 30, 46, cx + 30, 46);

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(18);
  doc.setTextColor(...SLATE_700);
  doc.text("Reporte de Comisiones", cx, 58, { align: "center" });

  // Period
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...SLATE_900);
  doc.text(`${mesNombre} ${periodo.year}`, cx, 72, { align: "center" });

  // Vendor filter label
  let coverY = 82;
  if (filtroVendedor) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(...INDIGO);
    doc.text(
      `Vendedor: ${filtroVendedor.vendedor_nombre || filtroVendedor.vendedor_codigo}`,
      cx,
      coverY,
      { align: "center" },
    );
    coverY += 14;
  } else {
    coverY += 6;
  }

  // -- Summary box --
  const boxX = 40;
  const boxW = pageW - 80;
  const boxY = coverY + 6;
  const boxH = 44;

  doc.setFillColor(...SLATE_50);
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(boxX, boxY, boxW, boxH, 3, 3, "FD");

  // 4 metrics in 2x2 grid
  const metrics = [
    {
      label: "Total Ventas",
      value: formatCOP(totals.totalVentas),
      color: SLATE_900,
    },
    {
      label: "Comisionables",
      value: formatCOP(totals.ventasComisionables),
      color: EMERALD,
    },
    {
      label: "Excluidas",
      value: formatCOP(totals.ventasExcluidas),
      color: ROSE,
    },
    {
      label: "Margen %",
      value: `${(totals.margenPct || 0).toFixed(1)}%`,
      color: SLATE_900,
    },
  ];

  const colW = boxW / 4;
  metrics.forEach((m, i) => {
    const mx = boxX + colW * i + colW / 2;
    const my = boxY + boxH / 2 - 4;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...m.color);
    doc.text(m.value, mx, my, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...SLATE_400);
    doc.text(m.label, mx, my + 8, { align: "center" });
  });

  // -- Secondary info --
  const uniqueDays = new Set();
  vendedores.forEach((v) => {
    (v.ventas || []).forEach((vt) => {
      if (vt.fecha) uniqueDays.add(vt.fecha);
    });
  });

  const totalFacturas = vendedores.reduce(
    (s, v) => s + (v.numFacturas || v.facturasComisionables?.size || 0),
    0,
  );

  const infoY = boxY + boxH + 14;
  const infoLines = [
    `Dias con datos: ${uniqueDays.size} de ${daysInMonth}`,
    `Vendedores activos: ${vendedores.length}`,
    `Facturas comisionables: ${totalFacturas}`,
    `Cargas incluidas: ${cargas.length} archivo${cargas.length !== 1 ? "s" : ""}`,
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SLATE_500);
  infoLines.forEach((line, i) => {
    doc.text(line, cx, infoY + i * 6, { align: "center" });
  });

  // Generation timestamp
  const now = new Date();
  const genDate = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(now);
  doc.setFontSize(8);
  doc.setTextColor(...SLATE_300);
  doc.text(`Generado: ${genDate}`, cx, pageH - 20, { align: "center" });

  if (!filtroVendedor && vendedores.length > 0) {
    doc.addPage();
    let y = 20;
    y = drawSectionTitle(doc, "Resumen por Vendedor", y);

    const bodyRows = vendedores.map((v) => [
      `${v.vendedor_nombre || "Sin nombre"} (#${v.vendedor_codigo})`,
      v.diasTrabajados,
      formatCOP(v.totalVentas),
      formatCOP(v.ventasExcluidas),
      formatCOP(v.ventasComisionables),
      formatCOP(v.margenComisionable),
      `${(v.margenPct || 0).toFixed(1)}%`,
      v.numFacturas ?? 0,
    ]);

    const footRow = [
      "TOTALES",
      "",
      formatCOP(totals.totalVentas),
      formatCOP(totals.ventasExcluidas),
      formatCOP(totals.ventasComisionables),
      formatCOP(totals.margenComisionable),
      `${(totals.margenPct || 0).toFixed(1)}%`,
      "",
    ];

    autoTable(doc, {
      startY: y,
      head: [
        [
          "Vendedor",
          "Dias",
          "Ventas Totales",
          "Excluidas",
          "Comisionables",
          "Margen $",
          "Margen %",
          "Facturas",
        ],
      ],
      body: bodyRows,
      foot: [footRow],
      headStyles: {
        fillColor: INDIGO,
        textColor: 255,
        fontSize: 8,
        fontStyle: "bold",
      },
      footStyles: {
        fillColor: INDIGO_100,
        textColor: SLATE_900,
        fontSize: 8,
        fontStyle: "bold",
      },
      bodyStyles: { fontSize: 7.5 },
      alternateRowStyles: { fillColor: SLATE_50 },
      columnStyles: {
        0: { cellWidth: 65 },
        3: { textColor: ROSE },
        4: { fontStyle: "bold", textColor: EMERALD },
      },
      margin: { left: 15, right: 15 },
      didParseCell(data) {
        if (data.column.index === 6 && data.section === "body") {
          const val = parseFloat(data.cell.raw);
          if (val >= 20) data.cell.styles.textColor = EMERALD;
          else if (val >= 10) data.cell.styles.textColor = AMBER;
          else data.cell.styles.textColor = ROSE;
        }
      },
    });
  }

  vendedores.forEach((vend) => {
    doc.addPage();
    let y = 15;

    // -- Vendor header bar --
    doc.setFillColor(...INDIGO_50);
    doc.roundedRect(15, y, pageW - 30, 16, 2, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...INDIGO);
    doc.text(
      `${vend.vendedor_nombre || "Sin nombre"} (#${vend.vendedor_codigo})`,
      20,
      y + 7,
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...SLATE_500);
    const summaryLine = `Comisionable: ${formatCOP(vend.ventasComisionables)}  |  Excluido: ${formatCOP(vend.ventasExcluidas)}  |  Margen: ${(vend.margenPct || 0).toFixed(1)}%  |  Dias: ${vend.diasTrabajados}`;
    doc.text(summaryLine, 20, y + 13);

    y += 22;

    // -- Group ventas by factura --
    const facturaMap = {};
    (vend.ventas || []).forEach((v) => {
      const key = v.factura || `sin-factura-${v.id}`;
      if (!facturaMap[key]) {
        facturaMap[key] = {
          factura: v.factura,
          fecha: v.fecha,
          cliente: v.cliente_nombre,
          comisionable: [],
          excluido: [],
          totalComisionable: 0,
          costoComisionable: 0,
          totalExcluido: 0,
        };
      }
      const f = facturaMap[key];
      const val = Number(v.valor_total || 0);
      const costo = Number(v.costo || 0);
      if (v.excluded) {
        f.excluido.push(v);
        f.totalExcluido += val;
      } else {
        f.comisionable.push(v);
        f.totalComisionable += val;
        f.costoComisionable += costo;
      }
    });

    const facturas = Object.values(facturaMap).sort((a, b) =>
      (a.fecha || "").localeCompare(b.fecha || ""),
    );

    const facturasComisionables = facturas.filter(
      (f) => f.comisionable.length > 0,
    );
    const itemsExcluidos = (vend.ventas || []).filter((v) => v.excluded);

    // -- Commissionable invoices table --
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...EMERALD);
    doc.text(`Facturas Comisionables (${facturasComisionables.length})`, 15, y);
    y += 4;

    if (facturasComisionables.length > 0) {
      const comRows = facturasComisionables.map((f) => {
        const margen =
          f.totalComisionable > 0
            ? ((f.totalComisionable - f.costoComisionable) /
                f.totalComisionable) *
              100
            : 0;
        return [
          formatDate(f.fecha),
          f.factura || "-",
          (f.cliente || "").substring(0, 35),
          f.comisionable.length,
          formatCOP(f.totalComisionable),
          formatCOP(f.costoComisionable),
          `${margen.toFixed(1)}%`,
        ];
      });

      autoTable(doc, {
        startY: y,
        head: [
          [
            "Fecha",
            "Factura",
            "Cliente",
            "Productos",
            "Valor Total",
            "Costo",
            "Margen %",
          ],
        ],
        body: comRows,
        headStyles: {
          fillColor: EMERALD,
          textColor: 255,
          fontSize: 8,
          fontStyle: "bold",
        },
        bodyStyles: { fontSize: 7.5 },
        alternateRowStyles: { fillColor: [240, 253, 244] }, // emerald-50
        columnStyles: {
          2: { cellWidth: 55 },
          4: { fontStyle: "bold" },
        },
        margin: { left: 15, right: 15 },
        didParseCell(data) {
          if (data.column.index === 6 && data.section === "body") {
            const val = parseFloat(data.cell.raw);
            if (val >= 20) data.cell.styles.textColor = EMERALD;
            else if (val >= 10) data.cell.styles.textColor = AMBER;
            else data.cell.styles.textColor = ROSE;
          }
        },
      });

      y = doc.lastAutoTable.finalY + 8;
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...SLATE_400);
      doc.text("Sin facturas comisionables", 15, y + 4);
      y += 12;
    }

    // -- Excluded products table --
    if (itemsExcluidos.length > 0) {
      const totalExcluido = itemsExcluidos.reduce(
        (s, v) => s + Number(v.valor_total || 0),
        0,
      );

      // Check if we need a new page (leave at least 40mm for the table header + some rows)
      if (y > pageH - 50) {
        doc.addPage();
        y = 20;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...SLATE_400);
      doc.text(
        `Productos Excluidos (${itemsExcluidos.length} items - ${formatCOP(totalExcluido)})`,
        15,
        y,
      );
      y += 4;

      const exclRows = itemsExcluidos.map((v) => [
        formatDate(v.fecha),
        v.factura || "-",
        `${v.producto_codigo} - ${(v.producto_descripcion || "").substring(0, 30)}`,
        formatCOP(v.valor_total),
        v.reason || "-",
      ]);

      autoTable(doc, {
        startY: y,
        head: [["Fecha", "Factura", "Producto", "Valor", "Motivo"]],
        body: exclRows,
        headStyles: {
          fillColor: [241, 245, 249], // slate-100
          textColor: SLATE_500,
          fontSize: 7.5,
          fontStyle: "bold",
        },
        bodyStyles: { fontSize: 7, textColor: SLATE_400 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: {
          2: { cellWidth: 70 },
          4: { cellWidth: 45 },
        },
        margin: { left: 15, right: 15 },
      });
    }
  });

  const liqData =
    Array.isArray(liquidacion) && liquidacion.length > 0 ? liquidacion : null;

  if (liqData) {
    // -- Liquidation Summary (only when showing all vendors) --
    if (!filtroVendedor && liqData.length > 1) {
      doc.addPage();
      let y = 20;
      y = drawSectionTitle(
        doc,
        "Liquidación de Comisiones - Resumen",
        y,
        INDIGO,
      );

      const liqRows = liqData.map((l) => [
        `${l.vendedor_nombre || "Sin nombre"} (#${l.vendedor_codigo})`,
        formatCOP(l.comisionVentas?.totalComisionVentas),
        formatCOP(l.comisionRecaudo?.comisionRecaudo),
        formatCOP(l.totalComision),
      ]);

      const grandComVentas = liqData.reduce(
        (s, l) => s + (l.comisionVentas?.totalComisionVentas || 0),
        0,
      );
      const grandComRecaudo = liqData.reduce(
        (s, l) => s + (l.comisionRecaudo?.comisionRecaudo || 0),
        0,
      );
      const grandTotal = liqData.reduce(
        (s, l) => s + (l.totalComision || 0),
        0,
      );

      autoTable(doc, {
        startY: y,
        head: [
          ["Vendedor", "Comisión Ventas", "Comisión Recaudo", "Comisión Total"],
        ],
        body: liqRows,
        foot: [
          [
            "TOTALES",
            formatCOP(grandComVentas),
            formatCOP(grandComRecaudo),
            formatCOP(grandTotal),
          ],
        ],
        headStyles: {
          fillColor: INDIGO,
          textColor: 255,
          fontSize: 8,
          fontStyle: "bold",
        },
        footStyles: {
          fillColor: INDIGO_100,
          textColor: SLATE_900,
          fontSize: 8,
          fontStyle: "bold",
        },
        bodyStyles: { fontSize: 8 },
        alternateRowStyles: { fillColor: SLATE_50 },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { halign: "right" },
          2: { halign: "right" },
          3: { halign: "right", fontStyle: "bold" },
        },
        margin: { left: 15, right: 15 },
      });
    }

    // -- Per-Vendor Liquidation Detail --
    liqData.forEach((liq) => {
      doc.addPage();
      let y = 15;

      // Vendor header bar (matches existing style from vendor detail pages)
      doc.setFillColor(...INDIGO_50);
      doc.roundedRect(15, y, pageW - 30, 16, 2, 2, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...INDIGO);
      doc.text(
        `Liquidación - ${liq.vendedor_nombre || "Sin nombre"} (#${liq.vendedor_codigo})`,
        20,
        y + 7,
      );

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...SLATE_500);
      doc.text(`${mesNombre} ${periodo.year}`, 20, y + 13);

      y += 24;

      // -- Section A: Comisión por Ventas (Marca) --
      y = drawSectionTitle(doc, "Comisión por Ventas (Marca)", y, INDIGO);

      const marcas = liq.comisionVentas?.detalleMarcas || [];
      if (marcas.length > 0) {
        const marcaRows = marcas.map((dm) => [
          dm.marca,
          formatCOP(dm.totalCosto),
          dm.metaVentas > 0 ? formatCOP(dm.metaVentas) : "-",
          dm.tienePresupuesto ? (dm.cumpleMeta ? "Sí" : "No") : "-",
          dm.pctComision > 0 ? `${(dm.pctComision * 100).toFixed(1)}%` : "-",
          formatCOP(dm.comision),
        ]);

        const totalComVentas = liq.comisionVentas.totalComisionVentas || 0;

        autoTable(doc, {
          startY: y,
          head: [
            ["Marca", "Costo Total", "Meta", "Cumple", "% Com.", "Comisión"],
          ],
          body: marcaRows,
          foot: [
            ["SUBTOTAL VENTAS", "", "", "", "", formatCOP(totalComVentas)],
          ],
          headStyles: {
            fillColor: INDIGO,
            textColor: 255,
            fontSize: 7.5,
            fontStyle: "bold",
          },
          footStyles: {
            fillColor: INDIGO_100,
            textColor: SLATE_900,
            fontSize: 7.5,
            fontStyle: "bold",
          },
          bodyStyles: { fontSize: 7.5 },
          alternateRowStyles: { fillColor: SLATE_50 },
          columnStyles: {
            0: { cellWidth: 40 },
            1: { halign: "right" },
            2: { halign: "right" },
            3: { halign: "center" },
            4: { halign: "right" },
            5: { halign: "right", fontStyle: "bold" },
          },
          margin: { left: 15, right: 15 },
          didParseCell(data) {
            if (data.section !== "body") return;
            const rowIdx = data.row.index;
            const marca = marcas[rowIdx];
            if (!marca) return;
            // Green background for cumpleMeta=true, gray for no-budget rows
            if (marca.cumpleMeta && marca.tienePresupuesto) {
              data.cell.styles.fillColor = [240, 253, 244]; // emerald-50
            } else if (!marca.tienePresupuesto) {
              data.cell.styles.textColor = SLATE_400;
            }
          },
        });

        y = doc.lastAutoTable.finalY + 10;
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...SLATE_400);
        doc.text("Sin ventas comisionables en este periodo", 15, y + 2);
        y += 12;
      }

      // -- Section B: Comisión por Recaudo --
      // Check if we need a new page
      if (y > pageH - 70) {
        doc.addPage();
        y = 20;
      }

      y = drawSectionTitle(doc, "Comisión por Recaudo (Cobranza)", y, EMERALD);

      const rec = liq.comisionRecaudo || {};
      if (rec.metaRecaudo > 0) {
        // Info box
        const boxStartY = y;
        const recBoxH = 38;
        doc.setFillColor(...SLATE_50);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(15, boxStartY, pageW - 30, recBoxH, 2, 2, "FD");

        let ry = boxStartY + 8;
        ry = drawInfoRow(
          doc,
          "Meta Recaudo:",
          formatCOP(rec.metaRecaudo),
          20,
          ry,
        );
        ry = drawInfoRow(
          doc,
          "Total Comisionable:",
          formatCOP(rec.totalComisionable),
          20,
          ry,
          EMERALD,
        );
        drawInfoRow(
          doc,
          "% Cumplimiento:",
          `${(rec.pctCumplimiento || 0).toFixed(2)}%`,
          20,
          ry,
        );

        // Right column
        let ry2 = boxStartY + 8;
        ry2 = drawInfoRow(
          doc,
          "Tramo Aplicado:",
          rec.tramoAplicado || "N/A",
          pageW / 2,
          ry2,
        );
        ry2 = drawInfoRow(
          doc,
          "% Comisión:",
          rec.pctComision > 0 ? `${(rec.pctComision * 100).toFixed(2)}%` : "0%",
          pageW / 2,
          ry2,
        );
        drawInfoRow(
          doc,
          "Comisión Recaudo:",
          formatCOP(rec.comisionRecaudo),
          pageW / 2,
          ry2,
          EMERALD,
        );

        y = boxStartY + recBoxH + 10;
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...SLATE_400);
        doc.text(
          "Sin presupuesto de recaudo configurado para este vendedor",
          15,
          y + 2,
        );
        y += 12;
      }

      // -- Section C: TOTAL COMISION --
      if (y > pageH - 40) {
        doc.addPage();
        y = 20;
      }

      const totalBoxY = y;
      const totalBoxH = 22;
      doc.setFillColor(...INDIGO);
      doc.roundedRect(15, totalBoxY, pageW - 30, totalBoxH, 3, 3, "F");

      // Left label
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.text("TOTAL COMISION", 25, totalBoxY + totalBoxH / 2 + 1);

      // Breakdown
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const breakdownText = `Ventas: ${formatCOP(liq.comisionVentas?.totalComisionVentas)}  +  Recaudo: ${formatCOP(rec.comisionRecaudo)}`;
      doc.text(breakdownText, pageW / 2 - 10, totalBoxY + totalBoxH / 2 - 3);

      // Grand total value
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(
        formatCOP(liq.totalComision),
        pageW - 25,
        totalBoxY + totalBoxH / 2 + 2,
        { align: "right" },
      );
    });
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...SLATE_400);
    doc.text(
      `DistriPulse \u00B7 Reporte de Comisiones \u00B7 P\u00E1gina ${i} de ${totalPages}`,
      pageW / 2,
      pageH - 8,
      { align: "center" },
    );
  }

  // -- Save --
  let filename = `Comisiones_${mesNombre}_${periodo.year}`;
  if (filtroVendedor) {
    filename += `_${(filtroVendedor.vendedor_nombre || filtroVendedor.vendedor_codigo).replace(/\s+/g, "_")}`;
  }
  doc.save(`${filename}.pdf`);
}
