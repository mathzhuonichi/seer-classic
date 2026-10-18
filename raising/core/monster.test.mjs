import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addEvs, autoEvolve, changeNature, computeStats, createMonster, equipSkills, EV_STAT_CAP, EV_TOTAL_CAP, evolutionOptions, evolve,
  expToNext, gainExp, gainLevels, IV_MAX, levelEvolutions, MAX_LEVEL, requiresEvolutionChoice, resetEvs, restoreMonster, setIv,
} from './index.ts';
import {dex, rng} from './test-fixture.mjs';

const make = (species = 1, level = 10, opts = {}) => createMonster(dex, species, level, rng(species * 100 + level), {nature: 'hardy', iv: 20, ...opts});
const maxHp = (m) => computeStats(m, dex).hp;

test('createMonster: full HP, learnset to its level, the newest four equipped with full PP', () => {
  const m = make(1, 13);
  assert.deepEqual(m.learned, [1, 2, 3, 4, 5]);
  assert.deepEqual(m.skills, [2, 3, 4, 5]);
  assert.deepEqual(m.pp, {2: 12, 3: 13, 4: 14, 5: 15});
  assert.equal(m.hp, maxHp(m));
  assert.throws(() => make(1, 0), /out of range/);
  assert.throws(() => make(1, MAX_LEVEL + 1), /out of range/);
  for (let seed = 0; seed < 200; seed++) {
    const iv = createMonster(dex, 3, 5, rng(seed)).iv;
    assert(iv >= 1 && iv <= IV_MAX, 'new monsters roll 1-31');
  }
});

test('addEvs: 255 per stat, 510 in total, filled in hp..spe order (SPEC 2)', () => {
  const m = make();
  let r = addEvs(m, {atk: 300, spe: 4.9});
  assert.deepEqual([r.mon.evs.atk, r.mon.evs.spe], [EV_STAT_CAP, 4]);
  assert.deepEqual(r.events, [{kind: 'evs_gained', uid: m.uid, gained: {atk: 255, spe: 4}}]);
  r = addEvs({...r.mon, evs: {hp: 255, atk: 250, def: 0, spa: 0, spd: 0, spe: 0}}, {atk: 10, def: 10, spe: 10});
  assert.deepEqual(r.mon.evs, {hp: 255, atk: 255, def: 0, spa: 0, spd: 0, spe: 0}, 'the total cap cuts later stats');
  assert.equal(EV_TOTAL_CAP, 510);
  assert.deepEqual(addEvs(r.mon, {spe: 1}).events, [], 'nothing gained, no event');
});

test('stat changes shift current HP by the max HP change, clamped to [1, max]; fainted stays at 0', () => {
  const m = {...addEvs(make(1, 100), {hp: 252}).mon};
  m.hp = maxHp(m) - 5;
  const reset = resetEvs(m, dex).mon;
  assert.equal(maxHp(m) - maxHp(reset), 63);
  assert.equal(reset.hp, maxHp(reset) - 5);
  assert.equal(resetEvs({...m, hp: 3}, dex).mon.hp, 1, 'never faints');
  assert.equal(resetEvs({...m, hp: 0}, dex).mon.hp, 0, 'never revives');
  const low = setIv({...make(1, 60), hp: 10}, 31, dex).mon;
  assert.equal(low.hp, 10 + maxHp(low) - maxHp(make(1, 60)), 'a gain never heals more than the gain');
  assert.equal(changeNature(m, 'modest', dex).mon.hp, m.hp, '性格 never changes HP');
  assert.throws(() => setIv(m, 32, dex), /out of range/);
  assert.throws(() => changeNature(m, 'bogus', dex), /unknown nature/);
});

test('gainExp: multi-level ups learn skills, and EXP past level 100 overflows', () => {
  const m = make(2, 18);
  const need = expToNext('medium', 18) + expToNext('medium', 19) + 5;
  const r = gainExp(m, need, dex);
  assert.deepEqual([r.mon.level, r.mon.exp, r.overflow], [20, 5, 0]);
  assert.deepEqual(r.events.map((e) => e.kind), ['exp_gained', 'level_up', 'level_up', 'skill_learned']);
  assert(r.mon.skills.includes(6), 'a free slot auto-equips the new skill');
  const top = gainExp(make(3, 99), 10 ** 7, dex);
  assert.equal(top.mon.level, MAX_LEVEL);
  assert.equal(top.overflow, 10 ** 7 - expToNext('medium', 99));
  assert.deepEqual(gainExp(top.mon, 50, dex), {mon: top.mon, events: [], overflow: 50});
});

