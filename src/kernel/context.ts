// Everything a controller derives once from its catalog and dependencies. Read-only after creation.
import { Battle, buildDataSet, type BattleOptions, type BossEncounter, type DataSet, type RawData } from '../../battle/core/src/index.ts';
import { AI_POLICY } from '../../battle/ai/src/index.ts';
import { makeDex, type Dex, type Nature, type Skill, type Species } from '../../raising/core/index.ts';
import type { CatalogData } from '../domain/catalog/catalog.ts';
import { traits, type TraitDefinition } from '../domain/traits.ts';
import type { EssenceDefinition } from '../domain/acquisition/acquisition-limits.ts';
import { buildFacilityViews } from '../domain/challenges/battle-facilities.ts';
import { braveTowerFloor } from '../domain/challenges/brave-tower.ts';
import { CHALLENGE_CAMPAIGNS, type Campaign } from '../domain/challenges/challenge-campaigns.ts';
import { buildAcquisitionViews, type AcquisitionViews } from '../domain/acquisition/acquisition.ts';
import type { AcquisitionCatalog } from '../domain/acquisition/acquisition-model.ts';
import { buildCollectionAncestry } from '../domain/acquisition/collection-ancestry.ts';
import { conventionalMovesResolver } from '../domain/acquisition/conventional-moves.ts';
import type { RecruitmentReward } from '../domain/acquisition/recruitment.ts';
import { buildSkinOptions } from '../domain/acquisition/skins.ts';
import type { LineageSpecies } from '../domain/acquisition/species-graph.ts';
import { getEligibleRecruitmentSPTs } from '../domain/acquisition/spt-recruitment.ts';
import type { BattleFacilityView } from '../shared/views.ts';
import { whenIdle } from '../shared/idle.ts';
import { enrichCatalog } from '../domain/catalog/enrichment.ts';

export type BattleFactory = (options: BattleOptions) => Battle;

export interface GameDependencies {
  /** Constructs each battle from options that carry the AI policy; verification passes a wrapper to observe the controller's battles. */
  createBattle?: BattleFactory;
  /** Schedules idle work (turn preparation); by default the browser's idle slots (`shared/idle.ts`), and verification runs the tasks when it chooses. */
  idle?: (task: () => void) => void;
  /**
   * Schedules the coalesced save write (by default after the next frame) and returns true, or returns false where it cannot wait
   * and the controller writes at once; verification runs the writes when it chooses.
   */
  scheduleSave?: (write: () => void) => boolean;
  /** Registers the flush of a pending save write for when the page may close (by default `onPageExit`); verification calls it. */
  onPageExit?: (flush: () => void) => void;
}

/** Catalog lookups that view builders need. */
export interface CatalogContext {
  readonly catalog: CatalogData;
  readonly dex: Dex;
  readonly data: DataSet;
  speciesName(id: number): string;
}

export interface GameContext extends CatalogContext {
  readonly createBattle: BattleFactory;
  /** Runs `task` in an idle slot after the current frame (turn preparation). */
  idle(task: () => void): void;
  /** Trainer battles model their opponent with conventional movesets; built on first use. */
  conventionalMoves(): (speciesId: number) => number[];
  readonly bosses: BossEncounter[];
  /** Bosses followed by trainer teams. */
  readonly encounters: BossEncounter[];
  readonly encounterById: ReadonlyMap<string, BossEncounter>;
  readonly towerEncounters: BossEncounter[];
  /** Reward item ids per Boss, in catalogue order. */
  readonly bossRewardItemIds: readonly (readonly [string, readonly string[]])[];
  readonly collectionAncestry: ReadonlyMap<number, readonly number[]>;
  readonly skinOptions: ReadonlyMap<number, readonly number[]>;
  readonly availableTraits: readonly TraitDefinition[];
  readonly recruitments: readonly RecruitmentReward[];
  /** Acquisition routes and families of the source catalog, which the dex, fusion and breeding views show. */
  readonly acquisition: AcquisitionViews;
  /** Kind and hatched species of every catalogue item, by id. */
  readonly itemDefinitions: ReadonlyMap<string, EssenceDefinition>;
  /** The essence items that reserve a copy of each species. */
  readonly essencesBySpecies: ReadonlyMap<number, readonly EssenceDefinition[]>;
  readonly ordinarySPTs: ReadonlySet<string>;
  /** Ordinary raising, battle and capsule items: the player uses them without spending stock. */
  readonly unlimitedItemIds: ReadonlySet<string>;
  readonly facilityViews: BattleFacilityView[];
  campaignForBoss(id: string): Campaign | undefined;
}

