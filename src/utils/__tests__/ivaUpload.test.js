import { describe, test, expect } from "vitest";
import { parseIvaRows } from "../ivaUpload";

describe("parseIvaRows", () => {
  test("filtra productos con IVA 0%, 5% o 19%", () => {
    const data = [
      { Producto: "P1", Nombre: "Prod 1", "% Iva": 5 },
      { Producto: "P2", Nombre: "Prod 2", "% Iva": 19 },
      { Producto: "P3", Nombre: "Exento", "% Iva": 0 },
    ];
    const result = parseIvaRows(data);
    expect(result).toHaveLength(3);
    expect(result[0].pct_iva).toBe(5);
    expect(result[1].pct_iva).toBe(19);
    expect(result[2].pct_iva).toBe(0);
  });

  test("deduplica por código (toma el primero)", () => {
    const data = [
      { Producto: "P1", "% Iva": 5 },
      { Producto: "P1", "% Iva": 19 },
    ];
    const result = parseIvaRows(data);
    expect(result).toHaveLength(1);
    expect(result[0].pct_iva).toBe(5);
  });

  test("descarta filas sin código", () => {
    const data = [
      { Producto: "", "% Iva": 19 },
      { Producto: "P1", "% Iva": 5 },
    ];
    expect(parseIvaRows(data)).toHaveLength(1);
  });

  test("descarta IVA no numérico", () => {
    const data = [
      { Producto: "P1", "% Iva": "N/A" },
      { Producto: "P2", "% Iva": 19 },
    ];
    expect(parseIvaRows(data)).toHaveLength(1);
  });

  test("retorna vacío si no hay datos", () => {
    expect(parseIvaRows([])).toHaveLength(0);
  });

  test("parsea IVA string '5' correctamente", () => {
    const data = [{ Producto: "P1", "% Iva": "5" }];
    const result = parseIvaRows(data);
    expect(result).toHaveLength(1);
    expect(result[0].pct_iva).toBe(5);
  });

  test("aliases alternativos de columna funcionan", () => {
    const data = [{ producto: "P1", "% IVA": 19 }];
    const result = parseIvaRows(data);
    expect(result).toHaveLength(1);
    expect(result[0].codigo).toBe("P1");
    expect(result[0].pct_iva).toBe(19);
  });

  test("IVA = 10 (no es 0/5/19) se descarta", () => {
    const data = [
      { Producto: "P1", "% Iva": 10 },
      { Producto: "P2", "% Iva": 19 },
    ];
    const result = parseIvaRows(data);
    expect(result).toHaveLength(1);
    expect(result[0].codigo).toBe("P2");
  });
});
