// The battle engine. Pure and deterministic: all randomness comes from this.rng,
// all output is the event list. Rules: battle/RULES.md.
//
// The class holds the state and the public API. The rules live in the modules
// beside it; its methods delegate to them, and the modules call each other
// through these methods, so a script or test that wraps a method sees every
// internal call. Every field is a plain own property (cloneBattle copies them).
// Decisions for automatic sides come from the injected `policy`; the engine
// never imports the AI (battle/core/src/battle.ts wires it in).

import type {
  Action, BattleEvent, BattleOptions, BattlePolicy, BattleResult, BossEncounter, ConditionDef, DamageProbe, DataSet, EffectOp,
  EncounterVariant, Hook, HookPoint, JournalEntry, MonsterInput, Objective, ScriptEntry, ScriptRegistry, SideInput, Skill, StageKey, Stats, When,
} from '../types.ts';
import * as C from '../constants.ts';
import { STRUGGLE_SKILL } from '../constants.ts';
import { Rng } from '../rng.ts';
import { computeStats } from '../stats.ts';
import {
  zeroStages, type ActiveCondition, type BattlePhase, type DamageInfo, type HitTrace, type Mon, type MoveCtx, type Side, type WhenCtx,
} from './state.ts';
import * as actions from './actions.ts';
import * as conditions from './conditions.ts';
import * as damage from './damage.ts';
import * as effects from './effects.ts';
import * as move from './move.ts';
import * as rules from './rules.ts';
import * as turn from './turn.ts';
import { evalWhen } from './when.ts';

export class Battle {
  data: DataSet;
  rng: Rng;
  sides: [Side, Side];
  turn = 0;
  phase: BattlePhase = 'choose';
  result: BattleResult | null = null;
  log: BattleEvent[] = [];
  initialEvents: BattleEvent[] = [];
  warnings: string[] = [];
  encounter?: BossEncounter;
  variant?: EncounterVariant;
  scripts: ScriptRegistry;
  /** Decides for automatic sides (wild, boss, trainer, or a player side with `ai`). */
  policy?: BattlePolicy;
  maxTurns: number;
  conventionalMoves?: (speciesId: number) => number[];
  /** Present only on a planner's isolated world; never on a live battle. */
  planning?: { forcedReplacement?: Partial<Record<0 | 1, number>> };
  /** Search planner: the successor a chosen sacrifice was planned with, per side and foe response. */
  sacrificePlans?: Partial<Record<0 | 1, { turn: number; slot: number; responses: number[]; successors: number[] }>>;
  phasesFired = new Set<number>();
  variantPhasesFired = new Set<number>();
  damageBySide: [number, number] = [0, 0];
  lastKo: { by?: Mon; skill?: Skill; crit?: boolean; target: Mon; targetStatuses: string[]; status?: string; turn: number } | null = null;
  defeated: BattleResult['defeated'] = [];
  capturedMon: Mon | null = null;
  usingItem = false;
  /** Observation journal (design/notes/trainer-search-ai-v58.md 12.2). Plain data; never read by game rules. */
  journal: JournalEntry[] = [];

  // Engine-internal state, read and written by the rule modules.
  /** Events emitted since the last flush (`initialEvents` during construction). */
  out: BattleEvent[] = [];
  /** The order of the current turn's actions, by side. */
  turnOrder: (0 | 1)[] = [];
  /** Nesting depth of moves and damage; the battle end is settled when it returns to 0. */
  damageDepth = 0;
  /** The attack hit being computed, for the journal; null outside it. */
  hitTrace: HitTrace | null = null;
  /** The ordinary priority/speed ordering of this turn, for the journal; null when there was none. */
  lastOrder: { tie: boolean; spe: [number, number] } | null = null;
  /** True only inside probeDamage: scripts, warnings and RNG-bearing branches are off. */
  probing = false;
  /** Inside probeDamage: the side whose side-level rules count as unknown (none). */
  probeUnknownRules: 0 | 1 | null = null;

