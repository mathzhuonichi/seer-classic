// Engine seams (the injected policy, the read-only damage probe) and two engine rules: 先手权 and status type immunity.
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

/** Draws its move from the battle RNG, so a decision made at another point of the stream would show. */
const drawing = {chooseAction: b => ({kind: 'move', skill: b.rng.pick([1, 2])}), chooseReplacement: () => undefined};
const replay = (prepared, actions) => {
  const battle = new Battle(options({policy: drawing})), turns = [];
  for (const action of actions) {
    if (prepared) battle.prepare(1);
    battle.submit(0, action);
    turns.push(JSON.stringify({events: battle.resolveTurn(), rng: battle.rng.s, draws: battle.rng.draws, state: battle.state}));
  }
  return turns;
};

test('a prepared turn replays the unprepared one: same events, RNG and state', () => {
  const actions = [1, 2, 2, 1].map(skill => ({kind: 'move', skill}));
  assert.deepEqual(replay(true, actions), replay(false, actions));
  const fled = [...actions.slice(0, 2), {kind: 'flee'}];
  assert.deepEqual(replay(true, fled), replay(false, fled), 'a flee withdraws the prepared decision and its draw');
});

test('prepare decides once for an automatic side and declines what resolveTurn must decide', () => {
  const battle = new Battle(options({policy: drawing}));
  assert.equal(battle.prepare(0), null, 'the player side is not automatic');
  const action = battle.prepare(1);
  assert.deepEqual(battle.sides[1].pending, action);
  assert.equal(battle.prepare(1), null, 'already decided');
  const both = new Battle(options({policy: drawing, sides: [{kind: 'wild', team: [member()]}, {kind: 'boss', team: [member()]}]}));
  assert.equal(both.prepare(1), null, 'side 0 decides first');
  assert(both.prepare(0) && both.prepare(1));
  const scripted = new Battle(options({policy: drawing, encounter: {id: 'fixture', team: [member()], ai: {kind: 'script', id: 'pick'}}}));
  assert.equal(scripted.prepare(1), null, 'a script AI runs game code');
  const hooked = new Battle(options({policy: drawing}));
  hooked.addCondition(hooked.active(1), {id: 'choice', hooks: [{on: 'choose_action', script: 'pick'}]});
  assert.equal(hooked.prepare(1), null, 'choose_action hooks run game code');
});

test('a script objective is met by its script\'s objective member, and an entry without one warns', () => {
  const scripts = {met: {objective: () => true}, apply_only: {apply: () => true}};
  const turnWithLose = id => {
    const battle = new Battle(options({policy: fixed, scripts, encounter: {id: 'fixture', team: [member()], lose: [{kind: 'script', id}]}}));
    battle.submit(0, {kind: 'move', skill: 1});
    battle.resolveTurn();
    return battle;
  };
  assert.equal(turnWithLose('met').result?.reason, 'lose_condition');
  const missing = turnWithLose('apply_only');
  assert.equal(missing.result, null);
  assert.deepEqual(missing.warnings, ['script apply_only has no objective']);
});

// ---------- 先手权 and status type immunity (RULES.md 3 and 7) ----------

/** Raises atk when its user holds 先手权 and def when it moves last; it also hits, so the journal records the flag. */
const PROBE = 31, FIRE = 32;
const ruleData = () => buildDataSet({types: {chart: {normal: {normal: 1}, fire: {fire: 0.5}}},
  skills: [attack(1), {...attack(FIRE), type: 'fire'}, {...attack(PROBE), power: 10, effects: [
    {op: 'stat_stage', target: 'self', stats: {atk: 1}, when: {acted_first: true}},
    {op: 'stat_stage', target: 'self', stats: {def: 1}, when: {acted_first: false}},
  ]}],
  species: [{id: 1, name: {zh: 'fixture'}, types: ['normal'], base}],
  items: [{id: 'potion', battle_effects: [{op: 'heal', amount: 50}]}, {id: 'dud', capture_multiplier: 0}]});
const ruleMember = (extra = {}) => ({species: 1, level: 50, skills: [PROBE, 1, FIRE], stats: {...base, hp: 300}, ...extra});
const duel = (foe = {}) => new Battle({data: ruleData(), seed: 5, sides: [
  {kind: 'player', team: [ruleMember({stats: {...base, hp: 300, spe: 200}})]},
  {kind: 'player', team: [ruleMember(), ruleMember()], items: {potion: 1}, ...foe}]});
const probeStages = mon => ({atk: mon.stages.atk, def: mon.stages.def});
const probeHits = (battle, side) => battle.journal.filter(e => e.type === 'hit' && e.attacker.side === side).map(e => e.actedFirst);

