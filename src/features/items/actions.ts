// Action handlers for the shop, items and essences.
import { activeBeads, findMon, hatchEssence, useRaisingItem, type RaisingItem } from '../../../raising/core/index.ts';
import { SPECIES_COPY_LIMIT, acquisitionLimitReason, isHatchingEssence } from '../../domain/acquisition/acquisition-limits.ts';
import { isShopItemAvailable } from '../../domain/item-shop.ts';
import { isSpeciesRepeatable } from '../../domain/acquisition/recruitment.ts';
import type { GameAction } from '../../kernel/contract.ts';
import { allowance, boundedAutoEvolve, rollTrait } from '../../kernel/acquire.ts';
import { REWARD_COLLECTIBLE_IDS } from '../../domain/catalog/enrichment.ts';
import type { GameContext } from '../../kernel/api.ts';
import { SHOP_MAX_QUANTITY } from '../../domain/economy.ts';
import {clearEngravingDeficit} from '../engravings/index.ts';
import { commit, notice, replaceMonster, type ActionHandler, type Feature, type Runtime } from '../../kernel/api.ts';
import type { ItemsAction } from './feature.ts';

type CatalogItem = Record<string, unknown>;

const findItem = (ctx: GameContext, id: string) => ctx.catalog.items.find(item => String(item.id) === id);
const itemName = (item: CatalogItem) => (item.name as { zh: string }).zh;

const buyItem: ActionHandler<'buyItem'> = (rt, action) => {
  const { ctx, save } = rt, { itemId, quantity } = action;
  if (REWARD_COLLECTIBLE_IDS.has(itemId)) throw new Error('此奖励只能通过对应的挑战获得。');
  const item = findItem(ctx, itemId);
  const listed = item && (!item.trainer_supply_only || ctx.unlimitedItemIds.has(itemId))
    && isShopItemAvailable({ id: itemId, kind: String(item.kind) }, new Set(save.game.shopUnlocked));
  if (!item || !listed) throw new Error('这件道具尚未进入商城。');
  if (ctx.unlimitedItemIds.has(itemId)) {
    notice(rt, '此道具可无限使用，已在道具背包中。');
    return;
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > SHOP_MAX_QUANTITY) throw new Error(`购买数量须为1至${SHOP_MAX_QUANTITY}的整数。`);
  const essence = ctx.itemDefinitions.get(itemId);
  if (isHatchingEssence(essence)) {
    if (!isSpeciesRepeatable(essence.hatches)) throw new Error('此精灵的来源只允许领取一次。');
    const stock = allowance(ctx, save, essence.hatches);
    if (quantity > stock.remaining) throw new Error(acquisitionLimitReason(ctx.speciesName(essence.hatches), stock));
  }
  save.items[itemId] = (save.items[itemId] ?? 0) + quantity;
  notice(rt, `免费购买：${itemName(item)} ×${quantity}，已加入道具背包。`);
};

function hatch(rt: Runtime, item: CatalogItem, itemId: string) {
  const { ctx } = rt;
  if ((rt.save.items[itemId] ?? 0) < 1) throw new Error('没有可孵化的精元。');
  const species = Number(item.hatches), stock = allowance(ctx, rt.save, species);
  if (stock.owned >= SPECIES_COPY_LIMIT) throw new Error(acquisitionLimitReason(ctx.speciesName(species), stock));
  const hatched = hatchEssence(rt.save, item as { id: string; kind: 'essence'; hatches: number }, ctx.dex, rt.rng, new Date().toISOString());
  commit(rt, hatched.save);
  rollTrait(ctx, rt.save, rt.rng, hatched.mon.uid);
  const place = rt.save.party.includes(hatched.mon.uid) ? '背包' : '仓库';
  notice(rt, `${itemId.startsWith('fusion_bead_') ? '元神珠' : '精元'}孵化成功：${ctx.speciesName(hatched.mon.species)}已加入${place}！`);
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
  const mon = findMon(rt.save, action.uid);
  notice(rt, `已对${mon.nickname || ctx.speciesName(mon.species)}使用${itemName(item)}。`);
}

const useItem: ActionHandler<'useItem'> = (rt, action) => {
  const item = rt.ctx.catalog.items.find(entry => entry.id === action.itemId);
  if (!item) throw new Error('道具不存在。');
  if (item.kind === 'essence') hatch(rt, item, action.itemId);
  else if (item.kind === 'raising') useRaising(rt, item, action);
  else throw new Error('该道具请在战斗中使用。');
};

export const itemActions = { buyItem, useItem } satisfies Feature<ItemsAction>['actions'];
