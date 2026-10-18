import type {EngravingDefinition} from './engravings.ts';

// Remake balance limits apply per generic ability engraving, including equipped copies.
// HP gains are larger numerically; Speed receives extra weight for turn order.
// These are authored access rules, not historical Countermark ownership values.
const STAT_WEIGHTS = {hp: .8, atk: 1, def: 1, spa: 1, spd: 1, spe: 2};
/** [minimum weighted gain, copies one may own], strictest first; smaller gains allow DEFAULT_MAX_OWNED. */
const OWNERSHIP_TIERS: readonly (readonly [minGain: number, maxOwned: number])[] = [[35, 1], [30, 2], [25, 3], [20, 4]];
const DEFAULT_MAX_OWNED = 6;

/** Species-bound and skill engravings are unlimited (equipping uses no stock); generic ability engravings are capped by weighted gain. */
export function engravingAccess(def: EngravingDefinition): {unlimited: boolean; maxOwned: number} {
  if (def.slot !== 'ability' || def.species.length) return {unlimited: true, maxOwned: def.maxOwned};
  const gain = Object.entries(def.stats).reduce((sum, [key, value]) => sum + (value ?? 0) * STAT_WEIGHTS[key as keyof typeof STAT_WEIGHTS], 0);
  return {unlimited: false, maxOwned: OWNERSHIP_TIERS.find(([minGain]) => gain >= minGain)?.[1] ?? DEFAULT_MAX_OWNED};
}
