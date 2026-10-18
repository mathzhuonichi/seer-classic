import type {Battle, Hook, Mon, ScriptRegistry, Skill, StageKey} from '../../../battle/core/src/index.ts';
import {effectiveness} from '../../../battle/core/src/index.ts';
import {ruleScripts, type RuleSpec} from '../../../battle/core/src/scripts/builders.ts';
import {statusOnAttacker} from '../../../battle/core/src/scripts/boss.ts';
import {ALWAYS_FIRST_PRIORITY} from '../../../battle/core/src/constants.ts';
import {raiseStagesTo, ruleCondition, scriptHooks, type StageMap} from '../../../battle/core/src/scripts/util.ts';

/** Encounter-only conditions are attached to their member, never the whole side; a repeated rule gets its own condition. */
function attach(battle: Battle, mon: Mon, id: string, name: string, hooks: Hook[], params: Record<string, unknown> = {}) {
  const baseId = `campaign_${id}`;
  let conditionId = baseId, suffix = 1;
  while (mon.conditions.some(entry => entry.id === conditionId)) conditionId = `${baseId}_${suffix++}`;
  ruleCondition(battle, mon, conditionId, name, hooks, params);
}

function ramping(skill: Skill): boolean {
  // Recovered effect 9 increases actual power; effects 181/411 grow status
  // probability or percentage damage and do not belong to this skill class.
  return (skill.effects ?? []).some(op => op.op === 'script' && op.id === 'seer_eff_9' && op.params?.[0] > 0 && op.params?.[1] > skill.power);
}
function intrinsicPriority(battle: Battle, user: Mon, foe: Mon, skill: Skill): boolean {
  return (skill.priority ?? 0) > 0 ||
    (skill.effects ?? []).some(op => op.op === 'priority_if' && op.priority > 0 && battle.evalWhen(op.when, {self: user, foe, skill}));
}
const positive = (stages: StageMap): StageMap => Object.fromEntries(Object.entries(stages).filter(([, value]) => value! > 0));

