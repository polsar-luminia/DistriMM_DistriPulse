/**
 * @fileoverview Motor de cálculo de comisiones — funciones puras.
 * Recibe datos ya cargados de Supabase, retorna resultados calculados.
 * @module utils/comisionesCalculator
 */

import { normalizeBrand } from "./brandNormalization";

/**
 * Calcula comisiones por ventas (marca) para un vendedor.
 *
 * @param {Object} params
 * @param {Array} params.ventas — Ventas comisionables del vendedor (ya filtradas, sin excluidas)
 * @param {Array} params.presupuestosMarca — Presupuestos marca del periodo para este vendedor
 * @param {Object} params.productBrandMap — Mapa producto_codigo → marca (del catálogo)
 * @returns {{ detalleMarcas: Array<{ marca, totalCosto, metaVentas, pctComision, cumpleMeta, comision, tienePresupuesto }>, totalComisionVentas: number }}
 */
export function calcularComisionVentas({ ventas, presupuestosMarca, productBrandMap }) {
  // 1. Agrupar ventas por marca usando productBrandMap
  //    Para cada venta: marca = productBrandMap[venta.producto_codigo] || "SIN MARCA"
  //    Sumar el campo `costo` (Number) de cada venta
  //    IMPORTANTE: las DV ya vienen con costo negativo, se suman normalmente
  const ventasPorMarca = {};
  ventas.forEach((v) => {
    const rawMarca = productBrandMap[v.producto_codigo] || "SIN MARCA";
    const marca = normalizeBrand(rawMarca);
    if (!ventasPorMarca[marca]) ventasPorMarca[marca] = 0;
    ventasPorMarca[marca] += Number(v.costo || 0);
  });

  const detalleMarcas = [];

  // 2. Procesar presupuestos configurados
  const marcasConPresupuesto = new Set();
  presupuestosMarca.forEach((p) => {
    marcasConPresupuesto.add(p.marca);
    const totalCosto = ventasPorMarca[p.marca] || 0;
    const metaVentas = Number(p.meta_ventas || 0);
    const pctComision = Number(p.pct_comision || 0);
    const cumpleMeta = metaVentas > 0 ? totalCosto >= metaVentas : true;
    const bonoFijo = Number(p.bono_fijo || 0);
    const comisionPct = cumpleMeta ? totalCosto * pctComision : 0;
    const comision = cumpleMeta ? comisionPct + bonoFijo : 0;

    detalleMarcas.push({
      marca: p.marca,
      totalCosto,
      metaVentas,
      pctComision,
      bonoFijo,
      cumpleMeta,
      comisionPct: Math.round(comisionPct),
      comision: Math.round(comision),
      tienePresupuesto: true,
    });
  });

  // 3. Agregar marcas con ventas pero sin presupuesto (informativo, comisión = 0)
  Object.entries(ventasPorMarca).forEach(([marca, totalCosto]) => {
    if (!marcasConPresupuesto.has(marca)) {
      detalleMarcas.push({
        marca,
        totalCosto,
        metaVentas: 0,
        pctComision: 0,
        cumpleMeta: false,
        comision: 0,
        tienePresupuesto: false,
      });
    }
  });

  detalleMarcas.sort((a, b) => b.comision - a.comision);

  const totalComisionVentas = detalleMarcas.reduce((s, d) => s + d.comision, 0);

  return { detalleMarcas, totalComisionVentas };
}

/**
 * Calcula comisión por recaudo (cobranza) para un vendedor.
 *
 * @param {Object} params
 * @param {Array} params.recaudos — Todos los recaudos del periodo para este vendedor
 * @param {Object|null} params.presupuestoRecaudo — Presupuesto recaudo del vendedor (puede ser null)
 * @returns {{ totalRecaudado, totalComisionable, totalExcluido, metaRecaudo, pctCumplimiento, tramoAplicado, pctComision, comisionRecaudo }}
 */
