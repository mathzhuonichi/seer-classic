/** Per-monster state of the later-era mechanics that the game implements. */
export interface MonsterModules {
  engravings: string[];
  /** Spent bonus resources that cannot fit in the nonnegative base HP/PP save fields. */
  engravingDeficit?: { hp: number; pp: Record<string,number> };
}

export { engravings } from './engravings';
export type { EngravingDefinition } from './engravings';
export { traits } from './traits';
export type { TraitDefinition } from './traits';
