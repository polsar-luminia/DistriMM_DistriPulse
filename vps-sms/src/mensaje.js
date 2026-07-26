/**
 * Construccion del texto SMS de cobranza (tono cercano).
 *
 * Requisitos:
 *  - Identificacion clara del remitente (el shortcode de LabsMobile es generico).
 *  - Cobranza (transaccional, no comercial) -> sin promos.
 *  - Incluye numero de WhatsApp porque el shortcode no admite respuesta.
 *  - GSM-7 sin tildes/enie (sanitizarGsm) para no saltar a UCS-2.
 */

const SENDER = "Almacen Agropecuario DistriMM";
const CONTACTO = "3223806883"; // numero de WhatsApp al que el cliente debe escribir

// Regex construidos desde strings ASCII (doble backslash) para no depender de
// caracteres no imprimibles en el fuente.
const RE_COMBINING = new RegExp("[\\u0300-\\u036f]", "g"); // tildes tras NFD (enie -> n)
const RE_NBSP = new RegExp(
  "[\\u00a0\\u1680\\u2000-\\u200b\\u202f\\u205f\\u3000\\ufeff]",
  "g",
); // espacios no separables (los mete Intl COP)
const RE_SQUOTE = new RegExp("[\\u2018\\u2019]", "g");
const RE_DQUOTE = new RegExp("[\\u201c\\u201d]", "g");

/**
 * Normaliza a alfabeto GSM-7: quita tildes/enie y espacios raros. Un solo
 * caracter Unicode forzaria todo el mensaje a UCS-2 (70 chars/segmento).
 * Nota: el caracter '@' es valido en GSM-7, asi que "querid@" se conserva.
 */
function sanitizarGsm(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(RE_COMBINING, "")
    .replace(RE_NBSP, " ")
    .replace(RE_SQUOTE, "'")
    .replace(RE_DQUOTE, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {object} p
 * @param {string} p.tipo   - 'cobro' => saldo por vencer; cualquier otro => saldo pendiente.
 * @param {string} p.nombre - nombre del cliente.
 * @returns {string} texto SMS listo para enviar (GSM-7).
 */
function construirMensaje({ tipo, nombre }) {
  const nombreLimpio = sanitizarGsm(nombre) || "cliente";
  const recordatorio =
    tipo === "cobro"
      ? "tienes un saldo proximo a vencer"
      : "tienes un saldo pendiente";

  const cuerpo =
    `Hola, querid@ ${nombreLimpio}. ${SENDER} te recuerda que ${recordatorio}. ` +
    `Escribenos al WhatsApp ${CONTACTO} y aprovecha para ponerte al dia. ` +
    `Para nosotros es valioso contar con tu apoyo.`;

  return sanitizarGsm(cuerpo);
}

module.exports = { construirMensaje, sanitizarGsm };
