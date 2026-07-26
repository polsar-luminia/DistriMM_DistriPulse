/**
 * @fileoverview Filtros del Sugerido de Pedidos.
 * Viven fuera de los componentes porque los usan tres consumidores: la barra
 * de filtros de la pantalla, la tabla y el modal de exportación (que arma su
 * propio subconjunto sin depender de lo que se esté viendo).
 * @module utils/sugeridoFiltros
 */
import { CLASIFICACION_META } from "../components/sugerido/clasificacion";

/** Estado (clasificación de stock) — el mismo set que las pastillas. */
export const OPCIONES_ESTADO = [
  { key: "TODOS", label: "Todos" },
  { key: "POR_PEDIR", label: "Por pedir" },
  { key: "AGOTADO", label: "Agotados" },
  { key: "CRITICO", label: "Críticos" },
  { key: "NORMAL", label: "Normales" },
  { key: "LENTO", label: "Lentos" },
  { key: "MUERTO", label: "Muertos" },
];

/**
 * Antigüedad de la última venta. Los rangos son acumulativos ("últimos N
 * días") porque es como se pregunta en la práctica.
 *
 * OJO: `ultima_venta` sólo existe dentro de la ventana de análisis del
 * cálculo (parámetro "Ventana de análisis"). Un producto vendido antes de esa
 * ventana llega sin fecha, y por eso la última opción se llama "sin ventas en
 * la ventana" y no "nunca vendido".
 */
export const OPCIONES_ULTIMA_VENTA = [
  { key: "TODAS", label: "Cualquier fecha" },
  { key: "D30", label: "Últimos 30 días", max: 30 },
  { key: "D60", label: "Últimos 60 días", max: 60 },
  { key: "D90", label: "Últimos 90 días", max: 90 },
  { key: "MAS_90", label: "Hace más de 90 días", min: 91 },
  { key: "SIN_VENTA", label: "Sin ventas en la ventana" },
];

export const OPCIONES_STOCK = [
  { key: "TODOS", label: "Con y sin stock" },
  { key: "CON_STOCK", label: "Con stock" },
  { key: "SIN_STOCK", label: "Sin stock" },
];

/** Estado inicial de los filtros. Arrays vacíos = "todos". */
export const FILTROS_INICIALES = {
  estado: "TODOS",
  marcas: [],
  categorias: [],
  ultimaVenta: "TODAS",
  stock: "TODOS",
  search: "",
};

/**
 * Filtros de alcance: proveedor, línea, última venta y stock.
 * Se aplican antes que estado y búsqueda porque son los que definen el
 * universo sobre el que se calculan los KPIs y los contadores de las
 * pastillas.
 * @param {Object[]} rows
 * @param {typeof FILTROS_INICIALES} filtros
 * @returns {Object[]}
 */
export function aplicarAlcance(rows, filtros) {
  let result = rows;

  if (filtros.marcas?.length) {
    const set = new Set(filtros.marcas);
    result = result.filter((r) => set.has(r.marca));
  }
  if (filtros.categorias?.length) {
    const set = new Set(filtros.categorias);
    result = result.filter((r) => set.has(r.categoria_nombre));
  }

  if (filtros.ultimaVenta && filtros.ultimaVenta !== "TODAS") {
    const opcion = OPCIONES_ULTIMA_VENTA.find(
      (o) => o.key === filtros.ultimaVenta,
    );
    if (opcion) {
      result = result.filter((r) => {
        const dias = r.dias_sin_venta;
        if (opcion.key === "SIN_VENTA") return dias == null;
        if (dias == null) return false;
        if (opcion.max != null && Number(dias) > opcion.max) return false;
        if (opcion.min != null && Number(dias) < opcion.min) return false;
        return true;
      });
    }
  }

  if (filtros.stock === "CON_STOCK") {
    result = result.filter((r) => Number(r.stock) > 0);
  } else if (filtros.stock === "SIN_STOCK") {
    result = result.filter((r) => Number(r.stock) <= 0);
  }

  return result;
}

/**
 * Filtro por estado. "POR_PEDIR" no es una clasificación sino sugerido > 0.
 * @param {Object[]} rows
 * @param {string} estado
 * @returns {Object[]}
 */
export function aplicarEstado(rows, estado) {
  if (!estado || estado === "TODOS") return rows;
  if (estado === "POR_PEDIR")
    return rows.filter((r) => Number(r.sugerido_cantidad) > 0);
  return rows.filter((r) => r.clasificacion === estado);
}

/**
 * Búsqueda libre sobre código, nombre, marca y línea.
 * @param {Object[]} rows
 * @param {string} search
 * @returns {Object[]}
 */
export function aplicarBusqueda(rows, search) {
  const q = search?.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.producto_codigo?.toLowerCase().includes(q) ||
      r.producto_nombre?.toLowerCase().includes(q) ||
      r.marca?.toLowerCase().includes(q) ||
      r.categoria_nombre?.toLowerCase().includes(q),
  );
}

/**
 * Aplica los tres bloques de filtros en orden.
 * @param {Object[]} rows
 * @param {typeof FILTROS_INICIALES} filtros
 * @returns {Object[]}
 */
export function aplicarFiltros(rows, filtros) {
  return aplicarBusqueda(
    aplicarEstado(aplicarAlcance(rows, filtros), filtros.estado),
    filtros.search,
  );
}

/**
 * Cuántos filtros están activos (para el badge de "Limpiar").
 * @param {typeof FILTROS_INICIALES} filtros
 * @returns {number}
 */
export function contarFiltrosActivos(filtros) {
  let n = 0;
  if (filtros.estado && filtros.estado !== "TODOS") n++;
  if (filtros.marcas?.length) n++;
  if (filtros.categorias?.length) n++;
  if (filtros.ultimaVenta && filtros.ultimaVenta !== "TODAS") n++;
  if (filtros.stock && filtros.stock !== "TODOS") n++;
  if (filtros.search?.trim()) n++;
  return n;
}

/**
 * Describe los filtros en texto plano. Va a la hoja "Parámetros" del Excel
 * para que quien reciba el archivo sepa qué recorte está viendo.
 * @param {typeof FILTROS_INICIALES} filtros
 * @returns {[string, string][]} Pares [etiqueta, valor]
 */
export function describirFiltros(filtros) {
  const filas = [];
  filas.push([
    "Proveedores",
    filtros.marcas?.length ? filtros.marcas.join(", ") : "Todos",
  ]);
  filas.push([
    "Líneas de producto",
    filtros.categorias?.length ? filtros.categorias.join(", ") : "Todas",
  ]);
  filas.push([
    "Estado",
    OPCIONES_ESTADO.find((o) => o.key === filtros.estado)?.label || "Todos",
  ]);
  filas.push([
    "Última venta",
    OPCIONES_ULTIMA_VENTA.find((o) => o.key === filtros.ultimaVenta)?.label ||
      "Cualquier fecha",
  ]);
  filas.push([
    "Stock",
    OPCIONES_STOCK.find((o) => o.key === filtros.stock)?.label ||
      "Con y sin stock",
  ]);
  return filas;
}

/**
 * Etiqueta legible de un estado (reutiliza los metadatos de clasificación).
 * @param {string} key
 * @returns {string}
 */
export function etiquetaEstado(key) {
  return (
    OPCIONES_ESTADO.find((o) => o.key === key)?.label ||
    CLASIFICACION_META[key]?.label ||
    key
  );
}
