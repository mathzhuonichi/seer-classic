// Data shapes shared by the battle core: the static catalog shapes (data/README.md)
// and the battle-only shapes. See ARCHITECTURE.md and battle/RULES.md.

import type { Battle } from './engine/battle.ts';
import type { Side } from './engine/state.ts';

export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type StageKey = 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'acc' | 'eva';
export type Stats = Record<StatKey, number>;
export type Text = { zh: string; en?: string };
export type TypeId = string;
export type Category = 'physical' | 'special' | 'status';
export type Target = 'self' | 'foe';
export type DamageKind = 'attack' | 'fixed' | 'percent' | 'true';

// ---------- static data ----------

export interface Species {
  id: number;
  name: Text;
  types: TypeId[];
  base: Stats;
  catch_rate?: number;
  ev_yield?: Partial<Stats>;
  exp_yield?: number;
  learnset?: { level: number; skill: number }[];
  [key: string]: unknown;
}

export interface Skill {
  id: number;
  name: Text;
  type: TypeId;
  category: Category;
  power: number;
  accuracy: number | null;
  pp: number;
  priority?: number;
  crit_rate?: number;   // numerator over 16
  crit_stage?: number;  // legacy field (RULES.md section 14); crit_rate = 1 + crit_stage
  power_bonus?: number; // added after power ops and scripts (skill engravings)
  pp_cost?: number;     // PP spent per use; default 1
  target?: Target;
  effects?: EffectOp[];
  [key: string]: unknown;
}

export interface Nature { id: string; name?: Text; plus: StatKey; minus: StatKey }

export interface TypeData {
  types?: { id: TypeId; name?: Text }[];
  chart: Record<TypeId, Record<TypeId, number>>;
  /** Official dual skill type IDs normalized to their base-type constituents. */
  composites?: Record<TypeId, TypeId[]>;
  dual_rule?: string;
}

export interface Item {
  id: string;
  name?: Text;
  battle_effects?: EffectOp[];
  capture_multiplier?: number | null; // present => capsule; null => always catches
  [key: string]: unknown;
}

// ---------- conditions ----------

export type HookPoint =
  | 'turn_start' | 'turn_end' | 'before_move'
  | 'modify_damage_dealt' | 'modify_damage_taken' | 'modify_stat'
  | 'modify_accuracy' | 'modify_accuracy_taken' | 'modify_crit_rate' | 'modify_crit_rate_taken'
  | 'on_hit' | 'on_hurt' | 'block_status' | 'block_stage_down'
  | 'block_switch' | 'block_move' | 'on_switch_in' | 'on_faint' | 'on_expire'
  // script-only points (hooks with `script`):
  | 'modify_priority' | 'pp_cost' | 'on_foe_move' | 'before_hit' | 'on_miss' | 'on_foe_miss'
  | 'modify_power' | 'modify_damage_outgoing' | 'modify_damage_final' | 'on_ko' | 'on_status_incoming' | 'on_stage_incoming'
  | 'on_heal_incoming' | 'on_revive' | 'choose_action';

export interface Hook {
  on: HookPoint;
  when?: When;
  multiplier?: number;            // modify_* hooks
  multiplier_by_level?: number[]; // e.g. 衰弱 levels 1..5
  kinds?: DamageKind[];           // modify_damage_*: which damage kinds (default ['attack'])
  stat?: StageKey;                // modify_stat
  prevent?: boolean;              // before_move: cannot act
  fail_chance?: number;           // before_move: 0..100 move fails
  self_damage?: { chance: number; amount: number }; // before_move (混乱)
  statuses?: string[];            // block_status: which (default all)
  damage_pct_max_hp?: number;     // turn_end: lose pct of max hp (percent damage)
  drain_to_foe?: boolean;         // turn_end: the foe heals what was lost (寄生)
  effects?: EffectOp[];           // generic: run effect ops (holder is `self`)
  cure_on_attack_hit?: boolean;   // on_hurt: remove this condition (睡眠)
  add?: number;                   // modify_crit_rate: + numerator over 16
  force_crit?: boolean;           // modify_crit_rate
  inflict_on_type?: { type: TypeId; status: string }; // on_hurt (易燃)
  script?: string;                // call scripts[script].hook at this point
  params?: unknown;
  force_hit?: boolean;            // modify_accuracy: always hit
  add_percent?: number;           // classic trait accuracy/evasion percentage points
  reflect_pct?: number;           // on_hurt: reflect pct of attack damage taken
  consume_charge?: boolean;       // the hook uses up one charge each time it applies
  [key: string]: unknown;         // extra fields used by scripts
}

export interface ConditionDef {
  id: string;
  name?: Text;
  kind?: 'status' | 'buff' | 'debuff' | 'other';
  control?: boolean;               // counts as a control status (capture bonus, immunities)
  default_turns?: number | [number, number];
  stack?: 'refresh' | 'fail' | 'add';
  removed_on_switch?: boolean;     // default true
  hooks: Hook[];
}

