import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createBattle} from './_battle.ts';
import {buildDataSet} from '../../battle/core/src/data.ts';
import {SEER_SCRIPTS} from '../../battle/core/src/scripts/index.ts';
import type {BossEncounter, BossRule, MonsterInput, Objective, Phase, Skill} from '../../battle/core/src/types.ts';
import {campaignScripts} from '../../src/domain/challenges/campaign-rules.ts';
import {loadCatalogNode} from '../catalog.mjs';

const stats = {hp: 2000, atk: 100, def: 100, spa: 100, spd: 100, spe: 200};
const skills: Skill[] = [
  {id: 1, name: {zh: 'Ordinary'}, type: 'normal', category: 'physical', power: 100, accuracy: 100, pp: 20, crit_rate: 0},
  {id: 2, name: {zh: 'Sure hit'}, type: 'normal', category: 'physical', power: 100, accuracy: null, pp: 20, crit_rate: 0},
  {id: 3, name: {zh: 'Boost'}, type: 'normal', category: 'status', power: 0, accuracy: 100, pp: 20, target: 'self', effects: [{op: 'stat_stage', target: 'self', stats: {atk: 1}}]},
  {id: 4, name: {zh: 'Sure boost'}, type: 'normal', category: 'status', power: 0, accuracy: null, pp: 20, target: 'self', effects: [{op: 'stat_stage', target: 'self', stats: {atk: 1}}]},
  {id: 5, name: {zh: 'Paralyse'}, type: 'normal', category: 'status', power: 0, accuracy: null, pp: 20, effects: [{op: 'status', status: 'paralysis', turns: 10}]},
  {id: 6, name: {zh: 'Fixed'}, type: 'normal', category: 'status', power: 0, accuracy: null, pp: 20, effects: [{op: 'fixed_damage', amount: 600}]},
  {id: 7, name: {zh: 'Wait'}, type: 'normal', category: 'status', power: 0, accuracy: null, pp: 20, target: 'self'},
  {id: 8, name: {zh: 'Priority'}, type: 'normal', category: 'physical', power: 100, accuracy: null, pp: 20, priority: 1, crit_rate: 0},
  {id: 9, name: {zh: 'Ramping'}, type: 'normal', category: 'physical', power: 100, accuracy: null, pp: 20, crit_rate: 0, effects: [{op: 'script', id: 'seer_eff_9', params: [20, 180]}]},
  {id: 10, name: {zh: 'Critical'}, type: 'normal', category: 'physical', power: 100, accuracy: null, pp: 20, crit_rate: 16},
  {id: 11, name: {zh: 'Heal'}, type: 'normal', category: 'status', power: 0, accuracy: null, pp: 20, target: 'self', effects: [{op: 'heal', amount: 200}]},
  {id: 13, name: {zh: 'Finish'}, type: 'normal', category: 'physical', power: 0, accuracy: null, pp: 20, effects: [{op: 'fixed_damage', amount: 5000}]},
  {id: 16, name: {zh: 'Zero accuracy'}, type: 'normal', category: 'physical', power: 100, accuracy: 0, pp: 20, crit_rate: 0},
  {id: 17, name: {zh: 'Special'}, type: 'normal', category: 'special', power: 100, accuracy: null, pp: 20, crit_rate: 0},
];
const script = (id: string, params = {}): BossRule => ({rule: 'script', id, params});
function fixture(options: {rules?: BossRule[]; memberRules?: BossRule[]; phases?: Phase[]; members?: MonsterInput[]; win?: Objective[]; playerSkills?: number[]; bossSkills?: number[]; hp?: number} = {}) {
  const data = buildDataSet({species: [{id: 1, name: {zh: 'Player'}, types: ['normal'], base: stats}, {id: 2, name: {zh: 'Guardian'}, types: ['normal'], base: stats}], skills, types: {chart: {normal: {normal: 1}}}, items: [{id: 'potion', battle_effects: [{op: 'heal', amount: 200}]}]});
  const encounter: BossEncounter = {id: 'fixture', team: options.members ?? [{species: 2, level: 50, skills: options.bossSkills ?? [7], stats: {...stats, hp: options.hp ?? 2000, spe: 1}, member_rules: options.memberRules ?? [], member_phases: options.phases ?? []}], rules: options.rules ?? [], win: options.win ?? [{kind: 'ko_all'}], ai: {kind: 'sequence', skills: options.bossSkills ?? [7]}};
  const battle = createBattle({data, seed: 17, encounter, scripts: {...SEER_SCRIPTS, ...campaignScripts}, sides: [{kind: 'player', items: {potion: 2}, team: [{species: 1, level: 50, stats, skills: options.playerSkills ?? [2, 3, 4, 13]}]}]});
  return {battle, data, run: (skill: number) => {battle.submit(0, {kind: 'move', skill}); return battle.resolveTurn();}};
}
const passed: string[] = [];

