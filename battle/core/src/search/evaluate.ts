// Position evaluation, in "monsters" from one side's view (design note section 6).
import type { AiSpec, Skill } from '../types.ts';
import type { Battle } from '../engine/battle.ts';
import type { Mon } from '../engine/state.ts';
import { accuracyStageMultiplier } from '../constants.ts';

/** Value of a living monster beyond its HP share: a knockout is worth more than its HP. */
const ALIVE = 0.35;
/** Weight of the projected one-on-one exchange at the horizon. */
const RACE = 0.5;
/** Control style: value per remaining control turn, the turns counted, and the cap. */
const CONTROL_TURNS = 2, CONTROL_CAP = 0.3;
/** Value of one unused shared-critical charge when no opponent is in to spend it on. */
const IDLE_CHARGE = 0.15;

export interface Weights { ownHp: number; race: number; control: number }
const STYLE: Record<NonNullable<AiSpec['style']>, Weights> = {
  balanced: { ownHp: 1, race: RACE, control: 0 },
  offense: { ownHp: .85, race: RACE * 1.3, control: 0 },
  control: { ownHp: 1, race: RACE, control: .15 },
  attrition: { ownHp: 1.2, race: RACE, control: 0 },
};
export const styleWeights = (ai: AiSpec | undefined): Weights => STYLE[ai?.style ?? 'balanced'];

export const alive = (m: Mon) => !m.fainted && m.hp > 0;
export const worth = (m: Mon, hpWeight = 1) => ALIVE + (1 - ALIVE) * hpWeight * m.hp / Math.max(1, m.maxHp);

export function hitChance(user: Mon, target: Mon, skill: Skill): number {
  if (skill.accuracy === null || skill.accuracy === undefined) return 1;
  return Math.max(0, Math.min(1, skill.accuracy * accuracyStageMultiplier(user.stages.acc - target.stages.eva) / 100));
}
function expectedDamage(b: Battle, user: Mon, target: Mon, skill: Skill): number {
  return skill.category === 'status' ? 0 : b.estimateDamage(user, target, skill) * hitChance(user, target, skill);
}
function bestExpected(b: Battle, user: Mon, target: Mon): number {
  return Math.max(0, ...user.skills.filter(id => user.pp[id] > 0).map(id => expectedDamage(b, user, target, b.skill(id, user))));
}

/** Projected material swing of the one-on-one exchange that continues from here. */
export function race(b: Battle, x: Mon, y: Mon): number {
  const dx = bestExpected(b, x, y), dy = bestExpected(b, y, x);
  const tx = dx > 0 ? Math.ceil(y.hp / dx) : Infinity, ty = dy > 0 ? Math.ceil(x.hp / dy) : Infinity;
  if (tx === Infinity && ty === Infinity) return 0;
  const outcome = (xFirst: boolean) => {
    if (xFirst ? tx <= ty : tx < ty) {
      const taken = Math.min(x.hp, (xFirst ? tx - 1 : tx) * dy);
      return worth(y) - (1 - ALIVE) * taken / x.maxHp;
    }
    const dealt = Math.min(y.hp, (xFirst ? ty : ty - 1) * dx);
    return -worth(x) + (1 - ALIVE) * dealt / y.maxHp;
  };
  const sx = b.effStat(x, 'spe'), sy = b.effStat(y, 'spe');
  return sx === sy ? (outcome(true) + outcome(false)) / 2 : outcome(sx > sy);
}

/** Shared critical charges that the horizon has not yet spent (design note 7.3). */
function giftResidual(b: Battle, me: 0 | 1): number {
  const charges = (m: Mon) => m.conditions.find(c => c.id === 'seer_eff_71')?.data?.pool?.left ?? 0;
  const holders = b.sides[me].team.filter(m => alive(m) && charges(m) > 0);
  if (!holders.length) return 0;
  const left: number = charges(holders[0]), foe = b.active((1 - me) as 0 | 1);
  if (!alive(foe)) return left * IDLE_CHARGE;
  const extra = Math.max(...holders.map(m => bestExpected(b, m, foe)));
  return left * (1 - ALIVE) * Math.min(foe.hp, extra) / foe.maxHp;
}

export function evaluate(b: Battle, me: 0 | 1, weights: Weights): number {
  const foe = (1 - me) as 0 | 1;
  let value = 0;
  for (const m of b.sides[me].team) if (alive(m)) value += worth(m, weights.ownHp);
  for (const m of b.sides[foe].team) if (alive(m)) value -= worth(m);
  const mine = b.active(me), theirs = b.active(foe);
  if (alive(mine) && alive(theirs)) {
    value += weights.race * race(b, mine, theirs);
    if (weights.control) {
      const held = theirs.conditions.filter(c => c.def.control && c.turns > 0).reduce((n, c) => Math.max(n, Math.min(CONTROL_TURNS, c.turns)), 0);
      value += Math.min(CONTROL_CAP, weights.control * held);
    }
  }
  return value + giftResidual(b, me);
}
