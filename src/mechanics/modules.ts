/** Optional later-era mechanics retain explicit data interfaces without invented content. */
export interface FifthSkillDefinition { id: number; species: number[]; skill: number; unlockQuest: string; source: string }
export interface SoulMarkDefinition { id: string; name: {zh: string}; species: number[]; hooks: Record<string, unknown>[]; source: string }
export interface EngravingDefinition { id: string; name: {zh: string}; stats: Partial<Record<'hp'|'atk'|'def'|'spa'|'spd'|'spe', number>>; slot: 'ability'|'skill'|'universal'; source: string }
export interface MonsterModules { fifthSkill?: number; soulMark?: string; engravings: string[] }
export const fifthSkills: FifthSkillDefinition[] = [];
export const soulMarks: SoulMarkDefinition[] = [];
export const engravings: EngravingDefinition[] = [];

export { traits } from './traits';
export type { TraitDefinition } from './traits';
