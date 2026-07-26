import { normalizeBrand } from "./brandNormalization";

export function calcularComisionVentas({
  ventas,
  presupuestosMarca,
  productBrandMap,
  reglaNoListadas,
}) {
  // 1. Agrupar ventas por marca usando productBrandMap
  //    Para cada venta: marca = productBrandMap[venta.producto_codigo] || "SIN MARCA"
  //    Sumar el campo `valor_total` (Number) de cada venta
  //    IMPORTANTE: las DV ya vienen con valor_total negativo, se suman normalmente
  const ventasPorMarca = {};
  ventas.forEach((v) => {
    const rawMarca =
      productBrandMap[String(v.producto_codigo).trim().toUpperCase()] ||
      "SIN MARCA";
    const marca = normalizeBrand(rawMarca);
    if (!ventasPorMarca[marca]) ventasPorMarca[marca] = 0;
    const rawVenta = Number(v.valor_total);
    ventasPorMarca[marca] += Number.isFinite(rawVenta) ? rawVenta : 0;
  });

  const detalleMarcas = [];

  // 2. Procesar presupuestos configurados (normalizar marca para matchear con ventas)
  // Dedup: si dos presupuestos normalizan a la misma marca, el primero gana
  const marcasConPresupuesto = new Set();
  presupuestosMarca.forEach((p) => {
    const marcaNorm = normalizeBrand(p.marca);
    if (marcasConPresupuesto.has(marcaNorm)) return;
    marcasConPresupuesto.add(marcaNorm);
    const rawVenta = ventasPorMarca[marcaNorm] || 0;
    // Si DV de meses anteriores dejan la venta negativa, tratar como 0 (no penalizar)
    const totalVenta = Math.max(0, rawVenta);
    const metaVentas = Number(p.meta_ventas || 0);
    const pctComision = Number(p.pct_comision || 0);
    const cumpleMeta = metaVentas > 0 ? totalVenta >= metaVentas : true;
    const comision = cumpleMeta ? totalVenta * pctComision : 0;

    detalleMarcas.push({
      marca: marcaNorm,
      totalVenta,
      metaVentas,
      pctComision,
      cumpleMeta,
      comision: Math.round(comision),
      tienePresupuesto: true,
    });
  });

  // 3. Agregar marcas con ventas pero sin presupuesto.
  //    Regla de negocio: el umbral se evalúa sobre la SUMATORIA de todas las
  //    marcas no listadas del vendedor (no marca por marca). Si el grupo
  //    alcanza el umbral, cada marca del grupo comisiona pct sobre su venta
  //    (equivale a pct sobre la sumatoria, distribuido por marca).
  const marcasNoListadas = Object.entries(ventasPorMarca)
    .filter(([marca]) => !marcasConPresupuesto.has(marca))
    // Mismo guard que rama con presupuesto: DV negativa → 0 (no penalizar)
    .map(([marca, rawVenta]) => ({ marca, totalVenta: Math.max(0, rawVenta) }));

  const totalGrupoNoListadas = marcasNoListadas.reduce(
    (s, m) => s + m.totalVenta,
    0,
  );
  const umbral = Number(reglaNoListadas?.umbral || 0);
  const pct = Number(reglaNoListadas?.pct_comision || 0);
  const aplicaRegla =
    !!reglaNoListadas && umbral > 0 && totalGrupoNoListadas >= umbral;

  marcasNoListadas.forEach(({ marca, totalVenta }) => {
    const comision = aplicaRegla ? Math.round(totalVenta * pct) : 0;
    detalleMarcas.push({
      marca,
      totalVenta,
      metaVentas: umbral,
      pctComision: aplicaRegla ? pct : 0,
      cumpleMeta: aplicaRegla,
      comision,
      tienePresupuesto: false,
      reglaNoListadas: aplicaRegla,
      // Total del grupo para que la UI pueda mostrar contra qué se comparó el umbral
      grupoNoListadasTotal: totalGrupoNoListadas,
    });
  });

  detalleMarcas.sort((a, b) => b.comision - a.comision);

  const totalComisionVentas = detalleMarcas.reduce((s, d) => s + d.comision, 0);

  return { detalleMarcas, totalComisionVentas };
}