for (const [id, rejected, accepted] of [['only_sure_hit_moves_land', 1, 2], ['status_moves_always_miss', 5, 2]] as const) {
  const f = fixture({memberRules: [script(id)],playerSkills:[rejected,accepted,3,4]});
  assert(f.run(rejected).some(event => event.type === 'miss' && event.side === 0));
  assert(!f.run(3).some(event => event.type === 'miss' && event.side === 0));
  assert(!f.run(4).some(event => event.type === 'miss' && event.side === 0));
  assert.equal(f.battle.active(0).stages.atk, 2);
  assert(!f.run(accepted).some(event => event.type === 'miss' && event.side === 0));
  assert.equal(f.battle.warnings.length, 0);
  passed.push(`${id}: foe-targeting restriction permits self-targeted boosts`);
}

const phases: Phase[] = [{when: {first_turn: true}, once: true, do: [{op: 'stat_stage', target: 'self', stats: {def: 2}}]}];
const local = fixture({members: Array.from({length: 6}, (_, index) => ({species: 2, level: 50, skills: [7], stats: {...stats, hp: 100, spe: 1}, member_rules: index === 0 ? [script('status_moves_always_miss')] : [], member_phases: phases}))});
assert.equal(local.battle.active(1).stages.def, 2);
local.run(13);
assert.equal(local.battle.active(1).slot, 1);
assert.equal(local.battle.active(1).stages.def, 2);
assert(!local.run(4).some(event => event.type === 'miss' && event.side === 0));
assert.equal(local.battle.active(0).stages.atk, 1);
assert.equal(local.battle.active(1).stages.def, 2);
for (let index = 1; index < 6; index++) local.run(13);
assert(local.battle.result?.success);
assert.equal(local.battle.defeated.length, 6);
assert.equal(local.battle.sides[1].team.reduce((count, mon) => count + mon.phasesFired.size, 0), 6);
passed.push('six ordered members: local immunity does not leak; first-turn phases fire once per member');

const carry = fixture({rules: [{rule: 'block_heal'}], members: [{species: 2, level: 50, skills: [7], stats: {...stats, hp: 100, spe: 1}}, {species: 2, level: 50, skills: [7], stats: {...stats, hp: 100, spe: 1}}], playerSkills: [11, 13]});
carry.battle.active(0).hp = 700;
assert(carry.run(11).some(event => event.type === 'heal_blocked'));
carry.battle.submit(0, {kind: 'item', item: 'potion'});
assert(carry.battle.resolveTurn().some(event => event.type === 'heal_blocked'));
carry.battle.applyStatus(carry.battle.active(0), 'paralysis', {turns: 20, fromFoe: false});
// Fixed direct damage avoids the fixture's paralysis roll while checking carry.
carry.battle.dealDamage(carry.battle.active(1), 100, {kind: 'fixed', source: carry.battle.active(0)});
carry.run(13);
assert.equal(carry.battle.active(0).hp, 700);
assert(carry.battle.active(0).conditions.some(condition => condition.id === 'paralysis'));
assert(carry.battle.active(0).pp[11] < carry.battle.active(0).maxPp[11]);
passed.push('continuous chain preserves player HP, PP and status; skill/item healing remains blocked');

