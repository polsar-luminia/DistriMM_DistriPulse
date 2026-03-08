/**
 * Circular gauge visualization for the portfolio health score.
 * Renders an SVG ring with a color gradient based on the score value (0-100).
 * @module components/cfo/HealthScoreRing
 */

import { COLORS } from "../../utils/constants";
import { getSemaphore } from "./cfoUtils";

const RING_RADIUS = 54;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * @param {{ score: number, semaforo: string }} props
 */
export default function HealthScoreRing({ score, semaforo }) {
  const sem = getSemaphore(semaforo);
  const offset = RING_CIRCUMFERENCE - (score / 100) * RING_CIRCUMFERENCE;

  const strokeColor =
    score >= 80
      ? COLORS.CHART.PRIMARY
      : score >= 60
        ? "#3B82F6"
        : score >= 40
          ? COLORS.CHART.WARNING
          : score >= 20
            ? COLORS.CHART.DANGER
            : "#991B1B";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-36 h-36">
        <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={RING_RADIUS} stroke="#E2E8F0" strokeWidth="10" fill="none" />
          <circle cx="60" cy="60" r={RING_RADIUS} stroke={strokeColor} strokeWidth="10" fill="none"
            strokeLinecap="round" strokeDasharray={RING_CIRCUMFERENCE} strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black text-slate-900">{score}</span>
          <span className="text-xs font-bold text-slate-400">/100</span>
        </div>
      </div>
      <span className={`px-3 py-1 rounded-full text-xs font-bold ${sem.badge}`}>
        {sem.label}
      </span>
    </div>
  );
}
