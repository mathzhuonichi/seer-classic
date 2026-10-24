// The damage pipeline (RULES.md section 5): attack damage, the read-only probe,
// condition and rule modifiers, HP loss and what follows it, and healing.

import type { DamageProbe, Skill, StageKey, Stats } from '../types.ts';
import type { Battle } from './battle.ts';
import { emptyCtx, zeroStages, type DamageInfo, type Mon, type MoveCtx } from './state.ts';
import * as C from '../constants.ts';
import { attackTypes, effectiveness, hasAttackType, typeIdentity } from '../typechart.ts';
import { hookCtx, levelMult, runHookEffects, skillScripts } from './conditions.ts';
import { breakBarrier, checkEnd, findRule, hasRule, ignoresProtection, ruleBlocks, ruleSide, statusKoRevival } from './rules.ts';
import { traceHit } from './journal.ts';
import { dealsDamage, isSureHit } from './move.ts';

export interface AttackOptions { estimate?: boolean; roll?: number; crit?: boolean }
export interface Attack { damage: number; crit: boolean; effectiveness: number; base: number; power: number }

// ---------- attack damage ----------

/**
 * Damage before taken/dealt condition mods. Draws: crit, roll.
 * With `estimate`, or with `roll` (and `crit`) given, nothing is drawn: the roll is
 * the mean or the given one, a chance-gated power condition counts as not
 * triggered, and script power runs in estimate mode (SCRIPTS.md: no RNG draws).
 */
export function calcAttack(b: Battle, user: Mon, target: Mon, skill: Skill, ctx: Partial<MoveCtx> | undefined, opts: AttackOptions): Attack {
  const power = attackPower(b, user, target, skill, ctx, opts);
  const physical = skill.category === 'physical';
  const A = b.effStat(user, physical ? 'atk' : 'spa');
  let D = b.effStat(target, physical ? 'def' : 'spd');
  for (const { entry, op } of skillScripts(b, skill)) {
    const r = entry.defense?.({ battle: b, user, foe: target, skill }, op.params, D);
    if (typeof r === 'number') D = r;
  }
  // Retained remake rounding; published classic formulas do not establish
  // the server's intermediate integer/truncation order.
  const levelTerm = C.DAMAGE_LEVEL_FACTOR * user.level + C.DAMAGE_LEVEL_OFFSET;
  const base = Math.floor((levelTerm * power * A) / Math.max(1, D) / C.DAMAGE_DIVISOR) + C.DAMAGE_BASE_OFFSET;
  // A dual creature receives one bonus for its own pair or either component.
  // A partially overlapping dual skill is not the creature's own type.
  const stab = attackTypes(b.data.types, skill.type).every(type => user.types.includes(type)) ? C.STAB : 1;
  const ignoreChart = hasRule(ruleSide(b, target.side), 'ignore_type_chart', target);
  const eff = ignoreChart ? 1 : effectiveness(b.data.types, skill.type, target.types);
  const { crit, roll } = opts.roll !== undefined ? { crit: !!opts.crit, roll: opts.roll }
    : opts.estimate ? { crit: false, roll: C.MEAN_ROLL } : rollCritAndDamage(b, user, target, skill, ctx);
  const damage = base * stab * eff * (roll / C.RANDOM_MAX) * (crit ? C.CRIT_MULTIPLIER : 1) * damageIf(b, user, target, skill, ctx);
  return { damage, crit, effectiveness: eff, base, power };
}

/** The product of the skill's `damage_if` multipliers whose condition holds (先出手/后出手 ×2 doubles damage, not power). */
function damageIf(b: Battle, user: Mon, target: Mon, skill: Skill, ctx: Partial<MoveCtx> | undefined): number {
  let multiplier = 1;
  for (const op of skill.effects ?? []) {
    if (op.op === 'damage_if' && b.evalWhen(op.when, { self: user, foe: target, actedFirst: ctx?.actedFirst })) multiplier *= op.multiplier;
  }
  return multiplier;
}

