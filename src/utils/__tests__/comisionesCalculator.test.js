import { describe, test, expect } from "vitest";
import {
  calcularComisionVentas,
  calcularComisionRecaudo,
  calcularComisionesCompletas,
} from "../comisionesCalculator";

function makeVenta(producto_codigo, costo, opts = {}) {
  return {
    producto_codigo,
    costo,
    vendedor_codigo: opts.vendedor_codigo || "V1",
    vendedor_nombre: opts.vendedor_nombre || "Vendedor 1",
    excluded: opts.excluded || false,
  };
}

function makePresupuestoMarca(marca, meta_ventas, pct_comision, opts = {}) {
  return {
    marca,
    meta_ventas,
    pct_comision,
    vendedor_codigo: opts.vendedor_codigo || "V1",
  };
}

function makeRecaudo(valor_recaudo, aplica_comision, opts = {}) {
  return {
    valor_recaudo,
    aplica_comision,
    vendedor_codigo: opts.vendedor_codigo || "V1",
  };
}

describe("calcularComisionVentas", () => {
  test("aplica comision cuando ventas cumplen la meta", () => {
    const ventas = [makeVenta("P1", 200000)];
    const presupuestosMarca = [makePresupuestoMarca("CONTEGRAL", 150000, 0.02)];
    const productBrandMap = { P1: "CONTEGRAL AVES" }; // normaliza a CONTEGRAL

    const result = calcularComisionVentas({
      ventas,
      presupuestosMarca,
      productBrandMap,
    });

    expect(result.totalComisionVentas).toBe(4000); // 200000*0.02
    expect(result.detalleMarcas[0].cumpleMeta).toBe(true);
    expect(result.detalleMarcas[0].comision).toBe(4000);
  });

  test("retorna comision 0 cuando ventas no alcanzan la meta", () => {
    const ventas = [makeVenta("P1", 100000)];
    const presupuestosMarca = [makePresupuestoMarca("CONTEGRAL", 150000, 0.02)];
    const productBrandMap = { P1: "CONTEGRAL AVES" };

    const result = calcularComisionVentas({
      ventas,
      presupuestosMarca,
      productBrandMap,
    });

    expect(result.totalComisionVentas).toBe(0);
    expect(result.detalleMarcas[0].cumpleMeta).toBe(false);
    expect(result.detalleMarcas[0].comision).toBe(0);
  });

  test("devoluciones (DV) restan del total de costo", () => {
    const ventas = [
      makeVenta("P1", 300000),
      makeVenta("P1", -50000), // DV con costo negativo
    ];
    const presupuestosMarca = [makePresupuestoMarca("CONTEGRAL", 200000, 0.02)];
    const productBrandMap = { P1: "CONTEGRAL AVES" };

    const result = calcularComisionVentas({
      ventas,
      presupuestosMarca,
      productBrandMap,
    });

    expect(result.detalleMarcas[0].totalCosto).toBe(250000);
    expect(result.detalleMarcas[0].cumpleMeta).toBe(true);
    expect(result.detalleMarcas[0].comision).toBe(5000); // 250000*0.02
  });

  test("marca sin presupuesto tiene comision 0 y tienePresupuesto=false", () => {
    const ventas = [makeVenta("P1", 500000)];
    const presupuestosMarca = []; // sin presupuestos
    const productBrandMap = { P1: "CONTEGRAL" };

    const result = calcularComisionVentas({
      ventas,
      presupuestosMarca,
      productBrandMap,
    });

    expect(result.totalComisionVentas).toBe(0);
    expect(result.detalleMarcas[0].tienePresupuesto).toBe(false);
    expect(result.detalleMarcas[0].comision).toBe(0);
  });

  test("multiples marcas: solo las que tienen presupuesto generan comision", () => {
    const ventas = [
      makeVenta("P1", 200000), // CONTEGRAL
      makeVenta("P2", 300000), // VICAR
      makeVenta("P3", 100000), // EDO (sin presupuesto)
    ];
    const presupuestosMarca = [
      makePresupuestoMarca("CONTEGRAL", 100000, 0.03),
      makePresupuestoMarca("VICAR", 200000, 0.02),
    ];
    const productBrandMap = {
      P1: "CONTEGRAL AVES",
      P2: "VICAR FARMACEUTICA",
      P3: "EDO",
    };

    const result = calcularComisionVentas({
      ventas,
      presupuestosMarca,
      productBrandMap,
    });

    const contegral = result.detalleMarcas.find((d) => d.marca === "CONTEGRAL");
    const vicar = result.detalleMarcas.find((d) => d.marca === "VICAR");
    const edo = result.detalleMarcas.find((d) => d.marca === "EDO");

    expect(contegral.comision).toBe(6000); // 200000*0.03
    expect(contegral.tienePresupuesto).toBe(true);
    expect(vicar.comision).toBe(6000); // 300000*0.02
    expect(vicar.tienePresupuesto).toBe(true);
    expect(edo.comision).toBe(0);
    expect(edo.tienePresupuesto).toBe(false);
    expect(result.totalComisionVentas).toBe(12000);
  });

  test("producto no en catalogo se agrupa como 'SIN MARCA'", () => {
    const ventas = [makeVenta("DESCONOCIDO", 50000)];
    const presupuestosMarca = [];
    const productBrandMap = {}; // no tiene el codigo

    const result = calcularComisionVentas({
      ventas,
      presupuestosMarca,
      productBrandMap,
    });

    expect(result.detalleMarcas[0].marca).toBe("SIN MARCA");
  });

  test("normalizacion de marca se aplica: 'CONTEGRAL AVES' agrupa bajo 'CONTEGRAL'", () => {
    const ventas = [makeVenta("P1", 100000), makeVenta("P2", 150000)];
    const presupuestosMarca = [makePresupuestoMarca("CONTEGRAL", 200000, 0.05)];
    const productBrandMap = {
      P1: "CONTEGRAL AVES",
      P2: "CONTEGRAL GANADO",
    };

    const result = calcularComisionVentas({
      ventas,
      presupuestosMarca,
      productBrandMap,
    });

    const contegral = result.detalleMarcas.find((d) => d.marca === "CONTEGRAL");
    expect(contegral.totalCosto).toBe(250000); // ambos sumados
    expect(contegral.cumpleMeta).toBe(true);
    expect(contegral.comision).toBe(12500); // 250000*0.05
  });

  test("ventas vacias retornan totalComisionVentas=0", () => {
    const presupuestosMarca = [makePresupuestoMarca("CONTEGRAL", 100000, 0.03)];

    const result = calcularComisionVentas({
      ventas: [],
      presupuestosMarca,
      productBrandMap: {},
    });

    expect(result.totalComisionVentas).toBe(0);
    expect(result.detalleMarcas[0].totalCosto).toBe(0);
    expect(result.detalleMarcas[0].cumpleMeta).toBe(false);
  });

  test("meta=0 implica cumpleMeta=true siempre", () => {
    const ventas = [makeVenta("P1", 10000)];
    const presupuestosMarca = [makePresupuestoMarca("CONTEGRAL", 0, 0.05)];
    const productBrandMap = { P1: "CONTEGRAL" };

    const result = calcularComisionVentas({
      ventas,
      presupuestosMarca,
      productBrandMap,
    });

    expect(result.detalleMarcas[0].cumpleMeta).toBe(true);
    expect(result.detalleMarcas[0].comision).toBe(500); // 10000*0.05
  });
});

