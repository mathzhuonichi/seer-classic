// The effect-op interpreter (RULES.md section 8): skill effects, hook effects,
// boss phase ops and item effects, plus the stat-stage changes they make.

import type { EffectOp, Skill, StageKey } from '../types.ts';
import type { Battle } from './battle.ts';
import { STAGES, type Mon, type MoveCtx } from './state.ts';
import * as C from '../constants.ts';
import { computeStats } from '../stats.ts';
import { IV_MAX } from '../../../../raising/core/stats.ts';
import { hasRule } from './rules.ts';
import { runHookEffects } from './conditions.ts';

/** Ops read by the move pipeline itself (hit count, power, priority, crit); runEffects skips them. */
export const MODIFIER_OPS = new Set(['multi_hit', 'power_if', 'priority_if', 'crit_if']);

const SELF_OPS = new Set(['heal', 'restore_pp', 'protect', 'cure_status', 'transform', 'set_skills', 'set_ai', 'revive', 'say']);

export function defaultTarget(op: string): 'self' | 'foe' {
  return SELF_OPS.has(op) ? 'self' : 'foe';
}

/** A status skill targets the foe if any effect hits the foe. */
export function inferTarget(skill: Skill): 'self' | 'foe' {
  return (skill.effects ?? []).some((e) => (e.target ?? defaultTarget(e.op)) === 'foe' && !MODIFIER_OPS.has(e.op)) ? 'foe' : 'self';
}

export function runEffects(b: Battle, ops: EffectOp[], user: Mon, foe: Mon, ctx: MoveCtx, filter?: (op: EffectOp) => boolean): void {
  for (const op of ops) {
    if (b.result) return;
    if (MODIFIER_OPS.has(op.op)) continue;
    if (filter && !filter(op)) continue;
    if (op.when && !b.evalWhen(op.when, { self: user, foe, ctx })) continue;
    if (op.chance !== undefined && !b.rng.chance(op.chance)) continue;
    const handler = Object.hasOwn(OPS, op.op) ? OPS[op.op] : undefined;
    if (!handler) { b.warn(`unknown effect op ${op.op}`); continue; }
    handler(b, op, { user, foe, ctx, tgt: (op.target ?? defaultTarget(op.op)) === 'self' ? user : foe });
  }
}

interface OpArgs { user: Mon; foe: Mon; ctx: MoveCtx; tgt: Mon }
type OpHandler = (b: Battle, op: EffectOp, a: OpArgs) => void;