function attackPower(b: Battle, user: Mon, target: Mon, skill: Skill, ctx: Partial<MoveCtx> | undefined, opts: AttackOptions): number {
  const readOnly = !!opts.estimate || opts.roll !== undefined;
  let power = skill.power;
  for (const op of skill.effects ?? []) {
    if (op.op === 'power_if') {
      if (!b.evalWhen(op.when, { self: user, foe: target, actedFirst: ctx?.actedFirst })) continue;
      if (op.chance !== undefined && op.chance < 100) {
        if (readOnly) continue;
        traceHit(b, target, 'power_chance');
        if (!b.rng.chance(op.chance)) continue;
      }
      if (op.power) power = op.power;
      if (op.multiplier) power *= op.multiplier;
    } else if (op.op === 'script') {
      const fn = b.script(op.id)?.power;
      if (!fn) continue;
      const r = fn({ battle: b, user, foe: target, skill, ctx, estimate: readOnly }, op.params, power);
      if (typeof r === 'number') power = r;
    }
  }
  power += skill.power_bonus ?? 0;
  for (const r of b.fire(user, 'modify_power', { skill, power, foe: target })) if (typeof r === 'number') power = r;
  return power;
}

/** The crit draw (with every rate modifier) and then the damage roll draw. */
function rollCritAndDamage(b: Battle, user: Mon, target: Mon, skill: Skill, ctx: Partial<MoveCtx> | undefined): { crit: boolean; roll: number } {
  let rate = skill.crit_rate ?? C.DEFAULT_CRIT_RATE;
  let force = false;
  for (const op of skill.effects ?? []) {
    if (op.op === 'crit_if' && b.evalWhen(op.when, { self: user, foe: target })) {
      if (op.force) force = true;
      if (op.crit_rate) rate = op.crit_rate;
    }
    if (op.op === 'script') {
      const r = b.script(op.id)?.crit?.({ battle: b, user, foe: target, skill, ctx }, op.params);
      if (r?.force) force = true;
      if (r?.add) rate += r.add;
    }
  }
  for (const h of b.hooks(user, 'modify_crit_rate')) {
    if (h.force_crit) force = true;
    rate += h.add ?? 0;
  }
  for (const r of b.fire(user, 'modify_crit_rate', { skill, foe: target }) as any[]) {
    if (r?.force) force = true;
    if (r?.add) rate += r.add;
  }
  if (b.bossTrait(user, 'always_crit_below_pct')) force = true;
  const critRoll = b.rng.int(1, C.CRIT_DENOMINATOR);
  const crit = (force || critRoll <= rate) && !hasRule(b.sides[target.side], 'immune_crit');
  return { crit, roll: b.rng.int(C.RANDOM_MIN, C.RANDOM_MAX) };
}

export function effStat(b: Battle, mon: Mon, stat: StageKey & keyof Stats): number {
  let v = mon.stats[stat] * C.stageMultiplier(mon.stages[stat]);
  for (const h of b.hooks(mon, 'modify_stat')) if (h.stat === stat && !h.script) v *= h.multiplier ?? 1;
  for (const r of b.fire(mon, 'modify_stat', { stat, value: v })) if (typeof r === 'number') v = r;
  return v;
}

// ---------- read-only queries ----------

/**
 * Displayed damage (`amount + overkill`) of one attack hit with a fixed roll
 * (RANDOM_MIN..RANDOM_MAX) and crit; 0 for a skill that never strikes (status or
 * unpowered: its damage comes from effect ops). Reuses calcAttack and the damage pipeline
 * of applyDamage. Draws no RNG, emits no events and mutates nothing beyond the
 * caches of estimate-mode power scripts: the skill's own power scripts run in
 * estimate mode and its defense scripts as usual, other scripts (modifyDamage, finalDamage and
 * every script hook) are not run, chance-gated power counts as not triggered,
 * charges are not consumed and a cap-break chance counts as failed. Those cases
 * are journaled as opaque, so every non-opaque real hit equals the probe at its
 * realized roll and crit.
 */
