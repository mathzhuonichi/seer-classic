// The battle core. Pure and deterministic: all randomness comes from this.rng,
// all output is the event list. Rules: battle/RULES.md.

import type {
  Action, AiSpec, BattleEvent, BattleOptions, BattleResult, BossEncounter, BossRule,
  ConditionDef, DamageKind, DataSet, EffectOp, Hook, HookPoint, MonsterInput,
  Objective, Phase, ScriptEntry, ScriptRegistry, SideInput, Skill, Species, StageKey, Stats, When,
} from './types.ts';
import * as C from './constants.ts';
import { Rng } from './rng.ts';
import { computeStats } from './stats.ts';
import { attackTypes, effectiveness, hasAttackType, typeIdentity } from './typechart.ts';
import { chooseAiAction, chooseAiReplacement } from './ai.ts';
import { requiresTrainerSupportFallback } from './tactics.ts';
import { meetsWildCapturePrerequisite, rollReconstructedCapture } from './capture.ts';

export const STRUGGLE_SKILL: Skill = {
  id: C.STRUGGLE.id, name: { zh: '挣扎', en: 'Struggle' }, type: '__none', category: 'physical',
  power: C.STRUGGLE.power, accuracy: null, pp: 0, priority: 0,
  effects: [{ op: 'recoil', pct_max_hp: C.STRUGGLE.recoilFraction * 100 }],
};

