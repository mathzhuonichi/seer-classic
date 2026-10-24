// Using a skill (RULES.md section 4): can-act checks, PP, the foe's reactions,
// accuracy, the damaging hits and the skill's effects.

import type { Hook, Skill } from '../types.ts';
import type { Battle } from './battle.ts';
import type { ActiveCondition, Mon, MoveCtx } from './state.ts';
import * as C from '../constants.ts';
import { STRUGGLE_SKILL } from '../constants.ts';
import { fire, runHookEffects, skillScripts } from './conditions.ts';
import { inferTarget } from './effects.ts';
import { beginHitTrace, recordHit } from './journal.ts';
import { checkEnd, hasRule, ignoresProtection } from './rules.ts';

export function priority(b: Battle, mon: Mon, skill: Skill): number {
  let p = skill.priority ?? 0;
  const foe = b.foeOf(mon);
  for (const op of skill.effects ?? []) {
    if (op.op === 'priority_if' && b.evalWhen(op.when, { self: mon, foe })) p = op.priority;
    if (op.op === 'script') {
      const r = b.script(op.id)?.priority?.({ battle: b, user: mon, foe, skill }, op.params);
      if (typeof r === 'number') p = r;
    }
  }
  for (const r of b.fire(mon, 'modify_priority', { skill, priority: p })) if (typeof r === 'number') p = r;
  return p;
}

/** A skill that deals attack damage: a powered physical or special skill. */
export function dealsDamage(b: Battle, skill: Skill): boolean {
  return skill.category !== 'status' && (skill.power > 0 ||
    (skill.effects ?? []).some((e) => (e.op === 'power_if' && e.power) || (e.op === 'script' && b.script(e.id)?.power)));
}

export function isAttackSkill(b: Battle, mon: Mon, id: number): boolean {
  return dealsDamage(b, b.skill(id, mon));
}

export function useMove(b: Battle, user: Mon, target: Mon, skill: Skill, actedFirst: boolean): void {
  // Complete the move's recoil, drain and other effects before deciding a KO result.
  b.damageDepth++;
  try { performMove(b, user, target, skill, actedFirst); }
  finally {
    b.damageDepth--;
    if (b.damageDepth === 0) checkEnd(b);
  }
}

function performMove(b: Battle, user: Mon, target: Mon, skill: Skill, actedFirst: boolean): void {
  // This explicit encounter policy guarantees the next attack while active.
  // Re-evaluate current HP so healing above the threshold ends the mode.
  const execution = b.forcedExecution(user);
  if (execution && !isAttackSkill(b, user, skill.id)) {
    const attack = user.skills.find(id => user.pp[id] > 0 && isAttackSkill(b, user, id));
    skill = attack === undefined ? STRUGGLE_SKILL : b.skill(attack, user);
  }
  if (!execution && !canAct(b, user, target, skill)) return;
  spendPp(b, user, target, skill);
  b.emit({ type: 'move_used', side: user.side, skill: skill.id, name: skill.name.zh });
  if (execution) {
    b.emit({ type: 'boss_trait', side: user.side, trait: 'forced_execution_below_pct' });
    b.dealDamage(target, target.hp, { kind: 'true', source: user, skill, ohko: true, forcedExecution: true });
    return;
  }
  if (moveFails(b, user)) return;

  const ctx: MoveCtx = { skill, hit: true, crit: false, damageDealt: 0, effectiveness: 1, actedFirst, sureHit: isSureHit(b, user, skill), user, target };
  const targetsFoe = (skill.target ?? (skill.category === 'status' ? inferTarget(skill) : 'foe')) === 'foe';
  if (!reachesTarget(b, user, target, skill, ctx, targetsFoe)) return;
  // The foe's move reached the holder: after accuracy, evasion and blocks, before its damage and effects (RULES.md 4).
  if (targetsFoe) b.fire(target, 'on_foe_hit', { foe: user, skill, ctx });
  if (dealsDamage(b, skill)) {
    strike(b, user, target, skill, ctx, actedFirst);
    if (ctx.effectiveness === 0) {
      b.runEffects(skill.effects ?? [], user, target, ctx, (op) => (op.target ?? 'foe') === 'self');
      return;
    }
  }
  b.runEffects(skill.effects ?? [], user, target, ctx);
  if (ctx.hit && targetsFoe) runHookEffects(b, user, 'on_hit', target, { skill, ctx });
}

