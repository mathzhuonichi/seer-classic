// The contexts the engine passes to script entries (SCRIPTS.md, "Entry shape"). Each names its battle, so what a
// script emits or calls is checked against the engine's types, events included.

import type { Battle } from '../engine/battle.ts';
import type { ActiveCondition, DamageInfo, Mon, MoveCtx, Side } from '../engine/state.ts';
import type { Hook, HookPoint, Skill, StageKey } from '../types.ts';

/** Every context: the battle the script runs in. Objective scripts get only this. */
export interface BattleScriptCtx { battle: Battle }

/** `apply`: an effect op of a skill, a Boss phase, a hook or an item; `ctx` is `emptyCtx()` outside a move. */
export interface ApplyCtx extends BattleScriptCtx { user: Mon; foe: Mon; ctx: MoveCtx }

/** `priority`, `defense` and `ppCost`: the skill being used, by `user` on `foe`. */
export interface SkillCtx extends BattleScriptCtx { user: Mon; foe: Mon; skill: Skill }

/** `accuracy`, `modifyDamage` and `onMiss`: during the move, with its context. */
export interface MoveScriptCtx extends SkillCtx { ctx: MoveCtx }

/** `crit`, and `power` with `estimate`: the read-only damage probe passes a partial move context (RULES.md 5.1). */
export interface AttackScriptCtx extends SkillCtx { ctx?: Partial<MoveCtx>; estimate?: boolean }

/** `finalDamage`: one hit after every multiplier; `user` is the damage source. */
export interface FinalDamageCtx extends SkillCtx { info: DamageInfo }

/** `install`: a Boss rule script, once per matching team member at battle start. */
export interface InstallCtx extends BattleScriptCtx { mon: Mon; side: Side }

/** What the hook points pass beside the holder (`Battle.fire`'s `extra`); each point passes some of them (SCRIPTS.md). */
export interface HookExtras {
  /** The opposing monster when the point names it (the attacker at `on_foe_move`); otherwise the holder's foe. */
  foe?: Mon;
  skill?: Skill;
  ctx?: MoveCtx;
  /** `on_foe_move`: the move targets the holder. */
  targetsHolder?: boolean;
  /** `on_expire`: the condition ran out (false: it was removed). */
  expired?: boolean;
  priority?: number;
  power?: number;
  /** `modify_crit_rate_taken`: the attacker's crit rate so far. */
  rate?: number;
  source?: Mon;
  /** `on_ko`: the monster the holder knocked out. */
  target?: Mon;
  info?: DamageInfo;
  amount?: number;
  stat?: StageKey;
  /** `modify_stat`: the stat's value so far. */
  value?: number;
  delta?: number;
  byFoe?: boolean;
  /** `on_stage_incoming`: a clear of the stage, not a change. */
  clear?: boolean;
  status?: string;
  fromFoe?: boolean;
  turns?: number | [number, number];
  /** `on_heal_incoming`: the heal comes from an item. */
  item?: boolean;
  /** `choose_action`: the holder's side. */
  side?: Side;
}

/** Extras that can be unset even at a point that passes them (status damage has no source or skill, for example). */
type Unsure = 'source' | 'skill' | 'turns' | 'clear';

/** A scripted condition; `data` is the state it was attached with (`attach`'s `data`, a rule's params). */
export type ScriptCondition = ActiveCondition & { data: Record<string, any> };

/**
 * `hook`: a condition hook `{ on, script }` fired at `point` for `holder`, the monster carrying `cond`. A hook reads only
 * the extras its points pass: the types cannot tell the points apart, so the others are typed as set but are undefined.
 */
export interface HookCtx extends BattleScriptCtx, Required<Omit<HookExtras, Unsure | 'foe'>>, Pick<HookExtras, Unsure> {
  point: HookPoint;
  holder: Mon;
  cond: ScriptCondition;
  hook: Hook;
  foe: Mon;
}
