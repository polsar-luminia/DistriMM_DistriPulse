import { normalizeBrand } from "../../utils/brandNormalization";

const normalizeCode = (value) => String(value ?? "").trim().toUpperCase();

export function getExclusionInfo(
  productoCode,
  productExclusionSet,
  brandExclusionSet,
  productBrandMap,
) {
  const code = normalizeCode(productoCode);

  if (productExclusionSet.has(code)) {
    return { excluded: true, reason: `Producto: ${code}` };
  }
  const brand = productBrandMap[code];
  if (brand) {
    const brandLabel = String(brand).trim();
    const brandKey = brandLabel.toUpperCase();
    if (brandExclusionSet.has(brandKey)) {
      return { excluded: true, reason: `Marca: ${brandLabel}` };
    }
    const normalized = normalizeBrand(brandLabel);
    if (brandExclusionSet.has(normalized)) {
      return { excluded: true, reason: `Marca: ${normalized}` };
    }
  }
  return { excluded: false, reason: null };
}

export function buildExclusionLookups(exclusiones, catalogo) {
  const productExclusionSet = new Set();
  const brandExclusionSet = new Set();
  (exclusiones || []).forEach((e) => {
    if (e.tipo === "producto") {
      const code = normalizeCode(e.valor);
      if (code) productExclusionSet.add(code);
    }
    if (e.tipo === "marca") {
      const brandValue = String(e.valor ?? "").trim();
      if (!brandValue) return;
      brandExclusionSet.add(brandValue.toUpperCase());
      brandExclusionSet.add(normalizeBrand(brandValue));
    }
  });
  const productBrandMap = {};
  (catalogo || []).forEach((p) => {
    const code = normalizeCode(p.codigo);
    const brand = String(p.marca ?? "").trim();
    if (code && brand) productBrandMap[code] = brand;
  });
  return { productExclusionSet, brandExclusionSet, productBrandMap };
}