const STAGES: StageKey[] = ['atk', 'def', 'spa', 'spd', 'spe', 'acc', 'eva'];

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
  user?: Mon;
  target?: Mon;
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
  scripts: ScriptRegistry;
  maxTurns: number;
  phasesFired = new Set<number>();
  damageBySide: [number, number] = [0, 0];
  lastKo: { by?: Mon; skill?: Skill; crit?: boolean; target: Mon; targetStatuses: string[]; status?: string; turn: number } | null = null;
  defeated: BattleResult['defeated'] = [];
  variant?: { id: string; win?: Objective[]; lose?: Objective[]; rules?: BossRule[]; phases?: Phase[] };
  private variantPhasesFired = new Set<number>();
  capturedMon: Mon | null = null;
  usingItem = false;
  private out: BattleEvent[] = [];
  private turnOrder: (0 | 1)[] = [];
  private damageDepth = 0;

  constructor(opts: BattleOptions) {
    this.data = opts.data;
    this.rng = new Rng(opts.seed);
    this.scripts = opts.scripts ?? {};
    this.maxTurns = opts.maxTurns ?? C.MAX_TURNS;
    this.encounter = opts.encounter;
    const enc = opts.encounter;
    const s1: SideInput | undefined = enc
      ? { ...stripTeam(opts.sides[1]), kind: enc.category === 'trainer' ? 'trainer' : 'boss', name: enc.name?.zh, team: enc.team, rules: enc.rules ?? [], ai: enc.ai ?? { kind: 'smart' } }
      : opts.sides[1];
    if (!s1) throw new Error('side 1 or an encounter is required');
    if (enc && opts.variant) {
      const v = ((enc as any).variants ?? []).find((x: any) => x.id === opts.variant);
      if (!v) throw new Error(`unknown variant ${opts.variant}`);
      this.variant = v;
      if (v.rules) s1.rules = [...(s1.rules ?? []), ...v.rules];
    }
    this.sides = [this.buildSide(0, opts.sides[0]), this.buildSide(1, s1)];

    this.out = [];
    this.emit({ type: 'battle_start', sides: this.sides.map((s) => ({ kind: s.kind, name: s.name })) });
    for (const side of this.sides) {
      const first = side.team.findIndex((m) => !m.fainted);
      if (first < 0) throw new Error(`side ${side.index} has no monster able to battle`);
      side.active = first;
    }
    this.installRuleScripts();
    for (const side of this.sides) this.switchIn(side, side.active);
    this.initialEvents = this.out;
    this.out = [];
  }

  // ---------- construction ----------

  private buildSide(index: 0 | 1, input: SideInput): Side {
    if (input.team.length === 0 || input.team.length > C.MAX_PARTY) throw new Error(`side ${index}: team size must be 1..${C.MAX_PARTY}`);
    const rules = structuredClone(input.rules ?? []);
    const side: Side = {
      index, kind: input.kind, name: input.name ?? (index === 0 ? 'player' : input.kind),
      team: [], active: 0, items: { ...(input.items ?? {}) }, rules, ai: input.ai,
      unlimitedItems: new Set(input.unlimited_items ?? []),
      pending: null, needsReplacement: false,
    };
    side.team = input.team.map((m, slot) => this.buildMon(index, slot, m,
      rules.find((r) => r.rule === 'lives' && ruleMatchesMember(r, slot))?.count ?? 0));
    return side;
  }

  private buildMon(side: 0 | 1, slot: number, m: MonsterInput, lives: number): Mon {
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

  /** Boss rules written as `{ rule: 'script', id, params }`: aliases of native rules, or scripts with `install`. */
  private installRuleScripts(): void {
    for (const side of this.sides) {
      const installRules = (rules: BossRule[], members: Mon[]) => {
        for (const r of [...rules]) {
          if (r.rule !== 'script') {
            const fields = NATIVE_BOSS_RULE_FIELDS[r.rule];
            if (!fields) this.warn(`unknown native boss rule ${r.rule}`);
            else for (const key of Object.keys(r)) if (!['rule','member',...fields].includes(key)) this.warn(`unsupported boss rule field ${r.rule}.${key}`);
            continue;
          }
          const alias = RULE_ALIASES[r.id];
          if (alias) { rules.push({ ...(r.params ?? {}), ...(r.member === undefined ? {} : {member:r.member}), rule: alias }); continue; }
          const install = this.script(r.id)?.install;
          if (!install) { this.warn(`unknown rule script ${r.id}`); continue; }
          for (const mon of members) if (ruleMatchesMember(r, mon.slot)) install({ battle: this, mon, side }, r.params ?? {});
        }
      };
      installRules(side.rules, side.team);
      for (const mon of side.team) {
        installRules(mon.rules, [mon]);
        const lives = mon.rules.find(r => r.rule === 'lives' && ruleMatchesMember(r, mon.slot));
        if (lives) mon.livesLeft = lives.count;
      }
    }
  }

  // ---------- public API ----------

  active(side: 0 | 1): Mon {
    const s = this.sides[side];
    return s.team[s.active];
  }

  legalActions(sideIndex: 0 | 1): Action[] {
    if (this.phase === 'ended') return [];
    const side = this.sides[sideIndex];
    const foeSide = this.sides[1 - sideIndex];
    const bench = side.team.filter((m) => !m.fainted && m.slot !== side.active).map((m) => ({ kind: 'switch' as const, slot: m.slot }));
    if (this.phase === 'replace') return side.needsReplacement
      ? [...bench, { kind: 'flee' }] : side.kind === 'player' ? [{ kind: 'flee' }] : [];

    const mon = this.active(sideIndex);
    const actions: Action[] = [];
    const execution = this.forcedExecution(mon);
    const usable = mon.skills.filter((id) => mon.pp[id] > 0 && (!execution || this.isAttackSkill(mon, id)));
    if (usable.length) {
      for (const id of usable) actions.push({ kind: 'move', skill: id });
      if (requiresTrainerSupportFallback(this, side)) actions.push({kind:'move',skill:STRUGGLE_SKILL.id});
    }
    else actions.push({ kind: 'move', skill: STRUGGLE_SKILL.id });

    const switchBlocked = hasRule(foeSide, 'no_switch') || this.hooks(mon, 'block_switch').length > 0;
    if (!switchBlocked) actions.push(...bench);
    if (!hasRule(foeSide, 'no_items')) {
      for (const id of new Set([...Object.keys(side.items), ...side.unlimitedItems])) {
        const item = this.data.items.get(id);
        if (((side.items[id] ?? 0) > 0 || side.unlimitedItems.has(id)) && item?.battle_effects?.length) {
          const revives = item.battle_effects.some((effect) => effect.op === 'revive');
          for (const target of side.team.filter((member) => revives ? member.fainted : !member.fainted)) {
            if (item.battle_effects.some(effect => {
              if (effect.target === 'foe') return true;
              if (effect.op === 'heal') return target.hp < target.maxHp;
              if (effect.op === 'restore_pp') return (effect.skill ? [effect.skill] : target.skills).some(skill => target.pp[skill] < target.maxPp[skill]);
              if (effect.op === 'cure_status') return target.conditions.some(condition => condition.def.kind === 'status' && (!effect.statuses || effect.statuses.includes(condition.id)));
              return true;
            })) actions.push({ kind: 'item', item: id, target: target.slot });
          }
        }
      }
    }
    if (foeSide.kind === 'wild' && !hasRule(foeSide, 'no_capture') &&
      meetsWildCapturePrerequisite(this.active(foeSide.index).species.id, mon.species.id)) {
      for (const id of new Set([...Object.keys(side.items), ...side.unlimitedItems])) {
        const item = this.data.items.get(id);
        if (((side.items[id] ?? 0) > 0 || side.unlimitedItems.has(id)) && item && 'capture_multiplier' in item) actions.push({ kind: 'capture', item: id });
      }
    }
    actions.push({ kind: 'flee' });
    return actions;
  }

  submit(sideIndex: 0 | 1, action: Action): void {
    if (this.phase === 'ended') throw new Error('battle has ended');
    if (!this.isLegal(sideIndex, action)) throw new Error(`illegal action for side ${sideIndex}: ${JSON.stringify(action)}`);
    this.sides[sideIndex].pending = action;
  }

  needsInput(sideIndex: 0 | 1): boolean {
    const side = this.sides[sideIndex];
    if (this.phase === 'ended' || side.pending) return false;
    if (this.phase === 'replace') return side.needsReplacement && !this.isAuto(side);
    return !this.isAuto(side);
  }

  resolveTurn(): BattleEvent[] {
    if (this.phase === 'ended') return [];
    this.out = [];
    this.checkEnd();
    const retreat = this.sides.find((side) => side.pending?.kind === 'flee');
    if (!this.result && retreat) this.doAction(retreat.index, { kind: 'flee' }, true);
    else if (!this.result && this.phase === 'replace') this.resolveReplacements();
    else if (!this.result) this.resolveFullTurn();
    for (const s of this.sides) s.pending = null;
    const events = this.out;
    this.log.push(...events);
    this.out = [];
    return events;
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

  // ---------- turn flow ----------

  private isAuto(side: Side): boolean {
    return side.kind !== 'player' || !!side.ai;
  }

  private isLegal(sideIndex: 0 | 1, action: Action): boolean {
    const normalized = action.kind === 'item' && action.target === undefined
      ? { ...action, target: this.sides[sideIndex].active } : action;
    return this.legalActions(sideIndex).some((a) => sameAction(a, normalized));
  }

  private actionFor(side: Side): Action {
    if (side.pending) return side.pending;
    if (!this.isAuto(side)) throw new Error(`side ${side.index} has not submitted an action`);
    if (this.phase === 'replace') return chooseAiReplacement(this, side) ?? this.legalActions(side.index)[0];
    if (this.forcedExecution(this.active(side.index))) return this.legalActions(side.index).find(action => action.kind === 'move')!;
    for (const action of this.fire(this.active(side.index), 'choose_action', {side})) {
      if (action && this.isLegal(side.index, action as Action)) return action as Action;
    }
    return chooseAiAction(this, side);
  }

  private resolveReplacements(): void {
    for (const side of this.sides) {
      if (!side.needsReplacement) continue;
      const a = this.actionFor(side);
      if (a.kind !== 'switch') throw new Error('replacement must be a switch');
      this.switchIn(side, a.slot);
      side.needsReplacement = false;
      if (this.result) return;
    }
    this.checkEnd();
    if (!this.result) { this.phase = 'choose'; this.queueReplacements(); }
  }

  private resolveFullTurn(): void {
    const actions: [Action, Action] = [this.actionFor(this.sides[0]), this.actionFor(this.sides[1])];
    this.turn++;
    this.emit({ type: 'turn_start', turn: this.turn });
    this.markFaced();
    for (const s of this.sides) {
      const m = this.active(s.index);
      m.turnsActive++;
      this.runHookEffects(m, 'turn_start');
      // Innate first-turn boosts and turn thresholds must apply before moves.
      this.checkPhases(m);
    }

    const order = this.orderActions(actions);
    this.turnOrder = order;
    const actors = order.map((i) => this.active(i));
    for (let k = 0; k < order.length; k++) {
      if (this.result) break;
      const i = order[k];
      const action = actions[i];
      const mon = this.active(i);
      if (action.kind === 'move' && (mon !== actors[k] || mon.fainted)) continue;
      this.doAction(i, action, k === 0);
    }

    if (!this.result) this.endOfTurn();
    if (!this.result) this.checkEnd();
    if (!this.result && this.turn >= this.maxTurns) this.finish(null, 'turn_cap');
    if (!this.result) this.queueReplacements();
  }

  private orderActions(actions: [Action, Action]): (0 | 1)[] {
    const rank = (i: 0 | 1) => {
      const a = actions[i];
      if (a.kind !== 'move') return { cls: 1, execution: false, pri: 0, spe: 0 };
      const mon = this.active(i);
      const skill = this.skill(a.skill, mon);
      return { cls: 0, execution: this.forcedExecution(mon), pri: this.priority(mon, skill), spe: this.effStat(mon, 'spe') };
    };
    const r0 = rank(0), r1 = rank(1);
    if (r0.cls !== r1.cls) return r0.cls > r1.cls ? [0, 1] : [1, 0];
    if (r0.cls === 1) return [0, 1];
    if (r0.execution !== r1.execution) return r0.execution ? [0, 1] : [1, 0];
    if (r0.pri !== r1.pri) return r0.pri > r1.pri ? [0, 1] : [1, 0];
    if (r0.spe !== r1.spe) return r0.spe > r1.spe ? [0, 1] : [1, 0];
    return this.rng.next() < 0.5 ? [0, 1] : [1, 0];
  }

  private doAction(i: 0 | 1, action: Action, first: boolean): void {
    const side = this.sides[i];
    this.active(i).lastActedTurn = this.turn;
    const foe = this.sides[1 - i];
    switch (action.kind) {
      case 'flee':
        this.emit({ type: 'flee', side: i });
        this.finish((1 - i) as 0 | 1, 'flee');
        return;
      case 'switch':
        this.switchIn(side, action.slot);
        return;
      case 'item':
        this.useItem(side, action.item, action.target ?? side.active);
        return;
      case 'capture':
        this.tryCapture(side, foe, action.item);
        return;
      case 'move':
        if (this.active(foe.index).fainted) {
          this.emit({ type: 'no_target', side: i });
          return;
        }
        this.useMove(this.active(i), this.active(foe.index), this.skill(action.skill, this.active(i)), first);
        if (!this.result) this.checkBossFlee(this.active(i), this.skill(action.skill, this.active(i)));
    }
  }

  private queueReplacements(): void {
    let playerWaits = false;
    for (const side of this.sides) {
      if (!this.active(side.index).fainted) continue;
      if (!side.team.some((m) => !m.fainted)) continue;
      side.needsReplacement = true;
      if (this.isAuto(side)) {
        const replacement = chooseAiReplacement(this, side);
        const slot = replacement?.kind === 'switch' ? replacement.slot : side.team.find((m) => !m.fainted)!.slot;
        this.switchIn(side, slot);
        side.needsReplacement = false;
      } else playerWaits = true;
    }
    if (playerWaits) this.phase = 'replace';
  }

  // ---------- switching ----------

  switchIn(side: Side, slot: number): void {
    const prev = side.team[side.active];
    if (prev && prev.slot !== slot && !prev.fainted && this.turn > 0) {
      this.emit({ type: 'switch_out', side: side.index, slot: prev.slot });
    }
    if (prev && prev.slot !== slot) this.resetOnSwitch(prev);
    side.active = slot;
    const mon = side.team[slot];
    mon.turnsActive = 0;
    this.emit({ type: 'switch_in', side: side.index, slot, species: mon.species.id, types: [...mon.types], name: mon.name, hp: mon.hp, maxHp: mon.maxHp, level: mon.level });
    this.runHookEffects(mon, 'on_switch_in');
    if (mon.side === 1 && mon.phases.length) this.checkPhases(mon);
    if (this.sides.every((x) => x.team[x.active])) this.markFaced();
  }

  private markFaced(): void {
    const p = this.active(0), f = this.active(1);
    if (!p.fainted && !f.fainted) f.facedBy.add(p.uid ?? `slot${p.slot}`);
  }

  private resetOnSwitch(mon: Mon): void {
    mon.stages = zeroStages();
    mon.vol = {};
    mon.conditions = mon.conditions.filter((c) => c.def.removed_on_switch === false);
  }

  // ---------- moves ----------

  /** Catalog skill, or the owner's override (skill engravings) when `mon` is given. */
  skill(id: number, mon?: Mon): Skill {
    if (id === STRUGGLE_SKILL.id) return STRUGGLE_SKILL;
    const s = mon?.skillOverrides?.[id] ?? this.data.skills.get(id);
    if (!s) throw new Error(`unknown skill ${id}`);
    return s;
  }

  priority(mon: Mon, skill: Skill): number {
    let p = skill.priority ?? 0;
    const foe = this.foeOf(mon);
    for (const op of skill.effects ?? []) {
      if (op.op === 'priority_if' && this.evalWhen(op.when, { self: mon, foe })) p = op.priority;
      if (op.op === 'script') {
        const r = this.script(op.id)?.priority?.({ battle: this, user: mon, foe, skill }, op.params);
        if (typeof r === 'number') p = r;
      }
    }
    for (const r of this.fire(mon, 'modify_priority', { skill, priority: p })) if (typeof r === 'number') p = r;
    return p;
  }

  private skillScripts(skill: Skill): { entry: ScriptEntry; op: EffectOp }[] {
    const out: { entry: ScriptEntry; op: EffectOp }[] = [];
    for (const op of skill.effects ?? []) {
      if (op.op !== 'script') continue;
      const entry = this.script(op.id);
      if (entry) out.push({ entry, op });
    }
    return out;
  }

  private useMove(user: Mon, target: Mon, skill: Skill, actedFirst: boolean): void {
    // Complete the move's recoil, drain and other effects before deciding a KO result.
    this.damageDepth++;
    try { this.performMove(user, target, skill, actedFirst); }
    finally {
      this.damageDepth--;
      if (this.damageDepth === 0) this.checkEnd();
    }
  }

  private performMove(user: Mon, target: Mon, skill: Skill, actedFirst: boolean): void {
    // This explicit encounter policy guarantees the next attack while active.
    // Re-evaluate current HP so healing above the threshold ends the mode.
    const execution = this.forcedExecution(user);
    if (execution && !this.isAttackSkill(user, skill.id)) {
      const attack = user.skills.find(id => user.pp[id] > 0 && this.isAttackSkill(user, id));
      skill = attack === undefined ? STRUGGLE_SKILL : this.skill(attack, user);
    }
    // 1. can act?
    for (const { cond, hook } of execution ? [] : this.hooksWithCond(user, 'before_move')) {
      if (hook.prevent) {
        this.emit({ type: 'cant_act', side: user.side, reason: cond.id });
        return;
      }
    }
    for (const r of execution ? [] : this.fire(user, 'before_move', { skill, foe: target })) {
      if (r === 'prevent') { this.emit({ type: 'cant_act', side: user.side, reason: 'script' }); return; }
    }
    const userSide = this.sides[user.side];
    if (!execution && skill.id === STRUGGLE_SKILL.id && hasRule(userSide, 'no_struggle')) {
      this.emit({ type: 'cant_act', side: user.side, reason: 'no_pp' });
      return;
    }
    // 2. PP
    let ppCost = hasRule(userSide, 'unlimited_pp') ? 0 : (skill.pp_cost ?? 1);
    for (const r of this.fire(user, 'pp_cost', { skill })) if (typeof r === 'number') ppCost = r;
    for (const { entry, op } of this.skillScripts(skill)) {
      const r = entry.ppCost?.({ battle: this, user, foe: target, skill }, op.params);
      if (typeof r === 'number') ppCost = r;
    }
    if (skill.id !== STRUGGLE_SKILL.id) user.pp[skill.id] = Math.max(0, user.pp[skill.id] - ppCost);
    user.usedSkills.add(skill.id);
    user.streak = user.streak.skill === skill.id && user.lastActedTurn === this.turn && user.streak.turn === this.turn - 1
      ? { skill: skill.id, count: user.streak.count + 1, turn: this.turn }
      : { skill: skill.id, count: 1, turn: this.turn };
    user.skillUses[skill.id] = (user.skillUses[skill.id] ?? 0) + 1;
    this.emit({ type: 'move_used', side: user.side, skill: skill.id, name: skill.name.zh });
    if (execution) {
      this.emit({ type: 'boss_trait', side: user.side, trait: 'forced_execution_below_pct' });
      this.dealDamage(target, target.hp, { kind: 'true', source: user, skill, ohko: true, forcedExecution: true });
      return;
    }
    for (const { cond, hook } of this.hooksWithCond(user, 'before_move')) {
      if (hook.fail_chance && this.rng.chance(hook.fail_chance)) {
        this.emit({ type: 'move_failed', side: user.side, reason: cond.id });
        if (hook.self_damage && this.rng.chance(hook.self_damage.chance)) {
          this.dealDamage(user, hook.self_damage.amount, { kind: 'fixed' });
        }
        return;
      }
    }

    const ctx: MoveCtx = { skill, hit: true, crit: false, damageDealt: 0, effectiveness: 1, actedFirst, user, target };
    const targetsFoe = (skill.target ?? (skill.category === 'status' ? inferTarget(skill) : 'foe')) === 'foe';

    // the foe reacts to the move being used (e.g. 封印属性技能)
    for (const r of this.fire(target, 'on_foe_move', { foe: user, skill, ctx, targetsHolder: targetsFoe })) {
      if (r === 'negate') { this.emit({ type: 'move_failed', side: user.side, reason: 'negated' }); return; }
      if (r === 'miss') {
        ctx.hit = false;
        this.emit({ type: 'miss', side: user.side, skill: skill.id });
        for (const { entry, op } of this.skillScripts(skill)) entry.onMiss?.({ battle: this, user, foe: target, skill, ctx }, op.params);
        this.fire(user, 'on_miss', { foe: target, skill });
        this.fire(target, 'on_foe_miss', { foe: user, skill });
        return;
      }
    }

    // protect
    if (targetsFoe && this.hooks(target, 'block_move').length) {
      this.emit({ type: 'protected', side: target.side });
      return;
    }

    // 3. accuracy
    if (targetsFoe) {
      let forced: boolean | undefined;
      for (const { entry, op } of this.skillScripts(skill)) {
        const r = entry.accuracy?.({ battle: this, user, foe: target, skill, ctx }, op.params);
        if (typeof r === 'boolean') forced = r;
      }
      let hit: boolean;
      if (forced !== undefined) hit = forced;
      else if (skill.accuracy === null || this.hooks(user, 'modify_accuracy').some((h) => h.force_hit)) hit = true;
      else {
        let acc = skill.accuracy * C.accuracyStageMultiplier(user.stages.acc - target.stages.eva);
        for (const h of this.hooks(user, 'modify_accuracy')) {
          acc = acc * (h.multiplier ?? 1) + (h.add_percent ?? 0);
        }
        for (const h of this.hooks(target, 'modify_accuracy_taken')) {
          acc = acc * (h.multiplier ?? 1) - (h.add_percent ?? 0);
        }
        hit = this.rng.chance(acc);
      }
      if (hit) {
        for (const r of this.fire(target, 'before_hit', { foe: user, skill, ctx })) {
          if (r === 'evade') hit = false;
          if (r === 'block') { this.emit({ type: 'protected', side: target.side }); return; }
        }
      }
      if (!hit) {
        ctx.hit = false;
        this.emit({ type: 'miss', side: user.side, skill: skill.id });
        for (const { entry, op } of this.skillScripts(skill)) entry.onMiss?.({ battle: this, user, foe: target, skill, ctx }, op.params);
        this.fire(user, 'on_miss', { foe: target, skill });
        this.fire(target, 'on_foe_miss', { foe: user, skill });
        return;
      }
    }

    // 4. damage
    if (skill.category !== 'status' && (skill.power > 0 || this.hasPowerOp(skill))) {
      const multi = (skill.effects ?? []).find((e) => e.op === 'multi_hit');
      const hits = multi ? this.rng.int(multi.min ?? 2, multi.max ?? multi.min ?? 2) : 1;
      let landed = 0;
      let criticalDamage = false;
      for (let h = 0; h < hits && !target.fainted && !user.fainted; h++) {
        const r = this.calcAttack(user, target, skill, ctx);
        ctx.effectiveness = r.effectiveness;
        if (r.effectiveness === 0) {
          this.emit({ type: 'immune', side: target.side, skill: skill.id });
          break;
        }
        ctx.crit = ctx.crit || r.crit;
        let dmg = r.damage;
        for (const { entry, op } of this.skillScripts(skill)) {
          const m = entry.modifyDamage?.({ battle: this, user, foe: target, skill, ctx }, op.params, dmg);
          if (typeof m === 'number') dmg = m;
        }
        const dealt = this.dealDamage(target, dmg, { kind: 'attack', source: user, skill, crit: r.crit, effectiveness: r.effectiveness });
        ctx.damageDealt += dealt;
        criticalDamage ||= r.crit && dealt > 0;
        landed++;
      }
      if (hits > 1) this.emit({ type: 'multi_hit', side: user.side, hits: landed });
      // Classic critical hits use the boosted defence for this attack, then
      // remove only the corresponding positive defence stage. For multi-hit
      // moves, clear once after the damage sequence; exact historical per-hit
      // timing is unverified (design/notes/damage-formula-research.md).
      const defenceStat = skill.category === 'physical' ? 'def' : 'spd';
      const defenceStage = target.stages[defenceStat];
      if (criticalDamage && !target.fainted && defenceStage > 0) {
        const blocked = this.fire(target, 'on_stage_incoming', { stat: defenceStat, delta: -defenceStage, byFoe: true, clear: true }).includes(false);
        if (blocked) this.emit({ type: 'stage_blocked', side: target.side, stat: defenceStat });
        else {
          target.stages[defenceStat] = 0;
          this.emit({ type: 'stat_stage', side: target.side, name: target.name, stat: defenceStat, delta: -defenceStage, stage: 0, reason: 'critical' });
        }
      }
      if (ctx.effectiveness === 0) {
        this.runEffects(skill.effects ?? [], user, target, ctx, (op) => (op.target ?? 'foe') === 'self');
        return;
      }
    }

    // 5. effects
    this.runEffects(skill.effects ?? [], user, target, ctx);
    if (ctx.hit && targetsFoe) this.runHookEffects(user, 'on_hit', target, { skill, ctx });
  }

  private hasPowerOp(skill: Skill): boolean {
    return (skill.effects ?? []).some((e) => (e.op === 'power_if' && e.power) || (e.op === 'script' && this.script(e.id)?.power));
  }

  /** Damage before taken/dealt condition mods. Draws: crit, roll. */
  calcAttack(user: Mon, target: Mon, skill: Skill, ctx?: Partial<MoveCtx>, opts: { estimate?: boolean } = {}) {
    let power = skill.power;
    for (const op of skill.effects ?? []) {
      if (op.op === 'power_if') {
        if (!this.evalWhen(op.when, { self: user, foe: target, actedFirst: ctx?.actedFirst })) continue;
        if (op.chance !== undefined && op.chance < 100 && (opts.estimate || !this.rng.chance(op.chance))) continue;
        if (op.power) power = op.power;
        if (op.multiplier) power *= op.multiplier;
      } else if (op.op === 'script') {
        const fn = this.script(op.id)?.power;
        if (!fn) continue;
        const r = fn({ battle: this, user, foe: target, skill, ctx, estimate: !!opts.estimate }, op.params, power);
        if (typeof r === 'number') power = r;
      }
    }
    power += skill.power_bonus ?? 0;
    for (const r of this.fire(user, 'modify_power', { skill, power, foe: target })) if (typeof r === 'number') power = r;
    const physical = skill.category === 'physical';
    const A = this.effStat(user, physical ? 'atk' : 'spa');
    let D = this.effStat(target, physical ? 'def' : 'spd');
    for (const { entry, op } of this.skillScripts(skill)) {
      const r = entry.defense?.({ battle: this, user, foe: target, skill }, op.params, D);
      if (typeof r === 'number') D = r;
    }
    // Retained remake rounding; published classic formulas do not establish
    // the server's intermediate integer/truncation order.
    const base = Math.floor(((0.4 * user.level + 2) * power * A) / Math.max(1, D) / 50) + 2;
    // A dual creature receives one bonus for its own pair or either component.
    // A partially overlapping dual skill is not the creature's own type.
    const stab = attackTypes(this.data.types, skill.type).every(type => user.types.includes(type)) ? C.STAB : 1;
    const ignoreChart = hasRule(this.sides[target.side], 'ignore_type_chart', target);
    const eff = ignoreChart ? 1 : effectiveness(this.data.types, skill.type, target.types);

    let crit = false;
    let roll = (C.RANDOM_MIN + C.RANDOM_MAX) / 2;
    if (!opts.estimate) {
      let rate = skill.crit_rate ?? (skill.crit_stage !== undefined ? 1 + skill.crit_stage : C.DEFAULT_CRIT_RATE);
      let force = false;
      for (const op of skill.effects ?? []) {
        if (op.op === 'crit_if' && this.evalWhen(op.when, { self: user, foe: target })) {
          if (op.force) force = true;
          if (op.crit_rate) rate = op.crit_rate;
        }
        if (op.op === 'script') {
          const r = this.script(op.id)?.crit?.({ battle: this, user, foe: target, skill, ctx }, op.params);
          if (r?.force) force = true;
          if (r?.add) rate += r.add;
        }
      }
      for (const h of this.hooks(user, 'modify_crit_rate')) {
        if (h.force_crit) force = true;
        rate += h.add ?? 0;
      }
      for (const r of this.fire(user, 'modify_crit_rate', { skill, foe: target }) as any[]) {
        if (r?.force) force = true;
        if (r?.add) rate += r.add;
      }
      for (const r of this.fire(target, 'modify_crit_rate_taken', { rate, source: user, foe: user, skill }) as any[]) {
        if (r?.add) rate += r.add;
      }
      if (this.bossTrait(user, 'always_crit_below_pct')) force = true;
      const critRoll = this.rng.int(1, C.CRIT_DENOMINATOR);
      crit = (force || critRoll <= rate) && !hasRule(this.sides[target.side], 'immune_crit');
      roll = this.rng.int(C.RANDOM_MIN, C.RANDOM_MAX);
    }
    const damage = base * stab * eff * (roll / C.RANDOM_MAX) * (crit ? C.CRIT_MULTIPLIER : 1);
    return { damage, crit, effectiveness: eff, base, power };
  }

  /** Raw expected damage, no RNG (AI). */
  estimateDamage(user: Mon, target: Mon, skill: Skill): number {
    if (skill.category === 'status') return 0;
    const r = this.calcAttack(user, target, skill, {}, { estimate: true });
    let d = r.damage;
    for (const { cond, hook } of this.hooksWithCond(user, 'modify_damage_dealt')) {
      if (!(hook.kinds ?? ['attack']).includes('attack')) continue;
      if (hook.when && !this.evalWhen(hook.when, { self: user, foe: target, skill, kind: 'attack' })) continue;
      d *= levelMult(hook, cond);
    }
    return Math.floor(d);
  }

  effStat(mon: Mon, stat: StageKey & keyof Stats): number {
    let v = mon.stats[stat] * C.stageMultiplier(mon.stages[stat]);
    for (const h of this.hooks(mon, 'modify_stat')) if (h.stat === stat && !h.script) v *= h.multiplier ?? 1;
    for (const r of this.fire(mon, 'modify_stat', { stat, value: v })) if (typeof r === 'number') v = r;
    return v;
  }

  // ---------- damage ----------

  /** Damage transforms compose in condition order without changing unrelated hook dispatch. */
  private transformDamage(mon: Mon, point: 'modify_damage_outgoing' | 'modify_damage_final', amount: number, extra: { info: DamageInfo; foe?: Mon; source?: Mon; skill?: Skill }): number {
    let current = amount;
    for (const { cond, hook } of this.hooksWithCond(mon, point)) {
      if (!hook.script || !mon.conditions.includes(cond)) continue;
      const foe = extra.foe ?? this.foeOf(mon);
      if (hook.when && !this.evalWhen(hook.when, { self: mon, foe, skill: extra.skill, kind: extra.info.kind })) continue;
      const fn = this.script(hook.script)?.hook;
      if (!fn) { this.warn(`unknown script ${hook.script}`); continue; }
      const next = fn({ battle: this, point, holder: mon, cond, hook, foe, ...extra, amount: current }, hook.params);
      if (typeof next === 'number') current = Math.max(0, Math.floor(next));
    }
    return current;
  }

  dealDamage(target: Mon, raw: number, info: DamageInfo): number {
    this.damageDepth++;
    try { return this.applyDamage(target, raw, info); }
    finally {
      this.damageDepth--;
      // Retaliation can faint its source while the original defender is still
      // being processed. Settle both faints before deciding the result.
      if (this.damageDepth === 0) this.checkEnd();
    }
  }

  private applyDamage(target: Mon, raw: number, info: DamageInfo): number {
    if (target.fainted) return 0;
    const side = this.sides[target.side];
    let dmg = raw;
    const src = info.source;
    let zeroedByCondition = false;
    const trueCost = info.kind === 'true' && !info.ohko && (!src || src.side === target.side);

    if (info.kind !== 'true') {
      if (src) {
        for (const { cond, hook } of this.hooksWithCond(src, 'modify_damage_dealt')) {
          if (!(hook.kinds ?? ['attack']).includes(info.kind)) continue;
          if (hook.when && !this.evalWhen(hook.when, { self: src, foe: target, skill: info.skill, kind: info.kind })) continue;
          const multiplier = levelMult(hook, cond);
          if (multiplier === 0) zeroedByCondition = true;
          dmg *= multiplier;
          if (hook.consume_charge) this.useCharge(src, cond);
        }
      }
      const ignore = src?.persist.ignoreReduction;
      const ignoring = !!ignore && (ignore === true || (!!info.skill && (ignore as string[]).includes(info.skill.name.zh)));
      for (const { cond, hook } of this.hooksWithCond(target, 'modify_damage_taken')) {
        if (!(hook.kinds ?? ['attack']).includes(info.kind)) continue;
        if (hook.when && !this.evalWhen(hook.when, { self: target, foe: src, skill: info.skill, kind: info.kind })) continue;
        if (ignoring && levelMult(hook, cond) < 1) continue;
        const multiplier = levelMult(hook, cond);
        if (multiplier === 0) zeroedByCondition = true;
        dmg *= multiplier;
        if (hook.consume_charge) this.useCharge(target, cond);
      }
    }
    dmg = Math.floor(dmg);
    if (info.kind === 'attack' && raw > 0 && dmg < 1 && (info.effectiveness ?? 1) > 0) {
      // min 1 unless a condition explicitly zeroed it
      if (!zeroedByCondition) dmg = 1;
    }

    // boss executes: every attack KOs
    if (src && info.kind === 'attack' && this.bossTrait(src, 'ohko_below_pct')) dmg = Math.max(dmg, target.hp);

    // skill-level and condition-level final adjustments (shields, floors, endure)
    if (info.kind !== 'true' && info.skill && src) {
      for (const { entry, op } of this.skillScripts(info.skill)) {
        const m = entry.finalDamage?.({ battle: this, user: src, foe: target, skill: info.skill, info }, op.params, dmg);
        if (typeof m === 'number') dmg = Math.floor(m);
      }
    }
    if (info.kind !== 'true') {
      if (src) dmg = this.transformDamage(src, 'modify_damage_outgoing', dmg, { info, foe: target, skill: info.skill });
      dmg = this.transformDamage(target, 'modify_damage_final', dmg, { info, source: src, skill: info.skill });
    }

    // boss rules protecting the target's side
    const blocked = info.forcedExecution ? null : this.ruleBlocks(side, info, target);
    if (blocked) {
      this.emit({ type: 'damage_blocked', side: target.side, rule: blocked });
      return 0;
    }
    const cap = findRule(side, target, (r) => r.rule === 'damage_cap_per_hit');
    const capBreak = target.persist.capBreak as { statuses: string[]; chance: number } | undefined;
    const capBroken = !!capBreak && target.conditions.some((c) => capBreak.statuses.includes(c.id)) && this.rng.chance(capBreak.chance);
    if (cap && info.kind !== 'true' && (!cap.categories || cap.categories.includes(info.skill?.category)) && !capBroken) dmg = Math.min(dmg, cap.amount);
    const floor = findRule(side, target, (r) => r.rule === 'hp_floor_until');
    if (floor && !target.persist.floorBroken && !trueCost && !info.forcedExecution) {
      const skills: number[] = floor.skills ?? [floor.skill];
      if (info.skill && skills.includes(info.skill.id) && src?.side !== target.side) target.persist.floorBroken = true;
      else dmg = Math.min(dmg, Math.max(0, target.hp - 1));
    }
    if (info.skill && src && src.side !== target.side && info.kind === 'attack') side.lastHitType = typeIdentity(this.data.types, info.skill.type);

    const dealt = Math.min(dmg, target.hp);
    const rotation = findRule(side, target, r => r.rule === 'type_rotation');
    if (rotation && dealt > 0 && src && src.side !== target.side && info.skill) target.persist.typeRotationCursor = (target.persist.typeRotationCursor ?? 0) + 1;
    const targetStatuses = target.conditions.filter(c => c.def.kind === 'status').map(c => c.id);
    target.hp -= dealt;
    if (src && src.side !== target.side && dealt > 0) {
      const lt = target.persist.lastTaken;
      target.persist.lastTaken = lt?.turn === this.turn ? { turn: this.turn, amount: lt.amount + dealt } : { turn: this.turn, amount: dealt };
    }
    if (src && src.side !== target.side) this.damageBySide[src.side] += dealt;
    this.emit({
      type: 'damage', side: target.side, slot: target.slot, name: target.name, amount: dealt, kind: info.kind, hp: target.hp, maxHp: target.maxHp,
      crit: !!info.crit, status: info.status, sourceSide: src?.side, sourceName: src?.name, effectiveness: info.effectiveness, skill: info.skill?.id, overkill: dmg - dealt,
    });

    if (dealt > 0) this.fire(target, 'on_hurt', { source: src, amount: dealt, info, skill: info.skill });
    if (dealt > 0 && info.kind === 'attack') {
      for (const { cond, hook } of this.hooksWithCond(target, 'on_hurt')) {
        if (hook.cure_on_attack_hit) this.removeCondition(target, cond.id);
        if (hook.inflict_on_type && info.skill && hasAttackType(this.data.types, info.skill.type, hook.inflict_on_type.type)) {
          this.applyStatus(target, hook.inflict_on_type.status, {});
        }
        if (hook.reflect_pct && src && src !== target && !info.noReflect) {
          this.dealDamage(src, Math.floor((dealt * hook.reflect_pct) / 100), { kind: 'fixed', source: target, noReflect: true });
        }
        if (hook.effects) this.runEffects(hook.effects, target, src ?? this.foeOf(target), emptyCtx());
      }
    }

    const reflect = findRule(side, target, (r) => r.rule === 'reflect_damage');
    if (reflect && src && !info.noReflect && dealt > 0 && src.side !== target.side && dealt >= (reflect.min_damage ?? 0)) {
      this.dealDamage(src, Math.floor((dealt * reflect.pct) / 100), { kind: 'fixed', source: target, noReflect: true });
    }

    if (target.hp > 0) {
      const full = findRule(side, target, (r) => r.rule === 'heal_full_below');
      const threshold = full?.hp ?? (full?.pct === undefined ? undefined : target.maxHp * full.pct / 100);
      if (full && threshold !== undefined && target.hp < threshold && (full.times === undefined || (target.persist.fullHeals ?? 0) < full.times)) {
        target.persist.fullHeals = (target.persist.fullHeals ?? 0) + 1;
        const healed = target.maxHp - target.hp;
        target.hp = target.maxHp;
        this.emit({ type: 'heal', side: target.side, slot: target.slot, name: target.name, amount: healed, hp: target.hp, maxHp: target.maxHp, reason: 'heal_full_below' });
      }
    }
    if (target.hp <= 0) {
      this.handleFaint(target, info, targetStatuses);
      if (target.fainted && src && src !== target) this.fire(src, 'on_ko', { target, info, skill: info.skill });
    } else this.checkPhases(target);
    return dealt;
  }

  private ruleBlocks(side: Side, info: DamageInfo, target: Mon): string | null {
    const has = (r: string) => hasRule(side, r, target);
    if (info.kind === 'true' && !info.ohko) return null;
    const fromFoe = !!info.source && info.source.side !== side.index;
    if (fromFoe && info.kind === 'attack' && has('no_repeat_type') && info.skill && side.lastHitType === typeIdentity(this.data.types, info.skill.type)) return 'no_repeat_type';
    const req = findRule(side, target, (r) => r.rule === 'require_statuses');
    if (req && target.conditions.filter((c) => c.def.kind === 'status').length < req.count) return 'require_statuses';
    if (info.ohko && has('immune_ohko')) return 'immune_ohko';
    if (info.kind === 'fixed' && has('immune_fixed_damage')) return 'immune_fixed_damage';
    if (info.kind === 'percent' && has('immune_percent_damage')) return 'immune_percent_damage';
    const inv = findRule(side, target, (r) => r.rule === 'invulnerable_turns');
    if (inv && this.turn <= inv.turns) return 'invulnerable_turns';
    const only = findRule(side, target, (r) => r.rule === 'damage_only_from');
    if (only && info.source && info.source.side !== side.index) {
      if (info.status && (target.persist.allowedStatusDamage as string[] | undefined)?.includes(info.status)) return null;
      const sk = info.skill;
      const ok = (sk && only.allow_categories?.includes(sk.category)) ||
        (!only.types || (sk && only.types.some((type: string) => hasAttackType(this.data.types, sk.type, type)))) &&
        (!only.skills || (sk && only.skills.includes(sk.id))) &&
        (!only.categories || (sk && only.categories.includes(sk.category))) &&
        (!only.crit || info.crit) &&
        (!only.super_effective || (info.effectiveness ?? 1) > 1) &&
        (!only.sure_hit || (sk && sk.accuracy === null)) &&
        (!only.kinds || only.kinds.includes(info.kind));
      if (!ok) return 'damage_only_from';
    }
    const rotation = findRule(side, target, r => r.rule === 'type_rotation');
    if (rotation && fromFoe && info.skill) {
      const expected = rotation.order[(target.persist.typeRotationCursor ?? 0) % rotation.order.length];
      if (!hasAttackType(this.data.types, info.skill.type, expected)) return 'type_rotation';
    }
    return null;
  }

  private handleFaint(mon: Mon, info: DamageInfo, targetStatuses: string[]): void {
    // on_faint phases may revive (multi-phase bosses)
    if (this.checkPhases(mon, { onFaint: true }) && mon.hp > 0) return;
    const revival = mon.persist.reviveUnlessStatusKo as {maxRevives:number; throughTurn?:number} | undefined;
    if (revival && !['poison', 'burn', 'freeze'].includes(info.status ?? '') &&
        (revival.throughTurn === undefined || this.turn <= revival.throughTurn) &&
        (mon.persist.statusKoRevives ?? 0) < revival.maxRevives) {
      mon.persist.statusKoRevives = (mon.persist.statusKoRevives ?? 0) + 1;
      mon.hp = mon.maxHp;
      this.emit({type:'revive',side:mon.side,slot:mon.slot,name:mon.name,hp:mon.hp,maxHp:mon.maxHp,reason:'revive_unless_status_ko'});
      this.runHookEffects(mon, 'on_revive');
      return;
    }
    if (mon.livesLeft > 0) {
      mon.livesLeft--;
      mon.hp = mon.maxHp;
      mon.stages = zeroStages();
      mon.conditions = mon.conditions.filter((c) => c.def.kind !== 'status');
      for (const id of mon.skills) mon.pp[id] = mon.maxPp[id];
      this.emit({ type: 'revive', side: mon.side, slot: mon.slot, name: mon.name, hp: mon.hp, maxHp: mon.maxHp, livesLeft: mon.livesLeft, reason: 'lives' });
      this.runHookEffects(mon, 'on_revive');
      return;
    }
    mon.fainted = true;
    mon.hp = 0;
    this.lastKo = { by: info.source, skill: info.skill, crit: info.crit, target: mon, targetStatuses, status: info.status, turn: this.turn };
    if (mon.side === 1) {
      this.defeated.push({
        foe: { species: mon.species.id, level: mon.level, ...(this.sides[1].kind === 'boss' ? { boss: true } : {}) },
        participants: [...mon.facedBy],
      });
    }
    this.emit({ type: 'faint', side: mon.side, slot: mon.slot, species: mon.species.id, by: info.source ? { side: info.source.side, skill: info.skill?.id, crit: !!info.crit } : null });
    this.runHookEffects(mon, 'on_faint');
    // A fainted monster keeps no statuses, conditions or stages.
    mon.conditions = [];
    mon.stages = zeroStages();
  }

  heal(mon: Mon, amount: number, opts: { item?: boolean } = {}): number {
    if (mon.fainted) return 0;
    if (!Number.isFinite(amount)) { this.warn('non-finite heal amount rejected'); return 0; }
    const foeSide = this.sides[1 - mon.side];
    if (hasRule(foeSide, 'block_heal') && amount > 0) {
      this.emit({ type: 'heal_blocked', side: mon.side });
      return 0;
    }
    for (const r of this.fire(mon, 'on_heal_incoming', { amount, item: !!opts.item })) if (typeof r === 'number') amount = r;
    if (amount < 0) { this.dealDamage(mon, Math.floor(-amount), { kind: 'fixed' }); return 0; }
    const healed = Math.max(0, Math.min(Math.floor(amount), mon.maxHp - mon.hp));
    mon.hp += healed;
    if (healed > 0) this.emit({ type: 'heal', side: mon.side, slot: mon.slot, name: mon.name, amount: healed, hp: mon.hp, maxHp: mon.maxHp });
    return healed;
  }

  // ---------- conditions ----------

  applyStatus(target: Mon, status: string, opts: { turns?: number | [number, number]; level?: number; fromFoe?: boolean; source?: Mon }): boolean {
    const def = this.data.conditions.get(status);
    if (!def) { this.warn(`unknown status ${status}`); return false; }
    if (target.fainted) return false;
    if (status === 'leech' && target.types.includes('grass')) return this.blockedStatus(target, status, 'grass_immunity');
    for (const r of this.fire(target, 'on_status_incoming', { status, source: opts.source, fromFoe: opts.fromFoe !== false, turns: opts.turns })) {
      if (r === false) return this.blockedStatus(target, status, 'script');
    }
    const side = this.sides[target.side];
    if (opts.fromFoe !== false) {
      if (hasRule(side, 'immune_status', target)) return this.blockedStatus(target, status, 'immune_status');
      const list = findRule(side, target, (r) => r.rule === 'immune_status_list');
      if (list?.statuses?.includes(status)) return this.blockedStatus(target, status, 'immune_status_list');
    }
    for (const h of this.hooks(target, 'block_status')) {
      if (!h.statuses || h.statuses.includes(status)) return this.blockedStatus(target, status, 'block_status');
    }
    return this.addCondition(target, def, opts.turns, opts.level);
  }

  private blockedStatus(target: Mon, status: string, reason: string): false {
    this.emit({ type: 'status_blocked', side: target.side, status, reason });
    return false;
  }

  addCondition(target: Mon, def: ConditionDef, turns?: number | [number, number], level?: number, charges?: number): boolean {
    if (target.fainted) return false;
    const existing = target.conditions.find((c) => c.id === def.id);
    const stack = def.stack ?? (def.kind === 'status' ? 'fail' : 'refresh');
    const n = turns !== undefined ? this.rollTurns(turns) : charges !== undefined ? Infinity : this.rollTurns(def.default_turns);
    if (existing) {
      if (stack === 'fail') {
        this.emit({ type: 'condition_failed', side: target.side, condition: def.id, reason: 'already' });
        return false;
      }
      existing.turns = stack === 'add' ? existing.turns + n : n;
      existing.appliedTurn = this.appliedTurnFor(target);
      if (level) existing.level = level;
      if (charges !== undefined) existing.charges = stack === 'add' ? (existing.charges ?? 0) + charges : charges;
      this.emit({ type: 'condition_refreshed', side: target.side, slot: target.slot, condition: def.id, turns: existing.turns });
      return true;
    }
    target.conditions.push({ id: def.id, def, turns: n, level, charges, appliedTurn: this.appliedTurnFor(target) });
    this.emit({
      type: def.kind === 'status' ? 'status_applied' : 'condition_added',
      side: target.side, slot: target.slot, name:target.name, conditionName:def.name?.zh, condition: def.id, status: def.kind === 'status' ? def.id : undefined, turns: n, level,
    });
    return true;
  }

  useCharge(mon: Mon, cond: ActiveCondition): void {
    if (cond.charges === undefined) return;
    cond.charges--;
    if (cond.charges <= 0) this.removeCondition(mon, cond.id);
  }

  // A condition counts the target's turns: if the target has not acted yet this
  // turn, this turn is the first one affected and it ticks at this turn's end.
  private appliedTurnFor(target: Mon): number {
    return target.lastActedTurn === this.turn ? this.turn : this.turn - 1;
  }

  removeCondition(mon: Mon, id: string, expired = false): void {
    const c = mon.conditions.find((x) => x.id === id);
    if (!c) return;
    mon.conditions = mon.conditions.filter((x) => x !== c);
    this.emit({ type: 'condition_removed', side: mon.side, slot: mon.slot, name:mon.name,conditionName:c.def.name?.zh, condition: id, reason: expired ? 'expired' : 'removed' });
    for (const h of c.def.hooks) {
      if (h.on !== 'on_expire') continue;
      if (expired && h.effects) this.runEffects(h.effects, mon, this.foeOf(mon), emptyCtx());
      // scripted cleanup runs on any removal (expiry, cure, switch is not a removal)
      if (h.script) this.script(h.script)?.hook?.({ battle: this, point: 'on_expire', holder: mon, cond: c, hook: h, foe: this.foeOf(mon), expired }, h.params);
    }
  }

  rollTurns(t: ConditionDef['default_turns']): number {
    if (t === undefined) return Infinity;
    if (Array.isArray(t)) return this.rng.int(t[0], t[1]);
    return t;
  }

  script(id: string): ScriptEntry | undefined {
    const s = this.scripts[id];
    if (!s) return undefined;
    return typeof s === 'function' ? { apply: s, hook: s } : s;
  }

  /** Call every `script` hook at this point; returns their non-undefined results. */
  fire(mon: Mon, point: HookPoint, extra: Record<string, unknown> = {}): unknown[] {
    const out: unknown[] = [];
    for (const { cond, hook } of this.hooksWithCond(mon, point)) {
      if (!hook.script) continue;
      if (hook.when && !this.evalWhen(hook.when, { self: mon, foe: this.foeOf(mon), skill: extra.skill as Skill | undefined })) continue;
      const fn = this.script(hook.script)?.hook;
      if (!fn) { this.warn(`unknown script ${hook.script}`); continue; }
      const r = fn({ battle: this, point, holder: mon, cond, hook, foe: this.foeOf(mon), ...extra }, hook.params);
      if (r !== undefined) out.push(r);
    }
    return out;
  }

  hooks(mon: Mon, on: HookPoint): Hook[] {
    return this.hooksWithCond(mon, on).map((x) => x.hook);
  }

  hooksWithCond(mon: Mon, on: HookPoint): { cond: ActiveCondition; hook: Hook }[] {
    const out: { cond: ActiveCondition; hook: Hook }[] = [];
    for (const cond of mon.conditions) for (const hook of cond.def.hooks) if (hook.on === on) out.push({ cond, hook });
    return out;
  }

  private runHookEffects(mon: Mon, on: HookPoint, foe?: Mon, extra: Record<string, unknown> = {}): void {
    for (const { hook } of this.hooksWithCond(mon, on)) {
      if (hook.script) continue;
      if (hook.when && !this.evalWhen(hook.when, { self: mon, foe: foe ?? this.foeOf(mon) })) continue;
      if (hook.effects) this.runEffects(hook.effects, mon, foe ?? this.foeOf(mon), emptyCtx());
    }
    this.fire(mon, on, extra);
  }

  // ---------- turn end ----------

  private endOfTurn(): void {
    for (const i of [0, 1] as const) {
      if (this.result) return;
      const mon = this.active(i);
      if (mon.fainted) continue;
      for (const { cond, hook } of this.hooksWithCond(mon, 'turn_end')) {
        if (mon.fainted || this.result) break;
        if (cond.appliedTurn === this.turn && cond.def.kind === 'status') continue;
        if (hook.when && !this.evalWhen(hook.when, { self: mon, foe: this.foeOf(mon) })) continue;
        if (hook.damage_pct_max_hp) {
          const amount = Math.max(1, Math.floor((mon.maxHp * hook.damage_pct_max_hp) / 100));
          this.emit({ type: 'condition_tick', side: i, condition: cond.id });
          const lost = this.dealDamage(mon, amount, { kind: 'percent', status: cond.id });
          if (hook.drain_to_foe) this.heal(this.foeOf(mon), lost);
        }
        if (hook.effects) this.runEffects(hook.effects, mon, this.foeOf(mon), emptyCtx());
      }
      if (!mon.fainted && !this.result) this.fire(mon, 'turn_end', {});
      if (mon.fainted || this.result) continue;
      const side = this.sides[i];
      const regen = findRule(side, mon, (r) => r.rule === 'heal_each_turn');
      if (regen) this.heal(mon, regen.amount ?? (mon.maxHp * regen.pct_max_hp) / 100);
      if (hasRule(side, 'clear_debuffs_each_turn')) this.clearStages(mon, 'down');
      if (hasRule(side, 'strip_player_boosts_each_turn')) this.clearStages(this.foeOf(mon), 'up');
    }
    for (const i of [0, 1] as const) {
      const mon = this.active(i);
      for (const c of [...mon.conditions]) {
        if (c.appliedTurn === this.turn || c.turns === Infinity) continue;
        c.turns--;
        if (c.turns <= 0) this.removeCondition(mon, c.id, true);
      }
    }
    for (const i of [0, 1] as const) if (!this.active(i).fainted) this.checkPhases(this.active(i));
    this.checkObjectivesAtTurnEnd();
  }

  // ---------- boss phases & objectives ----------

  /** Returns true if any phase fired. */
  checkPhases(mon: Mon, extra: { onFaint?: boolean } = {}): boolean {
    if (mon.side !== 1) return false;
    let fired = false;
    const run = (phases: Phase[], completed: Set<number>, member: boolean) => phases.forEach((ph: Phase, idx: number) => {
      if (ph.target !== undefined && ph.target !== mon.slot) return;
      const once = ph.once ?? true;
      if (once && completed.has(idx)) return;
      if (!!(ph.when as any).on_faint !== !!extra.onFaint) return;
      if (!this.evalWhen(ph.when, { self: mon, foe: this.foeOf(mon), onFaint: extra.onFaint })) return;
      completed.add(idx);
      fired = true;
      this.emit({ type: 'phase_triggered', side: 1, phase: idx, ...(member ? {slot: mon.slot} : {}) });
      this.runEffects(ph.do, mon, this.foeOf(mon), emptyCtx());
    });
    run(this.encounter?.phases ?? [], this.phasesFired, false);
    run(this.variant?.phases ?? [], this.variantPhasesFired, false);
    run(mon.phases, mon.phasesFired, true);
    return fired;
  }

  private checkObjectivesAtTurnEnd(): void {
    if (!this.encounter || this.result) return;
    for (const o of this.winList) {
      if (o.kind === 'survive_turns' && this.turn >= o.turns) return this.finish(0, 'objective');
      if (o.kind === 'deal_damage' && this.damageBySide[0] >= o.amount) return this.finish(0, 'objective');
      if (o.kind === 'exhaust_pp' && this.sides[1].team.every((m) => m.fainted || m.skills.every((id) => m.pp[id] <= 0))) {
        return this.finish(0, 'objective');
      }
    }
    for (const o of this.loseList) {
      if (o.kind === 'turn_limit' && this.turn >= o.turns) return this.finish(1, 'lose_condition');
      if (o.kind === 'script' && this.callScript(o.id, {}, o.params)) return this.finish(1, 'lose_condition');
    }
  }

  get winList(): Objective[] {
    return this.variant?.win ?? this.encounter?.win ?? [];
  }

  get loseList(): Objective[] {
    return this.variant?.lose ?? this.encounter?.lose ?? [];
  }

  /** flee_after_skill: the boss leaves after using a skill N times (no reward). */
  private checkBossFlee(user: Mon, skill: Skill): void {
    if (user.side !== 1) return;
    const r = findRule(this.sides[1], user, (x) => x.rule === 'flee_after_skill' && (x.skill === skill.id || x.skills?.includes(skill.id)));
    if (!r || (user.skillUses[skill.id] ?? 0) < (r.count ?? 1)) return;
    this.emit({ type: 'boss_fled', side: 1, skill: skill.id });
    this.finish(null, 'boss_fled');
  }

  /** Dynamic execution policy adopted for Moshidilu in V57. */
  forcedExecution(mon: Mon): boolean {
    const rule = findRule(this.sides[mon.side], mon, value => value.rule === 'forced_execution_below_pct');
    return !!rule && !mon.fainted && mon.hp > 0 && mon.hp * 100 < mon.maxHp * rule.pct;
  }

  private isAttackSkill(mon: Mon, id: number): boolean {
    const skill = this.skill(id, mon);
    return skill.category !== 'status' && (skill.power > 0 || this.hasPowerOp(skill));
  }

  /** Boss traits that switch on below an HP threshold (rule) or from a phase op. */
  bossTrait(mon: Mon, trait: 'ohko_below_pct' | 'always_crit_below_pct'): boolean {
    if (mon.persist[trait]) return true;
    const r = findRule(this.sides[mon.side], mon, (x) => x.rule === trait);
    return !!r && (mon.hp / mon.maxHp) * 100 < r.pct;
  }

  private checkEnd(): void {
    if (this.result) return;
    const alive = this.sides.map((s) => s.team.some((m) => !m.fainted));
    if (!alive[0] && !alive[1]) this.finish(1, 'ko');   // simultaneous: the player loses
    else if (!alive[1]) this.finish(0, 'ko');
    else if (!alive[0]) this.finish(1, 'ko');
  }

  objectiveMet(o: Objective): boolean {
    const ko = this.lastKo;
    switch (o.kind) {
      case 'ko_all': return this.sides[1].team.every((m) => m.fainted);
      case 'turn_limit': return this.turn <= o.turns;
      case 'finish_with_skill': return !!ko?.skill && ((o.skills ?? [o.skill]) as number[]).includes(ko.skill.id) && ko.by?.side === 0;
      case 'finish_with_type': return !!ko?.skill && ((o.types ?? [o.type]) as string[]).some(type => hasAttackType(this.data.types, ko.skill!.type, type)) && ko.by?.side === 0;
      case 'finish_with_crit': return !!ko?.crit && ko.by?.side === 0;
      case 'use_skill':
      case 'used_skill': return this.sides[0].team.some(mon => (o.skills ?? [o.skill]).some((id: number) => mon.usedSkills.has(id)));
      case 'survive_turns': return this.turn >= o.turns && this.sides[0].team.some((m) => !m.fainted);
      case 'deal_damage': return this.damageBySide[0] >= o.amount;
      case 'ko_after_turn': return this.sides[1].team.every((m) => m.fainted) && !!ko && ko.turn > o.turns;
      case 'exhaust_pp': return this.sides[1].team.every((m) => m.fainted || m.skills.every((id) => m.pp[id] <= 0));
      case 'finish_with_status_damage': return !!ko?.status && ((o.statuses ?? ['poison', 'burn', 'freeze', 'leech']) as string[]).includes(ko.status);
      case 'script': return !!this.callScript(o.id, {}, o.params);
      default:
        this.warn(`unknown objective ${o.kind}`);
        return false;
    }
  }

  private finish(winner: 0 | 1 | null, reason: BattleResult['reason']): void {
    if (this.result) return;
    const objectives = this.winList.map((o) => ({ kind: o.kind, met: winner === 0 && this.objectiveMet(o) }));
    const success = reason !== 'flee' && winner === 0 && objectives.every((o) => o.met);
    this.result = { winner, reason, success, objectives: this.encounter ? objectives : undefined, defeated: reason === 'flee' ? [] : this.defeated, turns: this.turn };
    if (this.capturedMon) this.result.captured = { species: this.capturedMon.species.id, level: this.capturedMon.level, hp: this.capturedMon.hp };
    this.phase = 'ended';
    for (const side of this.sides) { side.needsReplacement = false; side.pending = null; }
    this.emit({ type: 'battle_end', ...this.result });
  }

  // ---------- items & capture ----------

  private useItem(side: Side, itemId: string, slot: number): void {
    const item = this.data.items.get(itemId)!;
    if (!side.unlimitedItems.has(itemId)) side.items[itemId]--;
    const mon = side.team[slot];
    this.emit({ type: 'item_used', side: side.index, item: itemId, slot, targetName: mon.name });
    this.usingItem = true;
    try {
      this.runEffects(item.battle_effects ?? [], mon, this.active((1 - side.index) as 0 | 1), emptyCtx());
    } finally {
      this.usingItem = false;
    }
  }

  private tryCapture(side: Side, foe: Side, itemId: string): void {
    const item = this.data.items.get(itemId)!;
    if (!side.unlimitedItems.has(itemId)) side.items[itemId]--;
    const target = this.active(foe.index);
    const statuses = target.conditions.filter((c) => c.def.kind === 'status');
    const ok = rollReconstructedCapture({ maxHp: target.maxHp, hp: target.hp,
      catchRate: target.species.catch_rate ?? 45, multiplier: item.capture_multiplier === null ? null : (item.capture_multiplier ?? 1),
      controlStatus: statuses.some((c) => c.def.control), anyStatus: statuses.length > 0,
    }, () => this.rng.next());
    this.emit({ type: 'capture_attempt', side: side.index, item: itemId, success: ok });
    if (ok) {
      this.capturedMon = target;
      this.finish(side.index, 'capture');
    }
  }

  // ---------- effects ----------

  foeOf(mon: Mon): Mon {
    return this.active((1 - mon.side) as 0 | 1);
  }

  runEffects(ops: EffectOp[], user: Mon, foe: Mon, ctx: MoveCtx, filter?: (op: EffectOp) => boolean): void {
    for (const op of ops) {
      if (this.result) return;
      if (MODIFIER_OPS.has(op.op)) continue;
      if (filter && !filter(op)) continue;
      if (op.when && !this.evalWhen(op.when, { self: user, foe, ctx })) continue;
      if (op.chance !== undefined && !this.rng.chance(op.chance)) continue;
      this.applyOp(op, user, foe, ctx);
    }
  }

  private applyOp(op: EffectOp, user: Mon, foe: Mon, ctx: MoveCtx): void {
    const tgt = (op.target ?? defaultTarget(op.op)) === 'self' ? user : foe;
    switch (op.op) {
      case 'stat_stage': {
        for (const [stat, delta] of Object.entries(op.stats as Record<StageKey, number>)) this.changeStage(tgt, stat as StageKey, delta, tgt !== user);
        return;
      }
      case 'status':
        this.applyStatus(tgt, Array.isArray(op.status) ? this.rng.pick(op.status) : op.status, { turns: op.turns, level: op.level, fromFoe: tgt !== user });
        return;
      case 'cure_status': {
        for (const c of [...tgt.conditions]) {
          if (c.def.kind === 'status' && (!op.statuses || op.statuses.includes(c.id))) this.removeCondition(tgt, c.id);
        }
        return;
      }
      case 'clear_stages':
        this.clearStages(tgt, op.which ?? 'all', tgt !== user);
        return;
      case 'heal': {
        let amt = 0;
        if (op.pct_max_hp) amt = (tgt.maxHp * op.pct_max_hp) / 100;
        else if (op.pct_damage_dealt) amt = (ctx.damageDealt * op.pct_damage_dealt) / 100;
        else if (op.amount) amt = op.amount;
        this.heal(tgt, amt, { item: this.usingItem });
        return;
      }
      case 'restore_pp': {
        const ids = op.skill ? [op.skill] : tgt.skills;
        const amount=typeof op.amount==='number'&&Number.isFinite(op.amount)?Math.max(0,op.amount):null;
        for (const id of ids) if(Number.isFinite(tgt.maxPp[id]))tgt.pp[id]=amount===null?tgt.maxPp[id]:Math.min(tgt.maxPp[id],tgt.pp[id]+amount);
        this.emit({ type: 'pp_restored', side: tgt.side, slot: tgt.slot, name: tgt.name, amount });
        return;
      }
      case 'pp_drain': {
        const ids = op.all === false && foe.usedSkills.size ? [...foe.usedSkills].slice(-1) : foe.skills;
        for (const id of ids) if (foe.pp[id] !== undefined) foe.pp[id] = Math.max(0, foe.pp[id] - (op.amount ?? 1));
        this.emit({ type: 'pp_drained', side: foe.side, amount: op.amount ?? 1 });
        return;
      }
      case 'recoil': {
        const amt = op.pct_max_hp ? (user.maxHp * op.pct_max_hp) / 100 : (ctx.damageDealt * (op.pct_damage_dealt ?? 0)) / 100;
        if (amt > 0) this.dealDamage(user, Math.max(1, Math.floor(amt)), { kind: 'fixed' });
        return;
      }
      case 'fixed_damage':
        this.dealDamage(tgt, op.amount, { kind: 'fixed', source: user, skill: ctx.skill });
        return;
      case 'pct_damage': {
        const amt = op.pct_max_hp ? (tgt.maxHp * op.pct_max_hp) / 100 : (tgt.hp * (op.pct_current_hp ?? 0)) / 100;
        this.dealDamage(tgt, Math.max(1, Math.floor(amt)), { kind: 'percent', source: user, skill: ctx.skill });
        return;
      }
      case 'ohko':
        this.dealDamage(tgt, tgt.hp, { kind: 'true', source: user, skill: ctx.skill, ohko: true });
        return;
      case 'add_condition': {
        const def = this.data.conditions.get(op.condition);
        if (!def) return this.warn(`unknown condition ${op.condition}`);
        this.addCondition(tgt, def, op.turns, op.level, op.charges);
        return;
      }
      case 'remove_condition':
        this.removeCondition(tgt, op.condition);
        return;
      case 'protect': {
        const def = this.data.conditions.get('protect')!;
        this.addCondition(user, def, op.turns ?? 1);
        user.conditions.find((c) => c.id === 'protect')!.appliedTurn = -1; // expires this turn end
        return;
      }
      case 'swap_stages': {
        const a = user.stages; user.stages = foe.stages; foe.stages = a;
        this.emit({ type: 'stages_swapped', side: user.side });
        return;
      }
      case 'copy_stages': {
        user.stages = { ...foe.stages };
        this.emit({ type: 'stages_copied', side: user.side });
        return;
      }
      case 'force_switch': {
        const side = this.sides[tgt.side];
        const bench = side.team.filter((m) => !m.fainted && m.slot !== side.active);
        if (!bench.length || hasRule(side, 'immune_force_switch')) return;
        this.switchIn(side, this.rng.pick(bench).slot);
        return;
      }
      // boss phase ops
      case 'transform': {
        const sp = this.data.species.get(op.species);
        if (!sp) return this.warn(`unknown species ${op.species}`);
        const ratio = user.hp / user.maxHp;
        user.species = sp;
        user.types = [...sp.types];
        if (op.stats || op.recompute !== false) {
          const stats = op.stats ?? computeStats(sp.base, user.level, op.iv ?? 31, op.evs ?? {}, undefined);
          const keepMax = op.hp_override ?? (op.keep_hp ? user.maxHp : stats.hp);
          user.stats = { ...stats, hp: keepMax };
          user.maxHp = keepMax;
          user.hp = Math.max(1, Math.round(keepMax * (op.full_heal ? 1 : ratio)));
        }
        if (op.skills) this.setSkills(user, op.skills);
        user.name = sp.name.zh;
        this.emit({ type: 'transform', side: user.side, species: sp.id, types: [...user.types], name: sp.name.zh, hp: user.hp, maxHp: user.maxHp });
        return;
      }
      case 'set_skills':
        this.setSkills(tgt, op.skills);
        this.emit({ type: 'skills_changed', side: tgt.side, skills: [...tgt.skills] });
        return;
      case 'set_ai':
        tgt.ai = op.ai;
        tgt.aiCursor = 0;
        return;
      case 'revive': {
        user.fainted = false;
        user.hp = Math.max(1, Math.floor((user.maxHp * (op.pct_max_hp ?? 100)) / 100));
        user.conditions = user.conditions.filter((c) => c.def.kind !== 'status');
        this.emit({ type: 'revive', side: user.side, slot: user.slot, name: user.name, hp: user.hp, maxHp: user.maxHp, reason: 'phase' });
        this.runHookEffects(user, 'on_revive');
        return;
      }
      case 'say':
        this.emit({ type: 'say', side: user.side, text: op.text });
        return;
      case 'ohko_below_pct':
      case 'always_crit_below_pct':
        user.persist[op.op] = true;
        this.emit({ type: 'boss_trait', side: user.side, trait: op.op });
        return;
      case 'swap_types': {
        if (op.types) user.types = [...op.types];
        else { const t = user.types; user.types = foe.types; foe.types = t; }
        this.emit({ type: 'types_changed', side: user.side, types: [...user.types], foeTypes: [...foe.types] });
        return;
      }
      case 'counter_skill': {
        if (!user.skills.includes(op.skill)) this.setSkills(user, [...user.skills, op.skill].slice(-4));
        user.vol.forcedSkill = op.skill;
        return;
      }
      case 'script':
        this.callScript(op.id, { user, foe, ctx }, op.params);
        return;
      default:
        this.warn(`unknown effect op ${op.op}`);
    }
  }

  private setSkills(mon: Mon, skills: number[]): void {
    mon.skills = [...skills];
    for (const id of skills) {
      const s = this.skill(id, mon);
      mon.maxPp[id] = s.pp;
      mon.pp[id] = mon.pp[id] ?? s.pp;
    }
    mon.aiCursor = 0;
  }

  changeStage(mon: Mon, stat: StageKey, delta: number, byFoe: boolean): void {
    if (mon.fainted) return;
    for (const r of this.fire(mon, 'on_stage_incoming', { stat, delta, byFoe })) {
      if (r === false) { this.emit({ type: 'stage_blocked', side: mon.side, stat }); return; }
      if (typeof r === 'number') delta = r;
    }
    if (delta === 0) return;
    if (delta > 0 && this.foeOf(mon).persist.foeCannotBoost && !this.foeOf(mon).fainted) {
      this.emit({ type: 'stage_blocked', side: mon.side, stat });
      return;
    }
    if (delta < 0 && byFoe) {
      if (hasRule(this.sides[mon.side], 'immune_stage_down', mon) || this.hooks(mon, 'block_stage_down').length) {
        this.emit({ type: 'stage_blocked', side: mon.side, stat });
        return;
      }
    }
    const before = mon.stages[stat];
    const after = Math.max(C.STAGE_MIN, Math.min(C.STAGE_MAX, before + delta));
    mon.stages[stat] = after;
    this.emit({ type: 'stat_stage', side: mon.side, stat, delta: after - before, stage: after, capped: after - before !== delta });
  }

  clearStages(mon: Mon, which: 'up' | 'down' | 'all', byFoe = false): void {
    let changed = false;
    for (const k of STAGES) {
      const v = mon.stages[k];
      if (!((which !== 'down' && v > 0) || (which !== 'up' && v < 0))) continue;
      if (byFoe && this.fire(mon, 'on_stage_incoming', { stat: k, delta: -v, byFoe, clear: true }).includes(false)) continue;
      mon.stages[k] = 0;
      changed = true;
    }
    if (changed) this.emit({ type: 'stages_cleared', side: mon.side, which });
  }

  // ---------- conditions language ----------

  evalWhen(when: When | undefined, c: WhenCtx): boolean {
    if (!when) return true;
    const { self, foe } = c;
    const hasStatus = (m: Mon | undefined, s: unknown) =>
      !!m && m.conditions.some((x) => x.def.kind === 'status' && (s === 'any' || s === true || x.id === s || (Array.isArray(s) && s.includes(x.id))));
    const pct = (m: Mon | undefined) => (m ? (m.hp / m.maxHp) * 100 : 0);
    for (const [k, v] of Object.entries(when)) {
      let ok: boolean;
      switch (k) {
        case 'self_status': ok = hasStatus(self, v); break;
        case 'foe_status': ok = hasStatus(foe, v); break;
        case 'self_no_status': ok = !hasStatus(self, 'any'); break;
        case 'foe_no_status': ok = !hasStatus(foe, 'any'); break;
        case 'self_condition': ok = self.conditions.some((x) => x.id === v); break;
        case 'foe_condition': ok = !!foe?.conditions.some((x) => x.id === v); break;
        case 'self_hp_below_pct': ok = pct(self) < (v as number); break;
        case 'self_hp_below': ok = self.hp < (v as number); break;
        case 'self_hp_above_pct': ok = pct(self) > (v as number); break;
        case 'foe_hp_below_pct': ok = pct(foe) < (v as number); break;
        case 'foe_hp_above_pct': ok = pct(foe) > (v as number); break;
        case 'first_turn': ok = (self.turnsActive <= 1) === v; break;
        case 'foe_type': ok = !!foe && (Array.isArray(v) ? v.some((t) => foe.types.includes(t)) : foe.types.includes(v as string)); break;
        case 'self_type': ok = Array.isArray(v) ? v.some((t) => self.types.includes(t)) : self.types.includes(v as string); break;
        case 'acted_first': ok = !!(c.ctx?.actedFirst ?? c.actedFirst ?? this.turnOrder[0] === self.side) === v; break;
        case 'acted_last': ok = !(c.ctx?.actedFirst ?? c.actedFirst ?? this.turnOrder[0] === self.side) === v; break;
        case 'crit': ok = !!c.ctx?.crit === v; break;
        case 'hit': ok = !!c.ctx?.hit === v; break;
        case 'super_effective': ok = ((c.ctx?.effectiveness ?? 1) > 1) === v; break;
        case 'self_stage_up': ok = Object.values(self.stages).some((s) => s > 0) === v; break;
        case 'foe_stage_up': ok = !!foe && Object.values(foe.stages).some((s) => s > 0) === v; break;
        case 'self_stage_down': ok = Object.values(self.stages).some((s) => s < 0) === v; break;
        case 'foe_stage_down': ok = !!foe && Object.values(foe.stages).some((s) => s < 0) === v; break;
        case 'turn': ok = this.turn === v; break;
        case 'turn_ge': ok = this.turn >= (v as number); break;
        case 'turn_le': ok = this.turn <= (v as number); break;
        case 'lives_left': ok = self.livesLeft === v; break;
        case 'on_faint': ok = !!c.onFaint === v; break;
        case 'category': { const sk = c.skill ?? c.ctx?.skill; ok = !!sk && (Array.isArray(v) ? v.includes(sk.category) : sk.category === v); break; }
        case 'skill_type': { const sk = c.skill ?? c.ctx?.skill; ok = !!sk && (Array.isArray(v) ? v : [v]).some(type => hasAttackType(this.data.types, sk.type, type as string)); break; }
        case 'damage_kind': ok = Array.isArray(v) ? v.includes(c.kind) : c.kind === v; break;
        case 'speed_faster': ok = !!foe && (this.effStat(self, 'spe') > this.effStat(foe, 'spe')) === v; break;
        case 'all': ok = (v as When[]).every((w) => this.evalWhen(w, c)); break;
        case 'any': ok = (v as When[]).some((w) => this.evalWhen(w, c)); break;
        case 'not': ok = !this.evalWhen(v as When, c); break;
        case 'script': ok = !!this.callScript((v as any).id, c, (v as any).params); break;
        default:
          this.warn(`unknown when key ${k}`);
          ok = false;
      }
      if (!ok) return false;
    }
    return true;
  }

  // ---------- misc ----------

  callScript(id: string, ctx: unknown, params: unknown): unknown {
    const entry = this.script(id);
    if (!entry) { this.warn(`unknown script ${id}`); return undefined; }
    return entry.apply?.({ battle: this, ...(ctx as object) }, params);
  }

  emit(e: BattleEvent): void {
    this.out.push(e);
  }

  warn(msg: string): void {
    if (!this.warnings.includes(msg)) this.warnings.push(msg);
    this.emit({ type: 'warning', message: msg });
  }
}

// ---------- helpers ----------

// Catalog boss `script` rules that are native engine rules under another name.
const RULE_ALIASES: Record<string, string> = {
  immune_pct_damage: 'immune_percent_damage',
  infinite_pp: 'unlimited_pp',
  reflect_damage: 'reflect_damage',
};

/** Fields consumed by native rules; the catalog audit checks every occurrence. */
export const NATIVE_BOSS_RULE_FIELDS:Record<string,readonly string[]> = {
  lives:['count'], no_switch:[], no_items:[], no_capture:[], no_struggle:[], unlimited_pp:[],
  ignore_type_chart:[], immune_crit:[], immune_ohko:[], immune_fixed_damage:[], immune_percent_damage:[],
  immune_status:[], immune_status_list:['statuses'], immune_stage_down:[], immune_force_switch:[],
  block_heal:[], clear_debuffs_each_turn:[], strip_player_boosts_each_turn:[], no_repeat_type:[],
  damage_cap_per_hit:['amount','categories'], hp_floor_until:['skill','skills'], reflect_damage:['pct','min_damage'],
  heal_full_below:['hp','pct','times'], heal_each_turn:['amount','pct_max_hp'],
  require_statuses:['count'], invulnerable_turns:['turns'],
  damage_only_from:['types','skills','categories','allow_categories','crit','super_effective','sure_hit','kinds'],
  type_rotation:['order'],
  flee_after_skill:['skill','skills','count'], ohko_below_pct:['pct'], always_crit_below_pct:['pct'], forced_execution_below_pct:['pct'],
  player_level_cap:['level'], player_team_size:['min','max','min_level'],
};

const MODIFIER_OPS = new Set(['multi_hit', 'power_if', 'priority_if', 'crit_if']);

function defaultTarget(op: string): 'self' | 'foe' {
  return ['heal', 'restore_pp', 'protect', 'cure_status', 'transform', 'set_skills', 'set_ai', 'revive', 'say'].includes(op) ? 'self' : 'foe';
}

function inferTarget(skill: Skill): 'self' | 'foe' {
  // A status skill targets the foe if any effect hits the foe.
  return (skill.effects ?? []).some((e) => (e.target ?? defaultTarget(e.op)) === 'foe' && !MODIFIER_OPS.has(e.op)) ? 'foe' : 'self';
}

function zeroStages(): Record<StageKey, number> {
  return { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 };
}

/** Member rules take precedence. Scan the live arrays without allocating a merged list. */
function findRule(side: Side, mon: Mon, predicate: (rule: BossRule) => boolean): BossRule | undefined {
  const matches = (rule: BossRule) => ruleMatchesMember(rule, mon.slot) && predicate(rule);
  return mon.rules.find(matches) ?? side.rules.find(matches);
}
function hasRule(side: Side, rule: string, mon?: Mon): boolean {
  const member = mon ?? side.team[side.active];
  return !!findRule(side, member, r => r.rule === rule);
}

function ruleMatchesMember(rule: BossRule, slot: number): boolean {
  const member = rule.member ?? (rule.rule === 'script' ? rule.params?.member : undefined);
  return member === undefined || member === slot;
}

function levelMult(hook: Hook, cond: ActiveCondition): number {
  if (hook.multiplier_by_level) return hook.multiplier_by_level[Math.min(hook.multiplier_by_level.length, Math.max(1, cond.level ?? 1)) - 1];
  return hook.multiplier ?? 1;
}

function emptyCtx(): MoveCtx {
  return { skill: STRUGGLE_SKILL, hit: true, crit: false, damageDealt: 0, effectiveness: 1, actedFirst: false };
}

function sameAction(a: Action, b: Action): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'move': return a.skill === (b as typeof a).skill;
    case 'switch': return a.slot === (b as typeof a).slot;
    case 'item': return a.item === (b as typeof a).item && a.target === (b as typeof a).target;
    case 'capture': return a.item === (b as typeof a).item;
    default: return true;
  }
}