for (const lethal of [false, true]) {
  const f = fixture({memberRules: [script('ko_attacker_on_big_hit', {threshold: 500})], hp: lethal ? 600 : 2000});
  f.battle.dealDamage(f.battle.active(1), 600, {kind: 'attack', source: f.battle.active(0), skill: f.data.skills.get(2)});
  assert.equal(f.battle.active(0).fainted, !lethal);
  assert.equal(f.battle.result?.winner, lethal ? 0 : 1);
}
const boundary = fixture({memberRules: [script('ko_attacker_on_big_hit', {threshold: 200, inclusive: true})]});
boundary.battle.dealDamage(boundary.battle.active(1), 200, {kind: 'attack', source: boundary.battle.active(0), skill: boundary.data.skills.get(2)});
assert(boundary.battle.active(0).fainted);
const reflected = fixture({rules: [{rule: 'reflect_damage', pct: 100}], hp: 2000});
reflected.battle.dealDamage(reflected.battle.active(1), 2000, {kind: 'fixed', source: reflected.battle.active(0)});
assert(reflected.battle.sides.every(side => side.team[0].fainted));
assert.equal(reflected.battle.result?.winner, 1);
assert.equal(reflected.battle.result?.defeated.length, 1);
passed.push('energy retaliation threshold and lethal exemption; simultaneous reflection settles both faints once');

const statusWin = fixture({win: [{kind: 'ko_all'}, {kind: 'script', id: 'finish_while_foe_status', params: {status: 'paralysis'}}]});
statusWin.battle.applyStatus(statusWin.battle.active(1), 'paralysis', {turns: 10});
statusWin.run(13);
assert(statusWin.battle.result?.success);
assert.equal(statusWin.battle.active(1).conditions.length, 0);
const statusFail = fixture({win: [{kind: 'script', id: 'finish_while_foe_status', params: {status: 'paralysis'}}]});
statusFail.run(13); assert.equal(statusFail.battle.result?.success, false);
const used = fixture({win: [{kind: 'ko_all'}, {kind: 'use_skill', skill: 4}]});
used.run(4); used.run(13); assert(used.battle.result?.success);
const unused = fixture({win: [{kind: 'used_skill', skill: 4}]});
unused.run(13); assert.equal(unused.battle.result?.success, false);
passed.push('reward predicates use lethal status snapshot and required used skill, with negative controls');

const revived = fixture({memberRules: [script('revive_restores_pp')], phases: [{when: {on_faint: true}, do: [{op: 'revive'}, {op: 'stat_stage', target: 'self', stats: {atk: 6}}]}]});
revived.battle.active(1).pp[7] = 0;
revived.run(13);
assert.equal(revived.battle.active(1).pp[7], revived.battle.active(1).maxPp[7]);
assert.equal(revived.battle.active(1).stages.atk, 6);
assert.equal(revived.battle.result, null);
revived.run(13); assert(revived.battle.result?.success);
passed.push('phase resurrection restores PP and applies final-body boost once');