// ---------- effect ops ----------

export type When = Record<string, unknown>;

export type EffectOp = { op: string; chance?: number; when?: When; [k: string]: any };

// ---------- bosses ----------

export interface BossRule { rule: string; [k: string]: any }
export interface Objective { kind: string; [k: string]: any }
export interface Phase { when: When; do: EffectOp[]; once?: boolean; target?: number }
export interface AiSpec {
  kind: 'sequence' | 'weighted' | 'random' | 'smart' | 'script';
  skills?: number[]; weights?: Record<string, number>; id?: string; params?: unknown;
  /** Only authored trainer teams opt in; historical boss ordering stays intact. */
  allow_switch?: boolean;
  style?: 'balanced' | 'offense' | 'control' | 'attrition';
}

export interface BossTeamMember extends MonsterInput {
  hp_override?: number;
  stat_multipliers?: Partial<Record<StatKey, number>>;
}

/** An encounter variant chosen by the player: extra rules, extra phases, and its own objectives. */
export interface EncounterVariant {
  id: string;
  win?: Objective[];
  lose?: Objective[];
  rules?: BossRule[];
  phases?: Phase[];
}

export interface BossEncounter {
  id: string;
  name?: Text;
  team: BossTeamMember[];
  rules?: BossRule[];
  win?: Objective[];
  lose?: Objective[];
  phases?: Phase[];
  ai?: AiSpec;
  variants?: EncounterVariant[];
  [key: string]: unknown;
}

// ---------- battle input ----------

export interface MonsterInput {
  /** Explicit NPC context; the game adapter resolves this before battle creation. */
  training_profile?: string;
  uid?: string;
  species: number;
  level: number;
  iv?: number;
  evs?: Partial<Stats>;
  nature?: string;
  skills: number[];
  hp?: number;                     // current HP; default = max
  pp?: Record<string, number>;     // current PP by skill id; default = max
  stats?: Stats;                   // precomputed; overrides the formula
  nickname?: string | null;
  hp_override?: number;
  stat_multipliers?: Partial<Record<StatKey, number>>;
  /** 能量珠 bonuses active for this battle (raising/core activeBeads). */
  beads?: BeadBonus[];
  /** Per-monster replacements for catalog skills (skill engravings), keyed by skill id. */
  skill_overrides?: Record<number, Skill>;
  /** Encounter traits and phases belonging only to this ordered opponent. */
  member_rules?: BossRule[];
  member_phases?: Phase[];
  /** Encounter avatars can have a type distinct from the catalog species. */
  types?: TypeId[];
}

export interface BeadBonus {
  stats?: Partial<Stats>;
  crit_rate_add?: number;
  damage_dealt_multiplier?: number;
  damage_taken_multiplier?: number;
  damage_taken_and_dealt_multiplier?: number;
  [k: string]: unknown;
}

export interface SideInput {
  name?: string;
  kind: 'player' | 'wild' | 'boss' | 'trainer';
  team: MonsterInput[];
  items?: Record<string, number>;
  /** Battle-only supply access; finite inventory quantities stay unchanged. */
  unlimited_items?: string[];
  ai?: AiSpec;
  rules?: BossRule[];   // rules protecting this side's monsters (boss rules)
}

export interface BattleOptions {
  sides: [SideInput, SideInput] | [SideInput];
  seed: number;
  data: DataSet;
  encounter?: BossEncounter;     // when present, side 1 is built from it
  variant?: string;              // encounter.variants[].id chosen by the player
  scripts?: ScriptRegistry;
  /** Decisions for automatic sides. `createBattle` in battle.ts injects the AI; the engine never imports it. */
  policy?: BattlePolicy;
  maxTurns?: number;             // safety stop, default 200
  /** A trainer mode's conventional moveset per species. Planners use it to
   * model an opponent; it is never the opponent's actual loadout. */
  conventionalMoves?: (speciesId: number) => number[];
}

/** Chooses for a side that does not wait for input (wild, boss, trainer, or a player side with `ai`). */
export interface BattlePolicy {
  /** A turn action; consulted after a pending action, forced execution and `choose_action` hooks. */
  chooseAction(battle: Battle, side: Side): Action;
  /** A faint replacement; `undefined` lets the engine bring in the first member able to battle. */
  chooseReplacement(battle: Battle, side: Side): Action | undefined;
}

export interface DataSet {
  species: Map<number, Species>;
  skills: Map<number, Skill>;
  natures: Map<string, Nature>;
  types: TypeData;
  conditions: Map<string, ConditionDef>;
  items: Map<string, Item>;
}

// ---------- actions & events ----------