const OPS: Record<string, OpHandler> = {
  stat_stage: (b, op, { user, tgt }) => {
    for (const [stat, delta] of Object.entries(op.stats as Record<StageKey, number>)) b.changeStage(tgt, stat as StageKey, delta, tgt !== user);
  },
  status: (b, op, { user, tgt }) => {
    b.applyStatus(tgt, Array.isArray(op.status) ? b.rng.pick(op.status) : op.status, { turns: op.turns, level: op.level, fromFoe: tgt !== user });
  },
  cure_status: (b, op, { tgt }) => {
    for (const c of [...tgt.conditions]) if (c.def.kind === 'status' && (!op.statuses || op.statuses.includes(c.id))) b.removeCondition(tgt, c.id);
  },
  // a move's context names its user; outside a move (emptyCtx) no skill does the clearing
  clear_stages: (b, op, { user, ctx, tgt }) => clearStages(b, tgt, op.which ?? 'all', tgt !== user, ctx.user ? ctx.skill : undefined),
  heal: (b, op, { ctx, tgt }) => {
    let amt = 0;
    if (op.pct_max_hp) amt = (tgt.maxHp * op.pct_max_hp) / 100;
    else if (op.pct_damage_dealt) amt = (ctx.damageDealt * op.pct_damage_dealt) / 100;
    else if (op.amount) amt = op.amount;
    b.heal(tgt, amt, { item: b.usingItem });
  },
  restore_pp: (b, op, { tgt }) => {
    const ids = op.skill ? [op.skill] : tgt.skills;
    const amount = typeof op.amount === 'number' && Number.isFinite(op.amount) ? Math.max(0, op.amount) : null;
    for (const id of ids) if (Number.isFinite(tgt.maxPp[id])) tgt.pp[id] = amount === null ? tgt.maxPp[id] : Math.min(tgt.maxPp[id], tgt.pp[id] + amount);
    b.emit({ type: 'pp_restored', side: tgt.side, slot: tgt.slot, name: tgt.name, amount });
  },
  pp_drain: (b, op, { foe }) => {
    const ids = op.all === false && foe.usedSkills.size ? [...foe.usedSkills].slice(-1) : foe.skills;
    for (const id of ids) if (foe.pp[id] !== undefined) foe.pp[id] = Math.max(0, foe.pp[id] - (op.amount ?? 1));
    b.emit({ type: 'pp_drained', side: foe.side, amount: op.amount ?? 1 });
  },
  recoil: (b, op, { user, ctx }) => {
    const amt = op.pct_max_hp ? (user.maxHp * op.pct_max_hp) / 100 : (ctx.damageDealt * (op.pct_damage_dealt ?? 0)) / 100;
    if (amt > 0) b.dealDamage(user, Math.max(1, Math.floor(amt)), { kind: 'fixed' });
  },
  fixed_damage: (b, op, { user, ctx, tgt }) => { b.dealDamage(tgt, op.amount, { kind: 'fixed', source: user, skill: ctx.skill }); },
  pct_damage: (b, op, { user, ctx, tgt }) => {
    const amt = op.pct_max_hp ? (tgt.maxHp * op.pct_max_hp) / 100 : (tgt.hp * (op.pct_current_hp ?? 0)) / 100;
    b.dealDamage(tgt, Math.max(1, Math.floor(amt)), { kind: 'percent', source: user, skill: ctx.skill });
  },
  ohko: (b, _op, { user, ctx, tgt }) => { b.dealDamage(tgt, tgt.hp, { kind: 'true', source: user, skill: ctx.skill, ohko: true }); },
  add_condition: (b, op, { tgt }) => {
    const def = b.data.conditions.get(op.condition);
    if (!def) return b.warn(`unknown condition ${op.condition}`);
    b.addCondition(tgt, def, op.turns, op.level, op.charges);
  },
  remove_condition: (b, op, { tgt }) => b.removeCondition(tgt, op.condition),
  protect: (b, op, { user }) => {
    b.addCondition(user, b.data.conditions.get('protect')!, op.turns ?? 1);
    user.conditions.find((c) => c.id === 'protect')!.appliedTurn = -1; // expires this turn end
  },
  swap_stages: (b, _op, { user, foe }) => {
    const a = user.stages; user.stages = foe.stages; foe.stages = a;
    b.emit({ type: 'stages_swapped', side: user.side });
  },
  copy_stages: (b, _op, { user, foe }) => {
    user.stages = { ...foe.stages };
    b.emit({ type: 'stages_copied', side: user.side });
  },
  force_switch: (b, _op, { tgt }) => {
    const side = b.sides[tgt.side];
    const bench = side.team.filter((m) => !m.fainted && m.slot !== side.active);
    if (!bench.length || hasRule(side, 'immune_force_switch')) return;
    b.switchIn(side, b.rng.pick(bench).slot);
  },
  // boss phase ops
  transform,
  set_skills: (b, op, { tgt }) => {
    setSkills(b, tgt, op.skills);
    b.emit({ type: 'skills_changed', side: tgt.side, skills: [...tgt.skills] });
  },
  set_ai: (_b, op, { tgt }) => { tgt.ai = op.ai; tgt.aiCursor = 0; },
  revive: (b, op, { user }) => {
    user.fainted = false;
    user.hp = Math.max(1, Math.floor((user.maxHp * (op.pct_max_hp ?? 100)) / 100));
    user.conditions = user.conditions.filter((c) => c.def.kind !== 'status');
    b.emit({ type: 'revive', side: user.side, slot: user.slot, name: user.name, hp: user.hp, maxHp: user.maxHp, reason: 'phase' });
    runHookEffects(b, user, 'on_revive');
  },
  say: (b, op, { user }) => b.emit({ type: 'say', side: user.side, text: op.text }),
  ohko_below_pct: bossTraitOp,
  always_crit_below_pct: bossTraitOp,
  swap_types: (b, op, { user, foe }) => {
    if (op.types) user.types = [...op.types];
    else { const t = user.types; user.types = foe.types; foe.types = t; }
    b.emit({ type: 'types_changed', side: user.side, types: [...user.types], foeTypes: [...foe.types] });
  },
  counter_skill: (b, op, { user }) => {
    if (!user.skills.includes(op.skill)) setSkills(b, user, [...user.skills, op.skill].slice(-C.MAX_SKILLS));
    user.vol.forcedSkill = op.skill;
  },
  script: (b, op, { user, foe, ctx }) => { b.callScript(op.id, { user, foe, ctx }, op.params); },
};