describe("calcularComisionRecaudo", () => {
  test("sin presupuesto retorna todo cero", () => {
    const recaudos = [makeRecaudo(500000, true)];

    const result = calcularComisionRecaudo({
      recaudos,
      presupuestoRecaudo: null,
    });

    expect(result.totalRecaudado).toBe(500000);
    expect(result.totalComisionable).toBe(500000);
    expect(result.metaRecaudo).toBe(0);
    expect(result.pctCumplimiento).toBe(0);
    expect(result.tramoAplicado).toBe(null);
    expect(result.comisionRecaudo).toBe(0);
  });

  test("tramo 1 (bajo): aplica tramo1_pct cuando cumplimiento esta debajo de tramo1_max", () => {
    const recaudos = [makeRecaudo(500000, true)];
    const presupuestoRecaudo = {
      meta_recaudo: 1000000,
      tramo1_max: 70,
      tramo1_pct: 0.01,
      tramo2_min: 70,
      tramo2_pct: 0.02,
      tramo3_min: 90,
      tramo3_pct: 0.03,
      tramo4_min: 100,
      tramo4_pct: 0.04,
    };

    const result = calcularComisionRecaudo({ recaudos, presupuestoRecaudo });

    // cumplimiento = 500000/1000000 * 100 = 50%
    expect(result.pctCumplimiento).toBe(50);
    expect(result.tramoAplicado).toBe("Tramo 1");
    expect(result.pctComision).toBe(0.01);
    expect(result.comisionRecaudo).toBe(5000); // 500000 * 0.01
  });

  test("tramo 4 (alto): aplica tramo4_pct cuando cumplimiento >= tramo4_min", () => {
    const recaudos = [makeRecaudo(1200000, true)];
    const presupuestoRecaudo = {
      meta_recaudo: 1000000,
      tramo1_max: 70,
      tramo1_pct: 0.01,
      tramo2_min: 70,
      tramo2_pct: 0.02,
      tramo3_min: 90,
      tramo3_pct: 0.03,
      tramo4_min: 100,
      tramo4_pct: 0.04,
    };

    const result = calcularComisionRecaudo({ recaudos, presupuestoRecaudo });

    // cumplimiento = 1200000/1000000 * 100 = 120%
    expect(result.pctCumplimiento).toBe(120);
    expect(result.tramoAplicado).toBe("Tramo 4");
    expect(result.pctComision).toBe(0.04);
    expect(result.comisionRecaudo).toBe(48000); // 1200000 * 0.04
  });

  test("solo recaudos con aplica_comision=true cuentan como comisionables", () => {
    const recaudos = [
      makeRecaudo(600000, true),
      makeRecaudo(400000, false), // no comisionable
    ];
    const presupuestoRecaudo = {
      meta_recaudo: 1000000,
      tramo1_max: 70,
      tramo1_pct: 0.01,
      tramo2_min: 70,
      tramo2_pct: 0.02,
      tramo3_min: 90,
      tramo3_pct: 0.03,
      tramo4_min: 100,
      tramo4_pct: 0.04,
    };

    const result = calcularComisionRecaudo({ recaudos, presupuestoRecaudo });

    expect(result.totalRecaudado).toBe(1000000);
    expect(result.totalComisionable).toBe(600000);
    // cumplimiento = 600000/1000000 * 100 = 60% → Tramo 1
    expect(result.pctCumplimiento).toBe(60);
    expect(result.tramoAplicado).toBe("Tramo 1");
    expect(result.comisionRecaudo).toBe(6000); // 600000 * 0.01
  });

  test("totalExcluido = totalRecaudado - totalComisionable", () => {
    const recaudos = [makeRecaudo(800000, true), makeRecaudo(200000, false)];

    const result = calcularComisionRecaudo({
      recaudos,
      presupuestoRecaudo: null,
    });

    expect(result.totalExcluido).toBe(200000);
  });

  test("recaudos vacios retornan totales en cero", () => {
    const result = calcularComisionRecaudo({
      recaudos: [],
      presupuestoRecaudo: {
        meta_recaudo: 1000000,
        tramo1_max: 70,
        tramo1_pct: 0.01,
      },
    });

    expect(result.totalRecaudado).toBe(0);
    expect(result.totalComisionable).toBe(0);
    expect(result.comisionRecaudo).toBe(0);
  });

  test("pctCumplimiento se redondea a 2 decimales", () => {
    const recaudos = [makeRecaudo(333333, true)];
    const presupuestoRecaudo = {
      meta_recaudo: 1000000,
      tramo1_max: 70,
      tramo1_pct: 0.01,
    };

    const result = calcularComisionRecaudo({ recaudos, presupuestoRecaudo });

    // 333333 / 1000000 * 100 = 33.3333 → rounded to 33.33
    expect(result.pctCumplimiento).toBe(33.33);
  });
});

