import { describe, test, expect } from "vitest";
import {
  isSaldosFormat,
  normalizeProductoCodigo,
  parseUltCompra,
  transformSaldos,
  BODEGAS_CONFIABLES,
} from "../inventarioUpload";

const filaBase = {
  Codigo: "92412",
  Referencia: "",
  Bodega: 5,
  "Nombre Producto": "EDO SULFA X 50 ML",
  Cantidad: 32,
  Valor: 938057.19,
  Remision: 0,
  Transito: 0,
  Cat: 1,
  "Nombre Categoria": " DROGA ",
  "Ult Compra": "22/01/2026",
  "Ult. Val. Compra": 29314.29,
  "Ult. Val. Venta": 31300,
  PrecioMinimo: 30300,
  PrecioMedio: 30300,
  PRecioMaximo: 30300,
  Marca: "EDO",
};

describe("isSaldosFormat", () => {
  test("detecta el reporte Saldos de Productos por sus columnas", () => {
    expect(isSaldosFormat([filaBase])).toBe(true);
  });

  test("rechaza archivos con otras columnas", () => {
    expect(isSaldosFormat([{ Cuenta: "1305", "Doc. CxC": "F123" }])).toBe(
      false,
    );
    expect(isSaldosFormat([])).toBe(false);
    expect(isSaldosFormat(null)).toBe(false);
  });
});

describe("normalizeProductoCodigo", () => {
  test("conserva códigos de 5 caracteres con ceros a la izquierda", () => {
    expect(normalizeProductoCodigo("00007")).toBe("00007");
    expect(normalizeProductoCodigo("92412")).toBe("92412");
  });

  test("restaura ceros perdidos cuando Excel entrega la celda como número", () => {
    expect(normalizeProductoCodigo(7)).toBe("00007");
    expect(normalizeProductoCodigo(58)).toBe("00058");
  });

  test("no altera códigos alfanuméricos ni largos", () => {
    expect(normalizeProductoCodigo("AB123")).toBe("AB123");
    expect(normalizeProductoCodigo("123456")).toBe("123456");
  });

  test("retorna string vacío para null/undefined", () => {
    expect(normalizeProductoCodigo(null)).toBe("");
    expect(normalizeProductoCodigo(undefined)).toBe("");
  });
});

describe("parseUltCompra", () => {
  test("convierte fecha dd/MM/yyyy a ISO", () => {
    expect(parseUltCompra("22/01/2026")).toBe("2026-01-22");
  });

  test("trata 01/01/1900 (nunca ha comprado) como null", () => {
    expect(parseUltCompra("01/01/1900")).toBeNull();
  });

  test("retorna null para valores vacíos o inválidos", () => {
    expect(parseUltCompra("")).toBeNull();
    expect(parseUltCompra(null)).toBeNull();
  });
});

describe("transformSaldos", () => {
  test("transforma una fila completa al formato de distrimm_inventario_items", () => {
    const [item] = transformSaldos([filaBase]);
    expect(item).toEqual({
      producto_codigo: "92412",
      producto_nombre: "EDO SULFA X 50 ML",
      bodega: 5,
      cantidad: 32,
      valor: 938057.19,
      transito: 0,
      categoria_codigo: "1",
      categoria_nombre: "DROGA",
      marca: "EDO",
      ult_compra: "2026-01-22",
      ult_val_compra: 29314.29,
      ult_val_venta: 31300,
      precio_medio: 30300,
    });
  });

  test("descarta filas sin código, sin bodega o sin existencias ni tránsito", () => {
    const result = transformSaldos([
      { ...filaBase, Codigo: "" },
      { ...filaBase, Bodega: null },
      { ...filaBase, Cantidad: 0, Transito: 0 },
    ]);
    expect(result).toHaveLength(0);
  });

  test("conserva filas sin stock pero con tránsito", () => {
    const result = transformSaldos([
      { ...filaBase, Cantidad: 0, Transito: 12 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].transito).toBe(12);
  });

  test("guarda todas las bodegas, incluidas las no confiables", () => {
    const result = transformSaldos([
      { ...filaBase, Bodega: 2 },
      { ...filaBase, Bodega: 5 },
    ]);
    expect(result.map((r) => r.bodega)).toEqual([2, 5]);
  });
});

describe("BODEGAS_CONFIABLES", () => {
  test("son 3, 5 y 6 según definición de gerencia", () => {
    expect(BODEGAS_CONFIABLES).toEqual([3, 5, 6]);
  });
});
