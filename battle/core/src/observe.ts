// Public opponent model (design/notes/trainer-search-ai-v58.md sections 2 and 12.2).
//
// The opponent's real Mon is read only for visible fields: species, level, types,
// stages, visible conditions, the HP ratio and, once it has taken visible damage,
// hp and maxHp. Everything else comes from the event log and the engine journal.
// Never read: the opponent's stats, skills, pp, maxPp, persist, vol, rules,
// hidden conditions, inventory, pending action (`side.pending`, which holds the
// opponent's choice while the AI decides mid-turn) or unrevealed reserves.
// Events are read from initialEvents, log and the unflushed `turnEvents`, so a
// mid-turn decision (a faint replacement) sees the current turn; the journal is
// appended directly and is always current.

import type { Battle } from './engine/battle.ts';
import type { ActiveCondition, Mon } from './engine/state.ts';
import type { BattleEvent, ConditionDef, JournalHit, JournalMon, JournalOrder, Skill, StageKey, Stats, When } from './types.ts';
import { computeStats } from './stats.ts';
import { RANDOM_MAX, RANDOM_MIN, STRUGGLE_SKILL, stageMultiplier } from './constants.ts';
import { effectiveness } from './typechart.ts';

export type RefinedStat = 'atk' | 'def' | 'spa' | 'spd' | 'spe';

export interface ModeledFoe {
  side: 0 | 1; slot: number; speciesId: number; level: number; types: string[];
  /** computeStats(base, level, 31, EV 85 each), neutral nature. */
  baseline: Stats;
  /** Stage-0 effective stats after refinement; `hp` is the modeled maximum HP. */
  stats: Stats;
  /** Evidence intervals on stage-0 effective stats; `Infinity` marks an open upper end. */
  intervals: Partial<Record<RefinedStat, [number, number]>>;
  hpKnown: boolean; hp: number; maxHp: number;
  stages: Record<StageKey, number>;
  /** Visible only: status icons and conditions announced while this individual was active. */
  conditions: ActiveCondition[];
  /** First-use order since the last transform. */
  observedMoves: number[];
  moveUses: Record<number, number>;
  conflicts: string[];
}

export const BASELINE_IV = 31;
export const BASELINE_EVS: Stats = { hp: 85, atk: 85, def: 85, spa: 85, spd: 85, spe: 85 };
/** Search domain for stat inversion. */
const STAT_LIMIT = 1 << 24;
const ANNOUNCEMENTS = new Set(['condition_added', 'condition_refreshed', 'status_applied']);

/** Opposing slots that have entered the field (a `switch_in` event), in order of first appearance. */
export function revealedOpponentSlots(b: Battle, viewer: 0 | 1): number[] {
  const foeSide = 1 - viewer;
  const out: number[] = [];
  for (const e of events(b)) if (e.type === 'switch_in' && e.side === foeSide && !out.includes(e.slot)) out.push(e.slot);
  return out;
}

export function observeOpponent(b: Battle, viewer: 0 | 1, slot: number): ModeledFoe {
  const foeSide = (1 - viewer) as 0 | 1;
  if (!revealedOpponentSlots(b, viewer).includes(slot)) throw new Error(`opponent slot ${slot} has not been revealed to side ${viewer}`);
  const pub = publicRecord(b, foeSide, slot);
  const mon = b.sides[foeSide].team[slot];

  const species = b.data.species.get(mon.species.id) ?? mon.species;
  const baseline = computeStats(species.base, mon.level, BASELINE_IV, BASELINE_EVS);
  const ratio = mon.maxHp > 0 ? mon.hp / mon.maxHp : 0;
  const hpKnown = pub.damaged;
  const maxHp = hpKnown ? mon.maxHp : baseline.hp;
  const hp = hpKnown ? mon.hp : ratio * baseline.hp;

  const conflicts: string[] = [];
  const evidence = gatherEvidence(b, viewer, foeSide, slot, pub, baseline, conflicts);
  const stats: Stats = { ...baseline, hp: maxHp };
  const intervals: ModeledFoe['intervals'] = {};
  for (const key of ['atk', 'def', 'spa', 'spd', 'spe'] as RefinedStat[]) {
    const interval = combine(evidence[key], key, conflicts);
    if (!interval) continue;
    intervals[key] = interval;
    stats[key] = Math.min(interval[1], Math.max(interval[0], baseline[key]));
  }

  return {
    side: foeSide, slot, speciesId: species.id, level: mon.level, types: [...mon.types],
    baseline, stats, intervals, hpKnown, hp, maxHp,
    stages: { ...mon.stages },
    conditions: mon.conditions.filter((c) => c.def.kind === 'status' || pub.announced.has(c.id)).map((c) => ({ ...c })),
    observedMoves: [...pub.moves], moveUses: { ...pub.uses }, conflicts,
  };
}

