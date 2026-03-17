/**
 * Extrae el periodo operativo {year, month} de una fecha_corte.
 * Regla: el mes con datos más recientes es el periodo activo.
 * Fallback: mes actual del sistema (solo si no hay cargas).
 * @param {string|null} fechaCorte - Fecha ISO (e.g. "2026-03-16")
 * @returns {{ year: number, month: number }}
 */
export function getPeriodoOperativo(fechaCorte) {
  if (fechaCorte) {
    const d = new Date(`${fechaCorte}T12:00:00`);
    if (!isNaN(d.getTime())) {
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    }
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/**
 * Calcula el periodo anterior dado un {year, month}.
 * @param {{ year: number, month: number }} periodo
 * @returns {{ year: number, month: number }}
 */
export function getPeriodoAnterior({ year, month }) {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}
