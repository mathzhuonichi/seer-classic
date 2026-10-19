// Conditions and their hooks (RULES.md sections 7-8): statuses, timed conditions,
// charges, and dispatch of declarative and scripted hooks.

import type { ConditionDef, EffectOp, Hook, HookPoint, ScriptEntry, Skill } from '../types.ts';
import type { ApplyCtx, HookCtx, HookExtras } from '../scripts/context.ts';
import type { Battle } from './battle.ts';
import { emptyCtx, type ActiveCondition, type Mon } from './state.ts';
import { findRule, hasRule } from './rules.ts';

export interface StatusOptions { turns?: number | [number, number]; level?: number; fromFoe?: boolean; source?: Mon }

export function applyStatus(b: Battle, target: Mon, status: string, opts: StatusOptions): boolean {
  const def = b.data.conditions.get(status);
  if (!def) { b.warn(`unknown status ${status}`); return false; }
  if (target.fainted) return false;
  if (status === 'leech' && target.types.includes('grass')) return blockedStatus(b, target, status, 'grass_immunity');
  for (const r of b.fire(target, 'on_status_incoming', { status, source: opts.source, fromFoe: opts.fromFoe !== false, turns: opts.turns })) {
    if (r === false) return blockedStatus(b, target, status, 'script');
  }
  const side = b.sides[target.side];
  if (opts.fromFoe !== false) {
    if (hasRule(side, 'immune_status', target)) return blockedStatus(b, target, status, 'immune_status');
    const list = findRule(side, target, (r) => r.rule === 'immune_status_list');
    if (list?.statuses?.includes(status)) return blockedStatus(b, target, status, 'immune_status_list');
  }
  for (const h of b.hooks(target, 'block_status')) {
    if (!h.statuses || h.statuses.includes(status)) return blockedStatus(b, target, status, 'block_status');
  }
  return b.addCondition(target, def, opts.turns, opts.level);
}

function blockedStatus(b: Battle, target: Mon, status: string, reason: string): false {
  b.emit({ type: 'status_blocked', side: target.side, status, reason });
  return false;
}

export function addCondition(b: Battle, target: Mon, def: ConditionDef, turns?: number | [number, number], level?: number, charges?: number): boolean {
  if (target.fainted) return false;
  const existing = target.conditions.find((c) => c.id === def.id);
  const stack = def.stack ?? (def.kind === 'status' ? 'fail' : 'refresh');
  const n = turns !== undefined ? b.rollTurns(turns) : charges !== undefined ? Infinity : b.rollTurns(def.default_turns);
  if (existing) {
    if (stack === 'fail') {
      b.emit({ type: 'condition_failed', side: target.side, condition: def.id, reason: 'already' });
      return false;
    }
    existing.turns = stack === 'add' ? existing.turns + n : n;
    existing.appliedTurn = appliedTurnFor(b, target);
    if (level) existing.level = level;
    if (charges !== undefined) existing.charges = stack === 'add' ? (existing.charges ?? 0) + charges : charges;
    b.emit({
      type: 'condition_refreshed', side: target.side, slot: target.slot, name: target.name, conditionName: existing.def.name?.zh,
      condition: def.id, turns: existing.turns,
    });
    return true;
  }
  target.conditions.push({ id: def.id, def, turns: n, level, charges, appliedTurn: appliedTurnFor(b, target) });
  const at = { side: target.side, slot: target.slot, name: target.name, conditionName: def.name?.zh, condition: def.id };
  b.emit(def.kind === 'status' ? { type: 'status_applied', ...at, status: def.id, turns: n, level } : { type: 'condition_added', ...at, turns: n, level });
  return true;
}

// A condition counts the target's turns: if the target has not acted yet this
// turn, this turn is the first one affected and it ticks at this turn's end.
function appliedTurnFor(b: Battle, target: Mon): number {
  return target.lastActedTurn === b.turn ? b.turn : b.turn - 1;
}

export function useCharge(b: Battle, mon: Mon, cond: ActiveCondition): void {
  if (cond.charges === undefined) return;
  cond.charges--;
  if (cond.charges <= 0) b.removeCondition(mon, cond.id);
}

