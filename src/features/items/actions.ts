// Action handlers for the shop, items, essences, fusion, breeding and quests.
import { activeBeads, findMon, hatchEssence, useRaisingItem, type RaisingItem } from '../../../raising/core/index.ts';
import { SPECIES_COPY_LIMIT, acquisitionLimitReason } from '../../domain/acquisition/acquisition-limits.ts';
import { BREEDING_RECIPES, canBreedParents, chooseBreedingOutcome } from '../../domain/recipes/breeding.ts';
import { FUSION_RECIPES, canFuseParents, chooseFusionOutcome, fusionBeadItemId } from '../../domain/recipes/fusion.ts';
import { isShopItemAvailable } from '../../domain/item-shop.ts';
import { isSpeciesRepeatable } from '../../domain/acquisition/recruitment.ts';
import type { GameAction } from '../../kernel/contract.ts';
import { acquire, allowance, boundedAutoEvolve, capacityReason, ensureAcquisitionCapacity, rollTrait } from '../../kernel/acquire.ts';
import { TOWER_COLLECTIBLE_IDS } from '../../domain/catalog/enrichment.ts';
import type { GameContext } from '../../kernel/api.ts';
import { SHOP_MAX_QUANTITY } from '../../domain/economy.ts';
import {clearEngravingDeficit} from '../engravings/index.ts';
import {claimQuest} from '../challenges/index.ts';
import { commit, notice, replaceMonster, type ActionHandler, type ActionHandlers, type Runtime } from '../../kernel/api.ts';

type CatalogItem = Record<string, unknown>;

const findItem = (ctx: GameContext, id: string) => ctx.catalog.items.find(item => String(item.id) === id);
const itemName = (item: CatalogItem) => (item.name as { zh: string }).zh;

const buyItem: ActionHandler<'buyItem'> = (rt, action) => {
  const { ctx, save } = rt, { itemId, quantity } = action;
  if (TOWER_COLLECTIBLE_IDS.has(itemId)) throw new Error('此奖励需要通过对应的勇者之塔楼层获得。');
  const item = findItem(ctx, itemId);
  const listed = item && (!item.trainer_supply_only || ctx.unlimitedItemIds.has(itemId))
    && isShopItemAvailable({ id: itemId, kind: String(item.kind) }, new Set(save.game.shopUnlocked));
  if (!item || !listed) throw new Error('这件道具尚未进入商城。');
  if (ctx.unlimitedItemIds.has(itemId)) {
    notice(rt, '此道具可无限使用，已在道具背包中。');
    return;
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > SHOP_MAX_QUANTITY) throw new Error(`购买数量须为1至${SHOP_MAX_QUANTITY}的整数。`);
  if (item.kind === 'essence' && typeof item.hatches === 'number') {
    if (!isSpeciesRepeatable(item.hatches)) throw new Error('此精灵的来源只允许领取一次。');
    const stock = allowance(ctx, save, item.hatches);
    if (quantity > stock.remaining) throw new Error(acquisitionLimitReason(ctx.speciesName(item.hatches), stock));
  }
  const count = (save.items[itemId] ?? 0) + quantity;
  if (!Number.isSafeInteger(count)) throw new Error('道具库存已达到上限。');
  save.items[itemId] = count;
  notice(rt, `免费购买：${itemName(item)} ×${quantity}，已加入道具背包。`);
};

function hatch(rt: Runtime, item: CatalogItem, itemId: string) {
  const { ctx } = rt;
  if ((rt.save.items[itemId] ?? 0) < 1) throw new Error('没有可孵化的精元。');
  ensureAcquisitionCapacity(rt.save);
  const species = Number(item.hatches), stock = allowance(ctx, rt.save, species);
  if (stock.owned >= SPECIES_COPY_LIMIT) throw new Error(acquisitionLimitReason(ctx.speciesName(species), stock));
  const hatched = hatchEssence(rt.save, item as { id: string; kind: 'essence'; hatches: number }, ctx.dex, rt.rng, new Date().toISOString());
  commit(rt, hatched.save);
  rollTrait(ctx, rt.save, rt.rng, hatched.mon.uid);
  notice(rt, `${itemId.startsWith('fusion_bead_') ? '元神珠' : '精元'}孵化成功：${ctx.speciesName(hatched.mon.species)}！`);
}

