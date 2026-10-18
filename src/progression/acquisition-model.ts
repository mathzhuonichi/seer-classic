/** The acquisition data model shared by the route index, initial forms and recruitment. */

/** The user's collection scope excludes both complete NPC-partner families. */
export const NPC_ONLY_SPECIES: ReadonlySet<number> = new Set([122, 123, 124, 125]);
/** Lv.5 partners given when a new journey starts. */
export const STARTER_SPECIES: readonly number[] = [1, 4, 7];
/** The captain's journey quests and the species each one grants. */
export const JOURNEY_QUEST_SPECIES = { 'first-victory': 10, 'three-victories': 13, 'first-spt': 6 } as const;

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
  /** One of these reachable forms must be active when attempting this capture. */
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
