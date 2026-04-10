import { describe, test, expect } from "vitest";
import {
  getRecaudoTierEntries,
  validateRecaudoTiers,
} from "../recaudoTierValidation";

describe("getRecaudoTierEntries", () => {
  test("convierte valores del row a numeros nullable", () => {
    const tiers = getRecaudoTierEntries({
      tramo1_min: "0",
      tramo1_max: "89.99",
      tramo1_pct: "0.01",
    });

    expect(tiers[0]).toMatchObject({
      min: 0,
      max: 89.99,
      pct: 0.01,
      configured: true,
    });
  });
});

describe("validateRecaudoTiers", () => {
  test("row vacio es valido", () => {
    expect(validateRecaudoTiers({}).isValid).toBe(true);
  });

  test("un solo tramo configurado es valido", () => {
    const result = validateRecaudoTiers({
      tramo1_min: 0,
      tramo1_max: 89.99,
      tramo1_pct: 0.01,
    });

    expect(result.isValid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test("acepta continuidad con tolerancia de 0.01", () => {
    const result = validateRecaudoTiers({
      tramo1_min: 0,
      tramo1_max: 89.99,
      tramo1_pct: 0.01,
      tramo2_min: 90,
      tramo2_max: 99.99,
      tramo2_pct: 0.02,
    });

    expect(result.isValid).toBe(true);
  });

  test("detecta gap entre tramos", () => {
    const result = validateRecaudoTiers({
      tramo1_min: 0,
      tramo1_max: 50,
      tramo1_pct: 0.01,
      tramo2_min: 60,
      tramo2_max: 100,
      tramo2_pct: 0.02,
    });

    expect(result.isValid).toBe(false);
    expect(result.issues[0].code).toContain("gap");
    expect(result.fieldErrors.tramo1_max).toBeDefined();
    expect(result.fieldErrors.tramo2_min).toBeDefined();
  });

  test("detecta overlap entre tramos", () => {
    const result = validateRecaudoTiers({
      tramo1_min: 0,
      tramo1_max: 70,
      tramo1_pct: 0.01,
      tramo2_min: 69,
      tramo2_max: 100,
      tramo2_pct: 0.02,
    });

    expect(result.isValid).toBe(false);
    expect(result.issues[0].code).toContain("overlap");
  });

  test("bloquea tramos superiores si falta un tramo anterior", () => {
    const result = validateRecaudoTiers({
      tramo2_min: 90,
      tramo2_max: 100,
      tramo2_pct: 0.02,
    });

    expect(result.isValid).toBe(false);
    expect(result.issues[0].code).toContain("required-before-higher-tier");
  });

  test("bloquea porcentaje negativo", () => {
    const result = validateRecaudoTiers({
      tramo1_min: 0,
      tramo1_max: 89.99,
      tramo1_pct: -0.01,
    });

    expect(result.isValid).toBe(false);
    expect(result.issues[0].code).toContain("pct-negative");
  });
});