/** Preventing statuses and scripts, and Struggle by a Boss: with no PP left it stands still (RULES.md 4, step 2). */
function canAct(b: Battle, user: Mon, target: Mon, skill: Skill): boolean {
  for (const { cond, hook } of b.hooksWithCond(user, 'before_move')) {
    if (hook.prevent) {
      b.emit({ type: 'cant_act', side: user.side, reason: cond.id });
      return false;
    }
  }
  for (const r of b.fire(user, 'before_move', { skill, foe: target })) {
    if (r === 'prevent') { b.emit({ type: 'cant_act', side: user.side, reason: 'script' }); return false; }
  }
  if (skill.id === STRUGGLE_SKILL.id && b.sides[user.side].kind === 'boss') {
    b.emit({ type: 'cant_act', side: user.side, reason: 'no_pp' });
    return false;
  }
  return true;
}

function spendPp(b: Battle, user: Mon, target: Mon, skill: Skill): void {
  let ppCost = hasRule(b.sides[user.side], 'unlimited_pp') ? 0 : (skill.pp_cost ?? 1);
  for (const r of b.fire(user, 'pp_cost', { skill })) if (typeof r === 'number') ppCost = r;
  for (const { entry, op } of skillScripts(b, skill)) {
    const r = entry.ppCost?.({ battle: b, user, foe: target, skill }, op.params);
    if (typeof r === 'number') ppCost = r;
  }
  if (skill.id !== STRUGGLE_SKILL.id) user.pp[skill.id] = Math.max(0, user.pp[skill.id] - ppCost);
  user.usedSkills.add(skill.id);
  user.streak = user.streak.skill === skill.id && user.lastActedTurn === b.turn && user.streak.turn === b.turn - 1
    ? { skill: skill.id, count: user.streak.count + 1, turn: b.turn }
    : { skill: skill.id, count: 1, turn: b.turn };
  user.skillUses[skill.id] = (user.skillUses[skill.id] ?? 0) + 1;
}

/** Chance-based failure (混乱), with its optional self-damage. */
function moveFails(b: Battle, user: Mon): boolean {
  for (const { cond, hook } of b.hooksWithCond(user, 'before_move')) {
    if (hook.fail_chance && b.rng.chance(hook.fail_chance)) {
      b.emit({ type: 'move_failed', side: user.side, reason: cond.id });
      if (hook.self_damage && b.rng.chance(hook.self_damage.chance)) {
        b.dealDamage(user, hook.self_damage.amount, { kind: 'fixed' });
      }
      return true;
    }
  }
  return false;
}

/** The foe's reaction to the move, protection and accuracy; false when the move ends here. */
function reachesTarget(b: Battle, user: Mon, target: Mon, skill: Skill, ctx: MoveCtx, targetsFoe: boolean): boolean {
  const ignored = (cond: ActiveCondition, hook: Hook) => ignoresProtection(user, cond, hook);
  // the foe reacts to the move being used (e.g. 封印属性技能); a negation the user ignores does not stop it
  for (const r of fire(b, target, 'on_foe_move', { foe: user, skill, ctx, targetsHolder: targetsFoe }, ignored)) {
    if (r === 'negate') { b.emit({ type: 'move_failed', side: user.side, reason: 'negated' }); return false; }
    if (r === 'miss') { missed(b, user, target, skill, ctx); return false; }
  }
  if (!targetsFoe) return true;
  if (b.hooksWithCond(target, 'block_move').some(({ cond, hook }) => !ignored(cond, hook))) {
    b.emit({ type: 'protected', side: target.side });
    return false;
  }
  let hit = rollAccuracy(b, user, target, skill, ctx);
  if (hit) {
    for (const r of fire(b, target, 'before_hit', { foe: user, skill, ctx }, ignored)) {
      if (r === 'evade') hit = false;
      if (r === 'block') { b.emit({ type: 'protected', side: target.side }); return false; }
    }
  }
  if (!hit) missed(b, user, target, skill, ctx);
  return hit;
}

/** 必中 (RULES.md 4): the one definition. The accuracy roll, the evasion shields and the Boss rules read it through `MoveCtx.sureHit`. */
export function isSureHit(b: Battle, user: Mon, skill: Skill): boolean {
  return skill.accuracy === null || b.hooks(user, 'modify_accuracy').some((h) => h.force_hit);
}

