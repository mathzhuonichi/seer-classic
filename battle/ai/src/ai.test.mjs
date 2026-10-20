// The Boss policy's ranking, status-move reuse and no-damage fallback (RULES.md 10.4), and the trainer planner against an
// immune foe.
import assert from 'node:assert/strict';
import test from 'node:test';
import {Battle} from '../../core/src/engine/battle.ts';
import {buildDataSet} from '../../core/src/data.ts';
import {AI_POLICY, chooseAiAction} from './ai.ts';

const S = {light: 1, normal: 2, boost: 3, heal: 4, poison: 5, leech: 6, wait: 7, sure: 8, wild: 9, multi: 10, big: 11, clear: 12, guard: 13,
  shield: 14, scripted: 15, growl: 16};
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
    skill(S.multi, {power: 40, effects: [{op: 'multi_hit', min: 3, max: 3}]}), skill(S.big, {power: 200, accuracy: 50}),
    status(S.clear, [{op: 'clear_stages', target: 'foe', which: 'up'}]),
    status(S.guard, [{op: 'add_condition', target: 'self', condition: 'fixture_guard', turns: 2}], 'self'),
    status(S.shield, [{op: 'add_condition', target: 'self', condition: 'fixture_guard', charges: 1}], 'self'),
    status(S.scripted, [{op: 'stat_stage', target: 'self', stats: {atk: 1}}, {op: 'script', id: 'fixture_unmodeled'}], 'self'),
    status(S.growl, [{op: 'stat_stage', target: 'foe', stats: {atk: -1}}])],
  conditions: [{id: 'fixture_guard', name: {zh: 'fixture guard'}, kind: 'buff', hooks: []}],
});
const mon = (species, skills) => ({species, level: 50, skills, stats: {...base, hp: 5000}});
function battle({kind = 'boss', skills, foe = 2, seed = 7, playerSkills = [S.wait]}) {
  return new Battle({data: data(), seed, policy: AI_POLICY, sides: [
    {kind: 'player', team: [mon(foe, playerSkills)]},
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

test('a Boss boosts again on its next turn after the foe clears its boosts, and attacks while they stand', () => {
  for (let seed = 1; seed <= 4; seed++) {
    const b = battle({skills: [S.normal, S.boost], foe: 3, seed, playerSkills: [S.wait, S.clear]}), used = [];
    for (let turn = 0; turn < 8; turn++) {
      b.submit(0, {kind: 'move', skill: turn === 2 ? S.clear : S.wait});
      used.push(...b.resolveTurn().filter(e => e.type === 'move_used' && e.side === 1).map(e => e.skill));
    }
    assert.deepEqual(used, [S.boost, S.normal, S.normal, S.boost, S.normal, S.normal, S.normal, S.normal], `seed ${seed}`);
  }
});

test('a self-boost counts as undone only when none of the stats it raises is above 0', () => {
  const b = battle({skills: [S.normal, S.boost], foe: 3}), boss = b.active(1);
  usedAll(b);
  boss.stages.spe = 1;
  assert.equal(decide(b), S.normal, 'one raised stat still stands');
  Object.assign(boss.stages, {spe: 0, atk: -2, eva: 3});
  assert.equal(decide(b), S.boost, 'reversed, and evasion is not a stat it raises');
  assert.equal(b.rng.draws, 0, 'the reuse draws nothing');
});

test('a Boss re-applies a status once the foe is rid of it, unless the foe is immune', () => {
  const b = battle({skills: [S.normal, S.poison], foe: 3}), foe = b.active(0);
  usedAll(b);
  b.applyStatus(foe, 'poison', {turns: 3});
  assert.equal(decide(b), S.normal, 'still poisoned');
  b.removeCondition(foe, 'poison');
  assert.equal(decide(b), S.poison, 'cured');
  b.sides[0].rules.push({rule: 'immune_status'});
  assert.equal(decide(b), S.normal, 'an immune foe is attacked instead');
  assert.equal(b.rng.draws, 0);
});

test('a Boss renews a condition on itself once it has expired and heals once it is missing the whole amount', () => {
  const b = battle({skills: [S.normal, S.guard, S.heal], foe: 3}), boss = b.active(1);
  usedAll(b);
  assert.equal(decide(b), S.guard, 'the condition has expired');
  b.addCondition(boss, b.data.conditions.get('fixture_guard'), 2);
  assert.equal(decide(b), S.normal, 'the condition stands and the Boss is unhurt');
  boss.hp = boss.maxHp / 2 + 1;
  assert.equal(decide(b), S.normal, 'part of what the heal restores is still there');
  boss.hp = boss.maxHp / 2;
  assert.equal(decide(b), S.heal, 'the heal restores half of its HP, all of it missing');
});

test('a status move whose effect the reuse rule does not renew stays used once', () => {
  const b = battle({skills: [S.normal, S.scripted, S.growl, S.shield], foe: 3});
  assert.equal(decide(b), S.scripted, 'each status move is used once first');
  usedAll(b);
  assert.equal(decide(b), S.normal, 'a script, a stage drop on the foe and a condition spent by charges are not renewed');
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
