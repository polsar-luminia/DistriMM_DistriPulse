import { describe, test, expect } from "vitest";
import { parseVentasRows } from "../ventasUpload";
import {
  calcularComisionVentas,
  calcularComisionRecaudo,
  calcularComisionesCompletas,
} from "../comisionesCalculator";

// --- Helpers para crear datos mock realistas ---

function makeVentaRow(overrides = {}) {
  return {
    Vend: "14",
    "Nit Vendedor": "830001",
    "Nombre Vendedor": "Juan Perez",
    Producto: "PROD-01",
    "Descripcion Producto": "Producto Test",
    Cliente: "900100200",
    "Nombre Cliente": "Cliente Test",
    Municipio: "Bogota",
    Fecha: "15/03/2026",
    Factura: "FELE-001",
    Precio: "1000",
    Descto: "0",
    "Val Unidad": "1000",
    Cant: "1",
    ValorTotal: "500000",
    Costo: "300000",
    Tipo: "VE",
    ...overrides,
  };
}

function makeRecaudo(overrides = {}) {
  return {
    vendedor_codigo: "14",
    valor_recaudo: 1000000,
    valor_excluido_marca: 0,
    valor_iva: 50000,
    aplica_comision: true,
    ...overrides,
  };
}

const productBrandMap = {
  "PROD-01": "CONTEGRAL",
  "PROD-02": "SOLLA",
};

// --- Tests de integración ---

describe("Integración: Ventas parse → cálculo comisiones", () => {
  test("flujo completo: parse Excel → agrupar por marca → calcular comisión", () => {
    const excelRows = [
      makeVentaRow({ Producto: "PROD-01", ValorTotal: "500000" }),
      makeVentaRow({ Producto: "PROD-02", ValorTotal: "300000" }),
      makeVentaRow({ Producto: "PROD-01", ValorTotal: "200000" }),
    ];

    const ventas = parseVentasRows(excelRows);
    expect(ventas).toHaveLength(3);

    // presupuestosMarca es un ARRAY con { marca, meta_ventas, pct_comision }
    const presupuestosMarca = [
      { marca: "CONTEGRAL", meta_ventas: 600000, pct_comision: 0.05 },
      { marca: "SOLLA", meta_ventas: 200000, pct_comision: 0.03 },
    ];

    const result = calcularComisionVentas({
      ventas,
      presupuestosMarca,
      productBrandMap,
    });

    // CONTEGRAL: 500000 + 200000 = 700000, meta 600000 → cumple → 700000 * 0.05 = 35000
    // SOLLA: 300000, meta 200000 → cumple → 300000 * 0.03 = 9000
    expect(result.totalComisionVentas).toBe(35000 + 9000);
    expect(result.detalleMarcas).toHaveLength(2);
  });

  test("DV (devoluciones) se restan del total por marca", () => {
    const excelRows = [
      makeVentaRow({ Producto: "PROD-01", ValorTotal: "500000", Tipo: "VE" }),
      makeVentaRow({ Producto: "PROD-01", ValorTotal: "100000", Tipo: "DV" }),
    ];

    const ventas = parseVentasRows(excelRows);
    expect(ventas[1].valor_total).toBe(-100000);

    const presupuestosMarca = [
      { marca: "CONTEGRAL", meta_ventas: 300000, pct_comision: 0.05 },
    ];

    const result = calcularComisionVentas({
      ventas,
      presupuestosMarca,
      productBrandMap,
    });

    // 500000 - 100000 = 400000, meta 300000 → cumple → 400000 * 0.05 = 20000
    expect(result.totalComisionVentas).toBe(20000);
  });

  test("vendedor sin presupuesto: marcas aparecen con comisión 0", () => {
    const excelRows = [
      makeVentaRow({ Producto: "PROD-01", ValorTotal: "1000000" }),
    ];

    const ventas = parseVentasRows(excelRows);
    // Sin presupuestos de marca → comisión 0
    const result = calcularComisionVentas({
      ventas,
      presupuestosMarca: [],
      productBrandMap,
    });

    expect(result.totalComisionVentas).toBe(0);
    // La marca aparece como "sin presupuesto"
    expect(result.detalleMarcas[0].tienePresupuesto).toBe(false);
  });

  test("vendedor no alcanza meta → comisión 0 para esa marca", () => {
    const excelRows = [
      makeVentaRow({ Producto: "PROD-01", ValorTotal: "100000" }),
    ];

    const ventas = parseVentasRows(excelRows);
    const presupuestosMarca = [
      { marca: "CONTEGRAL", meta_ventas: 500000, pct_comision: 0.05 },
    ];

    const result = calcularComisionVentas({
      ventas,
      presupuestosMarca,
      productBrandMap,
    });

    expect(result.totalComisionVentas).toBe(0);
    expect(result.detalleMarcas[0].cumpleMeta).toBe(false);
  });
});

