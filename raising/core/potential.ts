import type { Text } from "./types.ts";

// 潜力: the display tier for 个体值. The tier boundaries and wording are a remake choice
// (see SPEC.md 3.2); they live in data/potential.json so they can change without code.
export interface PotentialTier { min: number; max: number; id: string; name: Text }

export const DEFAULT_POTENTIAL_TIERS: PotentialTier[] = [
  { min: 0, max: 5, id: "ordinary", name: { zh: "普通", en: "Ordinary" } },
  { min: 6, max: 12, id: "decent", name: { zh: "一般", en: "Decent" } },
  { min: 13, max: 19, id: "good", name: { zh: "良好", en: "Good" } },
  { min: 20, max: 25, id: "excellent", name: { zh: "优秀", en: "Excellent" } },
  { min: 26, max: 30, id: "outstanding", name: { zh: "卓越", en: "Outstanding" } },
  { min: 31, max: 31, id: "perfect", name: { zh: "完美", en: "Perfect" } },
];

export function potentialTier(iv: number, tiers: PotentialTier[] = DEFAULT_POTENTIAL_TIERS): PotentialTier {
  const t = tiers.find((x) => iv >= x.min && iv <= x.max);
  if (!t) throw new Error(`no 潜力 tier covers iv ${iv}`);
  return t;
}
