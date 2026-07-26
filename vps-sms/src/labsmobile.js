/**
 * Cliente de LabsMobile (SMS http/POST API).
 * Auth: Basic base64(usuario:tokenapi). Endpoint: https://api.labsmobile.com/json/send
 * Docs: code "0" => enviado OK; cualquier otro => error (ver tabla de codigos).
 */

const LABS_URL = "https://api.labsmobile.com/json";

function authHeader() {
  const user = process.env.LABSMOBILE_USERNAME;
  const token = process.env.LABSMOBILE_TOKEN;
  if (!user || !token) {
    throw new Error("Faltan LABSMOBILE_USERNAME o LABSMOBILE_TOKEN");
  }
  return "Basic " + Buffer.from(`${user}:${token}`).toString("base64");
}

/**
 * Envia un SMS individual.
 * @param {object} p
 * @param {string} p.msisdn   - numero E.164 sin '+' (ej. 573114568164).
 * @param {string} p.message  - texto GSM-7.
 * @param {string} [p.ackurl] - URL para callbacks de estado (opcional).
 * @param {boolean} [p.test]  - true => modo simulado (no gasta creditos ni envia).
 * @returns {Promise<{ ok: boolean, code: string|null, subid: string|null, error: string|null }>}
 */
async function enviarSMS({ msisdn, message, ackurl, test = false }) {
  const tpoa = process.env.LABSMOBILE_TPOA;
  const body = {
    message,
    recipient: [{ msisdn }],
    ucs2: 0, // GSM-7 (el texto va sin tildes)
  };
  if (tpoa) body.tpoa = tpoa;
  if (ackurl) body.ackurl = ackurl;
  if (test) body.test = 1;

  let res;
  try {
    res = await fetch(`${LABS_URL}/send`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, code: null, subid: null, error: `Red: ${err.message}` };
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    return {
      ok: false,
      code: null,
      subid: null,
      error: `Respuesta no-JSON (HTTP ${res.status})`,
    };
  }

  const code = data.code != null ? String(data.code) : null;
  const ok = res.ok && code === "0";
  return {
    ok,
    code,
    subid: data.subid || null,
    error: ok ? null : data.message || `Error LabsMobile (code ${code})`,
  };
}

/**
 * Consulta el saldo de creditos (verificacion de credenciales).
 * @returns {Promise<{ ok: boolean, credits: number|null, error: string|null }>}
 */
async function consultarSaldo() {
  try {
    const res = await fetch(`${LABS_URL}/balance`, {
      method: "GET",
      headers: { Authorization: authHeader() },
    });
    const data = await res.json();
    if (!res.ok || (data.code != null && String(data.code) !== "0")) {
      return { ok: false, credits: null, error: data.message || `HTTP ${res.status}` };
    }
    return { ok: true, credits: Number(data.credits ?? 0), error: null };
  } catch (err) {
    return { ok: false, credits: null, error: err.message };
  }
}

module.exports = { enviarSMS, consultarSaldo };
