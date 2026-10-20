// The Boss policy: the project's pre-tactical policy from d7e87e9 (a knockout first, each status move once, then the
// strongest attack), refined after the 2026-10-19 playtest: attacks are ranked by expected damage, a status move is used
// again once its effect has been undone (厄尔塞拉 re-boosting after 叶绿光束, as the period guides fought it), and no turn
// is wasted on an attack that cannot hurt the foe while a move that changes something is left. Project behavior, not
// recovered official server code.
import type { Skill } from '../../core/src/types.ts';
import type { Battle } from '../../core/src/engine/battle.ts';
import type { Mon } from '../../core/src/engine/state.ts';
import { MULTI_HIT_DEFAULT } from '../../core/src/constants.ts';
import { dealsDamage } from '../../core/src/engine/move.ts';
import { hitChance } from './search/evaluate.ts';
import { changesSomething, effectUndone } from './idle-moves.ts';

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
 * A knockout first (highest priority, then most likely to land); otherwise the first status move not used yet or whose
 * effect has been undone (idle-moves.ts effectUndone); otherwise the attack with the highest expected damage. Remaining
 * ties go to the higher single-hit estimate, then to the equipped order. When no attack can hurt the foe, a move that
 * still changes something, drawn with one RNG value; only when none is left, any usable move.
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
  const setup = scored.find((x) => x.s.category === 'status' && (!mon.usedSkills.has(x.id) || effectUndone(battle, mon, foe, x.s)));
  if (setup) return setup.id;
  const attacks = scored.filter((x) => x.d > 0);
  if (attacks.length) return first(attacks, (a, b) => b.value - a.value || b.d - a.d);
  const useful = scored.filter((x) => !dealsDamage(battle, x.s) && changesSomething(battle, mon, foe, x.s));
  return battle.rng.pick(useful.length ? useful : scored).id;
}