describe("calcularComisionesCompletas", () => {
  test("2 vendedores retornan 2 resultados ordenados por totalComision desc", () => {
    const ventas = [
      makeVenta("P1", 200000, {
        vendedor_codigo: "V1",
        vendedor_nombre: "Ana",
      }),
      makeVenta("P2", 500000, {
        vendedor_codigo: "V2",
        vendedor_nombre: "Luis",
      }),
    ];
    const recaudos = [];
    const presupuestosMarca = [
      makePresupuestoMarca("CONTEGRAL", 100000, 0.02, {
        vendedor_codigo: "V1",
      }),
      makePresupuestoMarca("CONTEGRAL", 100000, 0.02, {
        vendedor_codigo: "V2",
      }),
    ];
    const productBrandMap = { P1: "CONTEGRAL", P2: "CONTEGRAL" };

    const result = calcularComisionesCompletas({
      ventas,
      recaudos,
      presupuestosMarca,
      presupuestosRecaudo: [],
      productBrandMap,
    });

    expect(result).toHaveLength(2);
    // V2 tiene mayor comision (500000*0.02=10000) que V1 (200000*0.02=4000)
    expect(result[0].vendedor_codigo).toBe("V2");
    expect(result[0].totalComision).toBe(10000);
    expect(result[1].vendedor_codigo).toBe("V1");
    expect(result[1].totalComision).toBe(4000);
  });

  test("exclusiones NO afectan comision de ventas — todas las ventas cuentan", () => {
    const ventas = [
      makeVenta("P1", 200000, { vendedor_codigo: "V1", excluded: false }),
      makeVenta("P1", 300000, { vendedor_codigo: "V1", excluded: true }),
    ];
    const presupuestosMarca = [
      makePresupuestoMarca("CONTEGRAL", 100000, 0.02, {
        vendedor_codigo: "V1",
      }),
    ];
    const productBrandMap = { P1: "CONTEGRAL" };

    const result = calcularComisionesCompletas({
      ventas,
      recaudos: [],
      presupuestosMarca,
      presupuestosRecaudo: [],
      productBrandMap,
    });

    // Ambas ventas cuentan (200000+300000=500000) — exclusiones solo aplican a recaudo
    expect(result[0].comisionVentas.totalComisionVentas).toBe(10000); // 500000*0.02
  });

  test("vendedor que solo tiene recaudos (sin ventas) aparece con comision ventas=0", () => {
    const ventas = [
      makeVenta("P1", 100000, {
        vendedor_codigo: "V1",
        vendedor_nombre: "Ana",
      }),
    ];
    const recaudos = [makeRecaudo(500000, true, { vendedor_codigo: "V2" })];
    const presupuestosMarca = [
      makePresupuestoMarca("CONTEGRAL", 50000, 0.02, { vendedor_codigo: "V1" }),
    ];
    const presupuestosRecaudo = [
      {
        vendedor_codigo: "V2",
        meta_recaudo: 1000000,
        tramo1_max: 70,
        tramo1_pct: 0.01,
      },
    ];
    const productBrandMap = { P1: "CONTEGRAL" };

    const result = calcularComisionesCompletas({
      ventas,
      recaudos,
      presupuestosMarca,
      presupuestosRecaudo,
      productBrandMap,
    });

    const v2 = result.find((r) => r.vendedor_codigo === "V2");
    expect(v2).toBeDefined();
    expect(v2.comisionVentas.totalComisionVentas).toBe(0);
    expect(v2.comisionRecaudo.comisionRecaudo).toBe(5000); // 500000*0.01
  });

  test("totalComision = comisionVentas + comisionRecaudo", () => {
    const ventas = [
      makeVenta("P1", 200000, {
        vendedor_codigo: "V1",
        vendedor_nombre: "Ana",
      }),
    ];
    const recaudos = [makeRecaudo(800000, true, { vendedor_codigo: "V1" })];
    const presupuestosMarca = [
      makePresupuestoMarca("CONTEGRAL", 100000, 0.02, {
        vendedor_codigo: "V1",
      }),
    ];
    const presupuestosRecaudo = [
      {
        vendedor_codigo: "V1",
        meta_recaudo: 1000000,
        tramo1_max: 70,
        tramo1_pct: 0.01,
        tramo2_min: 70,
        tramo2_pct: 0.02,
        tramo3_min: 90,
        tramo3_pct: 0.03,
        tramo4_min: 100,
        tramo4_pct: 0.04,
      },
    ];
    const productBrandMap = { P1: "CONTEGRAL" };

    const result = calcularComisionesCompletas({
      ventas,
      recaudos,
      presupuestosMarca,
      presupuestosRecaudo,
      productBrandMap,
    });

    const v1 = result[0];
    const expectedVentas = 4000; // 200000*0.02
    const expectedRecaudo = 16000; // 800000*0.02 (80% = Tramo 2)
    expect(v1.comisionVentas.totalComisionVentas).toBe(expectedVentas);
    expect(v1.comisionRecaudo.comisionRecaudo).toBe(expectedRecaudo);
    expect(v1.totalComision).toBe(expectedVentas + expectedRecaudo);
  });
});

