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
