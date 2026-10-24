// The Boss policy's ranking, status-move chance and no-damage fallback (RULES.md 10.4), a Boss at 0 PP, and the trainer planner
// against an immune foe.
import assert from 'node:assert/strict';
import test from 'node:test';
import {Battle} from '../../core/src/engine/battle.ts';
import {buildDataSet} from '../../core/src/data.ts';
import {BOSS_STATUS_CHANCE, STRUGGLE_SKILL} from '../../core/src/constants.ts';
import {emptyCtx} from '../../core/src/engine/state.ts';
import {SEER_SCRIPTS} from '../../core/src/scripts/index.ts';
import {AI_POLICY, chooseAiAction} from './ai.ts';

const S = {light: 1, normal: 2, boost: 3, heal: 4, poison: 5, leech: 6, wait: 7, sure: 8, wild: 9, multi: 10, big: 11, backfire: 12};
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
    status(S.backfire, [{op: 'script', id: 'seer_eff_69', params: [5]}])],
});
const mon = (species, skills) => ({species, level: 50, skills, stats: {...base, hp: 5000}});
function battle({kind = 'boss', skills, foe = 2, seed = 7}) {
  return new Battle({data: data(), seed, policy: AI_POLICY, scripts: SEER_SCRIPTS, sides: [
    {kind: 'player', team: [mon(foe, [S.wait])]},
    {kind, team: [mon(1, skills)], ai: {kind: 'smart'}},
  ]});
}
const decide = b => chooseAiAction(b, b.sides[1]).skill;

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
  hurt.active(1).hp = 1000;
  for (let i = 0; i < 6; i++) assert.equal(decide(hurt), S.heal);
  const poison = battle({skills: [S.light, S.poison, S.leech]});
  for (let i = 0; i < 6; i++) assert.equal(decide(poison), S.poison, 'grass is immune to leech; poison still lands');
  let draws = 0;
  for (const setup of [b => b.applyStatus(b.active(0), 'poison', {turns: 3}), b => b.sides[0].rules.push({rule: 'immune_status'})]) {
    const seen = new Set();
    for (let seed = 1; seed <= 12; seed++) {
      const b = battle({skills: [S.light, S.poison, S.leech], seed});
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
    if (hp) b.active(0).hp = hp;
    return decide(b);
  };
  assert.equal(pick([S.wild, S.sure]), S.sure, '100 power at 50% hits for less than 70 power at 100%');
  assert.equal(pick([S.normal, S.multi]), S.multi, 'three hits of 40 beat one of 100');
  assert.equal(pick([S.big, S.sure], 1), S.sure, 'both knock out; the surer one is chosen');
  assert.equal(pick([S.light, S.normal]), S.light, 'against a foe that takes light, the stronger light attack');
  for (let seed = 1; seed <= 8; seed++) {
    const b = battle({skills: [S.light, S.normal], seed});
    assert.equal(decide(b), S.normal, 'the grass foe takes nothing from light');
  }
});

test('with an attack that hurts, a Boss uses a status move that changes something on about one turn in five, by one draw', () => {
  // 1300 seeds put the ±0.05 bound at 4.5 standard deviations of the binomial, so new random draws alone cannot break it.
  const counts = {[S.normal]: 0, [S.boost]: 0, [S.poison]: 0};
  const SEEDS = 1300;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const b = battle({skills: [S.normal, S.boost, S.poison], foe: 3, seed});
    counts[decide(b)]++;
    assert.equal(b.rng.draws, 1, `seed ${seed}: one draw`);
  }
  const share = (counts[S.boost] + counts[S.poison]) / SEEDS;
  assert(share > BOSS_STATUS_CHANCE - 0.05 && share < BOSS_STATUS_CHANCE + 0.05, JSON.stringify(counts));
  assert(counts[S.boost] > 0 && counts[S.poison] > 0, 'both status moves are drawn');
  // The draw below BOSS_STATUS_CHANCE, scaled, picks among the useful status moves; at or above it, the best attack.
  const rolls = [[0, S.boost], [BOSS_STATUS_CHANCE * 0.49, S.boost], [BOSS_STATUS_CHANCE * 0.51, S.poison], [BOSS_STATUS_CHANCE, S.normal], [0.99, S.normal]];
  for (const [roll, expected] of rolls) {
    const b = battle({skills: [S.normal, S.boost, S.poison], foe: 3});
    b.rng.next = () => roll;
    assert.equal(decide(b), expected, `roll ${roll}`);
  }
});