test('a lone move after the foe\'s switch or item holds 先手权 although it resolves second', () => {
  const switched = duel();
  switched.submit(0, {kind: 'move', skill: PROBE});
  switched.submit(1, {kind: 'switch', slot: 1});
  switched.resolveTurn();
  assert.deepEqual(switched.turnOrder, [1, 0], 'the switch still resolves first');
  assert.deepEqual(probeStages(switched.active(0)), {atk: 1, def: 0});
  assert.deepEqual(probeHits(switched, 0), [true]);
  const healed = duel();
  healed.active(1).hp = 100;
  healed.submit(0, {kind: 'move', skill: PROBE});
  healed.submit(1, {kind: 'item', item: 'potion', target: 0});
  const events = healed.resolveTurn().map(e => e.type);
  assert(events.indexOf('item_used') < events.indexOf('move_used'), 'the item resolves first');
  assert.deepEqual(probeStages(healed.active(0)), {atk: 1, def: 0});
});

test('a textless turn_end opens the turn\'s end: after both moves, before the status damage', () => {
  const battle = duel();
  assert(battle.applyStatus(battle.active(1), 'poison', {}));
  battle.submit(0, {kind: 'move', skill: 1});
  battle.submit(1, {kind: 'move', skill: 1});
  const events = battle.resolveTurn(), types = events.map(e => e.type), end = types.indexOf('turn_end');
  assert.deepEqual(events[end], {type: 'turn_end', turn: 1});
  assert.equal(types.filter(type => type === 'turn_end').length, 1);
  assert(types.lastIndexOf('move_used') < end && end < types.indexOf('condition_tick'), types.join(' '));
});

test('a wild monster moving after a failed capsule holds 先手权', () => {
  const policy = {chooseAction: () => ({kind: 'move', skill: PROBE}), chooseReplacement: () => undefined};
  const battle = new Battle({data: ruleData(), seed: 5, policy, sides: [
    {kind: 'player', team: [ruleMember()], items: {dud: 1}}, {kind: 'wild', team: [ruleMember()]}]});
  battle.submit(0, {kind: 'capture', item: 'dud'});
  const events = battle.resolveTurn();
  assert(events.some(e => e.type === 'capture_attempt' && !e.success));
  assert.deepEqual(probeStages(battle.active(1)), {atk: 1, def: 0});
});

test('when both sides move, the faster holds 先手权 and the slower moves last', () => {
  const battle = duel();
  battle.submit(0, {kind: 'move', skill: PROBE});
  battle.submit(1, {kind: 'move', skill: PROBE});
  battle.resolveTurn();
  assert.deepEqual(probeStages(battle.active(0)), {atk: 1, def: 0});
  assert.deepEqual(probeStages(battle.active(1)), {atk: 0, def: 1});
  assert.deepEqual([probeHits(battle, 0), probeHits(battle, 1)], [[true], [false]]);
});

/** applyStatus's result and the reasons of the status_blocked events it emitted. */
const tryStatus = (mon, status, battle) => {
  const from = battle.out.length, applied = battle.applyStatus(mon, status, {});
  return {applied, blocked: battle.out.slice(from).filter(e => e.type === 'status_blocked').map(e => e.reason)};
};

test('fire types cannot be burned, ice types cannot be frozen, grass types cannot be leeched, dual types included', () => {
  const immune = {burn: [['fire'], ['fire', 'psychic']], freeze: [['ice'], ['electric', 'ice']], leech: [['grass'], ['water', 'grass']]};
  for (const [status, typeLists] of Object.entries(immune)) {
    for (const types of typeLists) {
      const battle = duel({team: [ruleMember({types})]});
      assert.deepEqual(tryStatus(battle.active(1), status, battle), {applied: false, blocked: ['type_immunity']}, `${status} on ${types}`);
      assert(!battle.active(1).conditions.some(c => c.id === status));
    }
  }
  for (const [status, types] of [['burn', ['water']], ['freeze', ['fire']], ['leech', ['ice']]]) {
    const battle = duel({team: [ruleMember({types})]});
    assert.deepEqual(tryStatus(battle.active(1), status, battle), {applied: true, blocked: []}, `${status} on ${types}`);
  }
});

test('冰封 ending on an ice monster lowers speed without 冻伤, and 易燃 does not burn a fire monster', () => {
  for (const [types, frozen] of [[['ice'], false], [['water'], true]]) {
    const battle = duel({team: [ruleMember({types})]});
    battle.applyStatus(battle.active(1), 'frozen_solid', {turns: 1});
    battle.submit(0, {kind: 'move', skill: 1});
    battle.submit(1, {kind: 'move', skill: 1});
    battle.resolveTurn();
    const mon = battle.active(1);
    assert.equal(mon.conditions.some(c => c.id === 'frozen_solid'), false, `${types}: 冰封 ended`);
    assert.equal(mon.conditions.some(c => c.id === 'freeze'), frozen, `${types}: 冻伤`);
    assert.equal(mon.stages.spe, -1, `${types}: speed -1`);
  }
  for (const [types, burned] of [[['fire'], false], [['normal'], true]]) {
    const battle = duel({team: [ruleMember({types})]});
    assert(battle.applyStatus(battle.active(1), 'flammable', {}), `${types}: 易燃 itself is not type-blocked`);
    battle.submit(0, {kind: 'move', skill: FIRE});
    battle.submit(1, {kind: 'move', skill: 1});
    battle.resolveTurn();
    assert.equal(battle.active(1).conditions.some(c => c.id === 'burn'), burned, `${types}: 烧伤 from 易燃`);
  }
});
