// Encounter rows shared by the challenge views and the encounter catalogue: opponents, Brave Tower reward labels, honours and categories.
import type { BossEncounter } from '../../../battle/core/src/index.ts';
import type { ChallengeCategoryId, EncounterOpponentView } from '../../shared/views.ts';
import type { CatalogData } from '../catalog/catalog.ts';
import { SEER_BEANS_ITEM_ID } from '../economy.ts';
import { buildBossEvidence } from './boss-evidence.ts';

/** The catalogue lookups these rows need; the controller's context is one. */
export interface EncounterCatalog { readonly catalog: CatalogData; speciesName(id: number): string }

export function opponentViews(ctx: EncounterCatalog, encounter: BossEncounter): EncounterOpponentView[] {
  return encounter.team.map((mon, slot) => ({
    species: mon.species, name: ctx.speciesName(mon.species), level: mon.level, evidence: buildBossEvidence(encounter, slot),
  }));
}

type HonorReward = { achievement?: { zh?: string }; title?: { zh?: string }; title_on_all_variants?: { zh?: string } };

/**
 * The achievement and title a clear of the encounter earns, as the archive shows them. Honours are read from the cleared record, so they
 * need no save field. The remake offers only an encounter's base fight (no variant is ever chosen), so its clear stands for every variant.
 */
export function encounterHonors(reward: unknown): string[] {
  const source = reward as HonorReward | undefined, title = source?.title?.zh ?? source?.title_on_all_variants?.zh;
  return [source?.achievement?.zh, title ? `称号：${title}` : undefined].filter((value): value is string => !!value);
}

export function towerRewardLabel(ctx: EncounterCatalog, id: string, count: number): string {
  const item = ctx.catalog.items.find(entry => entry.id === id);
  const name = id === SEER_BEANS_ITEM_ID ? '赛尔豆' : (item?.name as { zh?: string })?.zh ?? id;
  const species = ctx.catalog.species.find(entry => entry.id === item?.hatches);
  const evolutions = species?.evolution as { to: number; level?: number; method?: string }[] | undefined;
  const evolution = evolutions?.length === 1 && evolutions[0].method === 'level' ? evolutions[0] : undefined;
  return `${name} ×${count}${evolution?.level ? `（${evolution.level}级进化为${ctx.speciesName(evolution.to)}）` : ''}`;
}

export function encounterCategory(b: BossEncounter): ChallengeCategoryId {
  if (b.category === 'trainer') return 'trainer';
  if (b.name!.zh.includes('暗黑')) return 'dark';
  if (b.category === 'tower') return 'tower';
  if (b.category === 'legendary') return 'legendary';
  return ['story', 'event'].includes(String(b.category)) ? 'quest' : 'spt';
}
