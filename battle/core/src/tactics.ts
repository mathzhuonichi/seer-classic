// Bounded, read-only heuristics. Never invoke live scripts to score a candidate.
// Opponent builds, unrevealed moves, reserves and pending input are not AI inputs.
import type { Action, AiSpec, EffectOp, Hook, Skill, StageKey, When } from './types.ts';
import type { Battle, Mon, Side } from './battle.ts';
import { STRUGGLE_SKILL } from './battle.ts';
import { computeStats } from './stats.ts';
import { accuracyStageMultiplier, stageMultiplier, STAB } from './constants.ts';
import { attackTypes, effectiveness } from './typechart.ts';

type View = Pick<Mon, 'side' | 'slot' | 'species' | 'level' | 'types' | 'stats' | 'maxHp' | 'hp' | 'stages' | 'conditions' | 'turnsActive' | 'rules'> & {observedMoves?:Skill[]};
const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const hpRatio = (m: View) => m.hp / Math.max(1, m.maxHp);
const status = (m: View, id: unknown) => m.conditions.some(c => c.def.kind === 'status' && (id === true || id === 'any' || c.id === id || Array.isArray(id) && id.includes(c.id)));

function publicOpponent(battle: Battle, mon: Mon): View {
  const foe = battle.foeOf(mon);
  const stats = computeStats(foe.species.base, foe.level, 15);
  const revealed = new Set<string>();
  const moves=new Set<number>();
  let slot = 0;
  for (const event of [...battle.initialEvents, ...battle.log]) {
    if (event.side !== foe.side) continue;
    if (event.type === 'switch_in') slot = event.slot;
    if (event.type === 'transform' && slot === foe.slot) moves.clear();
    if (event.type === 'move_used' && slot === foe.slot) moves.add(event.skill);
    if (slot === foe.slot && ['condition_added', 'condition_refreshed', 'status_applied'].includes(event.type)) revealed.add(event.condition ?? event.status);
  }
  return { side: foe.side, slot: foe.slot, species: foe.species, level: foe.level,
    types: foe.types, stats, maxHp: stats.hp, hp: hpRatio(foe) * stats.hp,
    observedMoves:[...moves].map(id=>battle.data.skills.get(id)).filter((skill):skill is Skill=>!!skill),
    // Status icons are visible directly; other conditions require an announcement.
    // In particular, unannounced energy beads and innate traits stay hidden.
    stages: foe.stages, conditions: foe.conditions.filter(c => c.def.kind === 'status' || revealed.has(c.id)), turnsActive: foe.turnsActive, rules: foe.rules };
}

/** Pure subset of the condition language. Unknown/script predicates are not speculated on. */
function when(w: When | undefined, self: View, foe: View, skill?: Skill): boolean {
  if (!w) return true;
  return Object.entries(w).every(([k, v]) => {
    switch (k) {
      case 'all': return (v as When[]).every(x => when(x, self, foe, skill));
      case 'any': return (v as When[]).some(x => when(x, self, foe, skill));
      case 'not': return !when(v as When, self, foe, skill);
      case 'self_status': return status(self, v);
      case 'foe_status': return status(foe, v);
      case 'self_no_status': return !status(self, 'any');
      case 'foe_no_status': return !status(foe, 'any');
      case 'self_condition': return self.conditions.some(c => c.id === v);
      case 'foe_condition': return foe.conditions.some(c => c.id === v);
      case 'self_hp_below_pct': return hpRatio(self) * 100 < Number(v);
      case 'self_hp_above_pct': return hpRatio(self) * 100 > Number(v);
      case 'foe_hp_below_pct': return hpRatio(foe) * 100 < Number(v);
      case 'foe_hp_above_pct': return hpRatio(foe) * 100 > Number(v);
      case 'first_turn': return (self.turnsActive === 0) === v;
      case 'self_type': return (Array.isArray(v) ? v : [v]).some(t => self.types.includes(t as string));
      case 'foe_type': return (Array.isArray(v) ? v : [v]).some(t => foe.types.includes(t as string));
      case 'self_stage_up': return Object.values(self.stages).some(s => s > 0) === v;
      case 'foe_stage_up': return Object.values(foe.stages).some(s => s > 0) === v;
      case 'self_stage_down': return Object.values(self.stages).some(s => s < 0) === v;
      case 'foe_stage_down': return Object.values(foe.stages).some(s => s < 0) === v;
      case 'category': return !!skill && (Array.isArray(v) ? v : [v]).includes(skill.category);
      case 'skill_type': return !!skill && (Array.isArray(v) ? v : [v]).includes(skill.type);
      case 'speed_faster': return (stat(self, 'spe') > stat(foe, 'spe')) === v;
      default: return false;
    }
  });
}

