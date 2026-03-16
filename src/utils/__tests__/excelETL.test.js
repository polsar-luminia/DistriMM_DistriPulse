import { describe, test, expect } from "vitest";
import { parseFlexibleDate, detectFileType, UPLOAD_TYPES } from "../excelETL";

describe("parseFlexibleDate", () => {
  test("returns null for null/undefined/empty", () => {
    expect(parseFlexibleDate(null)).toBeNull();
    expect(parseFlexibleDate(undefined)).toBeNull();
    expect(parseFlexibleDate("")).toBeNull();
  });

  test("parses Excel serial number correctly (modern date)", () => {
    // Excel serial 45292 = 2024-01-01
    const result = parseFlexibleDate(45292);
    expect(result).not.toBeNull();
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(1);
  });

  test("parses Excel serial number for a known date (2023-06-15)", () => {
    // Excel serial 45092 = 2023-06-15
    const result = parseFlexibleDate(45092);
    expect(result).not.toBeNull();
    expect(result.getFullYear()).toBe(2023);
    expect(result.getMonth()).toBe(5); // June
    expect(result.getDate()).toBe(15);
  });

  test("parses dd/MM/yyyy (Colombian standard)", () => {
    const result = parseFlexibleDate("15/06/2023");
    expect(result).not.toBeNull();
    expect(result.getFullYear()).toBe(2023);
    expect(result.getMonth()).toBe(5); // June
    expect(result.getDate()).toBe(15);
  });

  test("parses d/M/yyyy (single digits)", () => {
    const result = parseFlexibleDate("5/3/2023");
    expect(result).not.toBeNull();
    expect(result.getFullYear()).toBe(2023);
  });

  test("parses yyyy-MM-dd (ISO)", () => {
    const result = parseFlexibleDate("2023-06-15");
    expect(result).not.toBeNull();
    expect(result.getFullYear()).toBe(2023);
    expect(result.getMonth()).toBe(5);
    expect(result.getDate()).toBe(15);
  });

  test("returns null for unparseable string", () => {
    expect(parseFlexibleDate("not-a-date")).toBeNull();
    expect(parseFlexibleDate("hello world")).toBeNull();
  });

  test("rejects dates outside 2000-2100 range", () => {
    expect(parseFlexibleDate("15/06/1899")).toBeNull();
    expect(parseFlexibleDate("15/06/2101")).toBeNull();
  });

  test("trims whitespace from string input", () => {
    const result = parseFlexibleDate("  15/06/2023  ");
    expect(result).not.toBeNull();
    expect(result.getFullYear()).toBe(2023);
  });
});

describe("detectFileType", () => {
  test("detects cartera file by column headers", () => {
    const headers = ["Nombre Tercero", "Documento", "Valor Saldo", "Días Mora", "Fecha Vence"];
    expect(detectFileType(headers)).toBe(UPLOAD_TYPES.CARTERA);
  });

  test("detects clientes file by column headers", () => {
    const headers = ["Primer Nombre", "Primer Apellido", "No Identif", "Tipo Ident", "Genero"];
    expect(detectFileType(headers)).toBe(UPLOAD_TYPES.CLIENTES);
  });

  test("returns null for unrecognized headers", () => {
    const headers = ["Random", "Column", "Names"];
    expect(detectFileType(headers)).toBeNull();
  });

  test("handles null/undefined in headers array", () => {
    const headers = [null, undefined, "Nombre Tercero", "Valor Saldo"];
    // Should not throw
    const result = detectFileType(headers);
    expect(result).toBeDefined();
  });
});
