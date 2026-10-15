/** Optional later-era mechanics retain explicit data interfaces without invented content. */
export interface FifthSkillDefinition { id: number; species: number[]; skill: number; unlockQuest: string; source: string }
export interface SoulMarkDefinition { id: string; name: {zh: string}; species: number[]; hooks: Record<string, unknown>[]; source: string }
export interface MonsterModules { fifthSkill?: number; soulMark?: string; engravings: string[] }
export const fifthSkills: FifthSkillDefinition[] = [];
export const soulMarks: SoulMarkDefinition[] = [];

export { engravings } from './engravings';
export type { EngravingDefinition } from './engravings';
export { traits } from './traits';
export type { TraitDefinition } from './traits';