  constructor(opts: BattleOptions) {
    this.data = opts.data;
    this.rng = new Rng(opts.seed);
    this.scripts = opts.scripts ?? {};
    this.policy = opts.policy;
    this.maxTurns = opts.maxTurns ?? C.MAX_TURNS;
    this.conventionalMoves = opts.conventionalMoves;
    this.encounter = opts.encounter;
    const enc = opts.encounter;
    const s1: SideInput | undefined = enc
      ? { ...stripTeam(opts.sides[1]), kind: enc.category === 'trainer' ? 'trainer' : 'boss', name: enc.name?.zh, team: enc.team,
        rules: enc.rules ?? [], ai: enc.ai ?? { kind: 'smart' } }
      : opts.sides[1];
    if (!s1) throw new Error('side 1 or an encounter is required');
    if (enc && opts.variant) {
      this.variant = rules.encounterVariant(enc, opts.variant);
      if (this.variant.rules) s1.rules = [...(s1.rules ?? []), ...this.variant.rules];
    }
    this.sides = [this.buildSide(0, opts.sides[0]), this.buildSide(1, s1)];
    if (!this.policy && this.sides.some(turn.isAuto)) throw new Error('a battle with an automatic side needs a policy (battle.ts createBattle injects the AI)');

    this.out = [];
    this.emit({ type: 'battle_start', sides: this.sides.map((s) => ({ kind: s.kind, name: s.name })) });
    for (const side of this.sides) {
      const first = side.team.findIndex((m) => !m.fainted);
      if (first < 0) throw new Error(`side ${side.index} has no monster able to battle`);
      side.active = first;
    }
    rules.installRuleScripts(this);
    for (const side of this.sides) this.switchIn(side, side.active);
    this.initialEvents = this.out;
    this.out = [];
  }

  // ---------- construction ----------

  private buildSide(index: 0 | 1, input: SideInput): Side {
    if (input.team.length === 0 || input.team.length > C.MAX_PARTY) throw new Error(`side ${index}: team size must be 1..${C.MAX_PARTY}`);
    const sideRules = structuredClone(input.rules ?? []);
    const side: Side = {
      index, kind: input.kind, name: input.name ?? (index === 0 ? 'player' : input.kind),
      team: [], active: 0, items: { ...(input.items ?? {}) }, rules: sideRules, ai: input.ai,
      unlimitedItems: new Set(input.unlimited_items ?? []),
      pending: null, needsReplacement: false,
    };
    side.team = input.team.map((m, slot) => this.buildMon(index, slot, m,
      sideRules.find((r) => r.rule === 'lives' && rules.ruleMatchesMember(r, slot))?.count ?? 0));
    return side;
  }

  buildMon(side: 0 | 1, slot: number, m: MonsterInput, lives: number): Mon {
    const species = this.data.species.get(m.species);
    if (!species) throw new Error(`unknown species ${m.species}`);
    if (m.skills.length === 0 || m.skills.length > C.MAX_SKILLS) throw new Error(`species ${m.species}: 1..${C.MAX_SKILLS} skills required`);
    for (const id of m.skills) if (!this.data.skills.has(id)) throw new Error(`unknown skill ${id}`);
    const nature = m.nature ? this.data.natures.get(m.nature) : undefined;
    const stats = { ...(m.stats ?? computeStats(species.base, m.level, m.iv ?? 0, m.evs ?? {}, nature)) };
    for (const [k, mult] of Object.entries(m.stat_multipliers ?? {})) {
      (stats as any)[k] = Math.floor((stats as any)[k] * (mult as number));
    }
    if (m.hp_override) stats.hp = m.hp_override;
    const overrides = m.skill_overrides ? structuredClone(m.skill_overrides) : undefined;
    const maxPp: Record<number, number> = {};
    const pp: Record<number, number> = {};
    for (const id of m.skills) {
      maxPp[id] = (overrides?.[id] ?? this.data.skills.get(id)!).pp;
      pp[id] = Math.min(maxPp[id], m.pp?.[id] ?? maxPp[id]);
    }
    const beadHooks: Hook[] = [];
    for (const bead of m.beads ?? []) {
      for (const [k, v] of Object.entries(bead.stats ?? {})) (stats as any)[k] += v as number;
      if (bead.crit_rate_add) beadHooks.push({ on: 'modify_crit_rate', add: bead.crit_rate_add });
      const both = bead.damage_taken_and_dealt_multiplier;
      const dealt = bead.damage_dealt_multiplier ?? both;
      const taken = bead.damage_taken_multiplier ?? both;
      if (dealt !== undefined) beadHooks.push({ on: 'modify_damage_dealt', multiplier: dealt });
      if (taken !== undefined) beadHooks.push({ on: 'modify_damage_taken', multiplier: taken });
    }
    const hp = Math.min(stats.hp, m.hp ?? stats.hp);
    const mon: Mon = {
      side, slot, uid: m.uid, species, name: m.nickname || species.name.zh, level: m.level,
      types: [...(m.types ?? species.types)], stats, maxHp: stats.hp, hp, skills: [...m.skills], skillOverrides: overrides, pp, maxPp,
      stages: zeroStages(), conditions: [], fainted: hp <= 0, livesLeft: lives, turnsActive: 0, lastActedTurn: -1,
      usedSkills: new Set(), skillUses: {}, streak: { skill: -1, count: 0, turn: -1 }, vol: {}, persist: {},
      facedBy: new Set(), aiCursor: 0, rules: structuredClone(m.member_rules ?? []), phases: structuredClone(m.member_phases ?? []), phasesFired: new Set(),
    };
    if (beadHooks.length) {
      const def: ConditionDef = { id: 'energy_bead', name: { zh: '能量珠' }, kind: 'buff', removed_on_switch: false, hooks: beadHooks };
      mon.conditions.push({ id: def.id, def, turns: Infinity, appliedTurn: 0 });
    }
    return mon;
  }