function useRaising(rt: Runtime, item: CatalogItem, action: Extract<GameAction, { type: 'useItem' }>) {
  const { ctx } = rt, effect = (item as unknown as RaisingItem).raising_effect;
  const bead = effect?.op === 'energy_bead' ? activeBeads(rt.save, action.uid)[0] : undefined;
  if (bead) {
    const name = (findItem(ctx, bead.item)?.name as { zh?: string } | undefined)?.zh ?? '能量珠';
    throw new Error(`${ctx.speciesName(findMon(rt.save, action.uid).species)}已使用${name}，剩余 ${bead.battles_left} 场战斗；失效前不能替换，未消耗新道具。`);
  }
  const options = { unlimited: ctx.unlimitedItemIds.has(action.itemId) };
  commit(rt, useRaisingItem(rt.save, action.uid, item as unknown as RaisingItem, ctx.dex, rt.rng, options).save);
  if (effect.op === 'restore') clearEngravingDeficit(rt.save, action.uid);
  if (effect.op === 'exp' || effect.op === 'levels' && effect.amount > 0) replaceMonster(rt, boundedAutoEvolve(rt, findMon(rt.save, action.uid)));
  notice(rt, `已对${ctx.speciesName(findMon(rt.save, action.uid).species)}使用${itemName(item)}。`);
}

const useItem: ActionHandler<'useItem'> = (rt, action) => {
  const item = rt.ctx.catalog.items.find(entry => entry.id === action.itemId);
  if (!item) throw new Error('道具不存在。');
  if (item.kind === 'essence') hatch(rt, item, action.itemId);
  else if (item.kind === 'raising') useRaising(rt, item, action);
  else throw new Error('该道具请在战斗中使用。');
};

/** Fusion keeps both parents and stores the outcome as a bead to hatch later. */
const fuse: ActionHandler<'fuse'> = (rt, action) => {
  const { ctx, save } = rt, recipe = FUSION_RECIPES.find(entry => entry.id === action.recipeId);
  if (!recipe) throw new Error('融合配方不存在。');
  if (action.primaryUid === action.secondaryUid) throw new Error('请选择两只不同的精灵作为双亲。');
  const primary = findMon(save, action.primaryUid), secondary = findMon(save, action.secondaryUid);
  if (!canFuseParents(recipe, primary, secondary)) throw new Error('双亲不符合这份融合配方，请检查精灵形态。');
  if (recipe.outcomes.filter(outcome => outcome.weight > 0).every(outcome => allowance(ctx, save, outcome.species).remaining < 1)) {
    throw new Error('本配方所有结果均已达到六份上限。');
  }
  const outcome = chooseFusionOutcome(recipe, rt.rng.next()), id = fusionBeadItemId(outcome.species), name = ctx.speciesName(outcome.species);
  const reason = capacityReason(ctx, save, outcome.species);
  if (reason) {
    notice(rt, `本次融合结果为${name}，${reason}双亲保留，可腾出额度或再次尝试。`);
    return;
  }
  save.items[id] = (save.items[id] ?? 0) + 1;
  notice(rt, `融合成功：获得${outcome.beadName}（${name}）。双亲已保留，可前往道具背包孵化。`);
};

const breed: ActionHandler<'breed'> = (rt, action) => {
  const { ctx, save } = rt, recipe = BREEDING_RECIPES.find(entry => entry.id === action.recipeId);
  if (!recipe) throw new Error('繁殖配方不存在。');
  const first = findMon(save, action.firstUid), second = findMon(save, action.secondUid);
  if (!canBreedParents(recipe, first, second)) throw new Error('双亲不符合配对条件：请选择两只指定成熟形态、至少50级的精灵，雄性必须为第一代。');
  // Validate capacity and every catalog outcome before consuming the selection RNG.
  ensureAcquisitionCapacity(save);
  for (const outcome of recipe.outcomes) ctx.dex.species(outcome.species);
  if (recipe.outcomes.filter(outcome => outcome.weight > 0).every(outcome => allowance(ctx, save, outcome.species).remaining < 1)) {
    throw new Error('本配方所有结果均已达到六份上限。');
  }
  const outcome = chooseBreedingOutcome(recipe, rt.rng.next()), name = ctx.speciesName(outcome.species);
  const reason = capacityReason(ctx, save, outcome.species);
  if (reason) {
    notice(rt, `本次繁殖结果为${name}，${reason}双亲保留，可腾出额度或再次尝试。`);
    return;
  }
  const infant = acquire(rt, outcome.species, 1, 'breeding', 1);
  notice(rt, `繁殖孵化成功：${name} Lv.1 已加入${rt.save.party.includes(infant.uid) ? '背包' : '仓库'}。双亲已保留。`);
};

export const itemActions = {
  buyItem, useItem, fuse, breed, claimQuest: (rt, action) => claimQuest(rt, action.questId),
} satisfies Partial<ActionHandlers>;
