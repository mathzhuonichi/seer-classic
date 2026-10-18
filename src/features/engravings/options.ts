// Engravings as they apply to one monster: what each does for it, whether it takes effect and how it can be equipped.
import { findMon, type Monster } from '../../../raising/core/index.ts';
import type { GameContext, GameSave } from '../../kernel/api.ts';
import { engravingAccess, equipMode } from '../../domain/engravings/engraving-access.ts';
import { engravingBlockedReason, engravingEffectGroup, engravings, engravingStatKeys, type EngravingDefinition } from '../../domain/engravings/engravings.ts';
import type { EngravingView } from '../../shared/views.ts';
import { engravingHolder, equippedEngravingCounts, equippedEngravings } from './loadout.ts';

export function engravingView(
  ctx: GameContext, save: GameSave, def: EngravingDefinition, mon: Monster, equipped = equippedEngravingCounts(save),
): EngravingView {
  const reason = engravingBlockedReason(def, engravingHolder(mon)), access = engravingAccess(def);
  const moveName = def.moveIds?.map(id => ctx.data.skills.get(id)?.name.zh).filter(Boolean).join('、');
  const holders = save.storage.filter(holder => equippedEngravings(save, holder.uid).includes(def.id))
    .map(holder => ({ uid: holder.uid, name: holder.nickname || ctx.speciesName(holder.species) }));
  const others = holders.filter(holder => holder.uid !== mon.uid), equippedHere = others.length < holders.length;
  const stock = save.game.engravingStock[def.id] ?? 0, count = equipped[def.id] ?? 0;
  const mode = equippedHere ? 'blocked' : equipMode(def, stock, count, others.length);
  return {
    id: def.id, name: def.name.zh, slot: def.slot, effect: def.effect.desc, levelMin: def.levelMin, bound: def.species.length > 0,
    moveName: moveName || undefined, moveIds: def.moveIds,
    group: engravingEffectGroup(def), statKeys: engravingStatKeys(def), era: def.era, ready: !reason, reason, note: def.notes?.join(' '),
    ...access, stock, equipped: count, equippedHere, equippedHolders: holders, equipMode: mode, ...(mode === 'transfer' ? { transferFrom: others } : {}),
    owned: stock + count, canBuy: !access.unlimited && stock + count < access.maxOwned,
  };
}

/** Engravings this monster's species and known skills qualify for. */
export function engravingOptions(ctx: GameContext, save: GameSave, uid: string): EngravingView[] {
  const mon = findMon(save, uid), known = new Set([...mon.skills, ...mon.learned]), equipped = equippedEngravingCounts(save);
  return engravings
    .filter(def => (!def.species.length || def.species.includes(mon.species)) && (def.slot === 'ability' || def.moveIds!.some(id => known.has(id))))
    .map(def => engravingView(ctx, save, def, mon, equipped));
}