function hooks(m: View, point: Hook['on'], foe: View, skill?: Skill): Hook[] {
  return m.conditions.flatMap(c => c.def.hooks.filter(h => h.on === point && !h.script && when(h.when, m, foe, skill))
    .map(h => ({...h, multiplier: h.multiplier_by_level ? h.multiplier_by_level[Math.min((c.level ?? 1) - 1, h.multiplier_by_level.length - 1)] : h.multiplier})));
}
function stat(m: View, key: 'atk' | 'def' | 'spa' | 'spd' | 'spe'): number {
  let value = m.stats[key] * stageMultiplier(m.stages[key]);
  for (const c of m.conditions) for (const h of c.def.hooks) {
    if (h.on === 'modify_stat' && h.stat === key && !h.script && !h.when) value *= h.multiplier ?? 1;
  }
  return value;
}
function rules(b: Battle, m: View) { return [...b.sides[m.side].rules, ...m.rules]; }
function hasRule(b: Battle, m: View, id: string) { return rules(b, m).some(r => r.rule === id); }
function hitChance(self: View, foe: View, skill: Skill): number {
  const target = skill.target ?? (skill.category !== 'status' || (skill.effects ?? []).some(e => effectTarget(e) === 'foe' && !['multi_hit', 'power_if', 'priority_if', 'crit_if'].includes(e.op)) ? 'foe' : 'self');
  if (target === 'self') return 1;
  if (skill.accuracy === null || hooks(self, 'modify_accuracy', foe, skill).some(h => h.force_hit)) return 1;
  let chance = skill.accuracy * accuracyStageMultiplier(self.stages.acc - foe.stages.eva);
  for (const h of hooks(self, 'modify_accuracy', foe, skill)) chance = chance * (h.multiplier ?? 1) + (h.add_percent ?? 0);
  for (const h of hooks(foe, 'modify_accuracy_taken', self, skill)) chance = chance * (h.multiplier ?? 1) - (h.add_percent ?? 0);
  return clamp(chance / 100);
}
function effectTarget(op: EffectOp): 'self' | 'foe' {
  return op.target ?? (['heal', 'restore_pp', 'protect', 'cure_status', 'transform', 'set_skills', 'set_ai', 'revive', 'say'].includes(op.op) ? 'self' : 'foe');
}
function ordinaryTrainerDuel(b: Battle, self: View): boolean {
  return b.sides[self.side].kind === 'trainer' && ['player', 'trainer'].includes(b.sides[1 - self.side].kind);
}
type TeamGift = 'critical' | 'inheritance';
function teamGift(skill: Skill): TeamGift | undefined {
  if ([20398, 20932].includes(skill.id) && skill.effects?.some(e => e.op === 'script' && e.id === 'seer_eff_71')) return 'critical';
  if (skill.id === 20749 && skill.effects?.some(e => e.op === 'script' && e.id === 'seer_eff_59' && e.params?.[0] === 4 && e.params?.[1] === 5)) return 'inheritance';
  return undefined;
}
function priority(self: View, foe: View, skill: Skill): number {
  let result = skill.priority ?? 0;
  for (const e of skill.effects ?? []) if (e.op === 'priority_if' && when(e.when, self, foe, skill)) result = e.priority;
  return result;
}
function actsBeforeThreat(b: Battle, self: View, foe: View, skill: Skill): boolean {
  const own = priority(self, foe, skill);
  const enemy = Math.max(...threats(b, foe).map(s => priority(foe, self, s)));
  return own > enemy || own === enemy && stat(self, 'spe') >= stat(foe, 'spe');
}
function typeBlocked(b: Battle, self: View, foe: View, skill: Skill): boolean {
  return skill.category !== 'status' && (skill.power > 0 || !!skill.effects?.some(e => e.op === 'power_if' && e.power)) &&
    !hasRule(b, foe, 'ignore_type_chart') && !hasRule(b, self, 'ignore_type_chart') && effectiveness(b.data.types, skill.type, foe.types) === 0;
}