export function probeDamage(b: Battle, user: Mon, target: Mon, skill: Skill, opts: DamageProbe): number {
  const { roll } = opts;
  if (!Number.isInteger(roll) || roll < C.RANDOM_MIN || roll > C.RANDOM_MAX) {
    throw new Error(`probe roll must be an integer in ${C.RANDOM_MIN}..${C.RANDOM_MAX}`);
  }
  if (!dealsDamage(b, skill)) return 0;
  const wasProbing = b.probing, trace = b.hitTrace, unknownRules = b.probeUnknownRules;
  b.probing = true;
  b.hitTrace = null;
  b.probeUnknownRules = opts.unknownRulesSide ?? null;
  try {
    const crit = !!opts.crit, sureHit = isSureHit(b, user, skill);
    const ctx: Partial<MoveCtx> = { skill, hit: true, crit, damageDealt: 0, effectiveness: 1, actedFirst: opts.actedFirst, sureHit, user, target };
    const r = b.calcAttack(user, target, skill, ctx, { roll, crit });
    if (r.effectiveness === 0) return 0;
    const { dmg, blocked } = computeDamage(b, target, r.damage, { kind: 'attack', source: user, skill, crit, effectiveness: r.effectiveness, sureHit }, true);
    return blocked ? 0 : dmg;
  } finally {
    b.probing = wasProbing;
    b.hitTrace = trace;
    b.probeUnknownRules = unknownRules;
  }
}

/** The AI's expected damage of one hit: the probe at the mean roll without a crit. */
export function estimateDamage(b: Battle, user: Mon, target: Mon, skill: Skill): number {
  return b.probeDamage(user, target, skill, { roll: C.MEAN_ROLL, crit: false });
}

// ---------- the pipeline ----------

export function dealDamage(b: Battle, target: Mon, raw: number, info: DamageInfo): number {
  b.damageDepth++;
  try { return applyDamage(b, target, raw, info); }
  finally {
    b.damageDepth--;
    // Retaliation can faint its source while the original defender is still
    // being processed. Settle both faints before deciding the result.
    if (b.damageDepth === 0) checkEnd(b);
  }
}

/** Damage transforms compose in condition order without changing unrelated hook dispatch. */
function transformDamage(b: Battle, mon: Mon, point: 'modify_damage_outgoing' | 'modify_damage_final', amount: number,
  extra: { info: DamageInfo; foe?: Mon; source?: Mon; skill?: Skill }): number {
  let current = amount;
  for (const { cond, hook } of b.hooksWithCond(mon, point)) {
    if (!hook.script || !mon.conditions.includes(cond)) continue;
    const foe = extra.foe ?? b.foeOf(mon);
    if (hook.when && !b.evalWhen(hook.when, { self: mon, foe, skill: extra.skill, kind: extra.info.kind })) continue;
    const fn = b.script(hook.script)?.hook;
    if (!fn) { b.warn(`unknown script ${hook.script}`); continue; }
    const next = fn(hookCtx(b, point, mon, cond, hook, { ...extra, foe, amount: current }), hook.params);
    if (typeof next === 'number') current = Math.max(0, Math.floor(next));
  }
  return current;
}