describe("Integración: Recaudo → cálculo comisiones con tramos", () => {
  test("5 tramos: cumplimiento selecciona tramo correcto", () => {
    const recaudos = [makeRecaudo({ valor_recaudo: 900000, valor_iva: 50000 })];

    const presupuestoRecaudo = {
      meta_recaudo: 1000000,
      tramo1_max: 50,
      tramo1_pct: 0.01,
      tramo2_min: 50,
      tramo2_pct: 0.02,
      tramo3_min: 70,
      tramo3_pct: 0.03,
      tramo4_min: 90,
      tramo4_pct: 0.04,
      tramo5_min: 100,
      tramo5_pct: 0.05,
    };

    const result = calcularComisionRecaudo({ recaudos, presupuestoRecaudo });

    // totalComisionable = 900000 - 0 - 50000 = 850000
    // pctCumplimiento = (850000 / 1000000) * 100 = 85%
    // 85% >= tramo3 (70%) pero < tramo4 (90%) → tramo 3, pct = 0.03
    expect(result.tramoAplicado).toBe("Tramo 3");
    expect(result.comisionRecaudo).toBe(Math.round(850000 * 0.03));
  });

  test("recaudo con mora excluido no cuenta para comisionable", () => {
    const recaudos = [
      makeRecaudo({
        valor_recaudo: 500000,
        aplica_comision: true,
        valor_iva: 0,
      }),
      makeRecaudo({
        valor_recaudo: 500000,
        aplica_comision: false,
        valor_iva: 0,
      }),
    ];

    const presupuestoRecaudo = {
      meta_recaudo: 1000000,
      tramo1_max: 70,
      tramo1_pct: 0.01,
      tramo2_min: 70,
      tramo2_pct: 0.02,
    };

    const result = calcularComisionRecaudo({ recaudos, presupuestoRecaudo });

    // Solo 500000 es comisionable
    expect(result.totalComisionable).toBe(500000);
    // 500000/1000000 = 50% → tramo1 (max: 70%) → pct 0.01
    expect(result.tramoAplicado).toBe("Tramo 1");
  });

  test("exclusión de marca se descuenta del comisionable", () => {
    const recaudos = [
      makeRecaudo({
        valor_recaudo: 1000000,
        valor_excluido_marca: 200000,
        valor_iva: 100000,
      }),
    ];

    const presupuestoRecaudo = {
      meta_recaudo: 1000000,
      tramo1_max: 70,
      tramo1_pct: 0.01,
      tramo2_min: 70,
      tramo2_pct: 0.03,
    };

    const result = calcularComisionRecaudo({ recaudos, presupuestoRecaudo });

    // totalComisionable = 1000000 - 200000 - 100000 = 700000
    expect(result.totalComisionable).toBe(700000);
  });

  test("todos los tramos null → comisión 0", () => {
    const recaudos = [makeRecaudo({ valor_recaudo: 1000000, valor_iva: 0 })];
    const presupuestoRecaudo = { meta_recaudo: 500000 };

    const result = calcularComisionRecaudo({ recaudos, presupuestoRecaudo });
    expect(result.comisionRecaudo).toBe(0);
  });
});

describe("Integración: calcularComisionesCompletas (ventas + recaudo)", () => {
  test("combina comisiones de ventas y recaudo por vendedor", () => {
    const ventas = [
      {
        vendedor_codigo: "14",
        vendedor_nombre: "Juan",
        producto_codigo: "PROD-01",
        valor_total: 600000,
      },
      {
        vendedor_codigo: "20",
        vendedor_nombre: "Maria",
        producto_codigo: "PROD-01",
        valor_total: 400000,
      },
    ];

    const recaudos = [
      makeRecaudo({
        vendedor_codigo: "14",
        valor_recaudo: 800000,
        valor_iva: 40000,
      }),
      makeRecaudo({
        vendedor_codigo: "20",
        valor_recaudo: 600000,
        valor_iva: 30000,
      }),
    ];

    // presupuestosMarca es ARRAY con vendedor_codigo
    const presupuestosMarca = [
      {
        vendedor_codigo: "14",
        marca: "CONTEGRAL",
        meta_ventas: 500000,
        pct_comision: 0.05,
      },
      {
        vendedor_codigo: "20",
        marca: "CONTEGRAL",
        meta_ventas: 300000,
        pct_comision: 0.04,
      },
    ];

    // presupuestosRecaudo es ARRAY con vendedor_codigo
    const presupuestosRecaudo = [
      {
        vendedor_codigo: "14",
        meta_recaudo: 1000000,
        tramo1_max: 100,
        tramo1_pct: 0.02,
      },
      {
        vendedor_codigo: "20",
        meta_recaudo: 500000,
        tramo1_max: 100,
        tramo1_pct: 0.02,
      },
    ];

    const result = calcularComisionesCompletas({
      ventas,
      recaudos,
      presupuestosMarca,
      presupuestosRecaudo,
      productBrandMap,
    });

    expect(result).toHaveLength(2);

    const juan = result.find((r) => r.vendedor_codigo === "14");
    const maria = result.find((r) => r.vendedor_codigo === "20");

    expect(juan).toBeDefined();
    expect(maria).toBeDefined();

    // Juan: ventas 600000 >= meta 500000 → 600000 * 0.05 = 30000
    expect(juan.comisionVentas.totalComisionVentas).toBe(30000);
    expect(juan.comisionRecaudo.comisionRecaudo).toBeGreaterThan(0);
    expect(juan.totalComision).toBe(
      juan.comisionVentas.totalComisionVentas +
        juan.comisionRecaudo.comisionRecaudo,
    );

    // Maria: ventas 400000 >= meta 300000 → 400000 * 0.04 = 16000
    expect(maria.comisionVentas.totalComisionVentas).toBe(16000);
  });

  test("vendedor solo en recaudo (sin ventas) recibe comisión de recaudo", () => {
    const ventas = [];
    const recaudos = [
      makeRecaudo({
        vendedor_codigo: "14",
        valor_recaudo: 500000,
        valor_iva: 0,
      }),
    ];

    const presupuestosRecaudo = [
      {
        vendedor_codigo: "14",
        meta_recaudo: 400000,
        tramo1_max: 200,
        tramo1_pct: 0.02,
      },
    ];

    const result = calcularComisionesCompletas({
      ventas,
      recaudos,
      presupuestosMarca: [],
      presupuestosRecaudo,
      productBrandMap: {},
    });

    expect(result).toHaveLength(1);
    expect(result[0].comisionVentas.totalComisionVentas).toBe(0);
    expect(result[0].comisionRecaudo.comisionRecaudo).toBeGreaterThan(0);
  });
});
