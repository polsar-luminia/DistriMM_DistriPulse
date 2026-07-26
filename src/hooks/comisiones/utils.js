import { normalizeBrand } from "../../utils/brandNormalization";
import { RECAUDO_THRESHOLDS } from "../../constants/thresholds";

const normalizeCode = (value) => String(value ?? "").trim().toUpperCase();

/**
 * Días de mora máximos para que un recaudo comisione.
 *
 * La fuente es la base —fila `tipo='dias_mora'` de las exclusiones, editable
 * desde la pantalla de Exclusiones—, no `thresholds.js`. Se lee del arreglo que
 * ya trae `getExclusiones()`; no hace falta una consulta aparte.
 *
 * El respaldo solo entra si la fila no está o trae basura, y es deliberadamente
 * el mismo 72 histórico: ante un fallo de lectura conviene liquidar como
 * siempre, no dejar de excluir a nadie (que sería sobrepagar).
 */
export function leerDiasMoraLimite(exclusiones) {
  const fila = (exclusiones || []).find(
    (e) => e.tipo === "dias_mora" && e.activa !== false,
  );
  const n = Number(fila?.valor);
  return Number.isInteger(n) && n > 0
    ? n
    : RECAUDO_THRESHOLDS.DIAS_MORA_LIMITE;
}

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