describe("calcularComisionRecaudo — null/undefined tramo defaults", () => {
  test("null tramo values default correctly: min→Infinity, max→Infinity, pct→0", () => {
    // Only tramo1 configured, tramo2-4 are null → should be unreachable (min=Infinity)
    const recaudos = [makeRecaudo(500000, true)];
    const presupuestoRecaudo = {
      meta_recaudo: 1000000,
      tramo1_max: 70,
      tramo1_pct: 0.01,
      tramo2_min: null,
      tramo2_pct: null,
      tramo3_min: null,
      tramo3_pct: null,
      tramo4_min: null,
      tramo4_pct: null,
    };

    const result = calcularComisionRecaudo({ recaudos, presupuestoRecaudo });

    // 50% cumplimiento → should match Tramo 1 (0-70%)
    expect(result.pctCumplimiento).toBe(50);
    expect(result.tramoAplicado).toBe("Tramo 1");
    expect(result.pctComision).toBe(0.01);
    expect(result.comisionRecaudo).toBe(5000);
  });

  test("null tramo1_max defaults to Infinity — Tramo 1 catches all unconfigured", () => {
    const recaudos = [makeRecaudo(500000, true)];
    const presupuestoRecaudo = {
      meta_recaudo: 1000000,
      tramo1_max: null,
      tramo1_pct: 0.01,
    };

    const result = calcularComisionRecaudo({ recaudos, presupuestoRecaudo });

    // 50% cumplimiento, tramo1_max=Infinity → Tramo 1 applies
    expect(result.pctCumplimiento).toBe(50);
    expect(result.tramoAplicado).toBe("Tramo 1");
    expect(result.pctComision).toBe(0.01);
  });

  test("undefined tramo fields behave same as null — fallback to defaults", () => {
    const recaudos = [makeRecaudo(800000, true)];
    const presupuestoRecaudo = {
      meta_recaudo: 1000000,
      tramo1_max: 70,
      tramo1_pct: 0.01,
      tramo2_min: 70,
      tramo2_pct: 0.02,
      // tramo3 and tramo4 not present at all (undefined)
    };

    const result = calcularComisionRecaudo({ recaudos, presupuestoRecaudo });

    // 80% cumplimiento → Tramo 2 (70+) should match
    expect(result.pctCumplimiento).toBe(80);
    expect(result.tramoAplicado).toBe("Tramo 2");
    expect(result.pctComision).toBe(0.02);
  });

  test("empty string tramo values treated as null — fallback to defaults", () => {
    const recaudos = [makeRecaudo(500000, true)];
    const presupuestoRecaudo = {
      meta_recaudo: 1000000,
      tramo1_max: 70,
      tramo1_pct: 0.01,
      tramo2_min: "",
      tramo2_pct: "",
      tramo3_min: "",
      tramo3_pct: "",
      tramo4_min: "",
      tramo4_pct: "",
    };

    const result = calcularComisionRecaudo({ recaudos, presupuestoRecaudo });

    // 50% → Tramo 1
    expect(result.tramoAplicado).toBe("Tramo 1");
    expect(result.pctComision).toBe(0.01);
  });
});

