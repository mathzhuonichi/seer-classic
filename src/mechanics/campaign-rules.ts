import type {Battle, Mon} from '../../battle/core/src/battle.ts';
import type {Hook, ScriptEntry, ScriptRegistry, Skill, StageKey} from '../../battle/core/src/types.ts';
import {effectiveness} from '../../battle/core/src/typechart.ts';

/** Encounter-only conditions are attached to their member, never the whole side. */
function attach(battle: Battle, mon: Mon, id: string, name: string, hooks: Hook[], params: Record<string, unknown> = {}) {
  const baseId = `campaign_${id}`;
  let conditionId = baseId, suffix = 1;
  while (mon.conditions.some(entry => entry.id === conditionId)) conditionId = `${baseId}_${suffix++}`;
  battle.addCondition(mon, {id: conditionId, name: {zh: name}, kind: 'other', removed_on_switch: false, hooks});
  const condition = mon.conditions.find(entry => entry.id === conditionId);
  if (condition) condition.data = {...params};
}
function scripted(id: string, name: string, points: Hook['on'][], hook: ScriptEntry['hook']): ScriptEntry {
  return {install: (c, p) => attach(c.battle, c.mon, id, name, points.map(on => ({on, script: id})), p), hook};
}

function ramping(skill: Skill): boolean {
  // Recovered effect 9 increases actual power; effects 181/411 grow status
  // probability or percentage damage and do not belong to this skill class.
  return (skill.effects ?? []).some(op => op.op === 'script' && op.id === 'seer_eff_9' && op.params?.[0] > 0 && op.params?.[1] > skill.power);
}
function intrinsicPriority(battle: Battle, user: Mon, foe: Mon, skill: Skill): boolean {
  return (skill.priority ?? 0) > 0 || (skill.effects ?? []).some(op => op.op === 'priority_if' && op.priority > 0 && battle.evalWhen(op.when, {self: user, foe, skill}));
}