/** Product of the dealt and taken condition multipliers; `zeroed` when one of them was 0. */
function conditionMultipliers(b: Battle, target: Mon, raw: number, info: DamageInfo, probe: boolean, trace: (reason: string) => void) {
  const src = info.source;
  let dmg = raw, zeroed = false;
  if (src) {
    for (const { cond, hook } of b.hooksWithCond(src, 'modify_damage_dealt')) {
      if (!(hook.kinds ?? ['attack']).includes(info.kind)) continue;
      if (hook.when && !b.evalWhen(hook.when, { self: src, foe: target, skill: info.skill, kind: info.kind })) continue;
      const multiplier = levelMult(hook, cond);
      if (multiplier === 0) zeroed = true;
      dmg *= multiplier;
      if (hook.consume_charge && !probe) b.useCharge(src, cond);
    }
  }
  for (const { cond, hook } of b.hooksWithCond(target, 'modify_damage_taken')) {
    if (!(hook.kinds ?? ['attack']).includes(info.kind)) continue;
    if (hook.when && !b.evalWhen(hook.when, { self: target, foe: src, skill: info.skill, kind: info.kind })) continue;
    const multiplier = levelMult(hook, cond);
    if (multiplier < 1 && ignoresProtection(src, cond, hook)) { trace('ignore_reduction'); continue; }
    if (multiplier === 0) zeroed = true;
    dmg *= multiplier;
    if (hook.consume_charge && !probe) b.useCharge(target, cond);
  }
  return { dmg, zeroed };
}

/**
 * The damage pipeline of applyDamage up to the HP change. With `probe` it has
 * no side effects: no charge use, scripts, RNG draw or floor-break mark.
 */
function computeDamage(b: Battle, target: Mon, raw: number, info: DamageInfo, probe: boolean): { dmg: number; blocked: string | null } {
  const side = ruleSide(b, target.side);
  const src = info.source;
  const trueCost = info.kind === 'true' && !info.ohko && (!src || src.side === target.side);
  const trace = (reason: string) => { if (!probe && info.kind === 'attack') traceHit(b, target, reason); };
  let dmg = raw, zeroedByCondition = false;
  if (info.kind !== 'true') ({ dmg, zeroed: zeroedByCondition } = conditionMultipliers(b, target, raw, info, probe, trace));
  dmg = Math.floor(dmg);
  if (zeroedByCondition) trace('zeroed');
  // min 1 unless a condition explicitly zeroed it
  if (info.kind === 'attack' && raw > 0 && dmg < 1 && (info.effectiveness ?? 1) > 0 && !zeroedByCondition) dmg = 1;

  // boss executes: every attack KOs
  if (src && info.kind === 'attack' && b.bossTrait(src, 'ohko_below_pct')) { dmg = Math.max(dmg, target.hp); trace('ohko_trait'); }

  // skill-level and condition-level final adjustments (shields, floors, endure)
  if (info.kind !== 'true' && info.skill && src && !probe) {
    for (const { entry, op } of skillScripts(b, info.skill)) {
      const m = entry.finalDamage?.({ battle: b, user: src, foe: target, skill: info.skill, info }, op.params, dmg);
      if (typeof m === 'number') dmg = Math.floor(m);
    }
  }
  if (info.kind !== 'true' && !probe) {
    if (src) dmg = transformDamage(b, src, 'modify_damage_outgoing', dmg, { info, foe: target, skill: info.skill });
    dmg = transformDamage(b, target, 'modify_damage_final', dmg, { info, source: src, skill: info.skill });
  }

  // boss rules protecting the target's side
  const blocked = info.forcedExecution ? null : ruleBlocks(b, side, info, target);
  if (blocked) return { dmg: 0, blocked };
  const cap = findRule(side, target, (r) => r.rule === 'damage_cap_per_hit');
  const capBreak = target.persist.capBreak as { statuses: string[]; chance: number } | undefined;
  const capBroken = !probe && !!capBreak && target.conditions.some((c) => capBreak.statuses.includes(c.id)) && b.rng.chance(capBreak.chance);
  if (cap && info.kind !== 'true' && (!cap.categories || cap.categories.includes(info.skill?.category))) {
    trace('damage_cap');
    if (!capBroken) dmg = Math.min(dmg, cap.amount);
  }
  const floor = findRule(side, target, (r) => r.rule === 'hp_floor_until');
  if (floor && !target.persist.floorBroken && !trueCost && !info.forcedExecution) {
    const skills: number[] = floor.skills ?? [floor.skill];
    if (info.skill && skills.includes(info.skill.id) && src?.side !== target.side) { if (!probe) target.persist.floorBroken = true; }
    else { dmg = Math.min(dmg, Math.max(0, target.hp - 1)); trace('hp_floor'); }
  }
  return { dmg, blocked: null };
}