/** Approximation, not a simulated turn: no RNG, script callbacks, or hidden builds. */
function damage(b: Battle, self: View, foe: View, skill: Skill): number {
  // The core aborts foe-facing secondary effects when a powered attack is immune.
  if (typeBlocked(b, self, foe, skill)) return 0;
  let power = skill.power;
  for (const e of skill.effects ?? []) if (e.op === 'power_if' && when(e.when, self, foe, skill)) {
    const q = (e.chance ?? 100) / 100;
    if (e.power) power += (e.power - power) * q;
    if (e.multiplier) power *= 1 + (e.multiplier - 1) * q;
  }
  const eff = hasRule(b, foe, 'ignore_type_chart') || hasRule(b, self, 'ignore_type_chart') ? 1 : effectiveness(b.data.types, skill.type, foe.types);
  let amount = 0;
  if (skill.category !== 'status' && power > 0) {
    const physical = skill.category === 'physical';
    const base = Math.floor((.4 * self.level + 2) * power * stat(self, physical ? 'atk' : 'spa') / Math.max(1, stat(foe, physical ? 'def' : 'spd')) / 50) + 2;
    amount = base * eff * .925 * (attackTypes(b.data.types, skill.type).every(t => self.types.includes(t)) ? STAB : 1);
    for (const h of hooks(self, 'modify_damage_dealt', foe, skill)) if ((h.kinds ?? ['attack']).includes('attack')) amount *= h.multiplier ?? 1;
    for (const h of hooks(foe, 'modify_damage_taken', self, skill)) if ((h.kinds ?? ['attack']).includes('attack')) amount *= h.multiplier ?? 1;
    for (const e of skill.effects ?? []) if (e.op === 'multi_hit') {
      const count = ((e.min ?? 2) + (e.max ?? e.min ?? 2)) / 2;
      amount *= count;
    }
  }
  for (const e of skill.effects ?? []) if (when(e.when, self, foe, skill)) {
    const q = (e.chance ?? 100) / 100;
    if (e.op === 'fixed_damage' && !hasRule(b, foe, 'immune_fixed_damage')) amount += (e.amount ?? 0) * q;
    if (e.op === 'pct_damage' && !hasRule(b, foe, 'immune_percent_damage')) amount += (e.pct_max_hp ? foe.maxHp * e.pct_max_hp : foe.hp * (e.pct_current_hp ?? 0)) / 100 * q;
    if (e.op === 'ohko' && !hasRule(b, foe, 'immune_ohko')) amount += foe.hp * q;
    // Sea Heart's pinned script is a known quarter of maximum HP. This reads
    // the public HP model; no live callback or hidden opponent build is used.
    if (ordinaryTrainerDuel(b, self) && skill.id === 20143 && e.op === 'script' && e.id === 'seer_eff_28' && e.params?.[0] === 4 && !hasRule(b, foe, 'immune_percent_damage')) amount += Math.floor(foe.maxHp / 4) * q;
  }
  for (const r of rules(b, foe)) {
    if (r.rule === 'damage_only_from' && ((r.types && !r.types.some((t: string) => attackTypes(b.data.types, skill.type).includes(t))) || (r.skills && !r.skills.includes(skill.id)) || (r.categories && !r.categories.includes(skill.category)) || (r.sure_hit && skill.accuracy !== null) || (r.super_effective && eff <= 1))) amount = 0;
    if (r.rule === 'invulnerable_turns' && b.turn <= r.turns) amount = 0;
  }
  // The already installed Gaia seal follows a successful damaging attack once.
  // Its separate fixed hit is not scaled by ordinary attack-only reductions.
  if (amount > 0 && ['physical', 'special'].includes(skill.category) && self.conditions.some(c => c.id === 'npc_gaia_evil_seal' && c.turns > 0) && !hasRule(b, foe, 'immune_fixed_damage')) {
    let bonus = 30;
    for (const h of hooks(self, 'modify_damage_dealt', foe, skill)) if ((h.kinds ?? ['attack']).includes('fixed')) bonus *= h.multiplier ?? 1;
    for (const h of hooks(foe, 'modify_damage_taken', self, skill)) if ((h.kinds ?? ['attack']).includes('fixed')) bonus *= h.multiplier ?? 1;
    for (const r of rules(b, foe)) if (r.rule === 'damage_cap_per_hit') bonus = Math.min(bonus, r.amount);
    amount += Math.max(0, Math.floor(bonus));
  }
  return Math.max(0, amount);
}

/** Move announcements are public; switches/transformations delimit their owner. */
function observedMoves(b: Battle, foe: View): Skill[] {
  // A public view is local to this decision; score all candidates against one scan.
  if(foe.observedMoves)return foe.observedMoves;
  let slot = 0;
  const seen = new Set<number>();
  for (const e of [...b.initialEvents, ...b.log]) {
    if (e.side !== foe.side) continue;
    if (e.type === 'switch_in') slot = e.slot;
    if (e.type === 'transform' && slot === foe.slot) seen.clear();
    if (e.type === 'move_used' && slot === foe.slot) seen.add(e.skill);
  }
  return [...seen].map(id => b.data.skills.get(id)).filter((s): s is Skill => !!s);
}
function threats(b: Battle, foe: View): Skill[] {
  const shown = observedMoves(b, foe).filter(s => s.category !== 'status' || s.effects?.some(e => ['fixed_damage', 'pct_damage', 'ohko'].includes(e.op)));
  if (shown.length) return shown;
  // An explicitly uncertain neutral-build STAB attack, never a peek at its loadout.
  return foe.types.map(type => ({...STRUGGLE_SKILL, type, power: 80, effects: [], category: foe.species.base.atk >= foe.species.base.spa ? 'physical' : 'special'}));
}
function threat(b: Battle, self: View, foe: View): number {
  return Math.max(0, ...threats(b, foe).map(s => damage(b, foe, self, s) * hitChance(foe, self, s)));
}
function canStatus(b: Battle, target: View, other: View, id: string): boolean {
  if (!b.data.conditions.has(id) || target.conditions.some(c => c.id === id)) return false;
  if (id === 'leech' && target.types.includes('grass')) return false;
  if (hasRule(b, target, 'immune_status') || rules(b, target).some(r => r.rule === 'immune_status_list' && r.statuses?.includes(id))) return false;
  return !hooks(target, 'block_status', other).some(h => !h.statuses || h.statuses.includes(id));
}

