// The catalog as one controller uses it, built once. The source catalog is never mutated.
import type { CatalogData } from './catalog.ts';
import { normalizeBattleSupplyItems } from '../battle-supplies.ts';
import { braveTowerFloor } from '../challenges/brave-tower.ts';
import { CHALLENGE_CAMPAIGNS } from '../challenges/challenge-campaigns.ts';
import { resolveEncounterEssenceSpecies } from '../acquisition/acquisition.ts';
import { FUSION_RECIPES, fusionBeadItemId } from '../recipes/fusion.ts';
import { buildRecruitmentRewards, type RecruitmentCatalog, type RecruitmentReward } from '../acquisition/recruitment.ts';
import { CURE_ITEM_ID } from '../economy.ts';

type CatalogItem = Record<string, unknown>;
type CatalogBoss = { id: string; team: { species: number }[]; reward?: { items?: Record<string, number>; learn_skill?: unknown } };

/** A simple remake supply fills the recovered catalogue's missing cure-item category. */
const CURE_ITEM: CatalogItem = {
  id: CURE_ITEM_ID, name: { zh: '异常解除剂' }, kind: 'battle', desc: { zh: '解除选中精灵的全部异常状态，不清除能力变化。' },
  battle_effects: [{ op: 'cure_status', target: 'self' }],
  source: 'Authored remake supply; the recovered item catalogue contains no status-cure consumables.',
};
/** Brave Tower floor rewards the recovered item catalogue does not define. */
const TOWER_COLLECTIBLES: readonly (readonly [string, string])[] = [['item_gacha_coin', '扭蛋币'], ['item_suit_flash', '闪光套装']];
export const TOWER_COLLECTIBLE_IDS: ReadonlySet<string> = new Set(TOWER_COLLECTIBLES.map(([id]) => id));
const BRAVE_TOWER_MYSTERY_ID = 'boss_tower_brave_mystery';

export interface EnrichedCatalog {
  /** Supplies plus every reward item the controller grants; Boss copies carry their default essence reward. */
  catalog: CatalogData;
  /** The items the battle engine knows: the source items plus battle supplies, without reward items. */
  battleItems: CatalogItem[];
  recruitments: RecruitmentReward[];
}

export function enrichCatalog(source: CatalogData): EnrichedCatalog {
  const battleItems = normalizeBattleSupplyItems(source.items);
  if (!battleItems.some(item => item.id === CURE_ITEM_ID)) battleItems.push(CURE_ITEM);
  const catalog: CatalogData = { ...source, items: [...battleItems], bosses: structuredClone(source.bosses) };
  const names = new Map(source.species.map(row => [Number(row.id), (row.name as { zh: string }).zh]));
  const name = (species: number) => {
    const value = names.get(species);
    if (value === undefined) throw new Error(`unknown species ${species}`);
    return value;
  };
  const items = itemRegistry(catalog.items);
  addBossEssences(catalog.bosses as unknown as CatalogBoss[], items, name);
  for (const [id, zh] of TOWER_COLLECTIBLES) {
    const rewarded = catalog.bosses.some(boss => braveTowerFloor(String(boss.id)) !== undefined && (boss.reward as CatalogBoss['reward'])?.items?.[id]);
    if (rewarded) items.add({ id, name: { zh }, kind: 'collectible', desc: { zh: '勇者之塔通关奖励。' } });
  }
  for (const species of catalog.species) if (!(species.obtain as string[] | undefined)?.includes('wild')) {
    items.add({ id: `essence_recruit_${species.id}`, name: { zh: `${name(Number(species.id))}精元` }, kind: 'essence', hatches: Number(species.id) });
  }
  for (const recipe of FUSION_RECIPES) for (const outcome of recipe.outcomes) {
    const zh = name(outcome.species);
    items.add({
      id: fusionBeadItemId(outcome.species), name: { zh: `${outcome.beadName} · ${zh}` }, kind: 'essence', hatches: outcome.species,
      desc: { zh: `孵化获得 Lv.1 ${zh}，背包已满时进入仓库。融合时已确定结果，孵化不会再次随机。` },
    });
  }
  const recruitments = buildRecruitmentRewards(catalog as unknown as RecruitmentCatalog);
  for (const reward of recruitments) items.add({
    id: reward.itemId, name: { zh: `${reward.name}精元` }, kind: 'essence', hatches: reward.rewardSpecies,
    desc: { zh: '完成收集与首领条件后领取；孵化获得初始形态，所有精元与现有同种精灵合计最多六份。' },
  });
  return { catalog, battleItems, recruitments };
}

/** Final Bosses without an explicit essence or skill reward grant the essence of their reward species. */
function addBossEssences(bosses: CatalogBoss[], items: ItemRegistry, name: (species: number) => string) {
  for (const boss of bosses) {
    const species = resolveEncounterEssenceSpecies(boss);
    const reward = boss.reward ?? {};
    const rewardItems = reward.items ?? {};
    const campaign = CHALLENGE_CAMPAIGNS.find(entry => entry.stages.some(stage => stage.bossIds.includes(boss.id)));
    const intermediate = campaign && !campaign.stages.at(-1)!.bossIds.includes(boss.id);
    const explicit = Object.keys(rewardItems).some(id => id.startsWith('essence_'));
    if (!intermediate && !reward.learn_skill && boss.id !== BRAVE_TOWER_MYSTERY_ID && braveTowerFloor(boss.id) === undefined && !explicit) {
      rewardItems[`essence_${boss.id}`] = 1;
    }
    boss.reward = { ...reward, items: rewardItems };
    for (const id of Object.keys(rewardItems)) {
      if (id.startsWith('essence_') && !items.has(id)) items.add({ id, name: { zh: `${name(species)}精元` }, kind: 'essence', hatches: species });
    }
  }
}

/** Appends items whose id is not yet registered, keeping catalogue order. */
function itemRegistry(items: CatalogItem[]) {
  const ids = new Set(items.map(item => String(item.id)));
  return {
    has: (id: string) => ids.has(id),
    add(item: CatalogItem) {
      const id = String(item.id);
      if (ids.has(id)) return;
      ids.add(id);
      items.push(item);
    },
  };
}
type ItemRegistry = ReturnType<typeof itemRegistry>;
