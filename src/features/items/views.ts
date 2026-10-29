// Inventory and shop views of catalogue items.
import type { Action, Battle } from '../../../battle/core/src/index.ts';
import type { Monster } from '../../../raising/core/index.ts';
import type { GameSave } from '../../kernel/api.ts';
import { isShopItemAvailable } from '../../domain/item-shop.ts';
import { isSpeciesRepeatable } from '../../domain/acquisition/recruitment.ts';
import { isHatchingEssence } from '../../domain/acquisition/acquisition-limits.ts';
import { STAT_LABELS } from '../../shared/labels.ts';
import type { ItemView, ShopItemView } from '../../shared/views.ts';
import { allowance, capacityReason } from '../../kernel/acquire.ts';
import { REWARD_COLLECTIBLE_IDS } from '../../domain/catalog/enrichment.ts';
import type { GameContext } from '../../kernel/api.ts';
import { SHOP_MAX_QUANTITY } from '../../domain/economy.ts';

type CatalogItem = Record<string, unknown>;
type RaisingEffect = { op: string; amount?: number; stats?: string[]; what?: string; multiplier?: number; battles?: number };

const BEAD_POLICY = '同一精灵同时只能使用一颗能量珠；每结束一场战斗减少一次，耗尽后失效，期间不能替换。';
const itemName = (item: CatalogItem) => (item.name as { zh?: string } | undefined)?.zh ?? String(item.id);
const battleEffects = (item: CatalogItem) => item.battle_effects as { op: string; amount?: number }[] | undefined;

export function itemDescription(item: CatalogItem): string {
  const description = (item.desc as { zh?: string })?.zh;
  const raising = item.raising_effect as RaisingEffect | undefined;
  if (description) return description.replace(/当前精灵/g, '选中精灵') + (raising?.op === 'energy_bead' ? ` ${BEAD_POLICY}` : '');
  if (item.kind === 'essence') return '点击孵化，直接获得对应精灵。';
  const effect = battleEffects(item)?.[0];
  if (effect?.op === 'heal') return `战斗中恢复选中精灵 ${effect.amount ?? '全部'} 点体力。`;
  if (effect?.op === 'restore_pp') return `战斗中为每个技能补充 ${effect.amount ?? '全部'} 点 PP。`;
  switch (raising?.op) {
    case 'restore': return '重新随机选中精灵的个体值和性格并清空学习力，等级和技能保留。';
    case 'levels': return `精灵等级 ${raising.amount! > 0 ? '+' : ''}${raising.amount}。`;
    case 'iv_reroll': return '重新生成潜力数值。';
    case 'nature_reroll': return '重新生成精灵性格。';
    case 'nature_set': return '将精灵性格改为道具标注的性格。';
    case 'ev_reset': return `清除${raising.stats?.map(stat => STAT_LABELS[stat as keyof typeof STAT_LABELS]).join('、')}学习力。`;
    case 'boost': return `${raising.what === 'ev' ? '学习力' : '经验'}收益 ×${raising.multiplier}，持续 ${raising.battles} 场。`;
    case 'energy_bead': return `为选中的精灵附加战斗增益。${BEAD_POLICY}`;
  }
  if (item.kind === 'capsule') {
    return item.capture_multiplier === null ? '必定捕捉普通野生精灵。首领与招募挑战不可使用。'
      : `捕捉普通野生精灵；体力越低、陷入异常状态时越容易成功。捕捉倍率 ×${item.capture_multiplier ?? 1}。`;
  }
  return '用于精灵培育。';
}

/** The parts of an inventory row that never change. */
interface ItemRow {
  item: CatalogItem; id: string; name: string; kind: string; description: string; battleUsable: boolean;
  battleCategory?: ItemView['battleCategory']; targetMode: ItemView['targetMode'];
}

