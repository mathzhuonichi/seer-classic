// Battle state shapes and the small pure helpers the engine modules share.

import type { Action, AiSpec, BossRule, ConditionDef, DamageKind, JournalMon, Phase, SideInput, Skill, Species, StageKey, Stats } from '../types.ts';
import { STRUGGLE_SKILL } from '../constants.ts';

export interface ActiveCondition {
  id: string;
  def: ConditionDef;
  turns: number;            // remaining; Infinity = until removed
  level?: number;
  appliedTurn: number;
  charges?: number;         // count-based conditions (防护罩)
  data?: Record<string, any>; // per-instance state for scripted conditions
}

export interface Mon {
  side: 0 | 1;
  slot: number;
  uid?: string;
  species: Species;
  name: string;
  level: number;
  types: string[];
  stats: Stats;
  maxHp: number;
  hp: number;
  skills: number[];
  skillOverrides?: Record<number, Skill>;
  pp: Record<number, number>;
  maxPp: Record<number, number>;
  stages: Record<StageKey, number>;
  conditions: ActiveCondition[];
  fainted: boolean;
  livesLeft: number;
  turnsActive: number;
  lastActedTurn: number;
  usedSkills: Set<number>;
  skillUses: Record<number, number>;
  streak: { skill: number; count: number; turn: number };
  vol: Record<string, any>;      // volatile per-switch-in state for scripts
  persist: Record<string, any>;  // per-battle state for scripts and boss traits
  facedBy: Set<string>;          // player uids that were on the field against this monster
  ai?: AiSpec;
  aiCursor: number;
  rules: BossRule[];
  phases: Phase[];
  phasesFired: Set<number>;
}

export interface Side {
  index: 0 | 1;
  kind: SideInput['kind'];
  name: string;
  team: Mon[];
  active: number;
  items: Record<string, number>;
  unlimitedItems: Set<string>;
  rules: BossRule[];
  ai?: AiSpec;
  pending: Action | null;
  needsReplacement: boolean;
  lastHitType?: string;
}

export interface MoveCtx {
  skill: Skill;
  hit: boolean;
  crit: boolean;
  damageDealt: number;
  effectiveness: number;
  actedFirst: boolean;
  /** 必中 (RULES.md 4): the skill's accuracy is null, or the user has a force-hit accuracy hook. */
  sureHit?: boolean;
  user?: Mon;
  target?: Mon;
  /** Per-move state that a skill's scripts share between their members (seer_eff_185, 188, 421). */
  data?: Record<string, any>;
}

export interface WhenCtx {
  self: Mon;
  foe?: Mon;
  ctx?: Partial<MoveCtx>;
  actedFirst?: boolean;
  onFaint?: boolean;
  skill?: Skill;
  kind?: DamageKind;
}

export interface DamageInfo {
  kind: DamageKind;
  source?: Mon;
  skill?: Skill;
  crit?: boolean;
  effectiveness?: number;
  ohko?: boolean;
  forcedExecution?: boolean; // Explicit user-adopted boss policy; not ordinary OHKO mechanics.
  noReflect?: boolean;
  status?: string;          // DoT damage: which status dealt it
}

export type BattlePhase = 'choose' | 'replace' | 'ended';

/** The attack hit being computed: its defender, opacity reasons, pre-hit snapshots and displayed damage. */
export interface HitTrace {
  target: Mon;
  reasons: string[];
  logIndex: number;
  attacker: JournalMon;
  defender: JournalMon;
  damage?: number;
}

export const STAGES: StageKey[] = ['atk', 'def', 'spa', 'spd', 'spe', 'acc', 'eva'];

export function zeroStages(): Record<StageKey, number> {
  return { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 };
}

/** The move context of effects that do not come from a move (hooks, phases, items). */
export function emptyCtx(): MoveCtx {
  return { skill: STRUGGLE_SKILL, hit: true, crit: false, damageDealt: 0, effectiveness: 1, actedFirst: false };
}

export function journalMon(m: Mon): JournalMon {
  return {
    side: m.side, slot: m.slot, species: m.species.id, level: m.level, types: [...m.types], hp: m.hp, maxHp: m.maxHp,
    stages: { ...m.stages }, conditions: m.conditions.map((c) => (c.level === undefined ? { id: c.id } : { id: c.id, level: c.level })),
    turnsActive: m.turnsActive,
  };
}