const first = fixture({memberRules: [script('always_moves_first')], bossSkills: [2], playerSkills: [8]});
assert.equal(first.run(8).find(event => event.type === 'move_used')?.side, 1);
const accurate = fixture({memberRules: [script('always_hit')], bossSkills: [16], playerSkills: [7]});
assert(accurate.run(7).some(event => event.type === 'damage' && event.side === 0 && event.amount > 0));
const penalty = fixture({memberRules: [script('foe_accuracy_penalty', {pct: 100})], playerSkills: [1, 2]});
assert(penalty.run(1).some(event => event.type === 'miss' && event.side === 0));
assert(!penalty.run(2).some(event => event.type === 'miss' && event.side === 0));
const copied = fixture({memberRules: [script('copy_foe_boosts')]});
copied.battle.active(0).stages.atk = 2; copied.run(4); assert.equal(copied.battle.active(1).stages.atk, 3);
const regen = fixture({memberRules: [script('heal_flat_each_turn', {amount: 200})]});
regen.battle.active(1).hp = 500;
assert(regen.run(2).some(event => event.type === 'heal' && event.side === 1 && event.amount === 200));
const permittedDot = fixture({memberRules: [{rule: 'damage_only_from', types: ['light']}, script('status_damage_allowed', {statuses: ['poison']})]});
assert.equal(permittedDot.battle.dealDamage(permittedDot.battle.active(1), 25, {kind: 'percent', source: permittedDot.battle.active(0), skill: permittedDot.data.skills.get(1)}), 0);
assert.equal(permittedDot.battle.dealDamage(permittedDot.battle.active(1), 25, {kind: 'percent', source: permittedDot.battle.active(0), skill: permittedDot.data.skills.get(1), status: 'poison'}), 25);
passed.push('forced priority, sure hit, accuracy penalty, boost copy, flat regeneration and allowed status damage');
const categoryReaction = fixture({memberRules: [script('status_on_attacker', {status: 'paralysis', chance: 100, categories: ['physical']}), script('status_on_attacker', {status: 'fear', chance: 100, categories: ['physical']})]});
categoryReaction.battle.dealDamage(categoryReaction.battle.active(1), 10, {kind: 'attack', source: categoryReaction.battle.active(0), skill: {...categoryReaction.data.skills.get(2)!, category: 'special'}});
assert.equal(categoryReaction.battle.active(0).conditions.length, 0);
categoryReaction.battle.dealDamage(categoryReaction.battle.active(1), 10, {kind: 'attack', source: categoryReaction.battle.active(0), skill: categoryReaction.data.skills.get(2)});
assert(categoryReaction.battle.active(0).conditions.some(condition => condition.id === 'paralysis'));
assert(categoryReaction.battle.active(0).conditions.some(condition => condition.id === 'fear'));
passed.push('physical-only retaliation honors categories and preserves multiple simultaneous status rules');
const alternating = fixture({memberRules: [script('alternating_immunity', {on: 'even_turns', order: ['special', 'physical', 'status']})], playerSkills: [2, 5, 7, 17]});
assert(alternating.run(17).some(event => event.type === 'damage' && event.side === 1 && event.amount > 0));
assert(alternating.run(17).some(event => event.type === 'move_failed' && event.side === 0));
alternating.run(2);
assert(alternating.run(2).some(event => event.type === 'move_failed' && event.side === 0));
alternating.run(7);
assert(alternating.run(5).some(event => event.type === 'move_failed' && event.side === 0));
assert(!alternating.battle.active(1).conditions.some(condition => condition.id === 'paralysis'));
const typeForced = fixture({memberRules: [script('vs_type_use_only', {type: 'light', skill: 2})], bossSkills: [7, 2], playerSkills: [7]});
typeForced.battle.active(0).types = ['light'];
assert.equal(typeForced.run(7).find(event => event.type === 'move_used' && event.side === 1)?.skill, 2);
typeForced.battle.active(0).types = ['normal'];
assert.equal(typeForced.run(7).find(event => event.type === 'move_used' && event.side === 1)?.skill, 7);
passed.push('member-turn immunity cycle and type-dependent legal AI move forcing');