function observedControlRisk(b: Battle, self: Mon, foe: View, condition: string): number {
  // Estimate the next unprotected turn without mutating the existing buff.
  const exposed = {...self, conditions: self.conditions.filter(c => c.id !== condition)};
  return Math.max(0, ...observedMoves(b, foe).flatMap(skill => {
    if (typeBlocked(b, foe, exposed, skill)) return [];
    return (skill.effects ?? []).filter(op => op.op === 'status' && effectTarget(op) === 'foe' && when(op.when, foe, exposed, skill)).map(op => {
      const ids: string[] = Array.isArray(op.status) ? op.status : [op.status];
      const dangerous = ids.filter(id => {
        const def = b.data.conditions.get(id);
        return !!def && (def.control || def.hooks.some(h => h.on === 'before_move' && h.prevent)) && canStatus(b, exposed, foe, id);
      }).length / ids.length;
      return dangerous * clamp((op.chance ?? 100) / 100) * hitChance(foe, exposed, skill);
    });
  }));
}

function pendingGift(mon: Mon): boolean {
  return mon.conditions.some(c => c.turns > 0 && (c.id === 'seer_eff_59' || c.id === 'seer_eff_71' && (c.data?.pool?.left ?? 1) > 0));
}
function poweredMoves(b: Battle, mon: Mon): Skill[] {
  return mon.skills.filter(id => mon.pp[id] > 0).map(id => b.skill(id)).filter(skill => skill.category !== 'status' && skill.power > 0);
}
function projectedInheritance(mon: Mon): Mon {
  // Transfer adds only speed and accuracy +1. It never copies the donor's stages.
  return {...mon, stages: {...mon.stages, spe: Math.min(6, mon.stages.spe + 1), acc: Math.min(6, mon.stages.acc + 1)}};
}
function giftBenefit(b: Battle, recipient: Mon, foe: View, gift: TeamGift): number {
  const attacks = poweredMoves(b, recipient);
  if (!attacks.length || recipient.hp <= threat(b, recipient, foe) * .6) return 0;
  const bestDamage = Math.max(0, ...attacks.map(skill => damage(b, recipient, foe, skill) * hitChance(recipient, foe, skill)));
  if (bestDamage <= 0) return 0;
  if (gift === 'critical') {
    if (recipient.conditions.some(c => c.turns > 0 && c.def.hooks.some(h => h.on === 'modify_crit_rate' && h.force_crit))) return 0;
    // Two shared critical attacks approximately add two ordinary attacks.
    return Math.min(110, bestDamage / foe.maxHp * 200);
  }
  const projected = projectedInheritance(recipient);
  const control = recipient.skills.filter(id => recipient.pp[id] > 0).map(id => b.skill(id)).filter(skill =>
    skill.effects?.some(e => e.op === 'status' && effectTarget(e) === 'foe' && ['sleep', 'paralysis', 'fear', 'petrify', 'fatigue'].includes(e.status) && canStatus(b, foe, recipient, e.status)));
  const accuracyGain = Math.max(0, ...[...attacks, ...control].map(skill => hitChance(projected, foe, skill) - hitChance(recipient, foe, skill)));
  const speedGain = projected.stages.spe > recipient.stages.spe;
  const overtakes = speedGain && stat(recipient, 'spe') <= stat(foe, 'spe') && stat(projected, 'spe') > stat(foe, 'spe');
  return (speedGain ? 18 : 0) + (overtakes ? 20 : 0) + accuracyGain * 80 + (control.length && (speedGain || accuracyGain > 0) ? 20 : 0);
}
function usefulRecipients(b: Battle, self: Mon, foe: View, gift: TeamGift): {mon: Mon; benefit: number}[] {
  return b.sides[self.side].team.filter(mon => !mon.fainted && mon.hp > 0 && mon.slot !== self.slot)
    .map(mon => ({mon, benefit: giftBenefit(b, mon, foe, gift)})).filter(row => row.benefit > 0);
}
function canGiveTeamGift(b: Battle, self: Mon, foe: View, skill: Skill): boolean {
  const gift = teamGift(skill);
  return !!gift && ordinaryTrainerDuel(b, self) && !b.sides[self.side].team.some(mon => !mon.fainted && pendingGift(mon)) && usefulRecipients(b, self, foe, gift).length > 0;
}

/** A smart trainer must not self-KO merely because its other moves ran out. */
export function requiresTrainerSupportFallback(b: Battle, side: Side): boolean {
  if (side.kind !== 'trainer' || (b.active(side.index).ai ?? side.ai ?? {kind:'smart'}).kind !== 'smart') return false;
  const self = b.active(side.index), ids = self.skills.filter(id => self.pp[id] > 0);
  if (!ids.length || !ids.every(id => teamGift(b.skill(id)))) return false;
  const foe = publicOpponent(b, self);
  const incoming = threat(b, self, foe);
  return ids.every(id => !canGiveTeamGift(b, self, foe, b.skill(id)) || teamGiftUtility(b, self, foe, b.skill(id), incoming) <= 0);
}

function teamGiftUtility(b: Battle, self: Mon, foe: View, skill: Skill, incoming: number): number {
  const gift = teamGift(skill);
  if (!gift || !canGiveTeamGift(b, self, foe, skill)) return 0;
  const benefit = Math.max(...usefulRecipients(b, self, foe, gift).map(row => row.benefit));
  const urgent = actsBeforeThreat(b, self, foe, skill) && incoming >= self.hp ? 30 : hpRatio(self) < .35 ? 12 : 0;
  return benefit - hpRatio(self) * 70 + urgent;
}