const UNLIMITED_ITEM_KINDS = ['raising', 'battle', 'capsule'];

export function createGameContext(source: CatalogData, dependencies: GameDependencies): GameContext {
  const { createBattle: construct = options => new Battle(options), idle = whenIdle } = dependencies;
  const { catalog, battleItems, recruitments } = enrichCatalog(source);
  const dex = makeDex(catalog as unknown as { species: Species[]; skills: Skill[]; natures: Nature[] });
  const data = buildDataSet({ ...catalog, items: battleItems } as unknown as RawData);
  const bosses = catalog.bosses as unknown as BossEncounter[];
  const trainers = structuredClone(catalog.trainers ?? []) as unknown as BossEncounter[];
  const encounters = [...bosses, ...trainers];
  const definitions = catalog.items.map(item => ({
    id: String(item.id), kind: String(item.kind), hatches: typeof item.hatches === 'number' ? item.hatches : undefined,
  }));
  let conventionalMoves: ((speciesId: number) => number[]) | undefined;
  return {
    catalog, dex, data, bosses, encounters, recruitments, idle,
    createBattle: options => construct({ ...options, policy: AI_POLICY }),
    speciesName: id => dex.species(id).name.zh,
    conventionalMoves: () => conventionalMoves ??= conventionalMovesResolver(catalog),
    encounterById: new Map(encounters.map(boss => [boss.id, boss])),
    towerEncounters: bosses.filter(boss => braveTowerFloor(boss.id) !== undefined),
    bossRewardItemIds: bosses.map(boss => [boss.id, Object.keys((boss.reward as { items?: Record<string, number> } | undefined)?.items ?? {})] as const),
    collectionAncestry: buildCollectionAncestry(catalog.species as unknown as LineageSpecies[]),
    skinOptions: buildSkinOptions(catalog.species as unknown as Species[]),
    availableTraits: traits.filter(trait => trait.implemented),
    itemDefinitions: new Map(definitions.map(item => [item.id, item])),
    essencesBySpecies: essencesBySpecies(definitions),
    ordinarySPTs: new Set(getEligibleRecruitmentSPTs(catalog as unknown as AcquisitionCatalog).map(boss => boss.id)),
    unlimitedItemIds: new Set(catalog.items.filter(item => UNLIMITED_ITEM_KINDS.includes(String(item.kind))).map(item => String(item.id))),
    facilityViews: buildFacilityViews(catalog),
    // Recruitment rewards do not depend on the enrichment, so the source catalog's routes reuse them.
    acquisition: buildAcquisitionViews(source as unknown as AcquisitionCatalog, recruitments),
    campaignForBoss: id => CHALLENGE_CAMPAIGNS.find(campaign => campaign.stages.some(stage => stage.bossIds.includes(id))),
  };
}

function essencesBySpecies(definitions: readonly EssenceDefinition[]) {
  const result = new Map<number, EssenceDefinition[]>();
  for (const item of definitions) {
    if (item.kind !== 'essence' || item.hatches === undefined) continue;
    const list = result.get(item.hatches) ?? [];
    list.push(item);
    result.set(item.hatches, list);
  }
  return result;
}
