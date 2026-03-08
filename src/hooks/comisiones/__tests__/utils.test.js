import { describe, expect, test } from "vitest";
import { buildExclusionLookups, getExclusionInfo } from "../utils";

describe("comisiones exclusion utils", () => {
  test("excluye producto aunque el codigo venga con distinto tipo/formato", () => {
    const exclusiones = [{ tipo: "producto", valor: "  p001 " }];
    const { productExclusionSet, brandExclusionSet, productBrandMap } =
      buildExclusionLookups(exclusiones, []);

    const info = getExclusionInfo(
      "P001",
      productExclusionSet,
      brandExclusionSet,
      productBrandMap,
    );

    expect(info.excluded).toBe(true);
    expect(info.reason).toContain("Producto");
  });

  test("excluye marca aunque la exclusion venga en minusculas y la marca de catalogo en variante", () => {
    const exclusiones = [{ tipo: "marca", valor: "contegral" }];
    const catalogo = [{ codigo: "A1", marca: "CONTEGRAL AVES" }];
    const { productExclusionSet, brandExclusionSet, productBrandMap } =
      buildExclusionLookups(exclusiones, catalogo);

    const info = getExclusionInfo(
      "a1",
      productExclusionSet,
      brandExclusionSet,
      productBrandMap,
    );

    expect(info.excluded).toBe(true);
    expect(info.reason).toContain("Marca");
  });

  test("no excluye cuando no hay regla que coincida", () => {
    const exclusiones = [{ tipo: "marca", valor: "VICAR" }];
    const catalogo = [{ codigo: "A1", marca: "CONTEGRAL AVES" }];
    const { productExclusionSet, brandExclusionSet, productBrandMap } =
      buildExclusionLookups(exclusiones, catalogo);

    const info = getExclusionInfo(
      "A1",
      productExclusionSet,
      brandExclusionSet,
      productBrandMap,
    );

    expect(info.excluded).toBe(false);
    expect(info.reason).toBeNull();
  });
});