test('gainLevels: up like EXP, down never below 1, keeping skills and resetting the EXP bar', () => {
  const m = {...make(1, 13), exp: 30};
  const up = gainLevels(m, 3, dex);
  assert.equal(up.mon.level, 16);
  assert.equal(up.events.filter((e) => e.kind === 'level_up').length, 3);
  const down = gainLevels(m, -20, dex);
  assert.deepEqual([down.mon.level, down.mon.exp, down.mon.learned], [1, 0, m.learned]);
  assert.deepEqual(down.events, [{kind: 'level_down', uid: m.uid, level: 1, stats: computeStats(down.mon, dex)}]);
  assert.deepEqual(gainLevels(down.mon, -1, dex).events, []);
});

test('evolution: options per method, identity kept, the new learnset learned', () => {
  const m = {...make(2, 32), nickname: '小花', evs: {hp: 4, atk: 0, def: 0, spa: 8, spd: 0, spe: 0}};
  const r = evolve(m, 3, dex);
  assert.deepEqual([r.mon.uid, r.mon.species, r.mon.level, r.mon.nickname, r.mon.iv, r.mon.evs], [m.uid, 3, 32, '小花', m.iv, m.evs]);
  assert.equal(r.mon.hp, m.hp + maxHp(r.mon) - maxHp(m));
  assert.throws(() => evolve(make(2, 31), 3, dex), /cannot evolve/);
  const stone = make(30, 5);
  assert.deepEqual(evolutionOptions(stone, dex), []);
  assert.deepEqual(evolutionOptions(stone, dex, {item: 'stone', special: ['moon']}), [31, 32]);
});

test('autoEvolve chains single-branch level evolutions and leaves choices to the player (SPEC 7)', () => {
  const chain = autoEvolve(make(1, 40), dex);
  assert.equal(chain.mon.species, 3);
  assert.deepEqual(chain.events.filter((e) => e.kind === 'evolved').map((e) => [e.from, e.to]), [[1, 2], [2, 3]]);
  const branch = make(10, 30);
  assert(requiresEvolutionChoice(branch, dex));
  assert.deepEqual(levelEvolutions(branch, dex), [11, 12]);
  assert.equal(autoEvolve(branch, dex).mon.species, 10);
  const manual = make(20, 15);
  assert.deepEqual([levelEvolutions(manual, dex), evolutionOptions(manual, dex)], [[], [21]]);
  assert.equal(autoEvolve(manual, dex).mon.species, 20);
});

test('equipSkills: 1-4 learned, distinct skills; equipped PP is kept and new ones start full', () => {
  const m = {...make(1, 13), pp: {2: 1, 3: 13, 4: 14, 5: 15}};
  assert.deepEqual(equipSkills(m, [1, 2], dex).pp, {1: 11, 2: 1});
  assert.throws(() => equipSkills(m, [], dex), /1-4/);
  assert.throws(() => equipSkills(m, [1, 2, 3, 4, 5], dex), /1-4/);
  assert.throws(() => equipSkills(m, [1, 1], dex), /duplicate/);
  assert.throws(() => equipSkills(m, [6], dex), /not learned/);
});

test('restoreMonster: level 1, fresh 个体 and 性格, no 学习力; uid, species, nickname, skin and generation kept', () => {
  const m = {...addEvs(make(3, 50), {atk: 100}).mon, nickname: '老友', skinSpecies: 1, generation: 1};
  const r = restoreMonster(m, dex, rng(7));
  assert.deepEqual([r.mon.uid, r.mon.species, r.mon.level, r.mon.nickname, r.mon.skinSpecies, r.mon.generation], [m.uid, 3, 1, '老友', 1, 1]);
  assert.equal(restoreMonster(make(3, 50), dex, rng(7)).mon.generation, undefined);
  assert.equal(r.mon.evs.atk, 0);
  assert.deepEqual(r.events.map((e) => e.kind), ['iv_changed', 'nature_changed', 'evs_reset']);
});