  // ---------- public API ----------

  active(side: 0 | 1): Mon {
    const s = this.sides[side];
    return s.team[s.active];
  }

  foeOf(mon: Mon): Mon {
    return this.active((1 - mon.side) as 0 | 1);
  }

  legalActions(sideIndex: 0 | 1): Action[] { return actions.legalActions(this, sideIndex); }

  isLegal(sideIndex: 0 | 1, action: Action): boolean { return actions.isLegal(this, sideIndex, action); }

  submit(sideIndex: 0 | 1, action: Action): void {
    if (this.phase === 'ended') throw new Error('battle has ended');
    if (!this.isLegal(sideIndex, action)) throw new Error(`illegal action for side ${sideIndex}: ${JSON.stringify(action)}`);
    this.sides[sideIndex].pending = action;
  }

  needsInput(sideIndex: 0 | 1): boolean {
    const side = this.sides[sideIndex];
    if (this.phase === 'ended' || side.pending) return false;
    if (this.phase === 'replace') return side.needsReplacement && !turn.isAuto(side);
    return !turn.isAuto(side);
  }

  resolveTurn(): BattleEvent[] {
    if (this.phase === 'ended') return [];
    this.out = [];
    rules.checkEnd(this);
    const retreat = this.sides.find((side) => side.pending?.kind === 'flee');
    if (!this.result && retreat) this.doAction(retreat.index, { kind: 'flee' }, true);
    else if (!this.result && this.phase === 'replace') turn.resolveReplacements(this);
    else if (!this.result) turn.resolveFullTurn(this);
    for (const s of this.sides) s.pending = null;
    const events = this.out;
    this.log.push(...events);
    this.out = [];
    return events;
  }

  /**
   * Events of the turn being resolved that are not yet in `log` (for decisions made
   * mid-turn, such as a faint replacement). Indexed after `log`: event k is at
   * `log.length + k`, matching journal `logIndex`. Empty between turns.
   */
  get turnEvents(): readonly BattleEvent[] {
    return this.out === this.initialEvents ? [] : this.out;
  }

  get state() {
    return {
      turn: this.turn,
      phase: this.phase,
      rng: [...this.rng.s],
      sides: this.sides.map((s) => ({
        kind: s.kind, name: s.name, active: s.active, items: { ...s.items },
        ...(s.unlimitedItems.size ? {unlimited_items: [...s.unlimitedItems]} : {}),
        needsReplacement: s.needsReplacement,
        team: s.team.map((m) => ({
          uid: m.uid, slot: m.slot, species: m.species.id, name: m.name, level: m.level, types: [...m.types],
          hp: m.hp, maxHp: m.maxHp, fainted: m.fainted, stats: { ...m.stats }, stages: { ...m.stages },
          skills: m.skills.map((id) => ({ id, pp: m.pp[id], maxPp: m.maxPp[id] })),
          conditions: m.conditions.map((c) => ({ id: c.id, turns: c.turns, level: c.level })),
          livesLeft: m.livesLeft,
        })),
      })),
      result: this.result,
    };
  }

  /** HP/PP to write back to the save after battle (statuses never persist). */
  exportTeam(sideIndex: 0 | 1) {
    return this.sides[sideIndex].team.map((m) => ({ uid: m.uid, slot: m.slot, hp: Math.max(0, m.hp), pp: { ...m.pp } }));
  }

  get winList(): Objective[] {
    return this.variant?.win ?? this.encounter?.win ?? [];
  }

  get loseList(): Objective[] {
    return this.variant?.lose ?? this.encounter?.lose ?? [];
  }

  // ---------- turn flow (turn.ts) ----------

  doAction(i: 0 | 1, action: Action, first: boolean): void { turn.doAction(this, i, action, first); }

  switchIn(side: Side, slot: number): void { turn.switchIn(this, side, slot); }

  endOfTurn(): void { turn.endOfTurn(this); }

  // ---------- moves (move.ts) ----------

  /** Catalog skill, or the owner's override (skill engravings) when `mon` is given. */
  skill(id: number, mon?: Mon): Skill {
    if (id === STRUGGLE_SKILL.id) return STRUGGLE_SKILL;
    const s = mon?.skillOverrides?.[id] ?? this.data.skills.get(id);
    if (!s) throw new Error(`unknown skill ${id}`);
    return s;
  }