function applyDamage(b: Battle, target: Mon, raw: number, info: DamageInfo): number {
  if (target.fainted) return 0;
  const side = b.sides[target.side];
  const src = info.source;
  const { dmg, blocked } = computeDamage(b, target, raw, info, false);
  if (blocked) {
    b.emit({ type: 'damage_blocked', side: target.side, rule: blocked });
    return 0;
  }
  breakBarrier(b, info, target);
  /** The source when it is on the other side. */
  const foe = src && src.side !== target.side ? src : undefined;
  if (info.skill && foe && info.kind === 'attack') side.lastHitType = typeIdentity(b.data.types, info.skill.type);

  const dealt = Math.min(dmg, target.hp);
  const rotation = findRule(side, target, r => r.rule === 'type_rotation');
  if (rotation && dealt > 0 && foe && info.skill) target.persist.typeRotationCursor = (target.persist.typeRotationCursor ?? 0) + 1;
  const targetStatuses = target.conditions.filter(c => c.def.kind === 'status').map(c => c.id);
  target.hp -= dealt;
  if (foe && dealt > 0) {
    const lt = target.persist.lastTaken;
    target.persist.lastTaken = lt?.turn === b.turn ? { turn: b.turn, amount: lt.amount + dealt } : { turn: b.turn, amount: dealt };
  }
  if (foe) b.damageBySide[foe.side] += dealt;
  if (info.kind === 'attack' && b.hitTrace?.target === target && b.hitTrace.damage === undefined) b.hitTrace.damage = dmg;
  b.emit({
    type: 'damage', side: target.side, slot: target.slot, name: target.name, amount: dealt, kind: info.kind, hp: target.hp, maxHp: target.maxHp,
    crit: !!info.crit, status: info.status, sourceSide: src?.side, sourceName: src?.name, effectiveness: info.effectiveness, skill: info.skill?.id,
    overkill: dmg - dealt,
  });

  if (dealt > 0) hurtReactions(b, target, dealt, info);
  const reflect = findRule(side, target, (r) => r.rule === 'reflect_damage');
  const reflects = reflect && dealt > 0 && dealt >= (reflect.min_damage ?? 0) && !(reflect.not_on_ko && target.hp <= 0);
  if (reflects && foe && !info.noReflect) {
    b.dealDamage(foe, Math.floor((dealt * reflect.pct) / 100), { kind: 'fixed', source: target, noReflect: true });
  }
  if (target.hp > 0) healFullBelow(b, target);
  if (target.hp <= 0) {
    handleFaint(b, target, info, targetStatuses);
    if (target.fainted && src && src !== target) b.fire(src, 'on_ko', { target, info, skill: info.skill });
  } else b.checkPhases(target);
  return dealt;
}

/** The holder's `on_hurt` scripts, then the declarative `on_hurt` hooks of an attack hit. */
function hurtReactions(b: Battle, target: Mon, dealt: number, info: DamageInfo): void {
  const src = info.source;
  b.fire(target, 'on_hurt', { source: src, amount: dealt, info, skill: info.skill });
  if (info.kind !== 'attack') return;
  for (const { cond, hook } of b.hooksWithCond(target, 'on_hurt')) {
    if (hook.cure_on_attack_hit) b.removeCondition(target, cond.id);
    if (hook.inflict_on_type && info.skill && hasAttackType(b.data.types, info.skill.type, hook.inflict_on_type.type)) {
      b.applyStatus(target, hook.inflict_on_type.status, {});
    }
    if (hook.reflect_pct && src && src !== target && !info.noReflect) {
      b.dealDamage(src, Math.floor((dealt * hook.reflect_pct) / 100), { kind: 'fixed', source: target, noReflect: true });
    }
    if (hook.effects) b.runEffects(hook.effects, target, src ?? b.foeOf(target), emptyCtx());
  }
}