describe("calcularComisionRecaudo — edge cases", () => {
  test("cumplimiento en gap entre tramos retorna comisión 0", () => {
    // Tramo 1: 0-50%, Tramo 2: 60-100%. Gap en 50-60%.
    const recaudos = [
      { vendedor_codigo: "V1", valor_recaudo: 550000, aplica_comision: true },
    ];
    const presupuestoRecaudo = {
      vendedor_codigo: "V1",
      meta_recaudo: 1000000,
      tramo1_max: 50,
      tramo1_pct: 0.01,
      tramo2_min: 60,
      tramo2_max: 100,
      tramo2_pct: 0.02,
      tramo3_min: Infinity,
      tramo3_pct: 0,
      tramo4_min: Infinity,
      tramo4_pct: 0,
    };
    const result = calcularComisionRecaudo({ recaudos, presupuestoRecaudo });
    // 55% cumplimiento — cae en gap, ningún tramo aplica
    expect(result.pctCumplimiento).toBe(55);
    expect(result.tramoAplicado).toBeNull();
    expect(result.pctComision).toBe(0);
    expect(result.comisionRecaudo).toBe(0);
  });

  test("recaudos con aplica_comision false no cuentan para comisionable", () => {
    const recaudos = [
      { vendedor_codigo: "V1", valor_recaudo: 500000, aplica_comision: true },
      { vendedor_codigo: "V1", valor_recaudo: 300000, aplica_comision: false },
    ];
    const presupuestoRecaudo = {
      vendedor_codigo: "V1",
      meta_recaudo: 1000000,
      tramo1_max: 89.99,
      tramo1_pct: 0.01,
      tramo2_min: 90,
      tramo2_pct: 0.02,
      tramo3_min: Infinity,
      tramo3_pct: 0,
      tramo4_min: Infinity,
      tramo4_pct: 0,
    };
    const result = calcularComisionRecaudo({ recaudos, presupuestoRecaudo });
    expect(result.totalRecaudado).toBe(800000);
    expect(result.totalComisionable).toBe(500000);
    expect(result.totalExcluido).toBe(300000);
  });

  test("sin presupuesto configurado retorna comisión 0", () => {
    const recaudos = [
      { vendedor_codigo: "V1", valor_recaudo: 500000, aplica_comision: true },
    ];
    const result = calcularComisionRecaudo({
      recaudos,
      presupuestoRecaudo: null,
    });
    expect(result.totalRecaudado).toBe(500000);
    expect(result.comisionRecaudo).toBe(0);
    expect(result.tramoAplicado).toBeNull();
  });
});