  priority(mon: Mon, skill: Skill): number { return move.priority(this, mon, skill); }

  useMove(user: Mon, target: Mon, skill: Skill, actedFirst: boolean): void { move.useMove(this, user, target, skill, actedFirst); }

  // ---------- damage (damage.ts) ----------

  calcAttack(user: Mon, target: Mon, skill: Skill, ctx?: Partial<MoveCtx>, opts: damage.AttackOptions = {}): damage.Attack {
    return damage.calcAttack(this, user, target, skill, ctx, opts);
  }

  probeDamage(user: Mon, target: Mon, skill: Skill, opts: DamageProbe): number { return damage.probeDamage(this, user, target, skill, opts); }

  estimateDamage(user: Mon, target: Mon, skill: Skill): number { return damage.estimateDamage(this, user, target, skill); }

  effStat(mon: Mon, stat: StageKey & keyof Stats): number { return damage.effStat(this, mon, stat); }

  dealDamage(target: Mon, raw: number, info: DamageInfo): number { return damage.dealDamage(this, target, raw, info); }

  heal(mon: Mon, amount: number, opts: { item?: boolean } = {}): number { return damage.heal(this, mon, amount, opts); }

  // ---------- conditions and hooks (conditions.ts) ----------

  applyStatus(target: Mon, status: string, opts: conditions.StatusOptions): boolean { return conditions.applyStatus(this, target, status, opts); }

  addCondition(target: Mon, def: ConditionDef, turns?: number | [number, number], level?: number, charges?: number): boolean {
    return conditions.addCondition(this, target, def, turns, level, charges);
  }

  useCharge(mon: Mon, cond: ActiveCondition): void { conditions.useCharge(this, mon, cond); }

  removeCondition(mon: Mon, id: string, expired = false): void { conditions.removeCondition(this, mon, id, expired); }

  rollTurns(t: ConditionDef['default_turns']): number { return conditions.rollTurns(this, t); }

  script(id: string): ScriptEntry | undefined { return conditions.script(this, id); }

  /** Call every `script` hook at this point; returns their non-undefined results. */
  fire(mon: Mon, point: HookPoint, extra: Record<string, unknown> = {}): unknown[] { return conditions.fire(this, mon, point, extra); }

  hooks(mon: Mon, on: HookPoint): Hook[] { return this.hooksWithCond(mon, on).map((x) => x.hook); }

  hooksWithCond(mon: Mon, on: HookPoint): { cond: ActiveCondition; hook: Hook }[] { return conditions.hooksWithCond(mon, on); }

  callScript(id: string, ctx: unknown, params: unknown): unknown { return conditions.callScript(this, id, ctx, params); }

  // ---------- effects (effects.ts) ----------

  runEffects(ops: EffectOp[], user: Mon, foe: Mon, ctx: MoveCtx, filter?: (op: EffectOp) => boolean): void {
    effects.runEffects(this, ops, user, foe, ctx, filter);
  }

  changeStage(mon: Mon, stat: StageKey, delta: number, byFoe: boolean): void { effects.changeStage(this, mon, stat, delta, byFoe); }

  clearStages(mon: Mon, which: 'up' | 'down' | 'all', byFoe = false): void { effects.clearStages(this, mon, which, byFoe); }

  evalWhen(when: When | undefined, c: WhenCtx): boolean { return evalWhen(this, when, c); }

  // ---------- boss rules, phases and objectives (rules.ts) ----------

  /** Returns true if any phase fired. */
  checkPhases(mon: Mon, extra: { onFaint?: boolean } = {}): boolean { return rules.checkPhases(this, mon, extra); }

  objectiveMet(o: Objective): boolean { return rules.objectiveMet(this, o); }

  /** Dynamic execution policy adopted for Moshidilu in V57. */
  forcedExecution(mon: Mon): boolean { return rules.forcedExecution(this, mon); }

  /** Boss traits that switch on below an HP threshold (rule) or from a phase op. */
  bossTrait(mon: Mon, trait: 'ohko_below_pct' | 'always_crit_below_pct'): boolean { return rules.bossTrait(this, mon, trait); }

  // ---------- output ----------

  emit(e: BattleEvent): void {
    this.out.push(e);
  }

  warn(msg: string): void {
    if (this.probing) return;
    if (!this.warnings.includes(msg)) this.warnings.push(msg);
    this.emit({ type: 'warning', message: msg });
  }
}

function stripTeam(s: SideInput | undefined): Partial<SideInput> {
  if (!s) return {};
  const { team: _t, kind: _k, ...rest } = s;
  return rest;
}