function itemRow(item: CatalogItem): ItemRow {
  const effects = battleEffects(item), hasEffects = Array.isArray(item.battle_effects) && (item.battle_effects as unknown[]).length > 0;
  const battleCategory = item.kind === 'capsule' ? 'capsule' : effects?.some(fx => fx.op === 'cure_status') ? 'status' : hasEffects ? 'recovery' : undefined;
  return {
    item, id: String(item.id), name: itemName(item), kind: String(item.kind), description: itemDescription(item),
    battleUsable: item.kind === 'capsule' || hasEffects, battleCategory, targetMode: effects?.some(fx => fx.op === 'revive') ? 'fainted' : 'living',
  };
}

/** What the bag does with an item now: raising items and essences outside a battle, supplies and capsules the battle allows in one. */
function bagAction(row: ItemRow, legal: Action[] | undefined): ItemView['useAction'] {
  if (!legal) return row.kind === 'raising' ? 'use' : row.kind === 'essence' ? 'hatch' : null;
  if (row.kind === 'capsule') return legal.some(action => action.kind === 'capture' && action.item === row.id) ? 'capture' : null;
  return row.kind === 'battle' && row.battleUsable ? 'use' : null;
}

/**
 * Inventory rows for held or unlimited items: in an unsettled `battle` supplies target the members they would change, else any
 * monster. The list of every monster keeps its identity while the storage holds the same monsters, as every row shares it.
 */
export function createInventoryViews(ctx: GameContext) {
  const rows = ctx.catalog.items.map(itemRow);
  let everyone: string[] = [];
  return (inventory: Record<string, number>, unlimited: ReadonlySet<string>, battle: Battle | null, storage: readonly Monster[]): ItemView[] => {
    const legal = battle?.legalActions(0), side = battle?.sides[0];
    if (storage.length !== everyone.length || storage.some((mon, index) => mon.uid !== everyone[index])) everyone = storage.map(mon => mon.uid);
    const itemActions = legal?.filter((action): action is Extract<Action, { kind: 'item' }> => action.kind === 'item');
    return rows.filter(row => (inventory[row.id] ?? 0) > 0 || unlimited.has(row.id)).map(row => {
      const useAction = bagAction(row, legal);
      const useTargets = useAction !== 'use' ? undefined : itemActions?.filter(action => action.item === row.id)
        .map(action => side!.team[action.target ?? side!.active].uid!).filter(Boolean) ?? everyone;
      return {
        id: row.id, name: row.name, kind: row.kind, count: inventory[row.id] ?? 0, unlimited: unlimited.has(row.id), description: row.description,
        battleUsable: row.battleUsable, battleCategory: row.battleCategory, targetMode: row.targetMode, useAction, ...(useTargets ? { useTargets } : {}),
      };
    });
  };
}

/** Shop rows: earned essences with their six-copy allowance, other items with the purchase limit. */
export function createShopViews(ctx: GameContext) {
  const products = ctx.catalog.items
    .filter(item => !REWARD_COLLECTIBLE_IDS.has(String(item.id)) && (!item.trainer_supply_only || ctx.unlimitedItemIds.has(String(item.id))))
    .map(item => ({
      id: String(item.id), name: itemName(item), kind: String(item.kind), description: itemDescription(item), price: 0 as const,
      unlimited: ctx.unlimitedItemIds.has(String(item.id)), ...(typeof item.hatches === 'number' ? { hatches: item.hatches } : {}),
    }));
  return (save: GameSave, inventory: Record<string, number>): ShopItemView[] => {
    const unlocked = new Set(save.game.shopUnlocked);
    return products.filter(item => isShopItemAvailable(item, unlocked)).map(product => {
      const item = { ...product, count: inventory[product.id] ?? 0 };
      if (!isHatchingEssence(item)) return { ...item, maxQuantity: SHOP_MAX_QUANTITY };
      const stock = allowance(ctx, save, item.hatches);
      const blockedReason = !isSpeciesRepeatable(item.hatches) ? '此精灵的来源只允许领取一次。' : capacityReason(ctx, save, item.hatches);
      return { ...item, allowance: stock, maxQuantity: blockedReason ? 0 : stock.remaining, blockedReason };
    });
  };
}
