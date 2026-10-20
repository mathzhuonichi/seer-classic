// Read-only checks of what a move would change at this moment, for the Boss policy (RULES.md 10.4): whether it provably
// changes nothing (the no-damage fallback) and whether a status move's effect has been undone (its reuse). They follow the
// engine's own refusals (effects.ts changeStage, conditions.ts applyStatus and addCondition); what they do not model, such as
// script effects and scripted refusals, counts as a change and is never reused.

import type { ConditionDef, EffectOp, Skill, StageKey } from '../../core/src/types.ts';
import type { Battle } from '../../core/src/engine/battle.ts';
import type { Mon } from '../../core/src/engine/state.ts';
import { STAGE_MAX, STAGE_MIN } from '../../core/src/constants.ts';
import { defaultTarget, healAmount, MODIFIER_OPS } from '../../core/src/engine/effects.ts';
import { findRule, hasRule } from '../../core/src/engine/rules.ts';

const effectOps = (skill: Skill): EffectOp[] => (skill.effects ?? []).filter((op) => !MODIFIER_OPS.has(op.op));
const targetOf = (user: Mon, foe: Mon, op: EffectOp): Mon => ((op.target ?? defaultTarget(op.op)) === 'self' ? user : foe);

/** False when every effect of `skill`, used by `user` against `foe`, provably changes nothing now. */
export function changesSomething(b: Battle, user: Mon, foe: Mon, skill: Skill): boolean {
  return effectOps(skill).some((op) => opChangesSomething(b, user, targetOf(user, foe, op), op));
}

/**
 * True when a status move's effect is no longer in place and using it again would put it back: a self-boost none of whose
 * raised stages is above 0, a status or condition its target no longer has and can get again, a condition on the user that
 * has expired, a heal whose whole amount the user is missing. Every part of the effect must be gone; the user's own stage
 * drops and statuses are the move's cost, not its effect. Any other effect (a script, a stage drop on the foe, a condition
 * spent by charges, a conditional op, a heal by damage dealt) is not renewed, so such a move stays used once.
 */
export function effectUndone(b: Battle, user: Mon, foe: Mon, skill: Skill): boolean {
  const parts = effectOps(skill).map((op) => effectState(b, user, targetOf(user, foe, op), op));
  if (parts.includes(ONCE)) return false;
  const effects = parts.filter((part): part is EffectState => part !== COST);
  return effects.some((part) => part.restorable) && !effects.some((part) => part.standing);
}

interface EffectState { standing: boolean; restorable: boolean }
const COST = 'cost', ONCE = 'once';

function effectState(b: Battle, user: Mon, target: Mon, op: EffectOp): EffectState | typeof COST | typeof ONCE {
  const byFoe = target !== user;
  if (op.when) return ONCE;
  const restorable = () => opChangesSomething(b, user, target, op), has = (id: string) => target.conditions.some((c) => c.id === id);
  switch (op.op) {
    case 'stat_stage': {
      if (byFoe) return ONCE;
      const raised = (Object.entries(op.stats) as [StageKey, number][]).filter(([, delta]) => delta > 0);
      return raised.length ? {
        standing: raised.some(([stat]) => target.stages[stat] > 0),
        restorable: raised.some(([stat, delta]) => stageMoves(b, target, stat, delta, false)),
      } : COST;
    }
    case 'status':
      return byFoe ? { standing: (Array.isArray(op.status) ? op.status : [op.status]).some(has), restorable: restorable() } : COST;
    case 'add_condition':
      // Charges are spent by the foe's moves, not by time: renewing them could take every turn.
      return op.charges === undefined ? { standing: has(op.condition), restorable: restorable() } : ONCE;
    case 'heal': {
      const amount = byFoe ? 0 : healAmount(op, target, 0);
      return amount > 0 ? { standing: target.maxHp - target.hp < amount, restorable: restorable() } : ONCE;
    }
    default:
      return ONCE;
  }
}

function opChangesSomething(b: Battle, user: Mon, target: Mon, op: EffectOp): boolean {
  const byFoe = target !== user;
  switch (op.op) {
    case 'stat_stage':
      return Object.entries(op.stats as Record<StageKey, number>).some(([stat, delta]) => stageMoves(b, target, stat as StageKey, delta, byFoe));
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

/** A stage change that is neither at its cap nor refused by the rules changeStage applies. */
function stageMoves(b: Battle, mon: Mon, stat: StageKey, delta: number, byFoe: boolean): boolean {
  if (mon.fainted || !delta) return false;
  if (delta > 0) {
    const foe = b.foeOf(mon);
    return mon.stages[stat] < STAGE_MAX && !(foe.persist.foeCannotBoost && !foe.fainted);
  }
  const refused = byFoe && (hasRule(b.sides[mon.side], 'immune_stage_down', mon) || b.hooks(mon, 'block_stage_down').length > 0);
  return mon.stages[stat] > STAGE_MIN && !refused;
}

/** A status `mon` does not already have and that no immunity, rule or hook refuses (applyStatus). */
function statusLands(b: Battle, mon: Mon, status: string, byFoe: boolean): boolean {
  const def = b.data.conditions.get(status);
  if (!def || mon.fainted || repeatFails(mon, def)) return false;
  if (status === 'leech' && mon.types.includes('grass')) return false;
  const side = b.sides[mon.side];
  if (byFoe && (hasRule(side, 'immune_status', mon) || findRule(side, mon, (r) => r.rule === 'immune_status_list')?.statuses?.includes(status))) return false;
  return !b.hooks(mon, 'block_status').some((h) => !h.statuses || h.statuses.includes(status));
}

/** The condition is already on `mon` and does not stack (addCondition's default for a status). */
function repeatFails(mon: Mon, def: ConditionDef): boolean {
  return mon.conditions.some((c) => c.id === def.id) && (def.stack ?? (def.kind === 'status' ? 'fail' : 'refresh')) === 'fail';
}