test('a Boss draws nothing without a real choice: a knockout, no status move, or none that changes something', () => {
  const run = (skills, setup = () => {}) => {
    const b = battle({skills, foe: 3});
    setup(b);
    const picks = new Set();
    for (let i = 0; i < 6; i++) picks.add(decide(b));
    return {picks: [...picks], draws: b.rng.draws};
  };
  assert.deepEqual(run([S.normal, S.boost], b => { b.active(0).hp = 1; }), {picks: [S.normal], draws: 0}, 'a knockout first');
  assert.deepEqual(run([S.normal, S.sure]), {picks: [S.normal], draws: 0}, 'attacks only');
  assert.deepEqual(run([S.normal, S.boost], b => Object.assign(b.active(1).stages, boosts, {atk: 6, def: 6, spa: 6, spd: 6, spe: 6})),
    {picks: [S.normal], draws: 0}, 'every boosted stage at +6');
  assert.deepEqual(run([S.normal, S.poison], b => b.applyStatus(b.active(0), 'poison', {turns: 3})), {picks: [S.normal], draws: 0}, 'already poisoned');
  assert.deepEqual(run([S.normal, S.poison], b => b.sides[0].rules.push({rule: 'immune_status'})), {picks: [S.normal], draws: 0}, 'immune');
  assert.deepEqual(run([S.normal, S.heal, S.wait]), {picks: [S.normal], draws: 0}, 'unhurt, and a move without effects');
  const backfire = b => b.runEffects(b.skill(S.backfire).effects, b.active(1), b.active(0), emptyCtx());
  assert.deepEqual(run([S.normal, S.backfire], backfire), {picks: [S.normal], draws: 0}, '药剂反噬 is still in place');
  assert.equal(run([S.normal, S.backfire]).draws, 6, 'without it, 药剂反噬 changes something');
});

test('with no attack PP left, a Boss uses a status move that changes something, else spends any status move', () => {
  const b = battle({skills: [S.normal, S.boost, S.wait], foe: 3}), boss = b.active(1);
  boss.pp[S.normal] = 0;
  for (let i = 0; i < 4; i++) assert.equal(decide(b), S.boost);
  Object.assign(boss.stages, {atk: 6, def: 6, spa: 6, spd: 6, spe: 6});
  const picks = new Set();
  for (let i = 0; i < 12; i++) picks.add(decide(b));
  assert.deepEqual([...picks].sort(), [S.boost, S.wait], 'nothing changes anything: a move with PP is spent');
});

test('a Boss with every skill at 0 PP stands still; a wild monster struggles', () => {
  for (const kind of ['boss', 'wild']) {
    const b = battle({kind, skills: [S.normal], foe: 3}), foe = b.active(0);
    b.active(1).pp[S.normal] = 0;
    b.submit(0, {kind: 'move', skill: S.wait});
    const events = b.resolveTurn();
    if (kind === 'boss') {
      assert(events.some(e => e.type === 'cant_act' && e.side === 1 && e.reason === 'no_pp'));
      assert.equal(foe.hp, foe.maxHp);
    } else assert(events.some(e => e.type === 'move_used' && e.side === 1 && e.skill === STRUGGLE_SKILL.id));
  }
});

test('a sequence whose skills are spent falls back to the side\'s policy without one', () => {
  const b = battle({skills: [S.light, S.normal, S.boost]});
  b.sides[1].ai = {kind: 'sequence', skills: [S.boost]};
  b.active(1).pp[S.boost] = 0;
  for (let i = 0; i < 4; i++) assert.equal(decide(b), S.normal, 'the Boss policy: the attack that hurts the grass foe');
  assert.equal(b.rng.draws, 0);
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
