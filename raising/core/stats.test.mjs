import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {computeStatsFrom, cumulative, evTotal, expToNext, MAX_LEVEL, natureMultiplier, statValue, totalExp} from './index.ts';
import {natures} from './test-fixture.mjs';

const [hardy, modest] = natures;
const growth = JSON.parse(fs.readFileSync(new URL('../../data/growth.json', import.meta.url), 'utf8'));

test('stat formula: HP adds L + 10, other stats add 5 and then the nature (SPEC 1)', () => {
  // base 100, 个体 31, 学习力 252, Lv100: core = floor((200 + 31 + 63) * 100 / 100) = 294.
  assert.equal(statValue('hp', 100, 31, 252, 100, modest), 404);
  assert.equal(statValue('atk', 100, 31, 252, 100, hardy), 299);
  assert.equal(statValue('spa', 100, 31, 252, 100, modest), 328); // floor(299 * 1.1)
  assert.equal(statValue('atk', 100, 31, 252, 100, modest), 269); // floor(299 * 0.9)
  assert.equal(statValue('atk', 100, 31, 3, 50, hardy), statValue('atk', 100, 31, 0, 50, hardy), 'four 学习力 make one point');
});

test('natures never touch HP and neutral natures change nothing', () => {
  assert.equal(natureMultiplier(modest, 'hp'), 1);
  assert.equal(natureMultiplier(hardy, 'atk'), 1);
  assert.deepEqual(['spa', 'atk', 'def'].map((k) => natureMultiplier(modest, k)), [1.1, 0.9, 1]);
});

test('computeStatsFrom treats missing 学习力 as 0, and evTotal sums all six', () => {
  const base = {hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80};
  const zero = {hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0};
  assert.deepEqual(computeStatsFrom(base, 10, {hp: 0}, 30, hardy), computeStatsFrom(base, 10, zero, 30, hardy));
  assert.equal(evTotal({hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6}), 21);
});

test('the four EXP curves reproduce data/growth.json for every level (SPEC 5.1)', () => {
  for (const id of ['medium', 'slow', 'medium_slow', 'fluctuating']) {
    const steps = Array.from({length: growth[id].to_next.length}, (_, i) => expToNext(id, i + 1));
    assert.deepEqual(steps, growth[id].to_next, id);
    assert.equal(totalExp(id, MAX_LEVEL), growth[id].total_to_lv100, id);
    assert.equal(cumulative(id, MAX_LEVEL) - cumulative(id, 1), growth[id].total_to_lv100, id);
    assert.equal(expToNext(id, MAX_LEVEL), 0, `${id} has no step past the cap`);
  }
});
