// The condition language (`when` objects) of effects, hooks and phases (RULES.md section 9).

import type { When } from '../types.ts';
import type { Battle } from './battle.ts';
import type { Mon, WhenCtx } from './state.ts';
import { hasAttackType, typeIdentity } from '../typechart.ts';

type Test = (b: Battle, c: WhenCtx, v: any) => boolean;

const hasStatus = (m: Mon | undefined, s: unknown) =>
  !!m && m.conditions.some((x) => x.def.kind === 'status' && (s === 'any' || s === true || x.id === s || (Array.isArray(s) && s.includes(x.id))));
const pct = (m: Mon | undefined) => (m ? (m.hp / m.maxHp) * 100 : 0);
const typed = (m: Mon, v: unknown) => Array.isArray(v) ? v.some((t) => m.types.includes(t)) : m.types.includes(v as string);
const up = (m: Mon) => Object.values(m.stages).some((s) => s > 0);
const down = (m: Mon) => Object.values(m.stages).some((s) => s < 0);
const actedFirst = (b: Battle, c: WhenCtx) => !!(c.ctx?.actedFirst ?? c.actedFirst ?? b.turnOrder[0] === c.self.side);

const TESTS: Record<string, Test> = {
  self_status: (_b, c, v) => hasStatus(c.self, v),
  foe_status: (_b, c, v) => hasStatus(c.foe, v),
  self_no_status: (_b, c) => !hasStatus(c.self, 'any'),
  foe_no_status: (_b, c) => !hasStatus(c.foe, 'any'),
  self_condition: (_b, c, v) => c.self.conditions.some((x) => x.id === v),
  foe_condition: (_b, c, v) => !!c.foe?.conditions.some((x) => x.id === v),
  self_hp_below_pct: (_b, c, v) => pct(c.self) < v,
  self_hp_below: (_b, c, v) => c.self.hp < v,
  self_hp_above_pct: (_b, c, v) => pct(c.self) > v,
  foe_hp_below_pct: (_b, c, v) => pct(c.foe) < v,
  foe_hp_above_pct: (_b, c, v) => pct(c.foe) > v,
  first_turn: (_b, c, v) => (c.self.turnsActive <= 1) === v,
  foe_type: (_b, c, v) => !!c.foe && typed(c.foe, v),
  self_type: (_b, c, v) => typed(c.self, v),
  acted_first: (b, c, v) => actedFirst(b, c) === v,
  acted_last: (b, c, v) => !actedFirst(b, c) === v,
  crit: (_b, c, v) => !!c.ctx?.crit === v,
  hit: (_b, c, v) => !!c.ctx?.hit === v,
  super_effective: (_b, c, v) => ((c.ctx?.effectiveness ?? 1) > 1) === v,
  self_stage_up: (_b, c, v) => up(c.self) === v,
  foe_stage_up: (_b, c, v) => !!c.foe && up(c.foe) === v,
  self_stage_down: (_b, c, v) => down(c.self) === v,
  foe_stage_down: (_b, c, v) => !!c.foe && down(c.foe) === v,
  turn: (b, _c, v) => b.turn === v,
  turn_ge: (b, _c, v) => b.turn >= v,
  turn_le: (b, _c, v) => b.turn <= v,
  lives_left: (_b, c, v) => c.self.livesLeft === v,
  on_faint: (_b, c, v) => !!c.onFaint === v,
  category: (_b, c, v) => { const sk = c.skill ?? c.ctx?.skill; return !!sk && (Array.isArray(v) ? v.includes(sk.category) : sk.category === v); },
  skill_type: (b, c, v) => {
    const sk = c.skill ?? c.ctx?.skill;
    return !!sk && (Array.isArray(v) ? v : [v]).some(type => hasAttackType(b.data.types, sk.type, type));
  },
  /** The skill's type is exactly `v`: a single type does not match a dual-type skill containing it. */
  skill_type_exact: (b, c, v) => {
    const sk = c.skill ?? c.ctx?.skill;
    return !!sk && typeIdentity(b.data.types, sk.type) === typeIdentity(b.data.types, v);
  },
  damage_kind: (_b, c, v) => Array.isArray(v) ? v.includes(c.kind) : c.kind === v,
  speed_faster: (b, c, v) => !!c.foe && (b.effStat(c.self, 'spe') > b.effStat(c.foe, 'spe')) === v,
  all: (b, c, v) => (v as When[]).every((w) => b.evalWhen(w, c)),
  any: (b, c, v) => (v as When[]).some((w) => b.evalWhen(w, c)),
  not: (b, c, v) => !b.evalWhen(v as When, c),
};

/** True when every key of `when` holds; an unknown key is a warning and fails. */
export function evalWhen(b: Battle, when: When | undefined, c: WhenCtx): boolean {
  if (!when) return true;
  for (const [k, v] of Object.entries(when)) {
    const test = Object.hasOwn(TESTS, k) ? TESTS[k] : undefined;
    if (!test) { b.warn(`unknown when key ${k}`); return false; }
    if (!test(b, c, v)) return false;
  }
  return true;
}