export function removeCondition(b: Battle, mon: Mon, id: string, expired: boolean): void {
  const c = mon.conditions.find((x) => x.id === id);
  if (!c) return;
  mon.conditions = mon.conditions.filter((x) => x !== c);
  b.emit({
    type: 'condition_removed', side: mon.side, slot: mon.slot, name:mon.name,conditionName:c.def.name?.zh, condition: id,
    reason: expired ? 'expired' : 'removed',
  });
  for (const h of c.def.hooks) {
    if (h.on !== 'on_expire') continue;
    if (expired && h.effects) b.runEffects(h.effects, mon, b.foeOf(mon), emptyCtx());
    // scripted cleanup runs on any removal (expiry, cure, switch is not a removal)
    if (h.script) b.script(h.script)?.hook?.(hookCtx(b, 'on_expire', mon, c, h, { expired }), h.params);
  }
}

export function rollTurns(b: Battle, t: ConditionDef['default_turns']): number {
  if (t === undefined) return Infinity;
  if (Array.isArray(t)) return b.rng.int(t[0], t[1]);
  return t;
}

// ---------- hooks ----------

export function script(b: Battle, id: string): ScriptEntry | undefined {
  const s = b.scripts[id];
  if (!s) return undefined;
  return typeof s === 'function' ? { apply: s } : s;
}

/** The skill's `script` effect ops that have a registered entry. */
export function skillScripts(b: Battle, skill: Skill): { entry: ScriptEntry; op: EffectOp }[] {
  const out: { entry: ScriptEntry; op: EffectOp }[] = [];
  for (const op of skill.effects ?? []) {
    if (op.op !== 'script') continue;
    const entry = b.script(op.id);
    if (entry) out.push({ entry, op });
  }
  return out;
}

/** Call every `script` hook at this point, except those `skip` names; returns their non-undefined results. */
export function fire(b: Battle, mon: Mon, point: HookPoint, extra: HookExtras, skip?: (cond: ActiveCondition, hook: Hook) => boolean): unknown[] {
  const out: unknown[] = [];
  if (b.probing) return out;
  for (const { cond, hook } of b.hooksWithCond(mon, point)) {
    if (!hook.script || skip?.(cond, hook)) continue;
    if (hook.when && !b.evalWhen(hook.when, { self: mon, foe: b.foeOf(mon), skill: extra.skill })) continue;
    const fn = b.script(hook.script)?.hook;
    if (!fn) { b.warn(`unknown script ${hook.script}`); continue; }
    const r = fn(hookCtx(b, point, mon, cond, hook, extra), hook.params);
    if (r !== undefined) out.push(r);
  }
  return out;
}

/**
 * A script hook's context: the holder's foe unless the point names another, and the point's extras. Hooks read only
 * the extras their points pass and the state their condition was attached with (scripts/context.ts), so the cast holds.
 */
export function hookCtx(b: Battle, point: HookPoint, holder: Mon, cond: ActiveCondition, hook: Hook, extra: HookExtras): HookCtx {
  return { battle: b, point, holder, cond, hook, foe: b.foeOf(holder), ...extra } as HookCtx;
}

export function hooksWithCond(mon: Mon, on: HookPoint): { cond: ActiveCondition; hook: Hook }[] {
  const out: { cond: ActiveCondition; hook: Hook }[] = [];
  for (const cond of mon.conditions) for (const hook of cond.def.hooks) if (hook.on === on) out.push({ cond, hook });
  return out;
}

/** Runs the declarative effects of the hooks at this point, then its script hooks. */
export function runHookEffects(b: Battle, mon: Mon, on: HookPoint, foe?: Mon, extra: HookExtras = {}): void {
  for (const { hook } of b.hooksWithCond(mon, on)) {
    if (hook.script) continue;
    if (hook.when && !b.evalWhen(hook.when, { self: mon, foe: foe ?? b.foeOf(mon) })) continue;
    if (hook.effects) b.runEffects(hook.effects, mon, foe ?? b.foeOf(mon), emptyCtx());
  }
  b.fire(mon, on, extra);
}

/** The multiplier of a `modify_*` hook, by the condition's level when it has a table. */
export function levelMult(hook: Hook, cond: ActiveCondition): number {
  if (hook.multiplier_by_level) return hook.multiplier_by_level[Math.min(hook.multiplier_by_level.length, Math.max(1, cond.level ?? 1)) - 1];
  return hook.multiplier ?? 1;
}

/** Runs script `id`'s `apply` (an effect op, or a `script` AI spec's decision). */
export function callScript(b: Battle, id: string, ctx: Omit<ApplyCtx, 'battle'>, params: unknown): unknown {
  if (b.probing) return undefined;
  const entry = b.script(id);
  if (!entry) { b.warn(`unknown script ${id}`); return undefined; }
  return entry.apply?.({ battle: b, ...ctx }, params);
}
