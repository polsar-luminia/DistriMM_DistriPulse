import { describe, test, expect } from "vitest";
import { parsePresupuestosExcel } from "../presupuestosParser";

// Minimal XLSX mock — only needs encode_cell, decode_range, and the workbook structure
const XLSX = {
  utils: {
    encode_cell: ({ r, c }) => {
      const col = String.fromCharCode(65 + c); // A, B, C, ...
      return `${col}${r + 1}`;
    },
    decode_range: (ref) => {
      // Parse "A1:N20" style ranges
      const match = ref.match(/([A-Z]+)(\d+):([A-Z]+)(\d+)/);
      if (!match) return { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
      return {
        s: { r: Number(match[2]) - 1, c: match[1].charCodeAt(0) - 65 },
        e: { r: Number(match[4]) - 1, c: match[3].charCodeAt(0) - 65 },
      };
    },
  },
};

/** Builds a mock workbook with cells defined as { "A1": value, "B2": value } */
function makeWorkbook(cells, ref = "A1:N20") {
  const ws = { "!ref": ref };
  for (const [addr, value] of Object.entries(cells)) {
    ws[addr] = { v: value };
  }
  return { Sheets: { Hoja1: ws }, SheetNames: ["Hoja1"] };
}

const vendorMap = {
  "JUAN PEREZ": "V01",
  "MARIA GARCIA": "V02",
};

describe("parsePresupuestosExcel", () => {
  test("lanza error si la hoja no existe", () => {
    const wb = { Sheets: {}, SheetNames: [] };
    expect(() => parsePresupuestosExcel(wb, vendorMap, XLSX)).toThrow(
      "No se encontró la hoja de datos",
    );
  });

  test("lanza error si no detecta vendedores", () => {
    const wb = makeWorkbook({ A1: "RANDOM", B1: "DATA" });
    expect(() => parsePresupuestosExcel(wb, vendorMap, XLSX)).toThrow(
      "No se detectaron secciones de vendedores",
    );
  });

  test("detecta vendedor con marcas básico", () => {
    const wb = makeWorkbook({
      A1: "JUAN PEREZ",
      B1: "MARCAS",
      // Marca row 1
      B2: "COLGATE",
      C2: 2, // 2% → 0.02
      F2: 5000000, // meta mes
      // Marca row 2
      B3: "PALMOLIVE",
      C3: 0.5, // 0.5% → 0.005
      F3: 3000000,
    });

    const result = parsePresupuestosExcel(wb, vendorMap, XLSX);

    expect(result.vendors).toHaveLength(1);
    expect(result.vendors[0].nombre).toBe("JUAN PEREZ");
    expect(result.vendors[0].codigo).toBe("V01");
    expect(result.vendors[0].marcas).toHaveLength(2);

    // pctRaw=2 >= 0.1 → 2/100 = 0.02
    expect(result.vendors[0].marcas[0].marca).toBe("COLGATE");
    expect(result.vendors[0].marcas[0].pct_comision).toBe(0.02);
    expect(result.vendors[0].marcas[0].meta_ventas).toBe(5000000);

    // pctRaw=0.5 >= 0.1 → 0.5/100 = 0.005
    expect(result.vendors[0].marcas[1].marca).toBe("PALMOLIVE");
    expect(result.vendors[0].marcas[1].pct_comision).toBe(0.005);
  });

  test("normaliza porcentaje: <0.1 se mantiene como decimal", () => {
    const wb = makeWorkbook({
      A1: "JUAN PEREZ",
      B1: "MARCAS",
      B2: "MARCA1",
      C2: 0.02, // ya es decimal → se mantiene
      F2: 1000000,
    });

    const result = parsePresupuestosExcel(wb, vendorMap, XLSX);
    expect(result.vendors[0].marcas[0].pct_comision).toBe(0.02);
  });

  test("genera warning para vendedor no encontrado en mapa (con otro válido)", () => {
    const wb = makeWorkbook(
      {
        A1: "DESCONOCIDO",
        B1: "MARCAS",
        B2: "MARCA1",
        C2: 1,
        F2: 100000,
        // Un vendedor válido para que no lance error
        A5: "JUAN PEREZ",
        B5: "MARCAS",
        B6: "COLGATE",
        C6: 2,
        F6: 5000000,
      },
      "A1:N10",
    );

    const result = parsePresupuestosExcel(wb, vendorMap, XLSX);
    expect(result.vendors).toHaveLength(1); // solo el válido
    expect(result.warnings).toContainEqual(
      expect.stringContaining("DESCONOCIDO"),
    );
  });

  test("lanza error si todos los vendedores son desconocidos", () => {
    const wb = makeWorkbook({
      A1: "DESCONOCIDO",
      B1: "MARCAS",
      B2: "MARCA1",
      C2: 1,
      F2: 100000,
    });

    expect(() => parsePresupuestosExcel(wb, vendorMap, XLSX)).toThrow(
      "No se detectaron secciones de vendedores",
    );
  });

  test("genera warning para vendedor sin marcas (con otro válido)", () => {
    const wb = makeWorkbook(
      {
        A1: "JUAN PEREZ",
        B1: "MARCAS",
        // No brand rows below for JUAN
        // Otro vendedor válido con marcas
        A5: "MARIA GARCIA",
        B5: "MARCAS",
        B6: "PALMOLIVE",
        C6: 1,
        F6: 3000000,
      },
      "A1:N10",
    );

    const result = parsePresupuestosExcel(wb, vendorMap, XLSX);
    expect(result.vendors).toHaveLength(1); // solo MARIA
    expect(result.warnings).toContainEqual(
      expect.stringContaining("no tiene marcas"),
    );
  });

  test("detecta recaudo tiers con meta >= 100M y porcentajes < 0.1", () => {
    const wb = makeWorkbook(
      {
        // Vendor section
        A1: "JUAN PEREZ",
        B1: "MARCAS",
        B2: "COLGATE",
        C2: 2,
        F2: 5000000,
        // Recaudo section in cols K-N
        K5: "JUAN PEREZ",
        // Row 6: meta values (one >= 100M)
        K6: 120000000,
        L6: 135000000,
        M6: 150000000,
        N6: 210000000,
        // Row 7: percentages (all < 0.1)
        K7: 0.005,
        L7: 0.009,
        M7: 0.012,
        N7: 0.015,
      },
      "A1:N10",
    );

    const result = parsePresupuestosExcel(wb, vendorMap, XLSX);

    expect(result.vendors[0].recaudo).not.toBeNull();
    expect(result.vendors[0].recaudo.meta_recaudo).toBe(120000000);
    expect(result.vendors[0].recaudo.tramo1_pct).toBe(0.005);
    expect(result.vendors[0].recaudo.tramo2_pct).toBe(0.009);
    expect(result.vendors[0].recaudo.tramo3_pct).toBe(0.012);
    expect(result.vendors[0].recaudo.tramo4_pct).toBe(0.015);
    expect(result.vendors[0].recaudo.tramo1_min).toBe(0);
    expect(result.vendors[0].recaudo.tramo1_max).toBe(89.99);
    expect(result.vendors[0].recaudo.tramo4_min).toBe(140);
  });

  test("genera warning si vendedor no tiene recaudo", () => {
    const wb = makeWorkbook({
      A1: "JUAN PEREZ",
      B1: "MARCAS",
      B2: "COLGATE",
      C2: 2,
      F2: 5000000,
      // No recaudo section
    });

    const result = parsePresupuestosExcel(wb, vendorMap, XLSX);
    expect(result.vendors[0].recaudo).toBeNull();
    expect(result.warnings).toContainEqual(
      expect.stringContaining("No se detectó escala de recaudo"),
    );
  });

  test("múltiples vendedores en un mismo workbook", () => {
    const wb = makeWorkbook(
      {
        // Vendor 1
        A1: "JUAN PEREZ",
        B1: "MARCAS",
        B2: "COLGATE",
        C2: 2,
        F2: 5000000,
        // Vendor 2
        A5: "MARIA GARCIA",
        B5: "MARCAS",
        B6: "PALMOLIVE",
        C6: 1.5,
        F6: 3000000,
      },
      "A1:N10",
    );

    const result = parsePresupuestosExcel(wb, vendorMap, XLSX);
    expect(result.vendors).toHaveLength(2);
    expect(result.vendors[0].codigo).toBe("V01");
    expect(result.vendors[1].codigo).toBe("V02");
  });

  test("acepta MARCA como label además de MARCAS", () => {
    const wb = makeWorkbook({
      A1: "JUAN PEREZ",
      B1: "MARCA", // singular
      B2: "COLGATE",
      C2: 2,
      F2: 5000000,
    });

    const result = parsePresupuestosExcel(wb, vendorMap, XLSX);
    expect(result.vendors).toHaveLength(1);
  });
});
