// Wild monsters that flee (battle/RULES.md 9.1): the flee is the monster's action, from its species' `wild_flee`; a partnered
// monster also flees at a capsule thrown while no partner is out.
import assert from 'node:assert/strict';
import test from 'node:test';
import {Battle} from './battle.ts';
import {buildDataSet} from '../data.ts';

const FROM_TURN = 3, FLEEING = 1, PLAIN = 2, PARTNERED = 3, PARTNER = 4;
/** A capsule that always catches, and one that rolls. */
const SURE = 'sure', BASIC = 'basic';
const base = {hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100};
const skill = (id, extra) => ({id, name: {zh: `skill ${id}`}, type: 'normal', category: 'physical', power: 10, accuracy: null, pp: 20, priority: 0, ...extra});
const SLEEP = 2, SPLASH = 3;
const data = () => buildDataSet({
  types: {chart: {normal: {normal: 1}}},
  skills: [skill(1), skill(SLEEP, {category: 'status', power: 0, effects: [{op: 'status', target: 'foe', status: 'sleep', turns: FROM_TURN}]}),
    skill(SPLASH, {category: 'status', power: 0, target: 'self', effects: []})],
  species: [{id: FLEEING, name: {zh: 'fleeing'}, types: ['normal'], base, wild_flee: {from_turn: FROM_TURN}},
    {id: PLAIN, name: {zh: 'plain'}, types: ['normal'], base},
    {id: PARTNERED, name: {zh: 'partnered'}, types: ['normal'], base, wild_flee: {unless_player_active: [PARTNER]}},
    {id: PARTNER, name: {zh: 'partner'}, types: ['normal'], base}],
  items: [{id: SURE, capture_multiplier: null}, {id: BASIC, capture_multiplier: 1}],
});
/** The player outspeeds the foe, so its move comes first in every turn. */
const player = {species: PLAIN, level: 50, skills: [1, SLEEP, SPLASH], stats: {...base, hp: 300, spe: 300}};
const foe = {species: FLEEING, level: 50, skills: [1], stats: {...base, hp: 3000}};
const policy = {chooseAction: () => ({kind: 'move', skill: 1}), chooseReplacement: () => undefined};
const battle = (kind = 'wild') => new Battle({data: data(), seed: 7, policy, sides: [{kind: 'player', team: [player]}, {kind, team: [foe]}]});
/** A wild PARTNERED foe against the player's `team` of these species (the first leads), with two capsules of each kind. */
const partnered = (...team) => new Battle({data: data(), seed: 7, policy, sides: [
  {kind: 'player', team: team.map(species => ({...player, species})), items: {[SURE]: 2, [BASIC]: 2}}, {kind: 'wild', team: [{...foe, species: PARTNERED}]}]});
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

test('a partnered monster flees at its first action unless a partner is out, and never with one out', () => {
  const lone = partnered(PLAIN), [first] = play(lone, [SPLASH]);
  assert.ok(has(first, 'move_used', 0) && has(first, 'wild_fled', 1) && !has(first, 'move_used', 1), 'in turn 1, after the faster move');
  assert.deepEqual([lone.result?.reason, lone.result?.turns], ['wild_fled', 1]);
  const held = partnered(PARTNER), turns = play(held, Array(FROM_TURN + 3).fill(SPLASH));
  assert.equal(held.result, null);
  assert.ok(turns.every(events => has(events, 'move_used', 1) && !has(events, 'wild_fled')), 'it fights on with the partner out');
});

test('a switch resolves before its action: to a partner it stays, away from one it flees in that turn', () => {
  const kept = partnered(PLAIN, PARTNER);
  kept.submit(0, {kind: 'switch', slot: 1});
  const stayed = kept.resolveTurn();
  assert.ok(has(stayed, 'switch_in', 0) && has(stayed, 'move_used', 1) && !has(stayed, 'wild_fled'));
  assert.equal(kept.result, null);
  const left = partnered(PARTNER, PLAIN);
  assert.ok(!has(play(left, [SPLASH])[0], 'wild_fled'));
  left.submit(0, {kind: 'switch', slot: 1});
  const types = left.resolveTurn().map(event => event.type);
  assert.ok(types.indexOf('switch_in') < types.indexOf('wild_fled') && !types.includes('move_used'), types.join(' '));
  assert.deepEqual([left.result?.reason, left.result?.turns], ['wild_fled', 2]);
});

test('a capsule thrown with no partner out spends the capsule and makes it flee at once, asleep too, with no roll', () => {
  const b = partnered(PLAIN), [slept] = play(b, [SLEEP]);
  assert.ok(has(slept, 'cant_act', 1) && !has(slept, 'wild_fled'), 'asleep, it cannot flee at its action');
  const draws = b.rng.draws;
  b.submit(0, {kind: 'capture', item: BASIC});
  const events = b.resolveTurn();
  assert.deepEqual(events.find(e => e.type === 'wild_fled'), {type: 'wild_fled', side: 1, slot: 0, name: 'partnered', item: BASIC});
  assert.ok(!has(events, 'capture_attempt') && !has(events, 'move_used', 1));
  assert.deepEqual([b.rng.draws, b.sides[0].items[BASIC]], [draws, 1], 'no capture roll; the thrown capsule is spent');
  assert.deepEqual([b.result?.reason, b.result?.winner, b.result?.captured, b.result?.defeated], ['wild_fled', null, undefined, []]);
});

test('with a partner out a capsule rolls and catches as usual; a from_turn monster does not flee at a capsule', () => {
  const caught = partnered(PARTNER);
  caught.submit(0, {kind: 'capture', item: SURE});
  const events = caught.resolveTurn();
  assert.ok(has(events, 'capture_attempt', 0) && !has(events, 'wild_fled'));
  assert.deepEqual([caught.result?.reason, caught.result?.captured?.species], ['capture', PARTNERED]);
  const late = new Battle({data: data(), seed: 7, policy, sides: [{kind: 'player', team: [player], items: {[BASIC]: 1}}, {kind: 'wild', team: [foe]}]});
  play(late, Array(FROM_TURN - 1).fill(SPLASH));
  late.submit(0, {kind: 'capture', item: BASIC});
  const types = late.resolveTurn().map(event => event.type);
  assert.ok(types.indexOf('capture_attempt') < types.indexOf('wild_fled'), 'the capsule rolls, then the monster flees at its action');
});