function transform(b: Battle, op: EffectOp, { user }: OpArgs): void {
  const sp = b.data.species.get(op.species);
  if (!sp) return b.warn(`unknown species ${op.species}`);
  const ratio = user.hp / user.maxHp;
  user.species = sp;
  user.types = [...sp.types];
  if (op.stats || op.recompute !== false) {
    const stats = op.stats ?? computeStats(sp.base, user.level, op.iv ?? IV_MAX, op.evs ?? {}, undefined);
    const keepMax = op.hp_override ?? (op.keep_hp ? user.maxHp : stats.hp);
    user.stats = { ...stats, hp: keepMax };
    user.maxHp = keepMax;
    user.hp = Math.max(1, Math.round(keepMax * (op.full_heal ? 1 : ratio)));
  }
  if (op.skills) setSkills(b, user, op.skills);
  user.name = sp.name.zh;
  b.emit({ type: 'transform', side: user.side, species: sp.id, types: [...user.types], name: sp.name.zh, hp: user.hp, maxHp: user.maxHp });
}

function bossTraitOp(b: Battle, op: EffectOp, { user }: OpArgs): void {
  user.persist[op.op] = true;
  b.emit({ type: 'boss_trait', side: user.side, trait: op.op });
}

function setSkills(b: Battle, mon: Mon, skills: number[]): void {
  mon.skills = [...skills];
  for (const id of skills) {
    const s = b.skill(id, mon);
    mon.maxPp[id] = s.pp;
    mon.pp[id] = mon.pp[id] ?? s.pp;
  }
  mon.aiCursor = 0;
}

// ---------- stat stages ----------

export function changeStage(b: Battle, mon: Mon, stat: StageKey, delta: number, byFoe: boolean): void {
  if (mon.fainted) return;
  for (const r of b.fire(mon, 'on_stage_incoming', { stat, delta, byFoe })) {
    if (r === false) { b.emit({ type: 'stage_blocked', side: mon.side, stat }); return; }
    if (typeof r === 'number') delta = r;
  }
  if (delta === 0) return;
  const foe = b.foeOf(mon);
  const blocked = delta > 0 ? !!foe.persist.foeCannotBoost && !foe.fainted
    : byFoe && (hasRule(b.sides[mon.side], 'immune_stage_down', mon) || b.hooks(mon, 'block_stage_down').length > 0);
  if (blocked) { b.emit({ type: 'stage_blocked', side: mon.side, stat }); return; }
  const before = mon.stages[stat];
  const after = Math.max(C.STAGE_MIN, Math.min(C.STAGE_MAX, before + delta));
  mon.stages[stat] = after;
  b.emit({ type: 'stat_stage', side: mon.side, stat, delta: after - before, stage: after, capped: after - before !== delta });
}

/** Clears `mon`'s stages; a move's clear passes its `skill` to `on_stage_incoming`. */
export function clearStages(b: Battle, mon: Mon, which: 'up' | 'down' | 'all', byFoe: boolean, skill?: Skill): void {
  let changed = false;
  for (const k of STAGES) {
    const v = mon.stages[k];
    if (!((which !== 'down' && v > 0) || (which !== 'up' && v < 0))) continue;
    if (byFoe && b.fire(mon, 'on_stage_incoming', { stat: k, delta: -v, byFoe, clear: true, skill }).includes(false)) continue;
    mon.stages[k] = 0;
    changed = true;
  }
  if (changed) b.emit({ type: 'stages_cleared', side: mon.side, which });
}
