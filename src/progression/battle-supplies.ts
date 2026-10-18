import type { BossEncounter } from '../../battle/core/src/types.ts';

/** Documented classic recovery tiers plus the existing authored remake cure. */
export const TRAINER_UNLIMITED_ITEMS = ['item_potion_hp_250', 'item_potion_pp_20', 'item_status_cure'] as const;

/** Keep source bytes and legacy stock; exclude tiers lacking classic-use evidence. */
export function normalizeBattleSupplyItems(items: Record<string, unknown>[]): Record<string, unknown>[] {
  const result = items.filter(item => item.id !== 'item_potion_hp_3000' && item.id !== 'item_potion_pp_40');
  if (!result.some(item => item.id === 'item_potion_hp_250')) result.push({
    id: 'item_potion_hp_250', seer_id: 300072, name: {zh: '极限体力药剂'}, kind: 'battle', era: 'pre-2013',
    desc: {zh: '恢复选中精灵 250 点体力，每次使用占用一回合。'},
    battle_effects: [{op: 'heal', target: 'self', amount: 250}], trainer_supply_only: true,
    source: 'Recovered item 300072; actual 250 HP use documented on 2010-10-02. Unlimited trainer access is a remake rule.',
    sources: ['https://news.4399.com/seer/jingyanxinde/201010-02-78409.html'],
  });
  return result;
}

/** Opt in only at the trainer boundary; never infer supplies from species. */
export function trainerBattleSupplies(catalog: {items: Record<string, unknown>[]}, encounter: BossEncounter | null | undefined): string[] {
  if (encounter?.category !== 'trainer') return [];
  return TRAINER_UNLIMITED_ITEMS.filter(id => catalog.items.some(item => String(item.id) === id && Array.isArray(item.battle_effects) && item.battle_effects.length > 0));
}