function utility(b: Battle, self: Mon, foe: View, skill: Skill, op: EffectOp, incoming: number, dealt: number): number {
  if (!when(op.when, self, foe, skill)) return 0;
  if (typeBlocked(b, self, foe, skill) && op.target !== 'self') return 0;
  const toSelf = effectTarget(op) === 'self';
  const target = toSelf ? self : foe;
  const sign = toSelf ? 1 : -1;
  let value = 0;
  switch (op.op) {
    case 'script':
      if (op.id === 'seer_eff_71' || op.id === 'seer_eff_59') value = teamGiftUtility(b, self, foe, skill, incoming);
      if (ordinaryTrainerDuel(b, self) && skill.id === 11924 && op.id === 'seer_eff_85') {
        const gains = Object.fromEntries(Object.entries(foe.stages).filter(([, stage]) => stage > 0));
        value = utility(b, self, foe, skill, {op:'clear_stages',target:'foe',which:'up'}, incoming, dealt) +
          utility(b, self, foe, skill, {op:'stat_stage',target:'self',stats:gains}, incoming, dealt);
      }
      break;
    case 'heal': {
      if (hasRule(b, toSelf ? foe : self, 'block_heal')) break;
      const amount = op.pct_max_hp ? target.maxHp * op.pct_max_hp / 100 : op.pct_damage_dealt ? dealt * op.pct_damage_dealt / 100 : op.amount ?? 0;
      const useful = Math.min(target.maxHp - target.hp, amount) / target.maxHp;
      value = sign * useful * (hpRatio(target) < .5 ? 170 : hpRatio(target) < .75 ? 90 : 15);
      if (toSelf && incoming >= self.hp && !actsBeforeThreat(b, self, foe, skill)) value *= .15;
      break;
    }
    case 'status': {
      const ids: string[] = Array.isArray(op.status) ? op.status : [op.status];
      value = ids.reduce((sum, id) => {
        if (!canStatus(b, target, toSelf ? foe : self, id)) return sum;
        const def = b.data.conditions.get(id)!;
        const control = def.control || def.hooks.some(h => h.on === 'before_move');
        const dot = def.hooks.some(h => h.damage_pct_max_hp || h.drain_to_foe);
        const alreadyControlled = target.conditions.some(c => c.def.control);
        return sum + (control ? alreadyControlled ? 8 : 48 : dot ? 34 : 22);
      }, 0) / ids.length * -sign * clamp(hpRatio(target) * 2, .2, 1);
      break;
    }
    case 'stat_stage': {
      for (const [raw, delta] of Object.entries(op.stats as Record<StageKey, number>)) {
        const key = raw as StageKey, old = target.stages[key];
        if (delta < 0 && !toSelf && (hasRule(b, target, 'immune_stage_down') || hooks(target, 'block_stage_down', self).length)) continue;
        let weight = 15;
        if (key === 'atk' || key === 'spa') {
          const physical = key === 'atk';
          const relevant = toSelf ? self.skills.some(id => b.skill(id).category === (physical ? 'physical' : 'special') && b.skill(id).power > 0 && self.pp[id] > 0) : foe.species.base[key] >= foe.species.base[physical ? 'spa' : 'atk'] * .8;
          weight = relevant ? 23 : 0;
        }
        if (key === 'spe' && stat(self, 'spe') > stat(foe, 'spe') && delta * sign > 0) weight = 4;
        const change = clamp(old + delta, -6, 6) - old;
        value += change * sign * weight / (1 + Math.abs(old));
      }
      if (value > 0) value *= clamp((self.hp - incoming) / self.maxHp * 1.7, .1, 1);
      break;
    }
    case 'clear_stages':
      value = Object.values(target.stages).filter(s => op.which === 'up' ? s > 0 : op.which === 'down' ? s < 0 : true).reduce((sum, s) => sum - s * sign * 15, 0);
      break;
    case 'cure_status': value = sign * target.conditions.filter(c => c.def.kind === 'status' && (!op.statuses || op.statuses.includes(c.id))).reduce((sum, c) => sum + (c.def.control ? 65 : 35), 0); break;
    case 'restore_pp': value = toSelf ? (op.skill ? [op.skill] : self.skills).reduce((sum: number, id: number) => sum + (self.pp[id] === 0 ? 20 : self.pp[id] <= 2 ? 7 : 0), 0) : 0; break;
    case 'recoil': value = -(op.pct_max_hp ? self.maxHp * op.pct_max_hp / 100 : dealt * (op.pct_damage_dealt ?? 0) / 100) / self.maxHp * 65; break;
    case 'protect': {
      const residual = foe.conditions.some(c => c.def.hooks.some(h => h.on === 'turn_end' && h.damage_pct_max_hp));
      value = residual ? incoming / self.maxHp * 45 : 0;
      if (self.streak.skill === skill.id && self.streak.turn === b.turn) value *= .2;
      break;
    }
    case 'add_condition': {
      if (target.conditions.some(c => c.id === op.condition && c.turns > 1)) break;
      const def = b.data.conditions.get(op.condition);
      for (const h of def?.hooks ?? []) {
        if (h.on === 'modify_damage_taken') value += sign * (1 - (h.multiplier ?? 1)) * 45;
        if (h.on === 'modify_damage_dealt') value += sign * ((h.multiplier ?? 1) - 1) * 25;
        if (h.on === 'block_status' && !status(target, 'any')) value += sign * 12;
        if (h.on === 'block_stage_down') value += sign * (Object.values(target.stages).some(s => s > 0) ? 18 : 6);
        if (h.on === 'turn_end' && h.damage_pct_max_hp) value -= sign * h.damage_pct_max_hp * 2;
        for (const e of h.effects ?? []) if (h.on === 'turn_end' && e.op === 'heal') value += sign * Math.min(1 - hpRatio(target), (e.pct_max_hp ?? 0) / 100) * 180;
      }
      if (toSelf && ordinaryTrainerDuel(b, self) && skill.id === 21020 && op.condition === 'cond_immune_status') {
        const remaining = self.conditions.find(c => c.id === op.condition)?.turns ?? 0;
        value += observedControlRisk(b, self, foe, op.condition) * (remaining > 0 ? 50 : 80);
      }
      // Unmodelled buffs get one cautious trial, never repeated blind setup.
      if (!value && !self.usedSkills.has(skill.id)) value = 8;
      break;
    }
  }
  return value * clamp((op.chance ?? 100) / 100);
}