describe("calcularComisionRecaudo — prorrateo exclusiones marca", () => {
  test("valor_excluido_marca se resta del comisionable", () => {
    const recaudos = [
      {
        vendedor_codigo: "V1",
        valor_recaudo: 100000,
        aplica_comision: true,
        valor_excluido_marca: 30000,
      },
    ];
    const result = calcularComisionRecaudo({
      recaudos,
      presupuestoRecaudo: null,
    });
    expect(result.totalRecaudado).toBe(100000);
    expect(result.totalComisionable).toBe(70000);
    expect(result.totalExcluido).toBe(30000);
  });

  test("recaudo excluido por mora no descuenta valor_excluido_marca adicionalmente", () => {
    const recaudos = [
      {
        vendedor_codigo: "V1",
        valor_recaudo: 100000,
        aplica_comision: false,
        valor_excluido_marca: 30000,
        dias_mora: 80,
      },
    ];
    const result = calcularComisionRecaudo({
      recaudos,
      presupuestoRecaudo: null,
    });
    // Mora excluye todo el valor, no se descuenta marca aparte
    expect(result.totalRecaudado).toBe(100000);
    expect(result.totalComisionable).toBe(0);
    expect(result.totalExcluido).toBe(100000);
  });

  test("sin valor_excluido_marca funciona igual que antes", () => {
    const recaudos = [makeRecaudo(500000, true), makeRecaudo(200000, false)];
    const result = calcularComisionRecaudo({
      recaudos,
      presupuestoRecaudo: null,
    });
    expect(result.totalComisionable).toBe(500000);
    expect(result.totalExcluido).toBe(200000);
  });

  test("prorrateo afecta comisión calculada", () => {
    const recaudos = [
      {
        vendedor_codigo: "V1",
        valor_recaudo: 1000000,
        aplica_comision: true,
        valor_excluido_marca: 200000,
      },
    ];
    const presupuestoRecaudo = {
      meta_recaudo: 1000000,
      tramo1_max: 70,
      tramo1_pct: 0.01,
      tramo2_min: 70,
      tramo2_pct: 0.02,
      tramo3_min: 90,
      tramo3_pct: 0.03,
      tramo4_min: 100,
      tramo4_pct: 0.04,
    };
    const result = calcularComisionRecaudo({ recaudos, presupuestoRecaudo });
    // comisionable = 800000, cumplimiento = 80% → Tramo 2
    expect(result.totalComisionable).toBe(800000);
    expect(result.pctCumplimiento).toBe(80);
    expect(result.tramoAplicado).toBe("Tramo 2");
    expect(result.comisionRecaudo).toBe(16000); // 800000 * 0.02
  });
});