/** `heal_full_below`: a living boss below the threshold returns to full HP, a limited number of times. */
function healFullBelow(b: Battle, target: Mon): void {
  const full = findRule(b.sides[target.side], target, (r) => r.rule === 'heal_full_below');
  const threshold = full?.hp ?? (full?.pct === undefined ? undefined : target.maxHp * full.pct / 100);
  const applies = full && threshold !== undefined && target.hp < threshold && (full.times === undefined || (target.persist.fullHeals ?? 0) < full.times);
  if (!applies) return;
  target.persist.fullHeals = (target.persist.fullHeals ?? 0) + 1;
  const healed = target.maxHp - target.hp;
  target.hp = target.maxHp;
  b.emit({
    type: 'heal', side: target.side, slot: target.slot, name: target.name, amount: healed, hp: target.hp, maxHp: target.maxHp, reason: 'heal_full_below',
  });
}

function handleFaint(b: Battle, mon: Mon, info: DamageInfo, targetStatuses: string[]): void {
  // on_faint phases may revive (multi-phase bosses)
  if (b.checkPhases(mon, { onFaint: true }) && mon.hp > 0) return;
  if (statusKoRevival(b, mon, info)) {
    runHookEffects(b, mon, 'on_revive');
    return;
  }
  if (mon.livesLeft > 0) {
    mon.livesLeft--;
    mon.hp = mon.maxHp;
    mon.stages = zeroStages();
    mon.conditions = mon.conditions.filter((c) => c.def.kind !== 'status');
    for (const id of mon.skills) mon.pp[id] = mon.maxPp[id];
    b.emit({ type: 'revive', side: mon.side, slot: mon.slot, name: mon.name, hp: mon.hp, maxHp: mon.maxHp, livesLeft: mon.livesLeft, reason: 'lives' });
    runHookEffects(b, mon, 'on_revive');
    return;
  }
  mon.fainted = true;
  mon.hp = 0;
  b.lastKo = { by: info.source, skill: info.skill, crit: info.crit, target: mon, targetStatuses, status: info.status, turn: b.turn };
  if (mon.side === 1) {
    b.defeated.push({
      foe: { species: mon.species.id, level: mon.level, ...(b.sides[1].kind === 'boss' ? { boss: true } : {}) },
      participants: [...mon.facedBy],
    });
  }
  const by = info.source ? { side: info.source.side, skill: info.skill?.id, crit: !!info.crit } : null;
  b.emit({ type: 'faint', side: mon.side, slot: mon.slot, species: mon.species.id, by });
  runHookEffects(b, mon, 'on_faint');
  // A fainted monster keeps no statuses, conditions or stages.
  mon.conditions = [];
  mon.stages = zeroStages();
}

// ---------- healing ----------

export function heal(b: Battle, mon: Mon, amount: number, opts: { item?: boolean }): number {
  if (mon.fainted) return 0;
  if (!Number.isFinite(amount)) { b.warn('non-finite heal amount rejected'); return 0; }
  const foeSide = b.sides[1 - mon.side];
  if (hasRule(foeSide, 'block_heal') && amount > 0) {
    b.emit({ type: 'heal_blocked', side: mon.side });
    return 0;
  }
  for (const r of b.fire(mon, 'on_heal_incoming', { amount, item: !!opts.item })) if (typeof r === 'number') amount = r;
  if (amount < 0) { b.dealDamage(mon, Math.floor(-amount), { kind: 'fixed' }); return 0; }
  const healed = Math.max(0, Math.min(Math.floor(amount), mon.maxHp - mon.hp));
  mon.hp += healed;
  if (healed > 0) b.emit({ type: 'heal', side: mon.side, slot: mon.slot, name: mon.name, amount: healed, hp: mon.hp, maxHp: mon.maxHp });
  return healed;
}
