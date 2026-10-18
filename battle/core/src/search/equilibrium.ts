// The simultaneous-move matrix game (design note 5.4).
import type { Rng } from '../rng.ts';

const SOLVER_ITERATIONS = 4000;
/** Equilibrium weights below this are sampling noise and are dropped. */
const TRIM = 0.05;
/** An action this dominant is played outright, without a draw. */
const PURE = 0.95;

/** Regret matching+ with linear averaging: the row player's maximin mixed strategy. */
export function solveZeroSum(m: number[][]): { strategy: number[]; value: number } {
  const rows = m.length, cols = m[0]?.length ?? 0;
  if (!rows || !cols) return { strategy: rows ? [1, ...Array(rows - 1).fill(0)] : [], value: 0 };
  const rr = Array(rows).fill(0), rc = Array(cols).fill(0), sum = Array(rows).fill(0);
  const norm = (r: number[]) => { const t = r.reduce((a, v) => a + v, 0); return t > 0 ? r.map(v => v / t) : r.map(() => 1 / r.length); };
  for (let it = 1; it <= SOLVER_ITERATIONS; it++) {
    const x = norm(rr), y = norm(rc);
    const ux = m.map(row => row.reduce((a, v, j) => a + v * y[j], 0));
    const uy = Array.from({ length: cols }, (_, j) => m.reduce((a, row, i) => a + row[j] * x[i], 0));
    const v = ux.reduce((a, u, i) => a + u * x[i], 0);
    for (let i = 0; i < rows; i++) rr[i] = Math.max(0, rr[i] + ux[i] - v);
    for (let j = 0; j < cols; j++) rc[j] = Math.max(0, rc[j] + v - uy[j]);
    for (let i = 0; i < rows; i++) sum[i] += it * x[i];
  }
  const strategy = norm(sum);
  const value = Math.min(...Array.from({ length: cols }, (_, j) => m.reduce((a, row, i) => a + row[j] * strategy[i], 0)));
  return { strategy, value };
}

/** The trimmed mix and the drawn row. A draw takes one value from `rng`, the live RNG, so replays stay deterministic. */
export function drawAction(strategy: number[], rng: Rng): { mix: number[]; index: number } {
  const kept = strategy.map(p => p >= TRIM ? p : 0);
  const total = kept.reduce((a, p) => a + p, 0);
  const mix = total > 0 ? kept.map(p => p / total) : strategy;
  let index = mix.indexOf(Math.max(...mix));
  if (mix[index] < PURE) {
    let r = rng.next();
    for (let i = 0; i < mix.length; i++) { r -= mix[i]; if (r < 0) { index = i; break; } }
  }
  return { mix, index };
}
