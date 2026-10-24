// State helpers shared by every script registry: the engine's (seer-main,
// seer-tail, boss) and the game's (traits in src/domain/traits.ts, campaign rules
// and NPC training in src/domain/challenges/). Entry factories built on them live
// in builders.ts. Guide: SCRIPTS.md.
import type { ConditionDef, Hook, HookPoint, StageKey } from '../types.ts';
import type { Battle } from '../engine/battle.ts';
import type { ActiveCondition, Mon } from '../engine/state.ts';
import type { ApplyCtx, HookCtx, SkillCtx } from './context.ts';

export type StageMap = Partial<Record<StageKey, number>>;

// ---------- original argument encodings ----------

export const STATUS_BY_INDEX: Record<number, string> = {
  0: 'paralysis', 1: 'poison', 2: 'burn', 3: 'leech', 4: 'leech', 5: 'freeze', 6: 'fear',
  7: 'fatigue', 8: 'sleep', 9: 'petrify', 10: 'confusion', 11: 'weaken', 13: 'flammable', 15: 'frozen_solid',
};
export const STAT_BY_INDEX: StageKey[] = ['atk', 'def', 'spa', 'spd', 'spe', 'acc'];

export const status = (i: number) => STATUS_BY_INDEX[i] ?? 'paralysis';
export const stat = (i: number) => STAT_BY_INDEX[i] ?? 'atk';

// ---------- predicates ----------

export const hasAnyStatus = (m: Mon) => m.conditions.some((c) => c.def.kind === 'status');
export const hasStatus = (m: Mon, id: string) => m.conditions.some((c) => c.id === id);
export const hasStageUp = (m: Mon) => Object.values(m.stages).some((v) => v > 0);
export const hasStageDown = (m: Mon) => Object.values(m.stages).some((v) => v < 0);
/** The two monsters share a type ("属性相同"). */
export const sameType = (a: Mon, b: Mon) => a.types.some((t) => b.types.includes(t));

/** Effect phase: the move connected and the foe is still standing. */
export const landed = (c: ApplyCtx) => c.ctx?.hit !== false && !c.foe.fainted;
/** Hook: a foe's attack damaged the holder. */
export const fromFoeAttack = (c: HookCtx): c is HookCtx & { source: Mon } => c.info?.kind === 'attack' && !!c.source && c.source.side !== c.holder.side;

// ---------- damage and stages ----------

/** Extra damage from the move to the foe: only when it landed, rounded down, at least 1. */
export function hitFoe(c: ApplyCtx, n: number, kind: 'fixed' | 'percent' = 'fixed'): void {
  if (!landed(c) || n < 1) return;
  c.battle.dealDamage(c.foe, Math.floor(n), { kind, source: c.user, skill: c.ctx?.skill, sureHit: c.ctx?.sureHit });
}

/** Self-inflicted HP cost (ignores damage modifiers). */
export const selfLoss = (b: Battle, m: Mon, n: number) => (n >= 1 ? b.dealDamage(m, Math.floor(n), { kind: 'true' }) : 0);

export function changeStages(b: Battle, m: Mon, stats: StageKey[], delta: number, byFoe: boolean): void {
  for (const s of stats) b.changeStage(m, s, delta, byFoe);
}

/** Raises each of `mon`'s stages that is below `target` up to it. */
export function raiseStagesTo(b: Battle, mon: Mon, target: StageMap): void {
  for (const [k, v] of Object.entries(target) as [StageKey, number][]) if (v > mon.stages[k]) b.changeStage(mon, k, v - mon.stages[k], false);
}

/** Moves the stages of `from` that match `pick` onto `to`, clearing them on `from`. */
export function moveStages(b: Battle, from: Mon, to: Mon, pick: (v: number) => boolean): void {
  for (const k of Object.keys(from.stages) as StageKey[]) {
    const v = from.stages[k];
    if (!pick(v)) continue;
    from.stages[k] = 0;
    b.emit({ type: 'stat_stage', side: from.side, stat: k, delta: -v, stage: 0, capped: false });
    b.changeStage(to, k, v, false);
  }
}

// ---------- conditions ----------

export interface CondOpts {
  kind?: ConditionDef['kind'];        // default 'buff'
  persist?: boolean;                  // survives switching out
  data?: Record<string, unknown>;     // merged into the condition's own state
  cover?: boolean;                    // the current turn counts as its first one
}

/** Hooks that call script `script` at each point with `params`. */
export const scriptHooks = (points: HookPoint[], script: string, params?: unknown): Hook[] =>
  points.map((on) => ({ on, script, params }));

/** Adds condition `id` to `mon`, or refreshes its turns. Returns the active condition, or undefined if it was not added. */
export function attach(
  b: Battle, mon: Mon, id: string, name: string, hooks: Hook[], turns?: number | [number, number], o: CondOpts = {},
): ActiveCondition | undefined {
  const def: ConditionDef = { id, name: { zh: name }, kind: o.kind ?? 'buff', stack: 'refresh', removed_on_switch: o.persist ? false : undefined, hooks };
  if (!b.addCondition(mon, def, turns)) return undefined;
  const c = mon.conditions.find((x) => x.id === id)!;
  if (o.data) c.data = { ...c.data, ...o.data };
  if (o.cover) c.appliedTurn = b.turn - 1;
  return c;
}

/**
 * The `changes` member of a script that puts condition `id` on its user, or on the foe with `onFoe`: while the condition is in
 * place, casting it again changes nothing, whatever its remaining turns or counts (RULES.md 10.4).
 */
export const placesCondition = (id: string, onFoe = false) => (c: SkillCtx): boolean => {
  const holder = onFoe ? c.foe : c.user;
  return !holder.fainted && !hasStatus(holder, id);
};

/** A permanent condition installed by an encounter rule, with `data` as its state. */
export const ruleCondition = (b: Battle, mon: Mon, id: string, name: string, hooks: Hook[], data?: Record<string, unknown>) =>
  attach(b, mon, id, name, hooks, undefined, { kind: 'other', persist: true, data });

/** Arms every benched, conscious monster of `side`: the next one to switch in runs script `script` (on_switch_in). */
export function armBench(b: Battle, side: 0 | 1, id: string, name: string, params: unknown, script = id): void {
  const s = b.sides[side];
  for (const m of s.team) {
    if (!m.fainted && m.slot !== s.active) attach(b, m, id, name, scriptHooks(['on_switch_in'], script, params), undefined, { kind: 'other', persist: true });
  }
}

/** Removes `id` from the whole of `side`; `quiet` drops it without removal events. */
export function disarm(b: Battle, side: 0 | 1, id: string, quiet = false): void {
  for (const m of b.sides[side].team) {
    if (quiet) m.conditions = m.conditions.filter((x) => x.id !== id);
    else if (hasStatus(m, id)) b.removeCondition(m, id);
  }
}

// ---------- condition timing (hook context) ----------

/** The condition ticks this turn (it was not applied this turn). */
export const counts = (c: HookCtx) => c.cond.appliedTurn !== c.battle.turn;
/** The condition ends at this turn's end. */
export const expiring = (c: HookCtx) => counts(c) && c.cond.turns <= 1;
/** First time this condition reacts this turn. */
export function once(c: HookCtx): boolean {
  const d = (c.cond.data ??= {});
  if (d.turn === c.battle.turn) return false;
  d.turn = c.battle.turn;
  return true;
}
