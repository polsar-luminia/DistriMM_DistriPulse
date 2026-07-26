/**
 * Validación de horario de cobranza — Ley 2300 de 2023 (Colombia).
 *
 * Ventanas permitidas (hora America/Bogota, UTC-5, sin DST):
 *   - Lunes a viernes: 07:00 a 19:00
 *   - Sábados:         08:00 a 15:00
 *   - Domingos:        PROHIBIDO
 *
 * Festivos colombianos: ver TODO al final (Fase 2). Por ahora solo se valida
 * día de semana y hora. Solo aplica al canal SMS (decisión de producto).
 */

const COLOMBIA_OFFSET = -5;

/** Devuelve { hora (0-23), dia (0=Dom..6=Sab) } en hora Colombia. */
function ahoraColombia(date = new Date()) {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
  const colombia = new Date(utcMs + COLOMBIA_OFFSET * 3600000);
  return { hora: colombia.getHours(), dia: colombia.getDay() };
}

/**
 * @returns {{ permitido: boolean, motivo: string|null, hora: number, dia: number }}
 */
function dentroDeHorarioCobranza(date = new Date()) {
  const { hora, dia } = ahoraColombia(date);

  if (dia === 0) {
    return { permitido: false, motivo: "Domingo: cobranza no permitida (Ley 2300)", hora, dia };
  }
  if (dia === 6) {
    const ok = hora >= 8 && hora < 15;
    return {
      permitido: ok,
      motivo: ok ? null : "Sabado: solo 08:00-15:00 (Ley 2300)",
      hora,
      dia,
    };
  }
  // Lunes a viernes
  const ok = hora >= 7 && hora < 19;
  return {
    permitido: ok,
    motivo: ok ? null : "Lun-Vie: solo 07:00-19:00 (Ley 2300)",
    hora,
    dia,
  };
}

// TODO (Fase 2): incorporar festivos colombianos (Ley Emiliani) para bloquearlos
// igual que los domingos. Requiere una lista anual o la librería date-holidays.

module.exports = { dentroDeHorarioCobranza, ahoraColombia };