export type Action =
  | { kind: 'move'; skill: number }
  | { kind: 'switch'; slot: number }
  | { kind: 'item'; item: string; target?: number }
  | { kind: 'capture'; item: string }
  | { kind: 'flee' };

export type BattleEvent = { type: string; [k: string]: any };

export interface BattleResult {
  winner: 0 | 1 | null;
  reason: 'ko' | 'flee' | 'capture' | 'objective' | 'lose_condition' | 'turn_cap' | 'boss_fled';
  success: boolean;            // player (side 0) won and met every win objective
  objectives?: { kind: string; met: boolean }[];
  captured?: { species: number; level: number; hp: number };
  /** For raising/core applyBattleRewards: one entry per foe the player knocked out. */
  defeated: { foe: { species: number; level: number; boss?: boolean }; participants: string[] }[];
  turns: number;
}

// ---------- engine journal ----------

// Plain data appended by the engine as things happen (design/notes/trainer-search-ai-v58.md 12.2).
// The journal is engine-internal and records exact state, including state hidden
// from the opposing side; `observe.ts` filters it before any planner sees it.

/** One monster at the moment of a journaled event. */
export interface JournalMon {
  side: 0 | 1;
  slot: number;
  species: number;
  level: number;
  types: TypeId[];
  hp: number;
  maxHp: number;
  stages: Record<StageKey, number>;
  /** Every condition the monster carried, visible or not. */
  conditions: { id: string; level?: number }[];
  turnsActive: number;
}

/** One `kind: 'attack'` damage hit that emitted a damage event. */
export interface JournalHit {
  type: 'hit';
  turn: number;
  /** Index in `battle.log` of the next event at the time of the hit. */
  logIndex: number;
  attacker: JournalMon;
  defender: JournalMon;
  skill: number;
  crit: boolean;
  effectiveness: number;
  /** Displayed damage, `amount + overkill`. */
  damage: number;
  hitIndex: number;
  actedFirst: boolean;
  /** True when something a public observer cannot reproduce may have changed the damage. */
  opaque: boolean;
  opaqueReasons: string[];
}

/** A turn in which both sides executed a move. Indexed by side. */
export interface JournalOrder {
  type: 'order';
  turn: number;
  logIndex: number;
  skills: [number, number];
  slots: [number, number];
  first: 0 | 1;
  speedTie: boolean;
  speStages: [number, number];
  /** Engine effective speeds used for ordering. Exact for both sides: read only your own. */
  effSpe: [number, number];
  /** Whether each active carried a `modify_priority` hook when the order was decided. */
  priorityHooks: [boolean, boolean];
  mons: [JournalMon, JournalMon];
}

export type JournalEntry = JournalHit | JournalOrder;

/** `battle.probeDamage` options: a fixed roll in RANDOM_MIN..RANDOM_MAX and a fixed crit. */
export interface DamageProbe {
  roll: number;
  crit: boolean;
  /** For `acted_first` power conditions; defaults to the current turn order. */
  actedFirst?: boolean;
  /** Treat this side's side-level rules as unknown (none), for a public observer's model of it. */
  unknownRulesSide?: 0 | 1;
}

// ---------- scripts ----------

// A script is either a plain function (run as an effect op / hook) or an
// object whose members are called at specific points of a move:
//   apply        effect phase (after damage), like any effect op
//   power        variable power, before damage: (c, params, power) => power
//   priority     (c, params) => priority
//   crit         (c, params) => { force?, add? }
//   accuracy     (c, params) => true (sure hit) | false (miss) | undefined
//   defense      (c, params, D) => D (e.g. ignore defense boosts)
//   modifyDamage (c, params, damage) => damage, before condition mods
//   finalDamage  (c, params, damage) => damage, after every mod (floors, leave 1 HP)
//   ppCost       (c, params) => PP spent
//   onMiss       (c, params) => void
//   hook         condition hooks with `script` (c includes `point`)
export type ScriptFn = (ctx: any, params: any) => unknown;
export interface ScriptEntry {
  apply?: ScriptFn;
  power?: (ctx: any, params: any, power: number) => number | void;
  priority?: (ctx: any, params: any) => number | void;
  crit?: (ctx: any, params: any) => { force?: boolean; add?: number } | void;
  accuracy?: (ctx: any, params: any) => boolean | void;
  defense?: (ctx: any, params: any, def: number) => number | void;
  modifyDamage?: (ctx: any, params: any, damage: number) => number | void;
  finalDamage?: (ctx: any, params: any, damage: number) => number | void;
  ppCost?: (ctx: any, params: any) => number | void;
  onMiss?: ScriptFn;
  hook?: ScriptFn;
  /** Boss rule scripts (`{ rule: 'script', id }`): called once per team member at battle start. */
  install?: (ctx: any, params: any) => void;
}
export type ScriptRegistry = Record<string, ScriptFn | ScriptEntry>;