function rollAccuracy(b: Battle, user: Mon, target: Mon, skill: Skill, ctx: MoveCtx): boolean {
  let forced: boolean | undefined;
  for (const { entry, op } of skillScripts(b, skill)) {
    const r = entry.accuracy?.({ battle: b, user, foe: target, skill, ctx }, op.params);
    if (typeof r === 'boolean') forced = r;
  }
  if (forced !== undefined) return forced;
  if (ctx.sureHit) return true;
  let acc = skill.accuracy! * C.accuracyStageMultiplier(user.stages.acc - target.stages.eva);
  for (const h of b.hooks(user, 'modify_accuracy')) acc = acc * (h.multiplier ?? 1) + (h.add_percent ?? 0);
  for (const h of b.hooks(target, 'modify_accuracy_taken')) acc = acc * (h.multiplier ?? 1) - (h.add_percent ?? 0);
  return b.rng.chance(acc);
}

function missed(b: Battle, user: Mon, target: Mon, skill: Skill, ctx: MoveCtx): void {
  ctx.hit = false;
  b.emit({ type: 'miss', side: user.side, skill: skill.id });
  for (const { entry, op } of skillScripts(b, skill)) entry.onMiss?.({ battle: b, user, foe: target, skill, ctx }, op.params);
  b.fire(user, 'on_miss', { foe: target, skill });
  b.fire(target, 'on_foe_miss', { foe: user, skill });
}

/** Every hit of a damaging skill, then the critical-hit defence clearing. */
function strike(b: Battle, user: Mon, target: Mon, skill: Skill, ctx: MoveCtx, actedFirst: boolean): void {
  const multi = (skill.effects ?? []).find((e) => e.op === 'multi_hit');
  const range = multi && C.multiHitRange(multi);
  const hits = range ? b.rng.int(range.min, range.max) : 1;
  let landed = 0;
  let criticalDamage = false;
  for (let h = 0; h < hits && !target.fainted && !user.fainted; h++) {
    const hit = oneHit(b, user, target, skill, ctx, h, actedFirst);
    if (!hit) break;
    ctx.damageDealt += hit.dealt;
    criticalDamage ||= hit.crit && hit.dealt > 0;
    landed++;
  }
  if (hits > 1) b.emit({ type: 'multi_hit', side: user.side, hits: landed });
  if (criticalDamage) clearCriticalDefence(b, target, skill, ctx);
}

/** One hit, journaled; null when the target is immune. */
function oneHit(b: Battle, user: Mon, target: Mon, skill: Skill, ctx: MoveCtx, hitIndex: number, actedFirst: boolean): { crit: boolean; dealt: number } | null {
  // Journal: snapshot and static opacity before the hit; the damage pipeline adds the rest.
  const trace = beginHitTrace(b, user, target, skill);
  const outer = b.hitTrace;
  b.hitTrace = trace;
  let r!: ReturnType<Battle['calcAttack']>;
  let dealt!: number;
  try {
    r = b.calcAttack(user, target, skill, ctx);
    ctx.effectiveness = r.effectiveness;
    if (r.effectiveness === 0) {
      b.emit({ type: 'immune', side: target.side, skill: skill.id });
      return null;
    }
    ctx.crit = ctx.crit || r.crit;
    let dmg = r.damage;
    for (const { entry, op } of skillScripts(b, skill)) {
      const m = entry.modifyDamage?.({ battle: b, user, foe: target, skill, ctx }, op.params, dmg);
      if (typeof m === 'number') dmg = m;
    }
    dealt = b.dealDamage(target, dmg, { kind: 'attack', source: user, skill, crit: r.crit, effectiveness: r.effectiveness, sureHit: ctx.sureHit });
  } finally {
    b.hitTrace = outer;
  }
  recordHit(b, trace, skill, r, hitIndex, actedFirst);
  return { crit: r.crit, dealt };
}

/**
 * Classic critical hits use the boosted defence for this attack, then remove
 * only the corresponding positive defence stage. For multi-hit moves, clear once
 * after the damage sequence; exact historical per-hit timing is unverified
 * (design/notes/damage-formula-research.md).
 */
function clearCriticalDefence(b: Battle, target: Mon, skill: Skill, ctx: MoveCtx): void {
  const defenceStat = skill.category === 'physical' ? 'def' : 'spd';
  const defenceStage = target.stages[defenceStat];
  if (target.fainted || !(defenceStage > 0)) return;
  const blocked = b.fire(target, 'on_stage_incoming', { stat: defenceStat, delta: -defenceStage, byFoe: true, clear: true, skill, ctx }).includes(false);
  if (blocked) b.emit({ type: 'stage_blocked', side: target.side, stat: defenceStat });
  else {
    target.stages[defenceStat] = 0;
    b.emit({ type: 'stat_stage', side: target.side, name: target.name, stat: defenceStat, delta: -defenceStage, stage: 0, reason: 'critical' });
  }
}