export function calcularComisionRecaudo({ recaudos, presupuestoRecaudo }) {
  const totalRecaudado = recaudos.reduce((s, r) => s + Number(r.valor_recaudo || 0), 0);
  const totalComisionable = recaudos
    .filter((r) => r.aplica_comision)
    .reduce((s, r) => s + Number(r.valor_recaudo || 0), 0);
  const totalExcluido = totalRecaudado - totalComisionable;

  // Si no hay presupuesto configurado, no se calcula comisión
  if (!presupuestoRecaudo || !presupuestoRecaudo.meta_recaudo) {
    return {
      totalRecaudado,
      totalComisionable,
      totalExcluido,
      metaRecaudo: 0,
      pctCumplimiento: 0,
      tramoAplicado: null,
      pctComision: 0,
      comisionRecaudo: 0,
    };
  }

  const metaRecaudo = Number(presupuestoRecaudo.meta_recaudo);
  const pctCumplimiento = metaRecaudo > 0 ? (totalComisionable / metaRecaudo) * 100 : 0;

  // Determinar tramo — evaluar de mayor a menor para tomar el más alto alcanzado
  const tramos = [
    {
      nombre: "Tramo 4",
      min: Number(presupuestoRecaudo.tramo4_min || Infinity),
      pct: Number(presupuestoRecaudo.tramo4_pct || 0),
    },
    {
      nombre: "Tramo 3",
      min: Number(presupuestoRecaudo.tramo3_min || Infinity),
      pct: Number(presupuestoRecaudo.tramo3_pct || 0),
    },
    {
      nombre: "Tramo 2",
      min: Number(presupuestoRecaudo.tramo2_min || Infinity),
      pct: Number(presupuestoRecaudo.tramo2_pct || 0),
    },
    {
      nombre: "Tramo 1",
      min: 0,
      max: Number(presupuestoRecaudo.tramo1_max || 0),
      pct: Number(presupuestoRecaudo.tramo1_pct || 0),
    },
  ];

  let tramoAplicado = null;
  let pctComision = 0;

  for (const tramo of tramos) {
    if (pctCumplimiento >= tramo.min) {
      tramoAplicado = tramo.nombre;
      pctComision = tramo.pct;
      break;
    }
  }

  const comisionRecaudo = pctComision > 0 ? Math.round(totalComisionable * pctComision) : 0;

  return {
    totalRecaudado,
    totalComisionable,
    totalExcluido,
    metaRecaudo,
    pctCumplimiento: Math.round(pctCumplimiento * 100) / 100,
    tramoAplicado,
    pctComision,
    comisionRecaudo,
  };
}

/**
 * Orquestador principal: calcula comisiones completas para todos los vendedores.
 *
 * @param {Object} params
 * @param {Array} params.ventas — Todas las ventas del periodo (ya clasificadas con campo `excluded`)
 * @param {Array} params.recaudos — Todos los recaudos del periodo
 * @param {Array} params.presupuestosMarca — Todos los presupuestos marca del periodo
 * @param {Array} params.presupuestosRecaudo — Todos los presupuestos recaudo del periodo
 * @param {Object} params.productBrandMap — Mapa producto_codigo → marca
 * @returns {Array<{ vendedor_codigo, vendedor_nombre, comisionVentas, comisionRecaudo, totalComision }>}
 */
export function calcularComisionesCompletas({
  ventas,
  recaudos,
  presupuestosMarca,
  presupuestosRecaudo,
  productBrandMap,
}) {
  // Obtener lista única de vendedores (union de ventas + recaudos)
  const vendedoresSet = new Set();
  const vendedorNombres = {};
  ventas.forEach((v) => {
    if (v.vendedor_codigo) {
      vendedoresSet.add(v.vendedor_codigo);
      if (v.vendedor_nombre) vendedorNombres[v.vendedor_codigo] = v.vendedor_nombre;
    }
  });
  recaudos.forEach((r) => {
    if (r.vendedor_codigo) vendedoresSet.add(r.vendedor_codigo);
  });

  // Para cada vendedor, calcular ambas comisiones
  const resultados = [];
  vendedoresSet.forEach((vendedorCodigo) => {
    const ventasVendedor = ventas.filter(
      (v) => v.vendedor_codigo === vendedorCodigo && !v.excluded,
    );
    const recaudosVendedor = recaudos.filter(
      (r) => r.vendedor_codigo === vendedorCodigo,
    );
    const presupuestosMarcaVendedor = presupuestosMarca.filter(
      (p) => p.vendedor_codigo === vendedorCodigo,
    );
    const presupuestoRecaudoVendedor =
      presupuestosRecaudo.find((p) => p.vendedor_codigo === vendedorCodigo) || null;

    const comisionVentas = calcularComisionVentas({
      ventas: ventasVendedor,
      presupuestosMarca: presupuestosMarcaVendedor,
      productBrandMap,
    });

    const comisionRecaudo = calcularComisionRecaudo({
      recaudos: recaudosVendedor,
      presupuestoRecaudo: presupuestoRecaudoVendedor,
    });

    resultados.push({
      vendedor_codigo: vendedorCodigo,
      vendedor_nombre: vendedorNombres[vendedorCodigo] || "",
      comisionVentas,
      comisionRecaudo,
      totalComision: comisionVentas.totalComisionVentas + comisionRecaudo.comisionRecaudo,
    });
  });

  resultados.sort((a, b) => b.totalComision - a.totalComision);
  return resultados;
}
