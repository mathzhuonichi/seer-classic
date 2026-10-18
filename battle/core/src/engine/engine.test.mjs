// Engine seams: the injected policy and the read-only damage probe.
import assert from 'node:assert/strict';
import test from 'node:test';
import {Battle} from './battle.ts';
import {buildDataSet} from '../data.ts';
import {MEAN_ROLL} from '../constants.ts';

const base = {hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100};
const attack = id => ({id, name: {zh: `skill ${id}`}, type: 'normal', category: 'physical', power: 40, accuracy: null, pp: 20, priority: 0});
const data = () => buildDataSet({types: {chart: {normal: {normal: 1}}}, skills: [attack(1), attack(2)],
  species: [{id: 1, name: {zh: 'fixture'}, types: ['normal'], base}]});
const member = (skills = [1, 2]) => ({species: 1, level: 50, skills, stats: {...base, hp: 300}});
const options = extra => ({data: data(), seed: 3, sides: [{kind: 'player', team: [member()]}, {kind: 'boss', team: [member(), member()]}], ...extra});

test('automatic sides are decided by the injected policy', () => {
  const calls = [];
  const policy = {
    chooseAction: (battle, side) => { calls.push(['action', battle.turn, side.index]); return {kind: 'move', skill: 2}; },
    chooseReplacement: (_battle, side) => { calls.push(['replacement', side.index]); return {kind: 'switch', slot: 1}; },
  };
  const battle = new Battle(options({policy}));
  battle.submit(0, {kind: 'move', skill: 1});
  const events = battle.resolveTurn();
  assert.deepEqual(calls, [['action', 0, 1]]);
  assert(events.some(e => e.type === 'move_used' && e.side === 1 && e.skill === 2));
  battle.dealDamage(battle.active(1), 1000, {kind: 'true'});
  battle.submit(0, {kind: 'move', skill: 1});
  battle.resolveTurn();
  assert.deepEqual(calls.slice(1), [['action', 1, 1], ['replacement', 1]]);
  assert.equal(battle.sides[1].active, 1);
});

test('a battle without a policy runs player decisions and refuses an automatic side at construction', () => {
  const battle = new Battle(options({sides: [{kind: 'player', team: [member()]}, {kind: 'player', team: [member()]}]}));
  battle.submit(0, {kind: 'move', skill: 1});
  battle.submit(1, {kind: 'move', skill: 2});
  assert.equal(battle.resolveTurn().filter(e => e.type === 'move_used').length, 2);
  assert.throws(() => new Battle(options()), /needs a policy/);
});

/** Decides every automatic side with the second skill and never picks a replacement. */
const fixed = {chooseAction: () => ({kind: 'move', skill: 2}), chooseReplacement: () => undefined};

test('the AI estimate is the damage probe at the mean roll, and both are read-only', () => {
  const battle = new Battle(options({policy: fixed}));
  battle.addCondition(battle.active(1), {id: 'guard', hooks: [{on: 'modify_damage_taken', multiplier: 0.5, consume_charge: true}]}, undefined, undefined, 1);
  const before = JSON.stringify({rng: battle.rng.s, draws: battle.rng.draws, conditions: battle.active(1).conditions, out: battle.turnEvents});
  const skill = battle.skill(1), probe = battle.probeDamage(battle.active(0), battle.active(1), skill, {roll: MEAN_ROLL, crit: false});
  assert.equal(battle.estimateDamage(battle.active(0), battle.active(1), skill), probe);
  assert.equal(probe, Math.floor(battle.calcAttack(battle.active(0), battle.active(1), skill, {}, {estimate: true}).damage * 0.5));
  assert.equal(JSON.stringify({rng: battle.rng.s, draws: battle.rng.draws, conditions: battle.active(1).conditions, out: battle.turnEvents}), before);
});