function score(b: Battle, self: Mon, foe: View, skill: Skill, ai: AiSpec): {score: number; ko: boolean} {
  const raw = damage(b, self, foe, skill), hit = hitChance(self, foe, skill), incoming = threat(b, self, foe);
  const ko = raw >= foe.hp && raw > 0 && hit >= .7;
  let score = Math.min(raw, foe.hp) / foe.maxHp * 100 * hit;
  const before = actsBeforeThreat(b, self, foe, skill);
  if (ko) score += (before ? 140 : 90) * hit;
  let support = (skill.effects ?? []).reduce((sum, e) => sum + utility(b, self, foe, skill, e, incoming, raw), 0);
  if (ai.style === 'offense' && support > 0) support *= .8;
  if (ai.style === 'control' && skill.effects?.some(e => e.op === 'status')) support *= 1.25;
  if (ai.style === 'attrition' && skill.effects?.some(e => ['heal', 'status', 'add_condition'].includes(e.op))) support *= 1.15;
  score += support * hit;
  if (incoming >= self.hp && !before && score > 0) score *= .35;
  // Stable ties preserve deterministic replays and use no extra random draws.
  return {score: score + hit * .01, ko};
}
function bestMove(b: Battle, self: Mon, foe: View, ai: AiSpec) {
  const ids = self.skills.filter(id => self.pp[id] > 0 &&
    (b.sides[self.side].kind !== 'trainer' || !teamGift(b.skill(id)) || canGiveTeamGift(b, self, foe, b.skill(id)) && teamGiftUtility(b, self, foe, b.skill(id), threat(b, self, foe)) > 0));
  return (ids.length ? ids : [STRUGGLE_SKILL.id]).map(id => ({id, ...score(b, self, foe, b.skill(id), ai)})).sort((a, z) => z.score - a.score || a.id - z.id)[0];
}
function matchup(b: Battle, self: Mon, foe: View): number {
  const attacks = self.skills.filter(id => self.pp[id] > 0).map(id => damage(b, self, foe, b.skill(id)) * hitChance(self, foe, b.skill(id)));
  return Math.max(0, ...attacks) / foe.maxHp * 100 - threat(b, self, foe) / Math.max(1, self.hp) * 65 + hpRatio(self) * 15;
}

const hpCost = (mon: View, amount: number) => Math.min(Math.max(0, amount), Math.max(0, mon.hp)) / mon.maxHp * 100;
const controlled = (mon: View) => mon.conditions.some(c => c.turns > 0 && c.def.control);
function afterDecisionTurn(mon: Mon, hp: number): Mon {
  // An existing one-turn buff expires after the entry/stay turn. Permanent
  // traits and shared gifts survive; projecting time never edits their objects.
  return {...mon, hp, conditions: mon.conditions.filter(c => c.turns > 1).map(c => ({...c, turns: c.turns === Infinity ? Infinity : c.turns - 1}))};
}

function controlBeforeMoveRisk(b: Battle, mon: Mon, foe: View, move: Skill): number {
  const ownPriority = priority(mon, foe, move);
  const earlier = observedMoves(b, foe).filter(skill => {
    const enemyPriority = priority(foe, mon, skill);
    return enemyPriority > ownPriority || enemyPriority === ownPriority && stat(foe, 'spe') >= stat(mon, 'spe');
  });
  return observedControlRisk(b, mon, {...foe, observedMoves: earlier}, '');
}

