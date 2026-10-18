// The observation journal (design/notes/trainer-search-ai-v58.md 12.2): plain data
// about attack hits and move orders, appended as they happen and never read by
// game rules. Every function here only reads battle state, apart from the journal.

import type { Action, HookPoint, JournalOrder, Skill } from '../types.ts';
import type { Battle } from './battle.ts';
import { journalMon, type HitTrace, type Mon } from './state.ts';
import { skillScripts } from './conditions.ts';

const ATTACKER_POINTS: HookPoint[] = ['modify_power', 'modify_damage_dealt', 'modify_damage_outgoing', 'modify_stat'];
const DEFENDER_POINTS: HookPoint[] = ['modify_damage_taken', 'modify_damage_final', 'modify_stat', 'before_hit'];

/** Pure reads: what a public observer could not reproduce about this hit before it is computed. */
export function beginHitTrace(b: Battle, user: Mon, target: Mon, skill: Skill): HitTrace {
  const reasons: string[] = [];
  for (const { entry } of skillScripts(b, skill)) {
    for (const key of ['power', 'modifyDamage', 'finalDamage', 'defense'] as const) if (entry[key]) reasons.push(`script_${key}`);
  }
  if (user.skillOverrides?.[skill.id]) reasons.push('skill_override');
  const scan = (mon: Mon, role: string, points: HookPoint[]) => {
    for (const point of points) for (const { hook } of b.hooksWithCond(mon, point)) {
      if (hook.script) reasons.push(`${role}_${point}_script`);
      else if (hook.when) reasons.push(`${role}_${point}_when`);
    }
  };
  scan(user, 'attacker', ATTACKER_POINTS);
  scan(target, 'defender', DEFENDER_POINTS);
  return { target, reasons, logIndex: b.log.length + b.out.length, attacker: journalMon(user), defender: journalMon(target) };
}

/** Records an opacity reason for the hit being computed, if `target` is its defender. */
export function traceHit(b: Battle, target: Mon, reason: string): void {
  const trace = b.hitTrace;
  if (trace && trace.target === target && trace.damage === undefined) trace.reasons.push(reason);
}

/** Journals a hit that emitted a damage event. */
export function recordHit(b: Battle, trace: HitTrace, skill: Skill, hit: { crit: boolean; effectiveness: number },
  hitIndex: number, actedFirst: boolean): void {
  if (trace.damage === undefined) return;
  const reasons = [...new Set(trace.reasons)];
  b.journal.push({
    type: 'hit', turn: b.turn, logIndex: trace.logIndex, attacker: trace.attacker, defender: trace.defender,
    skill: skill.id, crit: hit.crit, effectiveness: hit.effectiveness, damage: trace.damage, hitIndex,
    actedFirst, opaque: reasons.length > 0, opaqueReasons: reasons,
  });
}

/** Pure reads of the state at ordering time; pushed only if both moves execute. */
export function journalOrder(b: Battle, actions: [Action, Action], order: (0 | 1)[]): JournalOrder | null {
  const note = b.lastOrder;
  if (!note || actions[0].kind !== 'move' || actions[1].kind !== 'move') return null;
  const m0 = b.active(0), m1 = b.active(1);
  return {
    type: 'order', turn: b.turn, logIndex: b.log.length + b.out.length,
    skills: [actions[0].skill, actions[1].skill], slots: [m0.slot, m1.slot], first: order[0],
    speedTie: note.tie, speStages: [m0.stages.spe, m1.stages.spe], effSpe: [...note.spe],
    priorityHooks: [b.hooksWithCond(m0, 'modify_priority').length > 0, b.hooksWithCond(m1, 'modify_priority').length > 0],
    mons: [journalMon(m0), journalMon(m1)],
  };
}
