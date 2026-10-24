// Wild monsters that flee (battle/RULES.md 9.1): the flee is the monster's action, from its species' `wild_flee`.
import assert from 'node:assert/strict';
import test from 'node:test';
import {Battle} from './battle.ts';
import {buildDataSet} from '../data.ts';

const FROM_TURN = 3, FLEEING = 1, PLAIN = 2;
const base = {hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100};
const skill = (id, extra) => ({id, name: {zh: `skill ${id}`}, type: 'normal', category: 'physical', power: 10, accuracy: null, pp: 20, priority: 0, ...extra});
const SLEEP = 2, SPLASH = 3;
const data = () => buildDataSet({
  types: {chart: {normal: {normal: 1}}},
  skills: [skill(1), skill(SLEEP, {category: 'status', power: 0, effects: [{op: 'status', target: 'foe', status: 'sleep', turns: FROM_TURN}]}),
    skill(SPLASH, {category: 'status', power: 0, target: 'self', effects: []})],
  species: [{id: FLEEING, name: {zh: 'fleeing'}, types: ['normal'], base, wild_flee: {from_turn: FROM_TURN}},
    {id: PLAIN, name: {zh: 'plain'}, types: ['normal'], base}],
});
/** The player outspeeds the foe, so its move comes first in every turn. */
const player = {species: PLAIN, level: 50, skills: [1, SLEEP, SPLASH], stats: {...base, hp: 300, spe: 300}};
const foe = {species: FLEEING, level: 50, skills: [1], stats: {...base, hp: 3000}};
const policy = {chooseAction: () => ({kind: 'move', skill: 1}), chooseReplacement: () => undefined};
const battle = (kind = 'wild') => new Battle({data: data(), seed: 7, policy, sides: [{kind: 'player', team: [player]}, {kind, team: [foe]}]});
/** Plays the player's `moves`, one a turn, until the battle ends; returns each turn's events. */
const play = (b, moves) => {
  const turns = [];
  for (const move of moves) {
    if (b.result) break;
    b.submit(0, {kind: 'move', skill: move});
    turns.push(b.resolveTurn());
  }
  return turns;
};
const has = (events, type, side) => events.some(e => e.type === type && (side === undefined || e.side === side));

test('a wild monster flees at its action in its species\' from_turn, with no winner and no reward', () => {
  const b = battle(), turns = play(b, Array(FROM_TURN + 2).fill(1));
  assert.equal(turns.length, FROM_TURN, 'the flee ends the battle in its from_turn');
  for (const events of turns.slice(0, -1)) assert.ok(has(events, 'move_used', 1) && !has(events, 'wild_fled'), 'before it, the foe uses its move');
  const last = turns.at(-1), fled = last.findIndex(e => e.type === 'wild_fled');
  assert.deepEqual(last[fled], {type: 'wild_fled', side: 1, slot: 0, name: 'fleeing'});
  assert.ok(last.findIndex(e => e.type === 'move_used' && e.side === 0) < fled, 'the faster player still moved first');
  assert.ok(!has(last, 'move_used', 1) && !has(last, 'turn_end'), 'the flee takes the place of its move and ends the turn');
  assert.deepEqual(b.result, {winner: null, reason: 'wild_fled', success: false, objectives: undefined, defeated: [], turns: FROM_TURN});
  assert.equal(b.active(1).pp[1], 20 - (FROM_TURN - 1), 'the move it chose in the flee turn spends no PP');
  assert.deepEqual(b.legalActions(0), [], 'an ended battle takes no action');
});

test('the flee waits while the monster cannot act, and the turns it could not act count', () => {
  const b = battle(), turns = play(b, [SLEEP, SPLASH, SPLASH, SPLASH, SPLASH, SPLASH, SPLASH]);
  const asleep = turns.map(events => has(events, 'cant_act', 1));
  assert.ok(asleep[0] && asleep[FROM_TURN - 1], 'asleep from the first turn through the from_turn');
  assert.ok(turns.every(events => !has(events, 'move_used', 1)), 'it never acted before it fled');
  const fledAt = turns.findIndex(events => has(events, 'wild_fled')) + 1, firstAwake = asleep.indexOf(false, FROM_TURN - 1) + 1;
  assert.equal(fledAt, firstAwake, 'it flees at its first action from the from_turn on');
  assert.ok(fledAt > FROM_TURN, 'the turns it slept through are counted');
  for (const events of turns.filter(events => has(events, 'cant_act', 1))) assert.ok(!has(events, 'wild_fled'));
  assert.equal(b.result?.reason, 'wild_fled');
});

test('only a wild side flees: a Boss or trainer of the same species fights on', () => {
  for (const kind of ['boss', 'trainer']) {
    const b = battle(kind), turns = play(b, Array(FROM_TURN + 1).fill(SPLASH));
    assert.equal(b.result, null, kind);
    assert.ok(turns.every(events => !has(events, 'wild_fled') && has(events, 'move_used', 1)), kind);
  }
});
