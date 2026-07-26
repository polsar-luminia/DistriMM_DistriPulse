// Debug del parser de contado contra el PDF real
// Uso: node scripts/debug-contado-parser.mjs "ruta/al/archivo.pdf"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { groupItemsToLines, mergeWrappedLines, parseLines, validateChecksums } from "../src/utils/contadoPdfParser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error("Uso: node debug-contado-parser.mjs <pdf>");
  process.exit(1);
}

const buffer = fs.readFileSync(pdfPath);

// Cargar pdfjs-dist directamente (Node puro, sin worker)
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

const pdf = await pdfjs.getDocument({
  data: new Uint8Array(buffer),
  disableWorker: true,
  isEvalSupported: false,
}).promise;

console.log(`Páginas: ${pdf.numPages}`);

const allLines = [];
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const textContent = await page.getTextContent();
  const lines = groupItemsToLines(textContent.items, p);
  allLines.push(...lines);
}

console.log(`Líneas raw: ${allLines.length}`);

const merged = mergeWrappedLines(allLines);
console.log(`Líneas mergeadas: ${merged.length}`);

const result = parseLines(allLines);
console.log(`Documentos: ${result.documentos.length}`);
console.log(
  `  FV: ${result.documentos.filter(d => d.tipo === "FV").length}`,
);
console.log(
  `  DV: ${result.documentos.filter(d => d.tipo === "DV").length}`,
);
console.log(
  `  Anulados: ${result.documentos.filter(d => d.anulado).length}`,
);
console.log(`Resumen: ${JSON.stringify(result.resumen, null, 2).slice(0, 500)}`);

const ck = validateChecksums(result);
console.log("\n=== CHECKSUMS ===");
console.log(JSON.stringify(ck, null, 2));

// Diff de ventas
const sumFV = result.documentos
  .filter(d => d.tipo === "FV" && !d.anulado)
  .reduce((s, d) => s + d.total, 0);
const declarado = result.resumen.totalVentas;
console.log(`\nDiff FV: declarado=${declarado}, calculado=${sumFV}, diff=${declarado - sumFV}`);

// Inspect lines around the duplicated invoice 22648 (page 9 and 10)
console.log("\n=== LÍNEAS PAGINA 9 (final) Y 10 (inicio) ===");
for (const line of allLines) {
  if (line.page < 9 || line.page > 10) continue;
  if (line.text.includes("22648") || /Totales Documento|Devoluciones|Ventas|Identificaci|Cuenta\s+FP/i.test(line.text)) {
    console.log(`  pg${line.page} y${line.y.toFixed(0)}: ${line.text.slice(0, 110)}`);
  }
}

// Verificar detección de columnas
import { groupItemsToLines as gitl } from "../src/utils/contadoPdfParser.js";
const headerLine = allLines.find(l => /^Cuenta\s+FP\s+Descripcion/i.test(l.text));
if (headerLine) {
  console.log("\n=== HEADER FP DETECTADO ===");
  console.log(`text: ${headerLine.text}`);
  console.log(`items: ${JSON.stringify(headerLine.items.map(i => ({x: i.x, str: i.str})))}`);
}

// Mostrar primeros 5 docs DV con sus líneas (debugging)
console.log("\n=== PRIMEROS 5 DOCUMENTOS DV ===");
const primeros5DV = result.documentos.filter(d => d.tipo === "DV").slice(0, 5);
for (const d of primeros5DV) {
  console.log(`  DV ${d.factura} (${d.fecha}) ${d.cliente} total=${d.total} pg=${d.page}`);
  console.log(`    lineas: ${JSON.stringify(d.lineas)}`);
}

// Detectar documentos duplicados (misma factura, misma fecha, mismo total)
console.log("\n=== DUPLICADOS POSIBLES ===");
const dupKey = (d) => `${d.tipo}-${d.factura}-${d.fecha}-${d.total}-${d.numeroComprobante}`;
const seen = new Map();
for (const d of result.documentos) {
  const k = dupKey(d);
  if (seen.has(k)) {
    const prev = seen.get(k);
    console.log(`  DUP: ${d.tipo} ${d.factura} fecha=${d.fecha} comp=${d.numeroComprobante} total=${d.total} (pages: ${prev.page} y ${d.page})`);
  } else {
    seen.set(k, d);
  }
}