// ---------- public record ----------

interface PublicRecord {
  announced: Set<string>;
  moves: number[];
  uses: Record<number, number>;
  damaged: boolean;
  /** Log index of the last transform of this individual; journal entries after it count. */
  transformAt: number;
}

/** Every public event so far, including the current turn's events not yet flushed to `log`. */
function events(b: Battle): BattleEvent[] {
  return [...b.initialEvents, ...b.log, ...b.turnEvents];
}

/** One pass over the public event stream, tracking which opposing slot is active. */
function publicRecord(b: Battle, foeSide: 0 | 1, slot: number): PublicRecord {
  const rec: PublicRecord = { announced: new Set(), moves: [], uses: {}, damaged: false, transformAt: -Infinity };
  let active = -1;
  const scan = (e: BattleEvent, index: number) => {
    if (e.side !== foeSide) return;
    if (e.type === 'switch_in') active = e.slot;
    if (e.type === 'damage' && e.slot === slot && e.amount + (e.overkill ?? 0) > 0) rec.damaged = true;
    if (active !== slot) return;
    if (e.type === 'transform') { rec.moves = []; rec.uses = {}; rec.transformAt = index; }
    if (e.type === 'move_used' && e.skill !== STRUGGLE_SKILL.id) {
      if (!(e.skill in rec.uses)) { rec.moves.push(e.skill); rec.uses[e.skill] = 0; }
      rec.uses[e.skill]++;
    }
    if (ANNOUNCEMENTS.has(e.type)) rec.announced.add(e.condition ?? e.status);
  };
  for (const e of b.initialEvents) scan(e, -1);
  b.log.forEach((e, i) => scan(e, i));
  b.turnEvents.forEach((e, i) => scan(e, b.log.length + i));
  return rec;
}

// ---------- evidence ----------

interface Observation { lo: number; hi: number; turn: number; what: string }

function gatherEvidence(b: Battle, viewer: 0 | 1, foeSide: 0 | 1, slot: number, pub: PublicRecord, baseline: Stats, conflicts: string[]) {
  const out: Record<RefinedStat, Observation[]> = { atk: [], def: [], spa: [], spd: [], spe: [] };
  const add = (key: RefinedStat, found: [number, number] | null, turn: number, what: string) => {
    if (found) out[key].push({ lo: found[0], hi: found[1], turn, what });
    else conflicts.push(`${key}: ${what} on turn ${turn} fits no candidate stat; ignored`);
  };
  for (const entry of b.journal) {
    if (entry.logIndex <= pub.transformAt) continue;
    if (entry.type === 'hit') {
      if (entry.opaque || entry.damage <= 0) continue;
      const foeAttacks = entry.attacker.side === foeSide && entry.attacker.slot === slot && entry.defender.side === viewer;
      const foeDefends = entry.defender.side === foeSide && entry.defender.slot === slot && entry.attacker.side === viewer;
      if (!foeAttacks && !foeDefends) continue;
      const skill = b.skill(entry.skill);
      if (skill.category === 'status') continue;
      const key: RefinedStat = foeAttacks ? (skill.category === 'physical' ? 'atk' : 'spa') : (skill.category === 'physical' ? 'def' : 'spd');
      const what = `${foeAttacks ? 'hit by' : 'hit on'} the opponent (skill ${entry.skill}, damage ${entry.damage})`;
      const result = invertHit(b, entry, foeAttacks, key, skill, pub, baseline);
      if (result !== undefined) add(key, result, entry.turn, what);
    } else if (entry.slots[foeSide] === slot) {
      const result = invertOrder(b, entry, viewer, foeSide, pub);
      if (result !== undefined) add('spe', result, entry.turn, `move order (skills ${entry.skills.join('/')})`);
    }
  }
  return out;
}

