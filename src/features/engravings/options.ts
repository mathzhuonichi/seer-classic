// Engravings as they apply to one monster: what each does for it, whether it takes effect and how it can be equipped.
import { findMon, type Monster } from '../../../raising/core/index.ts';
import type { GameContext, GameSave } from '../../kernel/api.ts';
import { engravingAccess, equipMode } from '../../domain/engravings/engraving-access.ts';
import { engravingBlockedReason, engravingEffectGroup, engravings, engravingStatKeys, type EngravingDefinition } from '../../domain/engravings/engravings.ts';
import type { EngravingView } from '../../shared/views.ts';
import { engravingHolder, equippedEngravingCounts, equippedEngravings } from './loadout.ts';

type Holder = { uid: string; name: string };
/** Equipped copies per engraving, and its holders in storage order. */
interface Ledger { counts: Record<string, number>; holders: Map<string, Holder[]> }

function engravingLedger(ctx: GameContext, save: GameSave): Ledger {
  const holders = new Map<string, Holder[]>();
  for (const mon of save.storage) for (const id of equippedEngravings(save, mon.uid)) {
    holders.set(id, [...holders.get(id) ?? [], { uid: mon.uid, name: mon.nickname || ctx.speciesName(mon.species) }]);
  }
  return { counts: equippedEngravingCounts(save), holders };
}

export function engravingView(
  ctx: GameContext, save: GameSave, def: EngravingDefinition, mon: Monster, ledger = engravingLedger(ctx, save),
): EngravingView {
  const reason = engravingBlockedReason(def, engravingHolder(mon)), access = engravingAccess(def);
  const moveName = def.moveIds?.map(id => ctx.data.skills.get(id)?.name.zh).filter(Boolean).join('、');
  const holders = ledger.holders.get(def.id) ?? [], others = holders.filter(holder => holder.uid !== mon.uid);
  const stock = save.game.engravingStock[def.id] ?? 0, equipped = ledger.counts[def.id] ?? 0, owned = stock + equipped;
  const equippedHere = equippedEngravings(save, mon.uid).includes(def.id);
  const mode = equippedHere ? 'blocked' : equipMode(def, stock, equipped, others.length);
  return {
    id: def.id, name: def.name.zh, slot: def.slot, effect: def.effect.desc, levelMin: def.levelMin, bound: def.species.length > 0,
    moveName: moveName || undefined, moveIds: def.moveIds,
    group: engravingEffectGroup(def), statKeys: engravingStatKeys(def), era: def.era, ready: !reason, reason, note: def.notes?.join(' '),
    ...access, stock, equipped, equippedHere, equippedHolders: holders,
    equipMode: mode, ...(mode === 'transfer' ? { transferFrom: others } : {}), owned, canBuy: !access.unlimited && owned < access.maxOwned,
  };
}

/** Engravings this monster's species and known skills qualify for. */
export function engravingOptions(ctx: GameContext, save: GameSave, uid: string): EngravingView[] {
  const mon = findMon(save, uid), known = new Set([...mon.skills, ...mon.learned]), ledger = engravingLedger(ctx, save);
  return engravings
    .filter(def => (!def.species.length || def.species.includes(mon.species)) && (def.slot === 'ability' || def.moveIds!.some(id => known.has(id))))
    .map(def => engravingView(ctx, save, def, mon, ledger));
}