// Documentos con líneas FP que no suman
console.log("\n=== DOCS CON LÍNEAS FP INCONSISTENTES ===");
for (const d of result.documentos) {
  if (d.anulado) continue;
  if (!d.lineas || d.lineas.length === 0) {
    console.log(`  ${d.tipo} ${d.factura} (${d.fecha}) ${d.cliente} total=${d.total} → SIN LINEAS`);
    continue;
  }
  const sum = d.lineas.reduce((s, l) => s + l.valor, 0);
  if (Math.abs(sum - d.total) > 1) {
    console.log(
      `  ${d.tipo} ${d.factura} (${d.fecha}) ${d.cliente} total=${d.total} sumLineas=${sum} diff=${d.total - sum}`,
    );
    for (const l of d.lineas) {
      console.log(
        `    [${l.cuenta}-${l.fp}] ${l.descripcion} → ${l.valor}`,
      );
    }
  }
}

// Buscar patrones de líneas no parseadas en zona de documentos
console.log("\n=== LÍNEAS NO RECONOCIDAS EN ZONA DE DOCUMENTOS (sample) ===");
const RE_DOC_HEADER = /^([\d,]+)\s+(.+?)\s+(\d{2}\/\d{2})\s+(FV-\d|DV-\d)\s+(\d+)\s+(FELE|FCI)\s+(\d+)\s+([\d,.]+)(?:\s+(Anulado))?$/;
const RE_FP_LINE = /^(\d{4,8})\s+(\d{1,3})\s+(.+?)\s+(\d{1,3})\s+(\d{1,15})\s+(\d{1,15})\s+([\d,.]+)$/;
const RE_TOTALES_DOC = /^Totales\s+Documento\s*:/i;

let unrecognized = 0;
let sampleShown = 0;
for (const line of merged) {
  const t = line.text;
  if (
    t.match(RE_DOC_HEADER) ||
    t.match(RE_FP_LINE) ||
    t.match(RE_TOTALES_DOC) ||
    /^Identificaci[oó]n/i.test(t) ||
    /^Cuenta\s+FP/i.test(t) ||
    /^Fecha Desde/i.test(t) ||
    /^Impreso el:/i.test(t) ||
    /^OFICINAS|^TODAS LAS|^NIT|^Devoluciones$|^Ventas$|^Resumen|^Total|^Tipo de Documento/i.test(t) ||
    /^Informe de Ventas/i.test(t)
  ) {
    continue;
  }
  unrecognized++;
  if (sampleShown < 30) {
    console.log(`  pg${line.page} y${line.y.toFixed(0)}: ${t.slice(0, 200)}`);
    sampleShown++;
  }
}
console.log(`Total no reconocidas: ${unrecognized}`);

// Inspeccionar items raw de la primera línea FP simple y de una con NIT partido
console.log("\n=== ITEMS RAW PRIMERA PÁGINA (DV) ===");
for (let p = 1; p <= 1; p++) {
  const page = await pdf.getPage(p);
  const tc = await page.getTextContent();
  const lines = groupItemsToLines(tc.items, p);
  console.log(`--- Página ${p} ---`);
  for (let i = 0; i < lines.length && i < 20; i++) {
    const ln = lines[i];
    console.log(
      `  y=${ln.y.toFixed(1)} text="${ln.text.slice(0, 100)}"`,
    );
    console.log(
      `    items: ${ln.items.map(it => `[${it.x.toFixed(0)}:"${it.str}"]`).join(" ")}`,
    );
  }
}

console.log("\n=== ITEMS RAW PÁGINAS 4-5 ===");
for (let p = 4; p <= 5; p++) {
  const page = await pdf.getPage(p);
  const tc = await page.getTextContent();
  const lines = groupItemsToLines(tc.items, p);
  console.log(`--- Página ${p} ---`);
  for (let i = 0; i < lines.length && i < 25; i++) {
    const ln = lines[i];
    console.log(
      `  y=${ln.y.toFixed(1)} text="${ln.text.slice(0, 100)}"`,
    );
    console.log(
      `    items: ${ln.items.map(it => `[${it.x.toFixed(0)}:"${it.str}"]`).join(" ")}`,
    );
  }
}