/** Interval of the opponent's stage-0 stat, null if no candidate fits, undefined if the hit is unusable. */
function invertHit(b: Battle, entry: JournalHit, foeAttacks: boolean, key: RefinedStat, skill: Skill, pub: PublicRecord, baseline: Stats): [number, number] | null | undefined {
  const foeSnap = foeAttacks ? entry.attacker : entry.defender;
  const ownSnap = foeAttacks ? entry.defender : entry.attacker;
  const model = modelMon(b, foeSnap, { ...baseline }, pub);
  if (!model) return undefined;
  const own = ownAt(b, ownSnap);
  // A rule-level type override that the public chart does not reproduce.
  if (effectiveness(b.data.types, skill.type, foeAttacks ? own.types : model.types) !== entry.effectiveness) return undefined;
  const probe = (x: number, roll: number) => {
    model.stats[key] = x;
    const opts = { roll, crit: entry.crit, actedFirst: entry.actedFirst, unknownRulesSide: model.side };
    return foeAttacks ? b.probeDamage(model, own, skill, opts) : b.probeDamage(own, model, skill, opts);
  };
  const low = (x: number) => probe(x, RANDOM_MIN), high = (x: number) => probe(x, RANDOM_MAX);
  const D = entry.damage;
  if (foeAttacks) {
    // Damage rises with the attacking stat.
    if (high(STAT_LIMIT) < D || low(1) > D) return null;
    const lo = firstTrue(1, STAT_LIMIT, (x) => high(x) >= D);
    const hi = low(STAT_LIMIT) <= D ? Infinity : firstTrue(1, STAT_LIMIT, (x) => low(x) > D) - 1;
    return lo <= hi ? [lo, hi] : null;
  }
  // Damage falls as the defending stat rises.
  if (low(STAT_LIMIT) > D || high(1) < D) return null;
  const lo = firstTrue(1, STAT_LIMIT, (x) => low(x) <= D);
  const hi = high(STAT_LIMIT) >= D ? Infinity : firstTrue(1, STAT_LIMIT, (x) => high(x) < D) - 1;
  return lo <= hi ? [lo, hi] : null;
}

/** Speed interval from one move order; null if no candidate fits, undefined when the turn is not usable evidence. */
function invertOrder(b: Battle, entry: JournalOrder, viewer: 0 | 1, foeSide: 0 | 1, pub: PublicRecord): [number, number] | null | undefined {
  // Whether a tie decided the order is not public. The bounds below are
  // non-strict, so a tie turn is valid evidence without reading the flag.
  if (entry.priorityHooks[viewer]) return undefined;
  const ownSnap = entry.mons[viewer], foeSnap = entry.mons[foeSide];
  const ownView = whenView(b, ownSnap, () => true);
  const foeView = whenView(b, foeSnap, (id, def) => def?.kind === 'status' || pub.announced.has(id));
  // Visible priority or speed hooks on the opponent must be reproducible.
  const multipliers: number[] = [];
  for (const def of foeView.defs) {
    if (!def) return undefined;
    for (const hook of def.hooks) {
      if (hook.on === 'modify_priority') return undefined;
      if (hook.on === 'modify_stat' && (hook.stat === 'spe' || hook.script)) {
        if (hook.script) return undefined;
        multipliers.push(hook.multiplier ?? 1);
      }
    }
  }
  const pOwn = nominalPriority(b, b.skill(entry.skills[viewer]), ownView, foeView);
  const pFoe = nominalPriority(b, b.skill(entry.skills[foeSide]), foeView, ownView);
  if (pOwn === undefined || pFoe === undefined || pOwn !== pFoe) return undefined;
  const E = entry.effSpe[viewer];
  const speed = (x: number) => multipliers.reduce((v, m) => v * m, x * stageMultiplier(entry.speStages[foeSide]));
  if (entry.first === foeSide) {
    // Foe first: its effective speed >= ours.
    if (speed(STAT_LIMIT) < E) return null;
    return [firstTrue(0, STAT_LIMIT, (x) => speed(x) >= E), Infinity];
  }
  // Foe second: its effective speed <= ours.
  if (speed(STAT_LIMIT) <= E) return [0, Infinity];
  return [0, firstTrue(0, STAT_LIMIT, (x) => speed(x) > E) - 1];
}