function toFiniteVal(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function buildDesgloseOrigen(recaudos, origenKey) {
  const filtrados = recaudos.filter(
    (r) => (r.origen || "credito") === origenKey,
  );
  const bruto = filtrados.reduce(
    (s, r) => s + toFiniteVal(r.valor_recaudo),
    0,
  );
  const aplican = filtrados.filter((r) => r.aplica_comision);
  const noAplican = filtrados.filter((r) => !r.aplica_comision);
  const excluidoMarca = aplican.reduce(
    (s, r) => s + toFiniteVal(r.valor_excluido_marca),
    0,
  );
  const ivaDescontado = aplican.reduce(
    (s, r) => s + toFiniteVal(r.valor_iva),
    0,
  );
  const noComisionableMora = noAplican.reduce(
    (s, r) => s + toFiniteVal(r.valor_recaudo),
    0,
  );
  const comisionable = aplican.reduce(
    (s, r) =>
      s +
      toFiniteVal(r.valor_recaudo) -
      toFiniteVal(r.valor_excluido_marca) -
      toFiniteVal(r.valor_iva),
    0,
  );
  return {
    count: filtrados.length,
    countAplican: aplican.length,
    countNoAplican: noAplican.length,
    bruto,
    excluidoMarca,
    ivaDescontado,
    noComisionableMora,
    comisionable,
  };
}

export function calcularComisionRecaudo({ recaudos, presupuestoRecaudo }) {
  const toFinite = toFiniteVal;
  const totalRecaudado = recaudos.reduce(
    (s, r) => s + toFinite(r.valor_recaudo),
    0,
  );
  // Comisionable = recaudos que aplican, menos exclusiones de marca e IVA
  const totalComisionable = recaudos.reduce((s, r) => {
    if (!r.aplica_comision) return s;
    return (
      s +
      toFinite(r.valor_recaudo) -
      toFinite(r.valor_excluido_marca) -
      toFinite(r.valor_iva)
    );
  }, 0);
  const totalIva = recaudos.reduce((s, r) => {
    if (!r.aplica_comision) return s;
    return s + toFinite(r.valor_iva);
  }, 0);
  const totalExcluido = totalRecaudado - totalComisionable;

  const desglose = {
    credito: buildDesgloseOrigen(recaudos, "credito"),
    contado: buildDesgloseOrigen(recaudos, "contado"),
  };

  // Si no hay presupuesto configurado, no se calcula comisión
  const metaVal = Number(presupuestoRecaudo?.meta_recaudo);
  if (!presupuestoRecaudo || !metaVal || metaVal <= 0) {
    return {
      totalRecaudado,
      totalComisionable,
      totalExcluido,
      totalIva,
      metaRecaudo: 0,
      pctCumplimiento: 0,
      tramoAplicado: null,
      pctComision: 0,
      comisionRecaudo: 0,
      desglose,
    };
  }

  const metaRecaudo = metaVal;
  const pctCumplimiento =
    metaRecaudo > 0 ? (totalComisionable / metaRecaudo) * 100 : 0;

  // Determinar tramo — evaluar de mayor a menor para tomar el más alto alcanzado.
  // Tramos 2-5 solo usan `min` (sin `max`). La evaluación top-down con break
  // hace que el tramo más alto alcanzado gane. Los gaps se validan en
  // recaudoTierValidation.js al configurar presupuestos.
  const toNum = (v, fallback) => {
    if (v == null || String(v).trim() === "") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const tramos = [
    {
      nombre: "Tramo 5",
      min: toNum(presupuestoRecaudo.tramo5_min, Infinity),
      pct: toNum(presupuestoRecaudo.tramo5_pct, 0),
    },
    {
      nombre: "Tramo 4",
      min: toNum(presupuestoRecaudo.tramo4_min, Infinity),
      pct: toNum(presupuestoRecaudo.tramo4_pct, 0),
    },
    {
      nombre: "Tramo 3",
      min: toNum(presupuestoRecaudo.tramo3_min, Infinity),
      pct: toNum(presupuestoRecaudo.tramo3_pct, 0),
    },
    {
      nombre: "Tramo 2",
      min: toNum(presupuestoRecaudo.tramo2_min, Infinity),
      pct: toNum(presupuestoRecaudo.tramo2_pct, 0),
    },
    {
      nombre: "Tramo 1",
      min: 0,
      max: toNum(presupuestoRecaudo.tramo1_max, Infinity),
      pct: toNum(presupuestoRecaudo.tramo1_pct, 0),
    },
  ];

  let tramoAplicado = null;
  let pctComision = 0;

  for (const tramo of tramos) {
    const meetsMin = pctCumplimiento >= tramo.min;
    const meetsMax = tramo.max == null || pctCumplimiento <= tramo.max;
    if (meetsMin && meetsMax) {
      tramoAplicado = tramo.nombre;
      pctComision = tramo.pct;
      break;
    }
  }

  const comisionRecaudo =
    pctComision > 0 ? Math.round(totalComisionable * pctComision) : 0;

  return {
    totalRecaudado,
    totalComisionable,
    totalExcluido,
    totalIva,
    metaRecaudo,
    pctCumplimiento: Math.round(pctCumplimiento * 100) / 100,
    tramoAplicado,
    pctComision,
    comisionRecaudo,
    desglose,
  };
}

export function calcularComisionesCompletas({
  ventas,
  recaudos,
  presupuestosMarca,
  presupuestosRecaudo,
  productBrandMap,
  reglasExtra = [],
}) {
  // Obtener lista única de vendedores (union de ventas + recaudos)
  const vendedoresSet = new Set();
  const vendedorNombres = {};
  ventas.forEach((v) => {
    if (v.vendedor_codigo) {
      vendedoresSet.add(v.vendedor_codigo);
      if (v.vendedor_nombre)
        vendedorNombres[v.vendedor_codigo] = v.vendedor_nombre;
    }
  });
  recaudos.forEach((r) => {
    if (r.vendedor_codigo) vendedoresSet.add(r.vendedor_codigo);
  });

  // Para cada vendedor, calcular ambas comisiones
  const resultados = [];
  vendedoresSet.forEach((vendedorCodigo) => {
    // Exclusiones solo aplican a recaudo, no a ventas — todas las ventas cuentan
    const ventasVendedor = ventas.filter(
      (v) => v.vendedor_codigo === vendedorCodigo,
    );
    const recaudosVendedor = recaudos.filter(
      (r) => r.vendedor_codigo === vendedorCodigo,
    );
    const presupuestosMarcaVendedor = presupuestosMarca.filter(
      (p) => p.vendedor_codigo === vendedorCodigo,
    );
    const presupuestoRecaudoVendedor =
      presupuestosRecaudo.find((p) => p.vendedor_codigo === vendedorCodigo) ||
      null;

    const reglaVendedor = reglasExtra.find(
      (r) => r.vendedor_codigo === vendedorCodigo && r.activa,
    );
    const reglaNoListadas = reglaVendedor
      ? {
          umbral: Number(reglaVendedor.umbral),
          pct_comision: Number(reglaVendedor.pct_comision),
        }
      : undefined;

    const comisionVentas = calcularComisionVentas({
      ventas: ventasVendedor,
      presupuestosMarca: presupuestosMarcaVendedor,
      productBrandMap,
      reglaNoListadas,
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
      totalComision:
        comisionVentas.totalComisionVentas + comisionRecaudo.comisionRecaudo,
    });
  });

  resultados.sort((a, b) => b.totalComision - a.totalComision);
  return resultados;
}
