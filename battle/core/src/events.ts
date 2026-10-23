// The event stream: what the engine emits, in order (battle/RULES.md). Every event names its `type`;
// the other fields depend on it.

import type { BattleResult, DamageKind, SideInput, StageKey, Text, TypeId } from './types.ts';

/** A monster's HP after the event. */
interface HpFields { hp: number; maxHp: number }
/** The fields of each event type, beside `type`. `side` is the side the event happens to. */
interface EventFields {
  battle_start: { sides: { kind: SideInput['kind']; name: string }[] };
  battle_end: BattleResult;
  turn_start: { turn: number };
  /** The turn's actions are over and its end begins (battle/RULES.md section 8), so a display can tell its damage from a move's. */
  turn_end: { turn: number };
  warning: { message: string };
  switch_in: HpFields & { side: 0 | 1; slot: number; species: number; types: TypeId[]; name: string; level: number };
  switch_out: { side: 0 | 1; slot: number };
  transform: HpFields & { side: 0 | 1; species: number; types: TypeId[]; name: string };
  move_used: { side: 0 | 1; skill: number; name: string };
  cant_act: { side: 0 | 1; reason: string };
  move_failed: { side: 0 | 1; reason: string };
  no_target: { side: 0 | 1 };
  protected: { side: 0 | 1 };
  miss: { side: 0 | 1; skill: number };
  immune: { side: 0 | 1; skill: number };
  multi_hit: { side: 0 | 1; hits: number };
  damage: HpFields & {
    side: 0 | 1; slot: number; name: string; amount: number; kind: DamageKind; crit: boolean; status?: string;
    sourceSide?: 0 | 1; sourceName?: string; effectiveness?: number; skill?: number; overkill: number;
  };
  damage_blocked: { side: 0 | 1; rule: string };
  shield_absorb: { side: 0 | 1; amount: number; left: number };
  endure: { side: 0 | 1 };
  faint: { side: 0 | 1; slot: number; species: number; by: { side: 0 | 1; skill?: number; crit: boolean } | null };
  revive: HpFields & { side: 0 | 1; slot: number; name: string; reason: 'lives' | 'phase' | 'revive_unless_status_ko'; livesLeft?: number };
  heal: HpFields & { side: 0 | 1; slot: number; name: string; amount: number; reason?: 'heal_full_below' };
  heal_blocked: { side: 0 | 1 };
  max_hp_changed: HpFields & { side: 0 | 1 };
  status_applied: ConditionEvent & { status: string };
  condition_added: ConditionEvent;
  condition_refreshed: ConditionEvent;
  condition_removed: { side: 0 | 1; slot: number; name: string; conditionName?: string; condition: string; reason: 'expired' | 'removed' };
  condition_failed: { side: 0 | 1; condition: string; reason: 'already' };
  condition_tick: { side: 0 | 1; slot: number; name: string; conditionName?: string; condition: string };
  status_blocked: { side: 0 | 1; status: string; reason: string };
  stat_stage: { side: 0 | 1; stat: StageKey; delta: number; stage: number; capped?: boolean; name?: string; reason?: 'critical' };
  stage_blocked: { side: 0 | 1; stat: StageKey };
  stages_cleared: { side: 0 | 1; which: 'up' | 'down' | 'all' };
  stages_swapped: { side: 0 | 1 };
  stages_copied: { side: 0 | 1 };
  pp_restored: { side: 0 | 1; slot?: number; name?: string; amount: number | null };
  pp_drained: { side: 0 | 1; amount: number };
  skills_changed: { side: 0 | 1; skills: number[] };
  types_changed: { side: 0 | 1; types: TypeId[]; foeTypes?: TypeId[] };
  item_used: { side: 0 | 1; item: string; slot: number; targetName: string };
  capture_attempt: { side: 0 | 1; item: string; success: boolean };
  flee: { side: 0 | 1 };
  boss_fled: { side: 1; skill: number };
  boss_trait: { side: 0 | 1; trait: string };
  phase_triggered: { side: 1; phase: number; slot?: number };
  mechanic_waived: { side: 0 | 1; policy: string };
  say: { side: 0 | 1; text: Text };
}
/** A status or other condition taking hold (`status_applied` for a status). */
interface ConditionEvent { side: 0 | 1; slot: number; name: string; conditionName?: string; condition: string; turns: number; level?: number }

/** What the engine emits, in order; `battle.log` keeps every resolved event. */
export type BattleEvent = { [T in keyof EventFields]: { type: T } & EventFields[T] }[keyof EventFields];
