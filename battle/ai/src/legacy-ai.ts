// The Boss policy: the community "裸伤" model of the period Boss AI (BWIKI 赛尔号PVE概论; jiangshibiao PVE百科全书), adopted
// 2026-10-21 (design/notes/boss-ai-raw-damage-2026-10-21.md): a knockout first; otherwise usually the attack with the highest
// expected damage and sometimes a status move. The project keeps two deviations: a status move that changes nothing is never
// chosen, and no turn is wasted on an attack that cannot hurt the foe while a move that changes something is left. Project
// behavior, not recovered official server code.
import type { Skill } from '../../core/src/types.ts';
import type { Battle } from '../../core/src/engine/battle.ts';
import type { Mon } from '../../core/src/engine/state.ts';
import { BOSS_STATUS_CHANCE, MULTI_HIT_DEFAULT } from '../../core/src/constants.ts';
import { dealsDamage } from '../../core/src/engine/move.ts';
import { hitChance } from './search/evaluate.ts';
import { changesSomething } from './idle-moves.ts';

/** The hit counts the engine draws from for one use (move.ts strike). */
function hitRange(skill: Skill): { min: number; max: number } {
  const multi = (skill.effects ?? []).find((e) => e.op === 'multi_hit');
  if (!multi) return { min: 1, max: 1 };
  const min = multi.min ?? MULTI_HIT_DEFAULT;
  return { min, max: multi.max ?? min };
}

/** The first of `rows` by `order`; ties keep the equipped order. */
const first = <T extends { id: number }>(rows: T[], order: (a: T, b: T) => number): number => [...rows].sort(order)[0].id;

/**
 * A knockout first (highest priority, then most likely to land). Otherwise, while an attack can hurt the foe and a non-attacking
 * move would change something (idle-moves.ts), one RNG value decides: below BOSS_STATUS_CHANCE it picks among those moves,
 * scaled to their number; otherwise, and with no draw when no such move is left, the attack with the highest expected damage
 * (ties to the higher single-hit estimate, then to the equipped order). When no attack can hurt the foe, one RNG value picks
 * among the moves that change something, and among all usable moves only when none is left.
 */
export function legacySmartPick(battle: Battle, mon: Mon, usable: number[]): number {
  const foe = battle.foeOf(mon);
  const scored = usable.map((id) => {
    const s = battle.skill(id), d = battle.estimateDamage(mon, foe, s), hits = hitRange(s);
    // Every hit at the mean roll, weighted by the chance to hit; damage beyond the foe's HP is worth nothing.
    const value = Math.min(foe.hp, d * (hits.min + hits.max) / 2) * hitChance(mon, foe, s);
    return { id, s, d, sure: d * hits.min, value, pri: battle.priority(mon, s) };
  });
  const kos = scored.filter((x) => x.d > 0 && x.sure >= foe.hp);
  if (kos.length) return first(kos, (a, b) => b.pri - a.pri || b.value - a.value || b.d - a.d);
  const attacks = scored.filter((x) => x.d > 0);
  const useful = scored.filter((x) => !dealsDamage(battle, x.s) && changesSomething(battle, mon, foe, x.s));
  if (!attacks.length) return battle.rng.pick(useful.length ? useful : scored).id;
  if (useful.length) {
    const roll = battle.rng.next();
    if (roll < BOSS_STATUS_CHANCE) return useful[Math.floor((roll / BOSS_STATUS_CHANCE) * useful.length)].id;
  }
  return first(attacks, (a, b) => b.value - a.value || b.d - a.d);
}
