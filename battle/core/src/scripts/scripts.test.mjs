// Scripted skill effects run through the real engine with the built-in registry.
import assert from 'node:assert/strict';
import test from 'node:test';
import {Battle} from '../engine/battle.ts';
import {buildDataSet} from '../data.ts';
import {SEER_SCRIPTS} from './index.ts';

const base = {hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100};
const skill = (id, effects) =>
  ({id, name: {zh: `skill ${id}`}, type: 'normal', category: 'status', power: 0, accuracy: null, pp: 20, priority: 0, target: 'foe', effects});
const SYNC = 1, BOOST = 2;
const data = () => buildDataSet({types: {chart: {normal: {normal: 1}}}, skills: [
  skill(SYNC, [{op: 'script', id: 'seer_eff_91', params: [5]}]),
  skill(BOOST, [{op: 'stat_stage', target: 'self', stats: {atk: 1}}]),
], species: [{id: 1, name: {zh: 'fixture'}, types: ['normal'], base}]});
const member = () => ({species: 1, level: 50, skills: [SYNC, BOOST], stats: {...base, hp: 300}});
const duel = () => new Battle({data: data(), seed: 5, scripts: SEER_SCRIPTS, sides: [{kind: 'player', team: [member()]}, {kind: 'player', team: [member()]}]});
const turn = (battle, a, b) => {
  battle.submit(0, {kind: 'move', skill: a});
  battle.submit(1, {kind: 'move', skill: b});
  return battle.resolveTurn();
};

test('同步 (seer_eff_91) mirrors a stage change once, even when both actives carry it', () => {
  const battle = duel();
  turn(battle, SYNC, SYNC);
  assert(battle.active(0).conditions.some(c => c.id === 'seer_eff_91'), 'side 0 carries 同步');
  assert(battle.active(1).conditions.some(c => c.id === 'seer_eff_91'), 'side 1 carries 同步');
  const events = turn(battle, BOOST, SYNC);
  assert.equal(battle.active(0).stages.atk, 1, 'the user keeps its own boost');
  assert.equal(battle.active(1).stages.atk, 1, 'the foe receives the mirrored boost once');
  assert.equal(events.filter(e => e.type === 'stat_stage').length, 2, 'the mirrored change is not mirrored back');
});

// 闪避类护盾 (RULES.md 4): the physical and special shields (78, 106) do not stop 必中 moves; 圣洁 (86) still does.
const PHYS_95 = 11, PHYS_SURE = 12, PHYS_100 = 13, SPEC_95 = 14, SPEC_SURE = 15, STATUS_SURE = 16;
const attack = (id, category, accuracy) => ({...skill(id, []), category, power: 40, accuracy});
const shieldData = () => buildDataSet({types: {chart: {normal: {normal: 1}}}, skills: [
  attack(PHYS_95, 'physical', 95), attack(PHYS_SURE, 'physical', null), attack(PHYS_100, 'physical', 100),
  attack(SPEC_95, 'special', 95), attack(SPEC_SURE, 'special', null),
  skill(STATUS_SURE, [{op: 'stat_stage', target: 'foe', stats: {atk: -1}}]),
], conditions: [{id: 'cond_sure_hit', name: {zh: '攻击必定命中'}, kind: 'buff', hooks: [{on: 'modify_accuracy', force_hit: true}]}],
species: [{id: 1, name: {zh: 'fixture'}, types: ['normal'], base}]});
/** A battle whose side 1 carries shield `script`; `use(id)` is side 0's move (one of `ids`) and returns its events. */
const shielded = (script, ids) => {
  const one = () => ({species: 1, level: 50, skills: ids, stats: {...base, hp: 300}});
  const battle = new Battle({data: shieldData(), seed: 5, scripts: SEER_SCRIPTS, sides: [{kind: 'player', team: [one()]}, {kind: 'player', team: [one()]}]});
  const [user, holder] = [battle.active(0), battle.active(1)];
  battle.callScript(script, {user: holder, foe: user}, [3]);
  assert(holder.conditions.some(c => c.id === script), `side 1 carries ${script}`);
  const use = (id) => {
    const mark = battle.out.length;
    battle.useMove(user, holder, battle.data.skills.get(id), true);
    return battle.out.slice(mark);
  };
  return {battle, user, holder, use};
};
const missed = (events) => events.some(e => e.type === 'miss') && !events.some(e => e.type === 'damage');
const damaged = (events) => !events.some(e => e.type === 'miss') && events.some(e => e.type === 'damage' && e.side === 1 && e.amount > 0);

test('物理闪避 (seer_eff_78) evades a physical attack, but not a 必中 one', () => {
  const {use} = shielded('seer_eff_78', [PHYS_95, PHYS_SURE]);
  assert(missed(use(PHYS_95)), 'accuracy 95 is evaded');
  assert(damaged(use(PHYS_SURE)), 'accuracy null lands');
});

test('a force-hit accuracy hook (cond_sure_hit) makes an attack 必中 against 物理闪避', () => {
  const {battle, user, use} = shielded('seer_eff_78', [PHYS_95]);
  battle.addCondition(user, battle.data.conditions.get('cond_sure_hit'));
  assert(damaged(use(PHYS_95)), 'accuracy 95 lands under a force-hit hook');
});

test('特殊闪避 (seer_eff_106) evades a special attack unless 必中, and leaves physical attacks alone', () => {
  const {use} = shielded('seer_eff_106', [SPEC_SURE, SPEC_95, PHYS_100]);
  assert(damaged(use(SPEC_SURE)), 'a 必中 special attack lands');
  assert(missed(use(SPEC_95)), 'accuracy 95 is evaded');
  assert(damaged(use(PHYS_100)), 'a physical attack is not evaded');
});

test('圣洁 (seer_eff_86) still makes a 必中 status move miss', () => {
  const {holder, use} = shielded('seer_eff_86', [STATUS_SURE]);
  assert(use(STATUS_SURE).some(e => e.type === 'miss'), 'the status move misses');
  assert.equal(holder.stages.atk, 0, 'its effect does not apply');
});
