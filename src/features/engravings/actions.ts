// Action handlers for buying, equipping and moving engravings.
import { findMon } from '../../../raising/core/index.ts';
import { engravingAccess, equipMode } from '../../domain/engravings/engraving-access.ts';
import { engravingBlockedReason, engravingById, ENGRAVING_SLOTS, type EngravingDefinition } from '../../domain/engravings/engravings.ts';
import { engravingHolder, equippedEngravingCounts, equippedEngravings } from './loadout.ts';
import { notice, type ActionHandler, type Feature, type Runtime } from '../../kernel/api.ts';
import type { EngravingsAction } from './feature.ts';


const buyEngraving: ActionHandler<'buyEngraving'> = (rt, action) => {
  const def = engravingById(action.engravingId);
  if (!def) throw new Error('刻印不存在。');
  const access = engravingAccess(def);
  if (access.unlimited) {
    notice(rt, '此刻印可无限装备，请选择适用精灵。');
    return;
  }
  const stock = rt.save.game.engravingStock, owned = (stock[def.id] ?? 0) + (equippedEngravingCounts(rt.save)[def.id] ?? 0);
  if (owned >= access.maxOwned) throw new Error(`${def.name.zh}最多持有 ${access.maxOwned} 个（含已装备）。`);
  stock[def.id] = (stock[def.id] ?? 0) + 1;
  notice(rt, `${def.name.zh} ×1 已放入刻印库存。`);
};

/** The holder a finite engraving moves from: the requested one, else one by its equip mode; undefined takes a copy from stock. */
function transferSource(rt: Runtime, def: EngravingDefinition, uid: string, fromUid: string | undefined): string | undefined {
  const { save } = rt, equipped = equippedEngravingCounts(save)[def.id] ?? 0;
  const holders = save.storage.filter(holder => holder.uid !== uid && equippedEngravings(save, holder.uid).includes(def.id));
  if (fromUid && !holders.some(holder => holder.uid === fromUid)) throw new Error('来源精灵未装备此刻印。');
  const mode = equipMode(def, save.game.engravingStock[def.id] ?? 0, equipped, holders.length), { maxOwned } = engravingAccess(def);
  if (mode === 'blocked') throw new Error(equipped >= maxOwned ? `${def.name.zh}最多同时装备 ${maxOwned} 个。` : `${def.name.zh}库存不足，请先在商城补充。`);
  return fromUid ?? (mode === 'transfer' ? holders[0].uid : undefined);
}

const setEngraving: ActionHandler<'setEngraving'> = (rt, action) => {
  const { save } = rt, mon = findMon(save, action.uid);
  if (!ENGRAVING_SLOTS.includes(action.slot)) throw new Error('刻印槽位不存在。');
  const equipped = equippedEngravings(save, mon.uid), previous = equipped.find(id => engravingById(id)?.slot === action.slot);
  if ((previous ?? null) === action.engravingId) return;
  const def = action.engravingId === null ? undefined : engravingById(action.engravingId), stock = save.game.engravingStock;
  let sourceUid: string | undefined;
  if (action.engravingId !== null) {
    if (!def || def.slot !== action.slot) throw new Error('刻印不存在。');
    const reason = engravingBlockedReason(def, engravingHolder(mon));
    if (reason) throw new Error(`${def.name.zh}：${reason}。`);
    if (!engravingAccess(def).unlimited) sourceUid = transferSource(rt, def, mon.uid, action.fromUid);
  }
  // Finite generic marks move between holders or stock without changing ownership.
  if (previous && !engravingAccess(engravingById(previous)!).unlimited) stock[previous] = (stock[previous] ?? 0) + 1;
  if (sourceUid) {
    save.game.modules[sourceUid] = { ...save.game.modules[sourceUid], engravings: equippedEngravings(save, sourceUid).filter(id => id !== def!.id) };
  }
  else if (def && !engravingAccess(def).unlimited && !--stock[def.id]) delete stock[def.id];
  save.game.modules[mon.uid] = { ...save.game.modules[mon.uid], engravings: [...equipped.filter(id => id !== previous), ...(def ? [def.id] : [])] };
  notice(rt, def ? `${mon.nickname || rt.ctx.speciesName(mon.species)}${sourceUid ? '移装' : '装备'}了${def.name.zh}。` : '已卸下刻印。');
};

export const engravingActions = { buyEngraving, setEngraving } satisfies Feature<EngravingsAction>['actions'];
