/** Per-monster state of the later-era mechanics that the game implements. */
export interface MonsterModules {
  engravings: string[];
  /** Spent bonus resources that cannot fit in the nonnegative base HP/PP save fields. */
  engravingDeficit?: { hp: number; pp: Record<string,number> };
}

export { engravings } from './engravings.ts';
export type { EngravingDefinition } from './engravings.ts';
export { traits } from './traits.ts';
export type { TraitDefinition } from './traits.ts';
