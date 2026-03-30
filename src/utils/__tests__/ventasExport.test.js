import { describe, test, expect } from "vitest";
import {
  buildResumenRows,
  buildDetalleRows,
  buildExclusionesRows,
} from "../ventasExcelExport";

// ── Fixtures ──

const comisiones = [
  {
    vendedor_nombre: "Juan Perez",
    vendedor_codigo: "V01",
    total_ventas: 5000000,
    total_costo: 3000000,
    ventas_excluidas: 500000,
    ventas_comisionables: 4500000,
    items_total: 100,
    items_excluidos: 10,
    items_comisionables: 90,
  },
  {
    vendedor_nombre: "Maria Garcia",
    vendedor_codigo: "V02",
    total_ventas: 3000000,
    total_costo: 2000000,
    ventas_excluidas: 300000,
    ventas_comisionables: 2700000,
    items_total: 60,
    items_excluidos: 5,
    items_comisionables: 55,
  },
];

const totals = {
  totalVentas: 8000000,
  totalCosto: 5000000,
  ventasExcluidas: 800000,
  ventasComisionables: 7200000,
};

// ── Tests ──

describe("buildResumenRows", () => {
  test("genera filas de resumen por vendedor + fila TOTALES", () => {
    const rows = buildResumenRows(comisiones, totals);

    expect(rows).toHaveLength(3); // 2 vendedores + TOTALES
    expect(rows[0].Vendedor).toBe("Juan Perez (#V01)");
    expect(rows[0]["Ventas Totales"]).toBe(5000000);
    expect(rows[0]["Costo Total"]).toBe(3000000);
    expect(rows[0]["Sin Comision"]).toBe(500000);

    // Fila TOTALES
    expect(rows[2].Vendedor).toBe("TOTALES");
    expect(rows[2]["Ventas Totales"]).toBe(8000000);
    expect(rows[2]["Items Total"]).toBe(160);
    expect(rows[2]["Items Sin Comision"]).toBe(15);
    expect(rows[2]["Items Comisionables"]).toBe(145);
  });

  test("maneja vendedor sin nombre", () => {
    const rows = buildResumenRows([{ vendedor_codigo: "V99" }], {
      totalVentas: 0,
      totalCosto: 0,
      ventasExcluidas: 0,
      ventasComisionables: 0,
    });
    expect(rows[0].Vendedor).toBe("Sin nombre (#V99)");
  });

  test("convierte valores nulos a 0", () => {
    const rows = buildResumenRows(
      [{ vendedor_nombre: "Test", vendedor_codigo: "V01" }],
      {
        totalVentas: 0,
        totalCosto: 0,
        ventasExcluidas: 0,
        ventasComisionables: 0,
      },
    );
    expect(rows[0]["Ventas Totales"]).toBe(0);
    expect(rows[0]["Items Total"]).toBe(0);
  });
});

describe("buildDetalleRows", () => {
  const ventasDetail = [
    {
      vendedor_nombre: "Juan",
      vendedor_codigo: "V01",
      producto_codigo: "P001",
      producto_descripcion: "Producto A",
      cliente_nit: "900123",
      cliente_nombre: "Cliente 1",
      factura: "F001",
      municipio: "Bogotá",
      fecha: "2026-01-15",
      cantidad: 10,
      precio: 50000,
      descuento: 5000,
      valor_unidad: 45000,
      valor_total: 450000,
      costo: 300000,
    },
  ];

  test("marca Con Comision = SI para producto no excluido", () => {
    const checkExclusion = () => ({ excluded: false });
    const rows = buildDetalleRows(ventasDetail, checkExclusion);

    expect(rows).toHaveLength(1);
    expect(rows[0]["Con Comision"]).toBe("SI");
    expect(rows[0].Motivo).toBe("");
    expect(rows[0]["Valor Total"]).toBe(450000);
  });

  test("marca Con Comision = NO con motivo para producto excluido", () => {
    const checkExclusion = () => ({
      excluded: true,
      reason: "Marca excluida: MARCA_X",
    });
    const rows = buildDetalleRows(ventasDetail, checkExclusion);

    expect(rows[0]["Con Comision"]).toBe("NO");
    expect(rows[0].Motivo).toBe("Marca excluida: MARCA_X");
  });

  test("usa vendedor_codigo como fallback si no hay nombre", () => {
    const detail = [{ ...ventasDetail[0], vendedor_nombre: "" }];
    const rows = buildDetalleRows(detail, () => ({ excluded: false }));
    expect(rows[0].Vendedor).toBe("V01");
  });
});

describe("buildExclusionesRows", () => {
  test("genera filas de exclusiones con tipo legible", () => {
    const exclusiones = [
      {
        tipo: "marca",
        valor: "MARCA_A",
        descripcion: "Desc A",
        motivo: "Motivo A",
      },
      { tipo: "producto", valor: "P001", descripcion: "Desc B", motivo: "" },
    ];
    const rows = buildExclusionesRows(exclusiones);

    expect(rows).toHaveLength(2);
    expect(rows[0].Tipo).toBe("Marca");
    expect(rows[0].Valor).toBe("MARCA_A");
    expect(rows[1].Tipo).toBe("Producto");
  });

  test("retorna array vacío para null/undefined", () => {
    expect(buildExclusionesRows(null)).toEqual([]);
    expect(buildExclusionesRows(undefined)).toEqual([]);
  });

  test("maneja campos vacíos", () => {
    const rows = buildExclusionesRows([{ tipo: "marca", valor: "X" }]);
    expect(rows[0].Descripcion).toBe("");
    expect(rows[0].Motivo).toBe("");
  });
});
