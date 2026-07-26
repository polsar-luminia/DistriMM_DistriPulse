/**
 * @fileoverview Exportación a Excel del Sugerido de Pedidos.
 * El alcance lo elige el usuario en el modal de exportación:
 * "Orden de compra" (solo sugerido > 0), "Análisis completo" (todo lo
 * filtrado) o ambas hojas. Siempre se agrega una hoja "Parámetros" con el
 * cálculo y el recorte aplicado, para que el archivo se explique solo.
 * @module utils/sugeridoExcelExport
 */
import { CLASIFICACION_META } from "../components/sugerido/clasificacion";
import { describirFiltros } from "./sugeridoFiltros";

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: "4F46E5" } },
  alignment: { horizontal: "center" },
};

const MONEY_FMT = '"$"#,##0';

/** Etiquetas del alcance, para la hoja "Parámetros". */
const ALCANCE_ETIQUETA = {
  POR_PEDIR: "Orden de compra (solo productos por pedir)",
  COMPLETO: "Análisis completo",
  AMBOS: "Orden de compra y análisis completo",
};

function buildSheet(XLSX, rows, { incluirEstado }) {
  const header = [
    "Código",
    "Producto",
    "Marca",
    "Categoría",
    "Stock",
    "Tránsito",
    "Venta/día",
    "Cobertura (días)",
    "Últ. venta",
    ...(incluirEstado ? ["Estado"] : []),
    "Cantidad sugerida",
    "Costo unitario",
    "Costo estimado",
  ];

  const data = rows.map((r) => [
    r.producto_codigo,
    r.producto_nombre,
    r.marca || "",
    r.categoria_nombre || "",
    Number(r.stock) || 0,
    Number(r.transito) || 0,
    Number(r.venta_diaria) || 0,
    r.cobertura_dias != null ? Number(r.cobertura_dias) : "",
    r.ultima_venta || "",
    ...(incluirEstado
      ? [CLASIFICACION_META[r.clasificacion]?.label || r.clasificacion]
      : []),
    Number(r.sugerido_cantidad) || 0,
    Number(r.costo_unitario) || 0,
    Number(r.sugerido_costo) || 0,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);

  header.forEach((_, colIdx) => {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: colIdx })];
    if (cell) cell.s = HEADER_STYLE;
  });

  // Formato COP en columnas de costo (las dos últimas)
  const moneyCols = [header.length - 2, header.length - 1];
  for (let r = 1; r <= data.length; r++) {
    for (const c of moneyCols) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === "number") cell.z = MONEY_FMT;
    }
  }

  ws["!cols"] = [
    { wch: 8 },
    { wch: 40 },
    { wch: 18 },
    { wch: 16 },
    { wch: 8 },
    { wch: 8 },
    { wch: 10 },
    { wch: 14 },
    { wch: 11 },
    ...(incluirEstado ? [{ wch: 10 }] : []),
    { wch: 16 },
    { wch: 14 },
    { wch: 15 },
  ];

  return ws;
}

/**
 * Sufijo del nombre de archivo. Solo se agrega cuando el recorte es de un
 * único proveedor o una única línea: es el caso que se manda por correo y
 * conviene que se distinga sin abrirlo.
 * @param {{marcas: string[], categorias: string[]}} filtros
 * @returns {string}
 */
function sufijoArchivo(filtros) {
  const etiqueta =
    (filtros?.marcas?.length === 1 && filtros.marcas[0]) ||
    (filtros?.categorias?.length === 1 && filtros.categorias[0]) ||
    "";
  if (!etiqueta) return "";
  // Los caracteres inválidos en nombres de archivo se colapsan a "_"
  return "_" + etiqueta.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
}

/**
 * Genera y descarga el Excel del sugerido.
 * @param {Object[]} rows - Filas ya recortadas por el modal de exportación
 * @param {{diasCobertura: number, pctCrecimiento: number, pctReserva: number, diasAnalisis: number}} params
 * @param {{fecha_saldos: string}} carga - Carga de inventario usada
 * @param {Object} [opciones]
 * @param {"POR_PEDIR"|"COMPLETO"|"AMBOS"} [opciones.alcance="AMBOS"] - Qué hojas incluir
 * @param {Object} [opciones.filtros] - Recorte aplicado, para la hoja "Parámetros"
 */
export async function generarSugeridoExcel(rows, params, carga, opciones = {}) {
  const { alcance = "AMBOS", filtros } = opciones;
  const XLSX = await import("xlsx-js-style");

  const wb = XLSX.utils.book_new();

  if (alcance === "POR_PEDIR" || alcance === "AMBOS") {
    const porPedir = rows.filter((r) => Number(r.sugerido_cantidad) > 0);
    XLSX.utils.book_append_sheet(
      wb,
      buildSheet(XLSX, porPedir, { incluirEstado: false }),
      "Sugerido de compra",
    );
  }
  if (alcance === "COMPLETO" || alcance === "AMBOS") {
    XLSX.utils.book_append_sheet(
      wb,
      buildSheet(XLSX, rows, { incluirEstado: true }),
      "Análisis completo",
    );
  }

  // Hoja de parámetros para trazabilidad del cálculo y del recorte
  const paramsSheet = XLSX.utils.aoa_to_sheet([
    ["Parámetros del cálculo"],
    ["Fecha de saldos", carga?.fecha_saldos || ""],
    ["Cobertura (días)", params.diasCobertura],
    ["Crecimiento (%)", params.pctCrecimiento],
    ["Reserva (%)", params.pctReserva],
    ["Ventana de análisis (días)", params.diasAnalisis],
    ["Bodegas incluidas", "1, 5, 6"],
    [],
    ["Filtros aplicados a la exportación"],
    ["Alcance", ALCANCE_ETIQUETA[alcance] || alcance],
    ...(filtros ? describirFiltros(filtros) : [["Filtros", "Ninguno"]]),
  ]);
  paramsSheet["!cols"] = [{ wch: 26 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, paramsSheet, "Parámetros");

  const fecha = carga?.fecha_saldos || new Date().toISOString().slice(0, 10);
  XLSX.writeFile(
    wb,
    `Sugerido_Pedidos_${fecha}${sufijoArchivo(filtros || {})}.xlsx`,
  );
}