/** Rules whose condition (named `name`, params as its state) reacts through a script hook. */
const SCRIPTED: Record<string, RuleSpec & {name: string}> = {
  only_sure_hit_moves_land: {name: '虚无封印', on: ['on_foe_move'], hook: c => c.targetsHolder && c.skill.accuracy !== null ? 'miss' : undefined},
  status_moves_always_miss: {name: '圣洁封印', on: ['on_foe_move'], hook: c => c.targetsHolder && c.skill.category === 'status' ? 'miss' : undefined},
  ko_attacker_on_big_hit: {name: '能量封印', on: ['on_hurt'], hook: c => {
    const {holder, source, info, amount} = c;
    const p = c.cond.data;
    // The documented final blow is valid: retaliation belongs to a surviving
    // defender, and never retroactively invalidates the successful knockout.
    const thresholdReached = p.inclusive ? amount >= p.threshold : amount > p.threshold;
    if (holder.hp <= 0 || !source || source.side === holder.side || info.noReflect || !thresholdReached) return;
    if (p.exclude_categories?.includes(info.skill?.category)) return;
    c.battle.dealDamage(source, source.hp, {kind: 'true', source: holder, ohko: true, noReflect: true});
  }},
  heal_flat_each_turn: {name: '生命封印', on: ['turn_end'], hook: c => {c.battle.heal(c.holder, c.cond.data.amount);}},
  revive_restores_pp: {name: '轮回复苏', on: ['on_revive'], hook: c => {
    for (const id of c.holder.skills) c.holder.pp[id] = c.holder.maxPp[id];
    c.battle.emit({type: 'pp_restored', side: c.holder.side, slot: c.holder.slot, name: c.holder.name, amount: null});
  }},
  priority_add: {name: '先制能力', on: ['modify_priority'], hook: c => c.priority + (c.cond.data.amount ?? 1)},
  always_moves_first: {name: '强制先手', on: ['modify_priority'], hook: () => ALWAYS_FIRST_PRIORITY},
  alternating_immunity: {name: '轮转领域', on: ['on_foe_move'], hook: c => {
    const turn = c.holder.turnsActive;
    const order: string[] = c.cond.data.order ?? ['special', 'physical', 'status'];
    if (!c.targetsHolder || turn < 2 || turn % 2 !== 0 || !order.length) return;
    return c.skill.category === order[(turn / 2 - 1) % order.length] ? 'negate' : undefined;
  }},
  vs_type_use_only: {name: '属性应战', on: ['choose_action'], hook: c => {
    if (c.battle.foeOf(c.holder).types.includes(c.cond.data.type)) return {kind: 'move', skill: c.cond.data.skill};
  }},
  copy_foe_boosts: {name: '镜影强化', on: ['turn_start', 'turn_end'], hook: c => raiseStagesTo(c.battle, c.holder, positive(c.battle.foeOf(c.holder).stages))},
  // The engine's hook, honoring encounter-specific categories; each repeated rule keeps its own condition.
  status_on_attacker: {name: '受击异常反击', on: ['on_hurt'], hook: statusOnAttacker},
  campaign_qilin_damage_filter: {name: '麒麟轮回屏障', on: ['modify_damage_final'], hook: c => {
    const {info, source, holder} = c;
    if (!source || source.side === holder.side) return;
    const mode = c.cond.data.mode;
    const fixed = info.kind === 'fixed' && !info.ohko && (c.cond.data.allowFixed ?? mode !== 'critical');
    const attack = info.kind === 'attack' && !!info.skill;
    const allowed = fixed || (mode === 'critical' && attack && info.crit) ||
      (['priority_or_ramping', 'ramping'].includes(mode) && attack &&
        (ramping(info.skill) || (mode === 'priority_or_ramping' && intrinsicPriority(c.battle, source, holder, info.skill))));
    return allowed ? c.amount : 0;
  }},
  campaign_qilin_low_damage_crit: {name: '麒麟怒意', on: ['on_hurt'], hook: c => {
    if (c.holder.hp <= 0 || !c.source || c.source.side === c.holder.side || c.amount >= c.cond.data.threshold) return;
    const hooks: Hook[] = [{on: 'modify_crit_rate', force_crit: true}];
    c.battle.addCondition(c.holder, {id: 'campaign_qilin_critical_window', name: {zh: '怒意致命'}, kind: 'buff', hooks}, c.cond.data.turns);
  }},
  campaign_qilin_hurt_stage_down: {name: '麒麟能力压制', on: ['on_hurt'], hook: c => {
    if (c.holder.hp <= 0 || !c.source || c.source.side === c.holder.side || c.amount <= c.cond.data.threshold) return;
    for (const [stat, delta] of Object.entries(c.cond.data.stats ?? {})) c.battle.changeStage(c.source, stat as StageKey, delta as number, true);
  }},
  campaign_counter_type_extra_damage: {name: '麒麟天敌追击', on: ['on_hit'], hook: c => {
    const target = c.battle.foeOf(c.holder) as Mon;
    if (target.fainted || c.ctx?.damageDealt <= 0 || c.skill?.category === 'status') return;
    if (!target.types.some(type => effectiveness(c.battle.data.types, type, c.holder.types) > 1)) return;
    c.battle.dealDamage(target, c.cond.data.amount, {kind: 'fixed', source: c.holder, skill: c.skill});
  }},
};

export const campaignScripts: ScriptRegistry = {
  ...ruleScripts(SCRIPTED, (c, p, id, rule) => attach(c.battle, c.mon, id, rule.name, scriptHooks(rule.on, id), p)),
  status_damage_allowed: {install: (c, p) => {c.mon.persist.allowedStatusDamage = [...(p.statuses ?? [])];}},
  // Entry restrictions are enforced by the game adapter before battle creation.
  require_player_species: {install: () => {}},
  always_hit: {install: c => attach(c.battle, c.mon, 'always_hit', '必中', [{on: 'modify_accuracy', force_hit: true}])},
  foe_accuracy_penalty: {install: (c, p) =>
    attach(c.battle, c.mon, 'foe_accuracy_penalty', '命中压制', [{on: 'modify_accuracy_taken', multiplier: 1 - (p.pct ?? 0) / 100}])},
  finish_while_foe_status: {apply: (c: any, p: any) => {
    const ko = c.battle.lastKo;
    return ko?.target.side === 1 && ko.by?.side === 0 && ko.targetStatuses.includes(p.status);
  }},
};
