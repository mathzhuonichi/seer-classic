// Engravings as they apply to one monster: what each does for it, whether it takes effect and how it can be equipped.
import { findMon, type Monster } from '../../../raising/core/index.ts';
import type { GameContext, GameSave } from '../../kernel/api.ts';
import { engravingAccess, equipMode } from '../../domain/engravings/engraving-access.ts';
import { engravingBlockedReason, engravingEffectGroup, engravings, engravingStatKeys, type EngravingDefinition } from '../../domain/engravings/engravings.ts';
import type { EngravingView } from '../../shared/views.ts';
import { engravingHolder, equippedEngravingCounts, equippedEngravings } from './loadout.ts';

/** Who holds each engraving: the stored holders in storage order with their names, and the equipped copies. */
export interface EngravingLedger { holders: ReadonlyMap<string, { uid: string; name: string }[]>; equipped: Record<string, number> }

export function engravingLedger(ctx: GameContext, save: GameSave): EngravingLedger {
  const holders = new Map<string, { uid: string; name: string }[]>();
  for (const mon of save.storage) for (const id of new Set(equippedEngravings(save, mon.uid))) {
    const list = holders.get(id) ?? [];
    list.push({ uid: mon.uid, name: mon.nickname || ctx.speciesName(mon.species) });
    holders.set(id, list);
  }
  return { holders, equipped: equippedEngravingCounts(save) };
}

export function engravingView(ctx: GameContext, save: GameSave, def: EngravingDefinition, mon: Monster, ledger: EngravingLedger): EngravingView {
  const reason = engravingBlockedReason(def, engravingHolder(mon)), access = engravingAccess(def);
  const moveName = def.moveIds?.map(id => ctx.data.skills.get(id)?.name.zh).filter(Boolean).join('、');
  const holders = ledger.holders.get(def.id) ?? [], others = holders.filter(holder => holder.uid !== mon.uid), equippedHere = others.length < holders.length;
  const stock = save.game.engravingStock[def.id] ?? 0, count = ledger.equipped[def.id] ?? 0;
  const mode = equippedHere ? 'blocked' : equipMode(def, stock, count, others.length);
  return {
    id: def.id, name: def.name.zh, slot: def.slot, effect: def.effect.desc, levelMin: def.levelMin, bound: def.species.length > 0,
    moveName: moveName || undefined, moveIds: def.moveIds,
    group: engravingEffectGroup(def), statKeys: engravingStatKeys(def), ready: !reason, reason,
    ...access, stock, equipped: count, equippedHere, equippedHolders: holders, equipMode: mode, ...(mode === 'transfer' ? { transferFrom: others } : {}),
    owned: stock + count, canBuy: !access.unlimited && stock + count < access.maxOwned,
  };
}

/** Engravings this monster's species and known skills qualify for. Reads only what the monsters and engravingStock slices carry. */
export function engravingOptions(ctx: GameContext, save: GameSave, uid: string): EngravingView[] {
  const mon = findMon(save, uid), known = new Set([...mon.skills, ...mon.learned]), ledger = engravingLedger(ctx, save);
  return engravings
    .filter(def => (!def.species.length || def.species.includes(mon.species)) && (def.slot === 'ability' || def.moveIds!.some(id => known.has(id))))
    .map(def => engravingView(ctx, save, def, mon, ledger));
}
