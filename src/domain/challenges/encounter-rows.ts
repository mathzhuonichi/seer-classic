// Encounter rows shared by the challenge views and the encounter catalogue: opponents, reward labels, honours and categories.
import type { BossEncounter, DataSet } from '../../../battle/core/src/index.ts';
import type { ChallengeCategoryId, EncounterOpponentView } from '../../shared/views.ts';
import type { CatalogData } from '../catalog/catalog.ts';
import { SEER_BEANS_ITEM_ID } from '../economy.ts';

/** The catalogue lookups these rows need; the controller's context is one. */
export interface EncounterCatalog { readonly catalog: CatalogData; speciesName(id: number): string }

export function opponentViews(ctx: EncounterCatalog, encounter: BossEncounter): EncounterOpponentView[] {
  return encounter.team.map(mon => ({ species: mon.species, name: ctx.speciesName(mon.species), level: mon.level, levelMasked: mon.level_masked }));
}

type Honor = { zh?: string } | undefined;
type HonorReward = { achievement?: Honor; title?: Honor; achievement_on_all_variants?: Honor; title_on_all_variants?: Honor };
const honorLabels = (achievement: Honor, title: Honor) =>
  [achievement?.zh, title?.zh ? `称号：${title.zh}` : undefined].filter((value): value is string => !!value);

/** The achievement and title a clear of the encounter earns, as the archive shows them; read from the cleared record, they need no save field. */
export function encounterHonors(reward: unknown): string[] {
  const source = reward as HonorReward | undefined;
  return honorLabels(source?.achievement, source?.title);
}

/** The achievement and title earned once every variant of the encounter is cleared (厄尔塞拉's 七色光羽), read from its cleared variants. */
export function allVariantHonors(reward: unknown): string[] {
  const source = reward as HonorReward | undefined;
  return honorLabels(source?.achievement_on_all_variants, source?.title_on_all_variants);
}

/** The reward line of an encounter that teaches a skill. */
export function learnSkillLabel(ctx: { readonly data: DataSet }, skill: number): string {
  return `领悟技能：${ctx.data.skills.get(skill)?.name.zh}`;
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
