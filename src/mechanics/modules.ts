/** Per-monster state of the later-era mechanics that the game implements. */
export interface MonsterModules {
  engravings: string[];
  /** Spent bonus resources that cannot fit in the nonnegative base HP/PP save fields. */
  engravingDeficit?: { hp: number; pp: Record<string,number> };
}

// Re-exports kept only for src/game.ts; import them from their modules instead.
export { engravings } from './engravings.ts';
export { traits } from './traits.ts';
