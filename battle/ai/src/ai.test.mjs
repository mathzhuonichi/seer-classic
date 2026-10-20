// The Boss policy's ranking and no-damage fallback (RULES.md 10.4), and the trainer planner against an immune foe.
import assert from 'node:assert/strict';
import test from 'node:test';
import {Battle} from '../../core/src/engine/battle.ts';
import {buildDataSet} from '../../core/src/data.ts';
import {AI_POLICY, chooseAiAction} from './ai.ts';

const S = {light: 1, normal: 2, boost: 3, heal: 4, poison: 5, leech: 6, wait: 7, sure: 8, wild: 9, multi: 10, big: 11};
const base = {hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100};
const skill = (id, extra = {}) => ({id, name: {zh: `fixture ${id}`}, type: 'normal', category: 'special', power: 0, accuracy: null, pp: 20, priority: 0,
  effects: [], ...extra});
const status = (id, effects, target = 'foe') => skill(id, {category: 'status', target, effects});
const boosts = {atk: 1, def: 1, spa: 1, spd: 1, spe: 1};
const data = () => buildDataSet({
  types: {chart: {light: {grass: 0}, normal: {}}},
  species: [{id: 1, name: {zh: 'light boss'}, types: ['light'], base}, {id: 2, name: {zh: 'grass foe'}, types: ['grass'], base},
    {id: 3, name: {zh: 'normal foe'}, types: ['normal'], base}],
  skills: [skill(S.light, {type: 'light', power: 140}), skill(S.normal, {power: 100}),
    status(S.boost, [{op: 'stat_stage', target: 'self', stats: boosts}], 'self'), status(S.heal, [{op: 'heal', target: 'self', pct_max_hp: 50}], 'self'),
    status(S.poison, [{op: 'status', target: 'foe', status: 'poison'}]), status(S.leech, [{op: 'status', target: 'foe', status: 'leech'}]),
    status(S.wait, [], 'self'), skill(S.sure, {power: 70, accuracy: 100}), skill(S.wild, {power: 100, accuracy: 50}),
    skill(S.multi, {power: 40, effects: [{op: 'multi_hit', min: 3, max: 3}]}), skill(S.big, {power: 200, accuracy: 50})],
});
const mon = (species, skills) => ({species, level: 50, skills, stats: {...base, hp: 5000}});
function battle({kind = 'boss', skills, foe = 2, seed = 7}) {
  return new Battle({data: data(), seed, policy: AI_POLICY, sides: [
    {kind: 'player', team: [mon(foe, [S.wait])]},
    {kind, team: [mon(1, skills)], ai: {kind: 'smart'}},
  ]});
}
const decide = b => chooseAiAction(b, b.sides[1]).skill;
const usedAll = b => b.active(1).skills.forEach(id => b.active(1).usedSkills.add(id));

test('a Boss whose attacks cannot hurt the foe boosts until every boosted stage is capped, then uses any move', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const b = battle({skills: [S.light, S.boost], seed}), used = [];
    for (let turn = 0; turn < 18; turn++) {
      b.submit(0, {kind: 'move', skill: S.wait});
      used.push(...b.resolveTurn().filter(e => e.type === 'move_used' && e.side === 1).map(e => e.skill));
    }
    assert.deepEqual(used.slice(0, 6), Array(6).fill(S.boost), `seed ${seed}: boosts while a stage can still rise`);
    assert.equal(b.active(1).stages.spe, 6);
    assert(used.slice(6).includes(S.light), `seed ${seed}: once capped, the old random fallback returns`);
  }
});

test('with no attack that hurts, a heal is chosen only when hurt and a status only when it can land', () => {
  const hurt = battle({skills: [S.light, S.heal]});
  usedAll(hurt);
  hurt.active(1).hp = 1000;
  for (let i = 0; i < 6; i++) assert.equal(decide(hurt), S.heal);
  const poison = battle({skills: [S.light, S.poison, S.leech]});
  usedAll(poison);
  for (let i = 0; i < 6; i++) assert.equal(decide(poison), S.poison, 'grass is immune to leech; poison still lands');
  let draws = 0;
  for (const setup of [b => b.applyStatus(b.active(0), 'poison', {turns: 3}), b => b.sides[0].rules.push({rule: 'immune_status'})]) {
    const seen = new Set();
    for (let seed = 1; seed <= 12; seed++) {
      const b = battle({skills: [S.light, S.poison, S.leech], seed});
      usedAll(b);
      setup(b);
      seen.add(decide(b));
      draws += b.rng.draws;
    }
    assert.deepEqual([...seen].sort(), [S.light, S.poison, S.leech], 'nothing lands: any move, as before');
  }
  assert.equal(draws, 24, 'one RNG draw per fallback decision');
});

test('a Boss ranks attacks by expected damage: accuracy, every hit and no more than the foe has left', () => {
  const pick = (skills, hp) => {
    const b = battle({skills, foe: 3});
    usedAll(b);
    if (hp) b.active(0).hp = hp;
    return decide(b);
  };
  assert.equal(pick([S.wild, S.sure]), S.sure, '100 power at 50% hits for less than 70 power at 100%');
  assert.equal(pick([S.normal, S.multi]), S.multi, 'three hits of 40 beat one of 100');
  assert.equal(pick([S.big, S.sure], 1), S.sure, 'both knock out; the surer one is chosen');
  assert.equal(pick([S.light, S.normal]), S.light, 'against a foe that takes light, the stronger light attack');
  for (let seed = 1; seed <= 8; seed++) {
    const b = battle({skills: [S.light, S.normal], seed});
    usedAll(b);
    assert.equal(decide(b), S.normal, 'the grass foe takes nothing from light');
  }
});

test('the trainer planner never picks an attack the foe is immune to while one that hurts is left', () => {
  for (const style of ['balanced', 'offense', 'control', 'attrition']) for (let seed = 1; seed <= 4; seed++) {
    const b = battle({kind: 'trainer', skills: [S.light, S.normal, S.boost], seed});
    b.sides[1].ai = {kind: 'smart', style};
    for (let turn = 0; turn < 3 && !b.result; turn++) {
      const action = chooseAiAction(b, b.sides[1]);
      assert.notEqual(action.skill, S.light, `${style}/${seed}/turn ${turn}`);
      b.submit(0, {kind: 'move', skill: S.wait});
      b.submit(1, action);
      b.resolveTurn();
    }
  }
});
