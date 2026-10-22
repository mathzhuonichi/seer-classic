// A read-only check of what a move would change at this moment, for the Boss policy (RULES.md 10.4): whether it provably changes
// nothing, so that the Boss neither picks it as a status move nor spends a no-damage turn on it. It follows the engine's own
// refusals (effects.ts changeStage, conditions.ts applyStatus and addCondition); what it does not model, such as script effects
// and scripted refusals, counts as a change.

import type { ConditionDef, EffectOp, Skill, StageKey } from '../../core/src/types.ts';
import type { Battle } from '../../core/src/engine/battle.ts';
import type { Mon } from '../../core/src/engine/state.ts';
import { STAGE_MAX, STAGE_MIN } from '../../core/src/constants.ts';
import { defaultTarget, MODIFIER_OPS, stageDropRefused } from '../../core/src/engine/effects.ts';
import { findRule, hasRule } from '../../core/src/engine/rules.ts';

const effectOps = (skill: Skill): EffectOp[] => (skill.effects ?? []).filter((op) => !MODIFIER_OPS.has(op.op));
const targetOf = (user: Mon, foe: Mon, op: EffectOp): Mon => ((op.target ?? defaultTarget(op.op)) === 'self' ? user : foe);

/** False when every effect of `skill`, used by `user` against `foe`, provably changes nothing now. */
export function changesSomething(b: Battle, user: Mon, foe: Mon, skill: Skill): boolean {
  return effectOps(skill).some((op) => opChangesSomething(b, user, targetOf(user, foe, op), op, skill));
}

function opChangesSomething(b: Battle, user: Mon, target: Mon, op: EffectOp, skill: Skill): boolean {
  const byFoe = target !== user;
  switch (op.op) {
    case 'stat_stage':
      return Object.entries(op.stats as Record<StageKey, number>).some(([stat, delta]) => stageMoves(b, target, stat as StageKey, delta, byFoe, skill));
    case 'status':
      return (Array.isArray(op.status) ? op.status : [op.status]).some((status: string) => statusLands(b, target, status, byFoe));
    case 'heal':
      return target.hp < target.maxHp;
    case 'clear_stages': {
      const which = op.which ?? 'all';
      return Object.values(target.stages).some((v) => (which !== 'down' && v > 0) || (which !== 'up' && v < 0));
    }
    case 'cure_status':
      return target.conditions.some((c) => c.def.kind === 'status' && (!op.statuses || op.statuses.includes(c.id)));
    case 'add_condition': {
      const def = b.data.conditions.get(op.condition);
      return !!def && !target.fainted && !repeatFails(target, def);
    }
    default:
      return true;
  }
}

/** A stage change by `skill` that is neither at its cap nor refused by the rules changeStage applies. */
function stageMoves(b: Battle, mon: Mon, stat: StageKey, delta: number, byFoe: boolean, skill: Skill): boolean {
  if (mon.fainted || !delta) return false;
  if (delta > 0) {
    const foe = b.foeOf(mon);
    return mon.stages[stat] < STAGE_MAX && !(foe.persist.foeCannotBoost && !foe.fainted);
  }
  const refused = byFoe && stageDropRefused(b, mon, stat, skill);
  return mon.stages[stat] > STAGE_MIN && !refused;
}

/** A status `mon` does not already have and that no immunity, rule or hook refuses (applyStatus). */
function statusLands(b: Battle, mon: Mon, status: string, byFoe: boolean): boolean {
  const def = b.data.conditions.get(status);
  if (!def || mon.fainted || repeatFails(mon, def)) return false;
  if (status === 'leech' && mon.types.includes('grass')) return false;
  const side = b.sides[mon.side];
  if (byFoe && (hasRule(side, 'immune_status', mon)
    || findRule(side, mon, (r) => r.rule === 'immune_status_list' && !!r.statuses?.includes(status)))) return false;
  return !b.hooks(mon, 'block_status').some((h) => !h.statuses || h.statuses.includes(status));
}

/** The condition is already on `mon` and does not stack (addCondition's default for a status). */
function repeatFails(mon: Mon, def: ConditionDef): boolean {
  return mon.conditions.some((c) => c.id === def.id) && (def.stack ?? (def.kind === 'status' ? 'fail' : 'refresh')) === 'fail';
}