function stripTeam(s: SideInput | undefined): Partial<SideInput> {
  if (!s) return {};
  const { team: _t, kind: _k, ...rest } = s;
  return rest;
}

export function createBattle(opts: BattleOptions): Battle {
  return new Battle(opts);
}

/** Pre-battle checks for boss rules that limit the player's team. */
export function validateEncounter(encounter: BossEncounter, player: SideInput): string[] {
  const errors: string[] = [];
  for (const r of encounter.rules ?? []) {
    if (r.rule === 'player_level_cap') {
      for (const m of player.team) if (m.level > r.level) errors.push(`level ${m.level} exceeds cap ${r.level}`);
    }
    if (r.rule === 'player_team_size') {
      if (r.max !== undefined && player.team.length > r.max) errors.push(`team size ${player.team.length} exceeds ${r.max}`);
      if (r.min !== undefined && player.team.length < r.min) errors.push(`team size ${player.team.length} is below ${r.min}`);
      if (r.min_level !== undefined) for (const m of player.team) if (m.level < r.min_level) errors.push(`level ${m.level} is below ${r.min_level}`);
    }
    if (r.rule === 'script' && r.id === 'require_player_species') {
      const allowed = r.params?.species ?? [];
      for (const m of player.team) if (!allowed.includes(m.species)) errors.push(`species ${m.species} is not allowed; required ${allowed.join(',')}`);
    }
  }
  return errors;
}
