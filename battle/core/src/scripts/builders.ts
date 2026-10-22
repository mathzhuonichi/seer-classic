// Entry factories for script templates that differ only in data. Guide: SCRIPTS.md.
import type { ConditionDef, HookPoint, ScriptEntry, ScriptRegistry, StageKey } from '../types.ts';
import type { ApplyCtx, HookCtx, InstallCtx } from './context.ts';
import { attach, changeStages, counts, fromFoeAttack, hitFoe, once, scriptHooks, stat, status } from './util.ts';

type P = number[];
export type HookFn = (c: HookCtx, p: any) => unknown;

/** A scripted condition: the hook points it reacts at and the hook run there. */
export interface RuleSpec { on: HookPoint[]; hook: HookFn }

/** Entries for a table of encounter-rule conditions; `install` attaches rule `id` to `c.mon` (boss, campaign and NPC policies differ). */
export function ruleScripts<R extends RuleSpec>(table: Record<string, R>, install: (c: InstallCtx, p: any, id: string, rule: R) => void): ScriptRegistry {
  const out: ScriptRegistry = {};
  for (const [id, rule] of Object.entries(table)) out[id] = { install: (c, p) => install(c, p, id, rule), hook: rule.hook };
  return out;
}

/** A timed template ("{0}回合内…"): the skill attaches a condition named `name` whose `hook` runs at the `on` points. */
export interface Timed extends RuleSpec {
  name: string;
  /** Attach to the foe (default kind 'debuff') instead of the user (default kind 'buff'). */
  foe?: boolean;
  kind?: ConditionDef['kind'];
  /** Duration; default p[0]. Undefined lasts until removed. */
  turns?: (p: P) => number | undefined;
  /** Attach only when this holds. */
  when?: (c: ApplyCtx, p: P) => boolean;
  data?: (c: ApplyCtx, p: P) => Record<string, unknown>;
  /** The current turn counts as the first one. */
  cover?: boolean;
  /** Condition id suffix, for templates a skill can carry twice (condition `<id>_<key>`). */
  key?: (p: P) => number;
}

/** Entries for a table of timed templates: each condition id is its script id (plus `key`), and its hooks get the skill's params. */
export function timedScripts(table: Record<string, Timed>): ScriptRegistry {
  const out: ScriptRegistry = {};
  for (const [id, t] of Object.entries(table)) {
    out[id] = {
      apply: (c: ApplyCtx, p: P) => {
        if (t.when && !t.when(c, p)) return;
        const condId = t.key ? `${id}_${t.key(p)}` : id;
        attach(c.battle, t.foe ? c.foe : c.user, condId, t.name, scriptHooks(t.on, id, p), t.turns ? t.turns(p) : p[0],
          { kind: t.kind ?? (t.foe ? 'debuff' : 'buff'), data: t.data?.(c, p), cover: t.cover });
      },
      hook: t.hook,
    };
  }
  return out;
}

// ---------- timed families ----------

/** "{0}回合内{category}攻击对自身必定miss": a 必中 move (`ctx.sureHit`) still lands unless `sureHitToo` (RULES.md 4). */
export const evade = (name: string, category: string, sureHitToo = false): Timed => ({
  name, on: ['before_hit'],
  hook: (c) => (c.skill?.category === category && (sureHitToo || !c.ctx?.sureHit) ? 'evade' : undefined),
});

/** "{0}回合内受到{category}攻击时有{1}%概率令对手{status}"; without `fixed`, the status is index {2}. */
export const hurtStatus = (name: string, category?: string, fixed?: string): Timed => ({
  name, on: ['on_hurt'],
  hook: (c, p: P) => {
    if (!fromFoeAttack(c) || (category && c.info.skill?.category !== category)) return;
    if (c.battle.rng.chance(p[1])) c.battle.applyStatus(c.source, fixed ?? status(p[2]), { source: c.holder });
  },
});

/** "{0}回合内每次造成伤害的1/{1}会恢复自己的HP" */
export const drain = (name: string): Timed => ({
  name, on: ['on_hit'],
  hook: (c, p: P) => { if (c.ctx?.damageDealt > 0) c.battle.heal(c.holder, c.ctx.damageDealt / p[1]); },
});

/** "{0}回合内每回合自身{stats}提高{1}个等级" (at turn start) */
export const boostEachTurn = (name: string, stats: StageKey[]): Timed =>
  ({ name, on: ['turn_start'], hook: (c, p: P) => changeStages(c.battle, c.holder, stats, p[1], false) });

/** "{0}回合内对手每回合{stats}等级{1}" (at the end of each counted turn) */
export const dropEachTurn = (name: string, stats: StageKey[]): Timed => ({
  name, on: ['turn_end'], foe: true,
  hook: (c, p: P) => { if (counts(c)) changeStages(c.battle, c.holder, stats, p[1], true); },
});

/** "{0}回合内若受到攻击，对手{stats}等级-1" (once per turn) */
export const hurtDropsFoe = (name: string, stats: StageKey[]): Timed => ({
  name, on: ['on_hurt'],
  hook: (c) => { if (fromFoeAttack(c) && once(c)) changeStages(c.battle, c.source, stats, -1, true); },
});

/** "{0}回合内若…，则对手每回合受到{1}点固定伤害" */
export const foeDamageEachTurn = (name: string, holds: (c: HookCtx) => boolean): Timed => ({
  name, on: ['turn_end'],
  hook: (c, p: P) => { if (counts(c) && !c.foe.fainted && holds(c)) c.battle.dealDamage(c.foe, p[1], { kind: 'fixed', source: c.holder }); },
});

// ---------- one-shot families ----------

/** "威力随机，随机范围{min}~{max}": the AI estimates the midpoint without drawing. */
export const randomPower = (min: number, max: number): ScriptEntry =>
  ({ power: (c) => (c.estimate ? (min + max) / 2 : c.battle.rng.int(min, max)) });

/** "若…则附加{0}点伤害" */
export const bonusDamageIf = (holds: (c: ApplyCtx) => boolean): ScriptEntry =>
  ({ apply: (c, p: P) => { if (holds(c)) hitFoe(c, p[0]); } });

/** "若…，则{1}%自身{0}等级+{2}" */
export const selfStageIf = (holds: (c: ApplyCtx) => boolean): ScriptEntry => ({
  apply: (c, p: P) => { if (holds(c) && c.battle.rng.chance(p[1])) c.battle.changeStage(c.user, stat(p[0]), p[2], false); },
});
