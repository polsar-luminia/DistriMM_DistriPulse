import { describe, test, expect } from "vitest";
import {
  col,
  parseVentasRows,
  parseVentasWorkbookRows,
  VENTAS_FORMAT_ERROR,
} from "../ventasUpload";

describe("col", () => {
  test("resuelve headers con espacios alrededor", () => {
    const row = { "  Factura ": "FELE-1001" };
    expect(col(row, "Factura")).toBe("FELE-1001");
  });

  test("devuelve undefined cuando no encuentra el header", () => {
    expect(col({ A: 1 }, "Factura")).toBeUndefined();
  });
});

describe("parseVentasRows", () => {
  test("parsea por header aunque las columnas vengan reordenadas", () => {
    const rows = [
      {
        Costo: "800",
        Tipo: "DV",
        Factura: "F-001",
        Vend: "14",
        "Nombre Cliente": "Cliente Uno",
        ValorTotal: "1200",
        Producto: "PROD-01",
        Cliente: "900100200",
        "Nit Vendedor": "830001",
        "Descripcion Producto": "Producto A",
        Municipio: "Bogota",
        Precio: "1000",
        Descto: "50",
        "Val Unidad": "950",
        Cant: "2",
        Fecha: "15/03/2026",
      },
    ];

    const parsed = parseVentasRows(rows);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      vendedor_codigo: "14",
      vendedor_nit: "830001",
      vendedor_nombre: "",
      producto_codigo: "PROD-01",
      cliente_nit: "900100200",
      cliente_nombre: "Cliente Uno",
      municipio: "Bogota",
      fecha_raw: "15/03/2026",
      factura: "F-001",
      precio: 1000,
      descuento: 50,
      valor_unidad: 950,
      cantidad: 2,
      valor_total: -1200,
      costo: -800,
      tipo: "DV",
    });
  });

  test("parsea valores numéricos en formato colombiano (1.234.567,89)", () => {
    const rows = [
      {
        Vend: "14",
        Producto: "PROD-01",
        Cliente: "900100200",
        Factura: "F-001",
        ValorTotal: "1.234.567,89",
        Costo: "800.000,50",
        Tipo: "VE",
      },
    ];

    const parsed = parseVentasRows(rows);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].valor_total).toBe(1234567.89);
    expect(parsed[0].costo).toBe(800000.5);
  });

  test("rechaza un archivo con headers no reconocidos", () => {
    expect(() =>
      parseVentasRows([
        { Random: "value", Another: "thing" },
        { Random: "value2", Another: "thing2" },
      ]),
    ).toThrow(VENTAS_FORMAT_ERROR);
  });

  test("rechaza filas sin registros válidos", () => {
    expect(() =>
      parseVentasRows([
        {
          Vend: "14",
          "Nit Vendedor": "830001",
          "Nombre Vendedor": "Vendedor",
          Producto: "",
          "Descripcion Producto": "Sin producto",
          Cliente: "900100200",
          "Nombre Cliente": "Cliente",
          Municipio: "Bogota",
          Fecha: "15/03/2026",
          Factura: "F-001",
          Precio: "0",
          Descto: "0",
          "Val Unidad": "0",
          Cant: "0",
          ValorTotal: "0",
          Costo: "0",
          Tipo: "VE",
        },
      ]),
    ).toThrow("No se encontraron registros validos.");
  });
});

describe("parseVentasWorkbookRows", () => {
  test("usa la fila decorativa como fallback cuando range 1 no tiene headers válidos", () => {
    const decorativeRange = [
      {
        "Venta de Productos x Factura": "Venta de Productos x Factura",
      },
    ];

    const validRange = [
      {
        Vend: "14",
        "Nit Vendedor": "830001",
        "Nombre Vendedor": "Vendedor",
        Producto: "PROD-01",
        "Descripcion Producto": "Producto A",
        Cliente: "900100200",
        "Nombre Cliente": "Cliente Uno",
        Municipio: "Bogota",
        Fecha: "15/03/2026",
        Factura: "F-001",
        Precio: "1000",
        Descto: "0",
        "Val Unidad": "1000",
        Cant: "1",
        ValorTotal: "1000",
        Costo: "800",
        Tipo: "VE",
      },
    ];

    const parsed = parseVentasWorkbookRows(decorativeRange, validRange);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      vendedor_codigo: "14",
      producto_codigo: "PROD-01",
      valor_total: 1000,
      costo: 800,
      tipo: "VE",
    });
  });

  test("propaga el error de formato cuando ambos rangos son inválidos", () => {
    expect(() =>
      parseVentasWorkbookRows([{ Foo: "bar" }], [{ Baz: "qux" }]),
    ).toThrow(VENTAS_FORMAT_ERROR);
  });
});