/** Smallest x in [lo, hi] with pred(x), for a predicate monotone false -> true; hi + 1 when none. */
function firstTrue(lo: number, hi: number, pred: (x: number) => boolean): number {
  let a = lo, z = hi + 1;
  while (a < z) {
    const mid = Math.floor((a + z) / 2);
    if (pred(mid)) z = mid; else a = mid + 1;
  }
  return a;
}

/** Most recent observations win: intersect backwards from the newest and stop at the first conflict. */
function combine(obs: Observation[], key: RefinedStat, conflicts: string[]): [number, number] | undefined {
  if (!obs.length) return undefined;
  let lo = obs[obs.length - 1].lo, hi = obs[obs.length - 1].hi;
  for (let i = obs.length - 2; i >= 0; i--) {
    const nlo = Math.max(lo, obs[i].lo), nhi = Math.min(hi, obs[i].hi);
    if (nlo > nhi) {
      conflicts.push(`${key}: ${i + 1} earlier observation(s) through turn ${obs[i].turn} (${obs[i].what}: [${obs[i].lo}, ${obs[i].hi}]) conflict with the ${obs.length - 1 - i} most recent ([${lo}, ${hi}]); kept the most recent`);
      break;
    }
    lo = nlo; hi = nhi;
  }
  return [lo, hi];
}

// ---------- model monsters for the probe ----------

/** The opponent at the journaled moment, built only from public data plus a candidate stat line. */
function modelMon(b: Battle, snap: JournalMon, stats: Stats, pub: PublicRecord): Mon | null {
  const species = b.data.species.get(snap.species);
  if (!species) return null;
  const conditions: ActiveCondition[] = [];
  for (const c of snap.conditions) {
    const def = b.data.conditions.get(c.id);
    if (!(def?.kind === 'status' || pub.announced.has(c.id))) continue;
    if (!def) return null; // visible but not reproducible
    conditions.push({ id: c.id, def, turns: Infinity, level: c.level, appliedTurn: 0 });
  }
  return {
    side: snap.side, slot: snap.slot, species, name: species.name.zh, level: snap.level, types: [...snap.types],
    stats, maxHp: stats.hp, hp: snap.maxHp > 0 ? (snap.hp / snap.maxHp) * stats.hp : 0,
    skills: [], pp: {}, maxPp: {}, stages: { ...snap.stages }, conditions, fainted: false, livesLeft: 0,
    turnsActive: snap.turnsActive, lastActedTurn: -1, usedSkills: new Set(), skillUses: {},
    streak: { skill: -1, count: 0, turn: -1 }, vol: {}, persist: {}, facedBy: new Set(), aiCursor: 0,
    rules: [], phases: [], phasesFired: new Set(),
  };
}

/** The viewer's own monster at the journaled moment. Its own side is fully known. */
function ownAt(b: Battle, snap: JournalMon): Mon {
  const real = b.sides[snap.side].team[snap.slot];
  const conditions: ActiveCondition[] = [];
  for (const c of snap.conditions) {
    const live = real.conditions.find((x) => x.id === c.id);
    const def = live?.def ?? b.data.conditions.get(c.id);
    if (def) conditions.push({ id: c.id, def, turns: Infinity, level: c.level, appliedTurn: 0, charges: live?.charges, data: live?.data });
  }
  return { ...real, types: [...snap.types], hp: snap.hp, maxHp: snap.maxHp, stages: { ...snap.stages }, conditions, turnsActive: snap.turnsActive };
}