for (const mode of ['fixed', 'critical', 'priority_or_ramping', 'ramping']) {
  for (const skillId of [2, 8, 9, 10]) {
    const f = fixture({memberRules: [script('campaign_qilin_damage_filter', {mode})], playerSkills: [skillId]});
    const events = f.run(skillId);
    const hit = events.find(event => event.type === 'damage' && event.side === 1);
    const expected = mode === 'critical' ? skillId === 10 : mode === 'priority_or_ramping' ? [8, 9].includes(skillId) : mode === 'ramping' ? skillId === 9 : false;
    assert.equal((hit?.amount ?? 0) > 0, expected, `${mode} / ${skillId}`);
    if (!f.battle.result) assert.equal(f.battle.dealDamage(f.battle.active(1), 30, {kind: 'fixed', source: f.battle.active(0)}), mode === 'critical' ? 0 : 30);
  }
}
passed.push('Qilin damage categories distinguish critical, intrinsic priority, actual power growth and fixed damage');
const lawfulTrait = fixture({memberRules: [script('campaign_qilin_damage_filter', {mode: 'fixed'})]});
lawfulTrait.battle.dealDamage(lawfulTrait.battle.active(1), lawfulTrait.battle.active(1).hp, {kind: 'true', ohko: true, source: lawfulTrait.battle.active(0)});
assert(lawfulTrait.battle.result?.success);
const avatar = fixture({members: [{species: 2, types: ['fighting'], level: 50, skills: [2], stats: {...stats, spe: 1}, member_rules: [script('campaign_counter_type_extra_damage', {amount: 200})]}], bossSkills: [2], playerSkills: [7]});
assert.deepEqual(avatar.battle.active(1).types, ['fighting']);
assert.deepEqual(avatar.battle.initialEvents.find(event => event.type === 'switch_in' && event.side === 1)?.types, ['fighting']);
assert.deepEqual(avatar.data.species.get(2)?.types, ['normal']);
avatar.data.types.chart.normal.fighting = 2;
assert(avatar.run(7).some(event => event.type === 'damage' && event.side === 0 && event.kind === 'fixed' && event.amount === 200));
passed.push('member type override leaves catalog intact; counter-type extra damage and lawful instant-kill trait');

const temporary = fixture({memberRules: [script('campaign_qilin_low_damage_crit', {threshold: 1000, turns: 2})], bossSkills: [2], playerSkills: [7]});
temporary.battle.dealDamage(temporary.battle.active(1), 10, {kind: 'fixed', source: temporary.battle.active(0)});
for (let turn = 0; turn < 2; turn++) assert(temporary.run(7).some(event => event.type === 'damage' && event.side === 0 && event.crit));
assert(!temporary.battle.active(1).conditions.some(condition => condition.id === 'campaign_qilin_critical_window'));
const downAlive = fixture({hp: 5000, memberRules: [script('campaign_qilin_hurt_stage_down', {threshold: 1000, stats: {atk: -1, spe: -1}})]});
downAlive.battle.dealDamage(downAlive.battle.active(1), 1000, {kind: 'fixed', source: downAlive.battle.active(0)});
assert.equal(downAlive.battle.active(0).stages.atk, 0);
downAlive.battle.dealDamage(downAlive.battle.active(1), 1001, {kind: 'fixed', source: downAlive.battle.active(0)});
assert.equal(downAlive.battle.active(0).stages.atk, -1); assert.equal(downAlive.battle.active(0).stages.spe, -1);
passed.push('calibrated low-damage critical window expires; high-damage stage penalty uses strict threshold');

const catalog = buildDataSet(loadCatalogNode());
const bossDirectory = new URL('../../data/bosses/', import.meta.url);
const newEncounters = readdirSync(bossDirectory).filter(name => name.startsWith('boss_campaign_') && name.endsWith('.json'));
for (const filename of newEncounters) {
  const encounter = JSON.parse(readFileSync(new URL(filename, bossDirectory), 'utf8')) as BossEncounter;
  const battle = createBattle({data: catalog, seed: 17, scripts: {...SEER_SCRIPTS, ...campaignScripts}, encounter, sides: [{kind: 'player', team: [{species: 70, level: 100, skills: [10170]}]}]});
  assert.deepEqual(battle.warnings, [], filename);
  assert.equal(battle.sides[1].team.length, encounter.team.length);
}
assert.equal(newEncounters.length, 17);
passed.push('all 17 authored campaign encounters initialize without missing rule-script warnings');

console.log(JSON.stringify({passed, historicalCalibration: ['Qilin low-damage threshold is supplied by encounter data; exact historical value remains unverified.', 'Ramping skill-class eligibility starts on its first use; the historical first-hit boundary remains unverified.']}, null, 2));
