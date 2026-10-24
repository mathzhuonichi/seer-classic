/** The acquisition data model shared by the route index, initial forms and recruitment. */
import type { WildFlee } from '../../../battle/core/src/types.ts';

/** The user's collection scope excludes both complete NPC-partner families. */
export const NPC_ONLY_SPECIES: ReadonlySet<number> = new Set([122, 123, 124, 125]);
/**
 * A captain's journey quest: its name, its task as the player reads it, the goal and what counts toward it (won battles, a
 * capture among them, or clears of the challenge archive's SPT首领), and the species it grants.
 */
export interface JourneyQuest { id: string; name: string; task: string; goal: number; counts: 'wins' | 'spt-clears'; species: number }
/** The captain's journey quests. The dex's quest routes and the quest rows both word them from here. */
export const JOURNEY_QUESTS: readonly JourneyQuest[] = [
  { id: 'first-victory', name: '初次胜利', task: '赢得一次野外遭遇或首领挑战（捕捉成功也算）', goal: 1, counts: 'wins', species: 10 },
  { id: 'three-victories', name: '成长之路', task: '赢得三场战斗（捕捉成功也算）', goal: 3, counts: 'wins', species: 13 },
  { id: 'first-spt', name: 'SPT 挑战者', task: '击败星际挑战档案「SPT首领」中的任意一位首领', goal: 1, counts: 'spt-clears', species: 6 },
];

export interface AcquisitionRoute {
  kind: 'starter' | 'wild' | 'boss' | 'campaign' | 'quest' | 'fusion' | 'breeding' | 'evolution';
  label: string;
  /** The obtainable seed form, including when this route leads to an evolution. */
  entrySpecies: number;
  planetId?: string;
  regionId?: string;
  bossId?: string;
  campaignId?: string;
  questId?: string;
  /** Preserved on every evolution descended from a fusion bead. */
  fusionRecipeId?: string;
  /** Breeding offspring and their evolved forms remain second-generation. */
  breedingRecipeId?: string;
  /** One of these reachable forms must be active when attempting this capture: with any other the monster flees. */
  requiredActiveSpecies?: readonly number[];
  sourceSpecies?: number;
  evolutionChain?: { from: number; to: number; level: number }[];
  authoredReward?: boolean;
}
export type RecruitmentPrerequisite = { kind: 'species'; species: number } | { kind: 'boss'; bossId: string };
/** A route granted directly, or once every prerequisite is reachable. */
export interface AcquisitionSeed { species: number; route: AcquisitionRoute; prerequisites?: readonly RecruitmentPrerequisite[] }
export interface SpeciesAcquisition {
  status: 'available' | 'npc' | 'unimplemented';
  description: string;
  routes: AcquisitionRoute[];
}
export interface AcquisitionFamily {
  id: number;
  name: string;
  memberIds: number[];
  rootSpecies: number[];
  availableSpecies: number[];
  missingSpecies: number[];
  excludedSpecies: number[];
  status: 'complete' | 'partial' | 'missing' | 'npc';
  /** Existing acquisition actions only; grouping never creates an evolution. */
  entryRoutes: AcquisitionRoute[];
}

export interface AcquisitionSpecies {
  id: number; name: { zh: string }; types?: readonly string[]; obtain?: readonly string[]; catch_rate?: number;
  evolves_from?: number | null;
  evolution: readonly { to: number; method: string; level?: number; automatic?: boolean }[];
  /** A wild flee (battle/RULES.md 9.1); `unless_player_active` makes a capture wait for one of those species. */
  wild_flee?: WildFlee;
}
export interface AcquisitionEncounter {
  id: string; name?: { zh: string }; category?: string; team: readonly { species: number }[];
  reward_hatches?: number;
  reward?: { items?: Record<string, number>; monster?: { species: number; level?: number }; learn_skill?: unknown };
}
/** The slice of the game catalog that acquisition and recruitment read. */
export interface AcquisitionCatalog {
  species: readonly AcquisitionSpecies[];
  bosses: readonly AcquisitionEncounter[];
  items?: readonly { id: string; kind?: string; hatches?: number }[];
}
