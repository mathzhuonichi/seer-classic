import type { GrowthId } from "./types.ts";

export const MAX_LEVEL = 100;

// Cumulative EXP curve T(n). Seer's four per-level tables (升级所需经验) are exactly
// T(n+1) - T(n) for these curves; see SPEC.md section 5 for the check against the
// published Seer tables (30301 / 37876 / 33446 / 59996 at level 100).
export function cumulative(growth: GrowthId, n: number): number {
  const n2 = n * n, n3 = n2 * n;
  switch (growth) {
    case "medium": return n3;
    case "slow": return Math.floor((5 * n3) / 4);
    case "medium_slow": return Math.floor((6 * n3 - 75 * n2 + 500 * n - 700) / 5);
    case "fluctuating":
      if (n < 15) return Math.floor((n3 * (n + 73)) / 150);
      if (n < 36) return Math.floor((n3 * (n + 14)) / 50);
      return Math.floor((n3 * (n + 64)) / 100);
  }
}

// EXP needed to go from `level` to `level + 1`. 0 at the level cap.
export function expToNext(growth: GrowthId, level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return cumulative(growth, level + 1) - cumulative(growth, level);
}

// Total EXP from level 1 (0 exp) to the given level and exp-into-level.
export function totalExp(growth: GrowthId, level: number, expIntoLevel = 0): number {
  return cumulative(growth, level) - cumulative(growth, 1) + expIntoLevel;
}
