// Everything a controller derives once from its catalog. Read-only after creation.
import { buildDataSet, type Battle, type BattleOptions, type BossEncounter, type DataSet, type RawData } from '../../battle/core/src/index.ts';
import { makeDex, type Dex, type Nature, type Skill, type Species } from '../../raising/core/index.ts';
import type { CatalogData } from '../domain/catalog/catalog.ts';
import { traits, type TraitDefinition } from '../domain/traits.ts';
import type { EssenceDefinition } from '../domain/acquisition/acquisition-limits.ts';
import { buildFacilityViews } from '../domain/challenges/battle-facilities.ts';
import { braveTowerFloor } from '../domain/challenges/brave-tower.ts';
import { CHALLENGE_CAMPAIGNS, type Campaign } from '../domain/challenges/challenge-campaigns.ts';
import { buildCollectionAncestry, type CollectionSpecies } from '../domain/acquisition/collection-ancestry.ts';
import { conventionalMovesResolver } from '../domain/acquisition/conventional-moves.ts';
import type { RecruitmentCatalog, RecruitmentReward } from '../domain/acquisition/recruitment.ts';
import { buildSkinOptions } from '../domain/acquisition/skins.ts';
import { getEligibleRecruitmentSPTs } from '../domain/acquisition/spt-recruitment.ts';
import type { BattleFacilityView } from './contract.ts';
import { enrichCatalog } from '../domain/catalog/enrichment.ts';

export type BattleFactory = (options: BattleOptions) => Battle;

/** Catalog lookups that view builders need. */
export interface CatalogContext {
  readonly catalog: CatalogData;
  readonly dex: Dex;
  readonly data: DataSet;
  speciesName(id: number): string;
}

export interface GameContext extends CatalogContext {
  readonly createBattle: BattleFactory;
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

export function createGameContext(source: CatalogData, createBattle: BattleFactory): GameContext {
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
    catalog, dex, data, createBattle, bosses, encounters, recruitments,
    speciesName: id => dex.species(id).name.zh,
    conventionalMoves: () => conventionalMoves ??= conventionalMovesResolver(catalog),
    encounterById: new Map(encounters.map(boss => [boss.id, boss])),
    towerEncounters: bosses.filter(boss => braveTowerFloor(boss.id) !== undefined),
    bossRewardItemIds: bosses.map(boss => [boss.id, Object.keys((boss.reward as { items?: Record<string, number> } | undefined)?.items ?? {})] as const),
    collectionAncestry: buildCollectionAncestry(catalog.species as unknown as CollectionSpecies[]),
    skinOptions: buildSkinOptions(catalog.species as unknown as Species[]),
    availableTraits: traits.filter(trait => trait.implemented),
    itemDefinitions: new Map(definitions.map(item => [item.id, item])),
    essencesBySpecies: essencesBySpecies(definitions),
    ordinarySPTs: new Set(getEligibleRecruitmentSPTs(catalog as unknown as RecruitmentCatalog).map(boss => boss.id)),
    unlimitedItemIds: new Set(catalog.items.filter(item => UNLIMITED_ITEM_KINDS.includes(String(item.kind))).map(item => String(item.id))),
    facilityViews: buildFacilityViews(catalog),
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
