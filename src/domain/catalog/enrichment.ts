// The catalog as one controller uses it, built once. The source catalog is never mutated.
import type { CatalogData } from './catalog.ts';
import { normalizeBattleSupplyItems } from '../battle-supplies.ts';
import type { AcquisitionCatalog } from '../acquisition/acquisition-model.ts';
import { bossEssenceRewards } from '../acquisition/native-acquisition.ts';
import { FUSION_RECIPES, fusionBeadItemId } from '../recipes/fusion.ts';
import { buildRecruitmentRewards, type RecruitmentReward } from '../acquisition/recruitment.ts';
import { CURE_ITEM_ID } from '../economy.ts';

type CatalogItem = Record<string, unknown>;
type CatalogReward = { items?: Record<string, number>; first_clear_items?: Record<string, number> };

/** A simple remake supply fills the recovered catalogue's missing cure-item category. */
const CURE_ITEM: CatalogItem = {
  id: CURE_ITEM_ID, name: { zh: '异常解除剂' }, kind: 'battle', desc: { zh: '解除选中精灵的全部异常状态，不清除能力变化。' },
  battle_effects: [{ op: 'cure_status', target: 'self' }],
  source: 'Authored remake supply; the recovered item catalogue contains no status-cure consumables.',
};
/** Encounter rewards the recovered item catalogue does not define: collectibles that only their encounter pays, never sold. */
const REWARD_COLLECTIBLES: readonly { id: string; zh: string; desc: string }[] = [
  { id: 'item_gacha_coin', zh: '扭蛋币', desc: '勇者之塔通关奖励。' },
  { id: 'item_suit_flash', zh: '闪光套装', desc: '勇者之塔通关奖励。' },
  { id: 'suit_blue_warrior', zh: '蓝武士装', desc: '首次击败里奥斯的奖励。' },
];
export const REWARD_COLLECTIBLE_IDS: ReadonlySet<string> = new Set(REWARD_COLLECTIBLES.map(({ id }) => id));
/** The items an encounter pays on some clear: its reward items and its first-clear items. */
const rewardItemIds = (reward: CatalogReward | undefined) => [...Object.keys(reward?.items ?? {}), ...Object.keys(reward?.first_clear_items ?? {})];

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
  addBossEssences(catalog, items, name);
  for (const { id, zh, desc } of REWARD_COLLECTIBLES) {
    if (catalog.bosses.some(boss => rewardItemIds(boss.reward as CatalogReward | undefined).includes(id))) {
      items.add({ id, name: { zh }, kind: 'collectible', desc: { zh: desc } });
    }
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
  const recruitments = buildRecruitmentRewards(catalog as unknown as AcquisitionCatalog);
  for (const reward of recruitments) items.add({
    id: reward.itemId, name: { zh: `${reward.name}精元` }, kind: 'essence', hatches: reward.rewardSpecies,
    desc: { zh: '完成收集与首领条件后领取；孵化获得初始形态，所有精元与现有同种精灵合计最多六份。' },
  });
  return { catalog, battleItems, recruitments };
}

/** Boss copies list their default essence (`bossEssenceRewards`), and every reward essence becomes an item once. */
function addBossEssences(catalog: CatalogData, items: ItemRegistry, name: (species: number) => string) {
  for (const boss of catalog.bosses) {
    const reward = boss.reward as CatalogReward | undefined;
    boss.reward = { ...reward, items: { ...reward?.items } };
  }
  for (const { boss, itemId, species, authored } of bossEssenceRewards(catalog as unknown as AcquisitionCatalog)) {
    if (authored) boss.reward!.items![itemId] = 1;
    if (!items.has(itemId)) items.add({ id: itemId, name: { zh: `${name(species)}精元` }, kind: 'essence', hatches: species });
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