/** One following attack opportunity, in percentages of full combatant HP. */
function nextExchange(b: Battle, mon: Mon, foe: View, controlRisk = 0, suppressedReply = 0): {value: number; hp: number} {
  if (mon.hp <= 0 || foe.hp <= 0) return {value: 0, hp: Math.max(0, mon.hp)};
  const incoming = threat(b, mon, foe) * (1 - suppressedReply);
  const options = mon.skills.filter(id => mon.pp[id] > 0).map(id => {
    const skill = b.skill(id), raw = damage(b, mon, foe, skill), hit = hitChance(mon, foe, skill);
    const available = controlled(mon) ? 0 : 1 - Math.max(controlRisk, controlBeforeMoveRisk(b, mon, foe, skill) * (1 - suppressedReply));
    const before = actsBeforeThreat(b, mon, foe, skill);
    const canAct = before || mon.hp > incoming;
    const dealt = canAct ? Math.min(foe.hp, raw * hit) * available : 0;
    const preventsReply = canAct && before && raw >= foe.hp && hit >= .7;
    const taken = incoming * (preventsReply ? 1 - hit * available : 1);
    return {value: dealt / foe.maxHp * 100 - hpCost(mon, taken), hp: Math.max(0, mon.hp - taken)};
  });
  return options.sort((a, z) => z.value - a.value)[0] ?? {value: -hpCost(mon, incoming), hp: Math.max(0, mon.hp - incoming)};
}

function lostSwitchInvestment(b: Battle, mon: Mon, foe: View, incoming: number): number {
  const reset = {...mon, stages: Object.fromEntries(Object.keys(mon.stages).map(key => [key, 0])) as Mon['stages'], conditions: mon.conditions.filter(c => c.def.removed_on_switch === false)};
  const positive = Object.fromEntries(Object.entries(mon.stages).filter(([, value]) => value > 0));
  // Value the terminal resource that a survivor would retain, using the same
  // bounded setup/buff weights as ordinary move choice. This includes inherited
  // speed/accuracy, but never charges for persistent beads, traits or gifts.
  let value = utility(b, reset, foe, STRUGGLE_SKILL, {op:'stat_stage',target:'self',stats:positive}, incoming, 0);
  for (const condition of mon.conditions) if (condition.turns > 1 && condition.def.removed_on_switch !== false && condition.def.kind === 'buff') {
    value += utility(b, reset, foe, STRUGGLE_SKILL, {op:'add_condition',target:'self',condition:condition.id}, incoming, 0);
  }
  return Math.max(0, value);
}

/** A voluntary switch must repay its lost action and paid entry over two decisions. */
function switchingNetGain(b: Battle, self: Mon, member: Mon, foe: View, best: ReturnType<typeof bestMove>) {
  const incoming = threat(b, self, foe), skill = b.skill(best.id), before = actsBeforeThreat(b, self, foe, skill);
  const acts = !controlled(self) && (before || self.hp > incoming);
  const actionChance = acts ? 1 - controlBeforeMoveRisk(b, self, foe, skill) : 0;
  const dealt = Math.min(foe.hp, damage(b, self, foe, skill) * hitChance(self, foe, skill)) * actionChance;
  let preventedReply = 0, continuedControl = 0;
  if (before && actionChance > 0) for (const op of skill.effects ?? []) {
    if (!when(op.when, self, foe, skill)) continue;
    const chance = actionChance * hitChance(self, foe, skill) * (op.chance ?? 100) / 100;
    if (op.op === 'status' && effectTarget(op) === 'foe' && !typeBlocked(b, self, foe, skill)) {
      const ids: string[] = Array.isArray(op.status) ? op.status : [op.status];
      const control = ids.filter(id => b.data.conditions.get(id)?.control && canStatus(b, foe, self, id)).length / ids.length;
      preventedReply = Math.max(preventedReply, chance * control);
      // A first-acting control consumes one duration at this turn's end.
      // Carry only its public probability of surviving into the next action.
      const lasting = ids.reduce((sum, id) => {
        const def = b.data.conditions.get(id);
        if (!def?.control || def.hooks.some(h => h.cure_on_attack_hit) || !canStatus(b, foe, self, id)) return sum;
        const turns = op.turns ?? def.default_turns;
        const survives = Array.isArray(turns) ? clamp((turns[1] - Math.max(2, turns[0]) + 1) / (turns[1] - turns[0] + 1)) : turns === undefined || turns > 1 ? 1 : 0;
        return sum + survives;
      }, 0) / ids.length;
      continuedControl = Math.max(continuedControl, chance * lasting);
    }
    if (op.op === 'protect') preventedReply = Math.max(preventedReply, chance);
    if (op.op === 'add_condition' && effectTarget(op) === 'self' && !self.conditions.some(c => c.id === op.condition)) {
      const def = b.data.conditions.get(op.condition);
      if (def) {
        if (def.hooks.some(h => h.on === 'block_move' && !h.script && !h.when)) preventedReply = Math.max(preventedReply, chance);
        const shielded = {...self, conditions: [...self.conditions, {id:def.id,def,turns:typeof op.turns === 'number' ? op.turns : 1,appliedTurn:b.turn + 1}]};
        // Reuse the pure damage model: an attack-only shield must not reduce
        // a publicly observed fixed/percent component of the same threat.
        if (incoming > 0) preventedReply = Math.max(preventedReply, chance * clamp(1 - threat(b, shielded, foe) / incoming));
      }
    }
  }
  const stayIncoming = incoming * (1 - preventedReply);
  let healing = 0;
  if (acts && !hasRule(b, foe, 'block_heal')) for (const op of skill.effects ?? []) {
    if (op.op !== 'heal' || effectTarget(op) !== 'self' || !when(op.when, self, foe, skill)) continue;
    healing += (op.pct_max_hp ? self.maxHp * op.pct_max_hp / 100 * actionChance : op.pct_damage_dealt ? dealt * op.pct_damage_dealt / 100 : (op.amount ?? 0) * actionChance) * (op.chance ?? 100) / 100;
  }
  const hpBeforeHit = before && acts ? Math.min(self.maxHp, self.hp + healing) : self.hp;
  const lostNow = Math.min(stayIncoming, hpBeforeHit), afterHit = Math.max(0, hpBeforeHit - stayIncoming);
  const stayHp = !before && acts && afterHit > 0 ? Math.min(self.maxHp, afterHit + healing) : afterHit;
  const foeAfterStay = {...foe, hp: Math.max(0, foe.hp - dealt)};
  const stays = stayHp > 0;
  // If the lead falls, the same reserve gets a free entry. Its next attack must
  // be included in the stay branch, rather than rewarding a 1-HP preservation.
  const continuation = nextExchange(b, stays ? afterDecisionTurn(self, stayHp) : member, foeAfterStay, 0, continuedControl);
  const actionValue = Math.max(0, best.score - .01) * actionChance, stayHpCost = lostNow / self.maxHp * 100;
  const stay = actionValue - stayHpCost + continuation.value;

  const entryDamage = threat(b, member, foe), afterEntry = afterDecisionTurn(member, Math.max(0, member.hp - entryDamage));
  const entryControl = observedControlRisk(b, member, foe, '');
  const switched = nextExchange(b, afterEntry, foe, entryControl);
  const investment = stays && continuation.hp > 0 ? lostSwitchInvestment(b, self, foe, incoming) : 0;
  const entryHpCost = hpCost(member, entryDamage), switchValue = switched.value - entryHpCost - investment;
  return {net: switchValue - stay, stay, switch: switchValue, actionValue, actionChance, dealt, stayHpCost,
    stayHp, freeReplacement: !stays, continuation: continuation.value, entryHpCost, entryControl,
    switchedContinuation: switched.value, investment, preventedReply, continuedControl};
}

