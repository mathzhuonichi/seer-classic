// Engine seams: the layering rule (the engine never imports the AI) and the injected policy.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {Battle} from './battle.ts';
import {createBattle} from '../battle.ts';
import {AI_POLICY} from '../ai.ts';
import {cloneBattle} from '../clone.ts';
import {buildDataSet} from '../data.ts';
import {MEAN_ROLL} from '../constants.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const AI_MODULES = ['ai.ts', 'legacy-ai.ts', 'search-ai.ts', 'observe.ts', 'clone.ts', 'search'].map(file => path.join(here, '..', file));

test('no engine module imports the AI, the planner or its helpers', () => {
  for (const file of fs.readdirSync(here).filter(name => name.endsWith('.ts'))) {
    const source = fs.readFileSync(path.join(here, file), 'utf8');
    for (const [, spec] of source.matchAll(/^\s*(?:import|export)\b[^'"]*from\s*'([^']+)'/gm)) {
      const target = path.resolve(here, spec);
      assert(!AI_MODULES.some(ai => target === ai || target.startsWith(ai + path.sep)), `${file} imports ${spec}`);
    }
  }
});

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

test('a battle without a policy runs player decisions and refuses an automatic one', () => {
  const battle = new Battle(options({sides: [{kind: 'player', team: [member()]}, {kind: 'player', team: [member()]}]}));
  battle.submit(0, {kind: 'move', skill: 1});
  battle.submit(1, {kind: 'move', skill: 2});
  assert.equal(battle.resolveTurn().filter(e => e.type === 'move_used').length, 2);
  const automatic = new Battle(options());
  automatic.submit(0, {kind: 'move', skill: 1});
  assert.throws(() => automatic.resolveTurn(), /no policy/);
});

test('the AI estimate is the damage probe at the mean roll, and both are read-only', () => {
  const battle = createBattle(options());
  battle.addCondition(battle.active(1), {id: 'guard', hooks: [{on: 'modify_damage_taken', multiplier: 0.5, consume_charge: true}]}, undefined, undefined, 1);
  const before = JSON.stringify({rng: battle.rng.s, draws: battle.rng.draws, conditions: battle.active(1).conditions, out: battle.turnEvents});
  const skill = battle.skill(1), probe = battle.probeDamage(battle.active(0), battle.active(1), skill, {roll: MEAN_ROLL, crit: false});
  assert.equal(battle.estimateDamage(battle.active(0), battle.active(1), skill), probe);
  assert.equal(probe, Math.floor(battle.calcAttack(battle.active(0), battle.active(1), skill, {}, {estimate: true}).damage * 0.5));
  assert.equal(JSON.stringify({rng: battle.rng.s, draws: battle.rng.draws, conditions: battle.active(1).conditions, out: battle.turnEvents}), before);
});

test('createBattle injects the AI unless a policy is given, and clones share the policy', () => {
  assert.equal(createBattle(options()).policy, AI_POLICY);
  const own = {chooseAction: () => ({kind: 'move', skill: 1}), chooseReplacement: () => undefined};
  const battle = createBattle(options({policy: own}));
  assert.equal(battle.policy, own);
  assert.equal(cloneBattle(battle).policy, own);
});