// ---------- nominal priority ----------

interface WhenView { types: string[]; ratio: number; stages: Record<StageKey, number>; ids: Set<string>; statuses: Set<string>; turnsActive: number; defs: (ConditionDef | undefined)[] }

function whenView(b: Battle, snap: JournalMon, visible: (id: string, def: ConditionDef | undefined) => boolean): WhenView {
  const ids = new Set<string>(), statuses = new Set<string>(), defs: (ConditionDef | undefined)[] = [];
  for (const c of snap.conditions) {
    const def = b.data.conditions.get(c.id);
    if (!visible(c.id, def)) continue;
    ids.add(c.id);
    defs.push(def);
    if (def?.kind === 'status') statuses.add(c.id);
  }
  return { types: snap.types, ratio: snap.maxHp > 0 ? (snap.hp / snap.maxHp) * 100 : 0, stages: snap.stages, ids, statuses, turnsActive: snap.turnsActive, defs };
}

/** Catalog priority plus visible `priority_if`; undefined when a script or unknown predicate decides it. */
function nominalPriority(b: Battle, skill: Skill, self: WhenView, foe: WhenView): number | undefined {
  let p = skill.priority ?? 0;
  for (const op of skill.effects ?? []) {
    if (op.op === 'script' && b.script(op.id)?.priority) return undefined;
    if (op.op !== 'priority_if') continue;
    const ok = publicWhen(op.when, self, foe);
    if (ok === undefined) return undefined;
    if (ok) p = op.priority;
  }
  return p;
}

/** Pure subset of the engine's condition language over visible state; undefined for anything else. */
function publicWhen(w: When | undefined, self: WhenView, foe: WhenView): boolean | undefined {
  if (!w) return true;
  const has = (v: WhenView, s: unknown) => [...v.statuses].some((id) => s === 'any' || s === true || id === s || (Array.isArray(s) && s.includes(id)));
  const up = (v: WhenView) => Object.values(v.stages).some((s) => s > 0), down = (v: WhenView) => Object.values(v.stages).some((s) => s < 0);
  const typed = (v: WhenView, t: unknown) => (Array.isArray(t) ? t : [t]).some((x) => v.types.includes(x as string));
  let all = true;
  for (const [k, v] of Object.entries(w)) {
    let ok: boolean | undefined;
    switch (k) {
      case 'self_status': ok = has(self, v); break;
      case 'foe_status': ok = has(foe, v); break;
      case 'self_no_status': ok = !has(self, 'any'); break;
      case 'foe_no_status': ok = !has(foe, 'any'); break;
      case 'self_condition': ok = self.ids.has(v as string); break;
      case 'foe_condition': ok = foe.ids.has(v as string); break;
      case 'self_hp_below_pct': ok = self.ratio < (v as number); break;
      case 'self_hp_above_pct': ok = self.ratio > (v as number); break;
      case 'foe_hp_below_pct': ok = foe.ratio < (v as number); break;
      case 'foe_hp_above_pct': ok = foe.ratio > (v as number); break;
      case 'first_turn': ok = (self.turnsActive <= 1) === v; break;
      case 'self_type': ok = typed(self, v); break;
      case 'foe_type': ok = typed(foe, v); break;
      case 'self_stage_up': ok = up(self) === v; break;
      case 'foe_stage_up': ok = up(foe) === v; break;
      case 'self_stage_down': ok = down(self) === v; break;
      case 'foe_stage_down': ok = down(foe) === v; break;
      case 'all': { const r = (v as When[]).map((x) => publicWhen(x, self, foe)); ok = r.includes(undefined) ? undefined : r.every(Boolean); break; }
      case 'any': { const r = (v as When[]).map((x) => publicWhen(x, self, foe)); ok = r.includes(undefined) ? undefined : r.some(Boolean); break; }
      case 'not': { const r = publicWhen(v as When, self, foe); ok = r === undefined ? undefined : !r; break; }
      default: ok = undefined;
    }
    if (ok === undefined) return undefined;
    all &&= ok;
  }
  return all;
}
