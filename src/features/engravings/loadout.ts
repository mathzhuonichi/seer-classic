// Engraving state per monster, and the battle-only HP/PP bonus it grants.
import type { DataSet } from '../../../battle/core/src/index.ts';
import type { Monster } from '../../../raising/core/index.ts';
import type { GameSave } from '../../kernel/api.ts';
import { engravingAccess } from '../../domain/engravings/engraving-access.ts';
import {
  activeEngravings, engravingById, engravingSkillOverrides, engravingStatBonus, type EngravingHolder,
} from '../../domain/engravings/engravings.ts';

export const engravingHolder = (mon: Monster): EngravingHolder => ({ species: mon.species, level: mon.level, skills: mon.skills, learned: mon.learned });
export const equippedEngravings = (save: GameSave, uid: string) => save.game.modules[uid]?.engravings ?? [];

/** Equipped copies per engraving across every monster; owned = stock + equipped, capped by the original Max. */
export function equippedEngravingCounts(save: GameSave): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const mods of Object.values(save.game.modules)) for (const id of mods.engravings ?? []) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

/** Battle-only engraving effects. Saved HP and PP stay on the unengraved scale. */
export function engravingLoadout(save: GameSave, data: DataSet, mon: Monster) {
  const active = activeEngravings(equippedEngravings(save, mon.uid), engravingHolder(mon));
  const bonus = engravingStatBonus(active), overrides = engravingSkillOverrides(active, id => data.skills.get(id));
  const ppBonus: Record<string, number> = Object.fromEntries(
    Object.entries(overrides ?? {}).map(([id, skill]) => [id, skill.pp - data.skills.get(Number(id))!.pp]),
  );
  const deficit = save.game.modules[mon.uid]?.engravingDeficit ?? { hp: 0, pp: {} };
  return { bonus, overrides, ppBonus, hpBonus: bonus.hp ?? 0, deficit };
}

/**
 * Retain spent bonus resources when an engraving is removed or temporarily inactive.
 * Only the currently available bonus is used; an inactive bonus never reduces base HP/PP.
 */
export function settleEngravingResource(current: number, baseMax: number, bonus: number, deficit: number, floor: number) {
  const base = Math.max(floor, Math.min(baseMax, current - bonus + Math.min(deficit, bonus)));
  // Actual recovery into the current bonus takes precedence over an old larger
  // engraving's dormant shortfall; otherwise settlement would lose healed HP/PP.
  const dormant = base < current ? 0 : Math.max(0, deficit - bonus);
  return { base, deficit: Math.max(0, base + bonus - current) + dormant };
}

/** A released monster's engravings: finite copies go back to stock (ownership is unchanged), and its engraving state is dropped. */
export function releaseEngravings(save: GameSave, uid: string) {
  const stock = save.game.engravingStock;
  for (const id of equippedEngravings(save, uid)) {
    const def = engravingById(id);
    if (def && !engravingAccess(def).unlimited) stock[id] = (stock[id] ?? 0) + 1;
  }
  delete save.game.modules[uid];
}

export function clearEngravingDeficit(save: GameSave, uid: string) {
  if (save.game.modules[uid]) delete save.game.modules[uid].engravingDeficit;
}