export function tacticalAction(b: Battle, side: Side, ai: AiSpec): Action {
  const self = b.active(side.index), foe = publicOpponent(b, self), best = bestMove(b, self, foe, ai);
  if (ai.allow_switch && self.turnsActive >= 2 && !best.ko) {
    const options = b.legalActions(side.index).filter((a): a is Extract<Action, {kind:'switch'}> => a.kind === 'switch');
    const current = matchup(b, self, foe);
    const candidates = options.map(action => {
      const member = side.team[action.slot], incoming = threat(b, member, foe);
      const afterEntry = {...member, hp: member.hp - incoming};
      const next = bestMove(b, afterEntry, foe, ai);
      const canAct = actsBeforeThreat(b, afterEntry, foe, b.skill(next.id));
      return {action, score: matchup(b, afterEntry, foe), safe: member.hp > incoming * 1.25 && (canAct || afterEntry.hp > incoming * 1.1) && switchingNetGain(b, self, member, foe, best).net > 0};
    }).filter(row => row.safe).sort((a, z) => z.score - a.score);
    // A switch pays a full turn; require a substantial and survivable improvement.
    if (candidates[0] && candidates[0].score > current + 35 && best.score < 70) return candidates[0].action;
  }
  return {kind: 'move', skill: best.id};
}

export function tacticalReplacement(b: Battle, side: Side): Action | undefined {
  const self = b.active(side.index), ai = self.ai ?? side.ai;
  if (ai?.kind !== 'smart' || !ai.allow_switch) return undefined;
  const foe = publicOpponent(b, self);
  // A faint replacement is free and ignores voluntary-switch traps, even when
  // called by queueReplacements before the global phase becomes 'replace'.
  return side.team.filter(mon => !mon.fainted && mon.slot !== side.active)
    .map(mon => {
      const inheritance = ordinaryTrainerDuel(b, mon) && mon.conditions.some(c => c.id === 'seer_eff_59' && c.turns > 0 && c.def.hooks.some(h => h.on === 'on_switch_in' && h.params instanceof Array && h.params[0] === 4 && h.params[1] === 5));
      const critical = ordinaryTrainerDuel(b, mon) && mon.conditions.some(c => c.id === 'seer_eff_71' && (c.data?.pool?.left ?? 0) > 0);
      const projected = inheritance ? projectedInheritance(mon) : mon;
      const bonus = inheritance ? giftBenefit(b, mon, foe, 'inheritance') : critical ? giftBenefit(b, mon, foe, 'critical') : 0;
      return {action: {kind: 'switch' as const, slot: mon.slot}, score: matchup(b, projected, foe) + bonus};
    }).sort((a, z) => z.score - a.score || a.action.slot - z.action.slot)[0]?.action;
}