export const campaignScripts: ScriptRegistry = {
  only_sure_hit_moves_land: scripted('only_sure_hit_moves_land', '虚无封印', ['on_foe_move'], c => c.targetsHolder && c.skill.accuracy !== null ? 'miss' : undefined),
  status_moves_always_miss: scripted('status_moves_always_miss', '圣洁封印', ['on_foe_move'], c => c.targetsHolder && c.skill.category === 'status' ? 'miss' : undefined),
  status_damage_allowed: {install: (c, p) => {c.mon.persist.allowedStatusDamage = [...(p.statuses ?? [])];}},
  ko_attacker_on_big_hit: scripted('ko_attacker_on_big_hit', '能量封印', ['on_hurt'], c => {
    const {holder, source, info, amount} = c;
    const p = c.cond.data;
    // The documented final blow is valid: retaliation belongs to a surviving
    // defender, and never retroactively invalidates the successful knockout.
    const thresholdReached = p.inclusive ? amount >= p.threshold : amount > p.threshold;
    if (holder.hp <= 0 || !source || source.side === holder.side || info.noReflect || !thresholdReached || p.exclude_categories?.includes(info.skill?.category)) return;
    c.battle.dealDamage(source, source.hp, {kind: 'true', source: holder, ohko: true, noReflect: true});
  }),
  heal_flat_each_turn: scripted('heal_flat_each_turn', '生命封印', ['turn_end'], c => {c.battle.heal(c.holder, c.cond.data.amount);}),
  revive_restores_pp: scripted('revive_restores_pp', '轮回复苏', ['on_revive'], c => {
    for (const id of c.holder.skills) c.holder.pp[id] = c.holder.maxPp[id];
    c.battle.emit({type: 'pp_restored', side: c.holder.side, slot: c.holder.slot, name: c.holder.name, amount: null});
  }),
  // Entry restrictions are enforced by the game adapter before battle creation.
  require_player_species: {install: () => {}},
  priority_add: scripted('priority_add', '先制能力', ['modify_priority'], c => c.priority + (c.cond.data.amount ?? 1)),
  always_moves_first: scripted('always_moves_first', '强制先手', ['modify_priority'], () => Number.MAX_SAFE_INTEGER),
  always_hit: {install: c => attach(c.battle, c.mon, 'always_hit', '必中', [{on: 'modify_accuracy', force_hit: true}])},
  foe_accuracy_penalty: {install: (c, p) => attach(c.battle, c.mon, 'foe_accuracy_penalty', '命中压制', [{on: 'modify_accuracy_taken', multiplier: 1 - (p.pct ?? 0) / 100}])},
  alternating_immunity: scripted('alternating_immunity', '轮转领域', ['on_foe_move'], c => {
    const turn = c.holder.turnsActive;
    const order: string[] = c.cond.data.order ?? ['special', 'physical', 'status'];
    if (!c.targetsHolder || turn < 2 || turn % 2 !== 0 || !order.length) return;
    return c.skill.category === order[(turn / 2 - 1) % order.length] ? 'negate' : undefined;
  }),
  vs_type_use_only: scripted('vs_type_use_only', '属性应战', ['choose_action'], c => {
    if (c.battle.foeOf(c.holder).types.includes(c.cond.data.type)) return {kind: 'move', skill: c.cond.data.skill};
  }),
  copy_foe_boosts: scripted('copy_foe_boosts', '镜影强化', ['turn_start', 'turn_end'], c => {
    const foe = c.battle.foeOf(c.holder) as Mon;
    for (const [key, value] of Object.entries(foe.stages)) if (value > 0 && value > c.holder.stages[key]) c.battle.changeStage(c.holder, key as StageKey, value - c.holder.stages[key], false);
  }),
  // Preserve the recovered trait and honor encounter-specific categories.
  status_on_attacker: scripted('status_on_attacker', '受击异常反击', ['on_hurt'], c => {
    const p = c.cond.data;
    if (!c.source || c.source.side === c.holder.side || c.info.kind !== 'attack' || (p.categories && !p.categories.includes(c.info.skill?.category)) || !c.battle.rng.chance(p.chance ?? 100)) return;
    const turns = p.turns_min !== undefined ? [p.turns_min, p.turns_max ?? p.turns_min] : undefined;
    c.battle.applyStatus(c.source, p.status, {turns, source: c.holder});
  }),
  finish_while_foe_status: {apply: (c: any, p: any) => {
    const ko = c.battle.lastKo;
    return ko?.target.side === 1 && ko.by?.side === 0 && ko.targetStatuses.includes(p.status);
  }},
  campaign_qilin_damage_filter: scripted('campaign_qilin_damage_filter', '麒麟轮回屏障', ['modify_damage_final'], c => {
    const {info, source, holder} = c;
    if (!source || source.side === holder.side) return;
    const mode = c.cond.data.mode;
    const fixed = info.kind === 'fixed' && !info.ohko && (c.cond.data.allowFixed ?? mode !== 'critical');
    const attack = info.kind === 'attack' && !!info.skill;
    const allowed = fixed || (mode === 'critical' && attack && info.crit) ||
      (['priority_or_ramping', 'ramping'].includes(mode) && attack &&
        (ramping(info.skill) || (mode === 'priority_or_ramping' && intrinsicPriority(c.battle, source, holder, info.skill))));
    return allowed ? c.amount : 0;
  }),
  campaign_qilin_low_damage_crit: scripted('campaign_qilin_low_damage_crit', '麒麟怒意', ['on_hurt'], c => {
    if (c.holder.hp <= 0 || !c.source || c.source.side === c.holder.side || c.amount >= c.cond.data.threshold) return;
    c.battle.addCondition(c.holder, {id: 'campaign_qilin_critical_window', name: {zh: '怒意致命'}, kind: 'buff', hooks: [{on: 'modify_crit_rate', force_crit: true}]}, c.cond.data.turns);
  }),
  campaign_qilin_hurt_stage_down: scripted('campaign_qilin_hurt_stage_down', '麒麟能力压制', ['on_hurt'], c => {
    if (c.holder.hp <= 0 || !c.source || c.source.side === c.holder.side || c.amount <= c.cond.data.threshold) return;
    for (const [stat, delta] of Object.entries(c.cond.data.stats ?? {})) c.battle.changeStage(c.source, stat as StageKey, delta as number, true);
  }),
  campaign_counter_type_extra_damage: scripted('campaign_counter_type_extra_damage', '麒麟天敌追击', ['on_hit'], c => {
    const target = c.battle.foeOf(c.holder) as Mon;
    if (target.fainted || c.ctx?.damageDealt <= 0 || c.skill?.category === 'status') return;
    if (target.types.some(type => effectiveness(c.battle.data.types, type, c.holder.types) > 1)) c.battle.dealDamage(target, c.cond.data.amount, {kind: 'fixed', source: c.holder, skill: c.skill});
  }),
};
