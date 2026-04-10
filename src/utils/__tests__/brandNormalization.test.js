import { describe, test, expect } from "vitest";
import { normalizeBrand, getNormalizedMarcasList } from "../brandNormalization";

describe("normalizeBrand", () => {
  // Null / undefined / empty
  test("retorna 'SIN MARCA' cuando recibe null", () => {
    expect(normalizeBrand(null)).toBe("SIN MARCA");
  });

  test("retorna 'SIN MARCA' cuando recibe undefined", () => {
    expect(normalizeBrand(undefined)).toBe("SIN MARCA");
  });

  test("retorna 'SIN MARCA' cuando recibe string vacío", () => {
    expect(normalizeBrand("")).toBe("SIN MARCA");
  });

  test("retorna 'SIN MARCA' cuando recibe solo espacios", () => {
    expect(normalizeBrand("   ")).toBe("SIN MARCA");
  });

  // CONTEGRAL agrupación
  test("agrupa 'CONTEGRAL AVES' bajo 'CONTEGRAL'", () => {
    expect(normalizeBrand("CONTEGRAL AVES")).toBe("CONTEGRAL");
  });

  test("agrupa 'CONTEGRAL GANADO' bajo 'CONTEGRAL'", () => {
    expect(normalizeBrand("CONTEGRAL GANADO")).toBe("CONTEGRAL");
  });

  // TECNOQUIMICAS
  test("normaliza 'TECNOQUIMICAS S.A.' a 'TECNOQUIMICAS'", () => {
    expect(normalizeBrand("TECNOQUIMICAS S.A.")).toBe("TECNOQUIMICAS");
  });

  test("normaliza 'TECNOQUIMICAS' con tilde a 'TECNOQUIMICAS'", () => {
    expect(normalizeBrand("TECNOQUÍMICAS")).toBe("TECNOQUIMICAS");
  });

  // GOLDEN & PREMIER
  test("agrupa 'PREMIER PET FOOD' bajo 'GOLDEN & PREMIER'", () => {
    expect(normalizeBrand("PREMIER PET FOOD")).toBe("GOLDEN & PREMIER");
  });

  test("agrupa 'GOLDEN NUTRITION' bajo 'GOLDEN & PREMIER'", () => {
    expect(normalizeBrand("GOLDEN NUTRITION")).toBe("GOLDEN & PREMIER");
  });

  // BOHERINGER GANADERIA
  test("normaliza 'BOEHRINGER INGELHEIM' a 'BOHERINGER GANADERIA'", () => {
    expect(normalizeBrand("BOEHRINGER INGELHEIM")).toBe("BOHERINGER GANADERIA");
  });

  // BONHOERFFER
  test("normaliza 'BONHOEFFER' a 'BONHOERFFER'", () => {
    expect(normalizeBrand("BONHOEFFER")).toBe("BONHOERFFER");
  });

  // VICAR
  test("normaliza 'VICAR FARMACEUTICA' a 'VICAR'", () => {
    expect(normalizeBrand("VICAR FARMACEUTICA")).toBe("VICAR");
  });

  // DIABONOS
  test("normaliza 'DIABONOS COLOMBIA' a 'DIABONOS'", () => {
    expect(normalizeBrand("DIABONOS COLOMBIA")).toBe("DIABONOS");
  });

  // EDO exact match
  test("retorna 'EDO' para match exacto 'EDO'", () => {
    expect(normalizeBrand("EDO")).toBe("EDO");
  });

  test("NO agrupa 'EDUARDO' bajo 'EDO' (requiere match exacto o prefijo 'EDO ')", () => {
    expect(normalizeBrand("EDUARDO")).toBe("EDUARDO");
  });

  // Desconocida pasa tal cual en mayusculas
  test("retorna marca desconocida en mayusculas", () => {
    expect(normalizeBrand("MARCA NUEVA DESCONOCIDA")).toBe("MARCA NUEVA DESCONOCIDA");
  });

  test("convierte minusculas a mayusculas para marcas sin regla", () => {
    expect(normalizeBrand("marca minusculas")).toBe("MARCA MINUSCULAS");
  });

  // Orden de reglas: CONTEGRAL matchea primero
  test("orden de reglas: CONTEGRAL matchea antes que otras reglas", () => {
    // Si hipotéticamente hubiera otra regla con "CONTEGRAL", la primera gana
    expect(normalizeBrand("CONTEGRAL")).toBe("CONTEGRAL");
    expect(normalizeBrand("CONTEGRAL ESPECIAL")).toBe("CONTEGRAL");
  });
});

describe("getNormalizedMarcasList", () => {
  test("deduplica marcas que normalizan al mismo nombre", () => {
    const input = ["CONTEGRAL AVES", "CONTEGRAL GANADO", "PREMIER"];
    const result = getNormalizedMarcasList(input);
    expect(result).toEqual(["CONTEGRAL", "GOLDEN & PREMIER"]);
  });

  test("retorna marcas ordenadas alfabeticamente", () => {
    const input = ["VICAR S.A.", "ADAMA ANDINA", "CONTEGRAL"];
    const result = getNormalizedMarcasList(input);
    expect(result).toEqual(["ADAMA", "CONTEGRAL", "VICAR"]);
  });

  test("retorna array vacio cuando recibe null", () => {
    expect(getNormalizedMarcasList(null)).toEqual([]);
  });

  test("retorna array vacio cuando recibe array vacio", () => {
    expect(getNormalizedMarcasList([])).toEqual([]);
  });

  test("incluye marcas conocidas y desconocidas", () => {
    const input = ["CONTEGRAL AVES", "ALGO NUEVO", "EDO"];
    const result = getNormalizedMarcasList(input);
    expect(result).toEqual(["ALGO NUEVO", "CONTEGRAL", "EDO"]);
  });
});
