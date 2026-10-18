import assert from 'node:assert/strict';
import test from 'node:test';
import {activeBeads, addMonster, boostMultiplier, createMonster, expToNext, findMon, MAX_LEVEL, tickBoosts, useRaisingItem} from './index.ts';
import {dex, emptySave, rng} from './test-fixture.mjs';

const item = (id, raising_effect) => ({id, kind: 'raising', raising_effect});
const saveWith = (level, items = {}) => ({...addMonster(emptySave(), createMonster(dex, 3, level, rng(level), {uid: 'a', nature: 'hardy'})), items});

test('a raising item applies its effect and is consumed; unlimited items are not', () => {
  const potion = item('ev_atk', {op: 'ev_add', evs: {atk: 10}});
  const s = saveWith(20, {ev_atk: 1});
  const r = useRaisingItem(s, 'a', potion, dex, rng());
  assert.equal(findMon(r.save, 'a').evs.atk, 10);
  assert.equal('ev_atk' in r.save.items, false);
  assert.throws(() => useRaisingItem(r.save, 'a', potion, dex, rng()), /no ev_atk left/);
  const free = useRaisingItem(r.save, 'a', potion, dex, rng(), {unlimited: true});
  assert.equal(findMon(free.save, 'a').evs.atk, 20);
  assert.deepEqual(free.save.items, {});
});

test('EXP items send EXP past level 100 to the pool and refuse a level-100 target', () => {
  const big = item('exp_big', {op: 'exp', amount: 10 ** 6});
  const r = useRaisingItem(saveWith(99, {exp_big: 2}), 'a', big, dex, rng());
  assert.equal(findMon(r.save, 'a').level, MAX_LEVEL);
  assert.equal(r.overflow, 10 ** 6 - expToNext('medium', 99));
  assert.equal(r.save.exp_pool, r.overflow);
  assert.throws(() => useRaisingItem(r.save, 'a', big, dex, rng()), /already level 100/);
  assert.throws(() => useRaisingItem(r.save, 'a', item('up', {op: 'levels', amount: 1}), dex, rng(), {unlimited: true}), /already level 100/);
  assert.throws(() => useRaisingItem(saveWith(1), 'a', item('down', {op: 'levels', amount: -1}), dex, rng(), {unlimited: true}), /already level 1/);
});

test('boosts: one of each kind at a time, multiplied, counted down per battle (SPEC 5.4)', () => {
  const exp2 = item('exp2', {op: 'boost', what: 'exp', multiplier: 2, battles: 2});
  const bead = item('bead', {op: 'energy_bead', battles: 1, stats: {atk: 5}});
  let s = useRaisingItem(saveWith(20, {exp2: 2, bead: 2}), 'a', exp2, dex, rng()).save;
  assert.equal(boostMultiplier(s, 'exp'), 2);
  assert.equal(boostMultiplier(s, 'ev'), 1);
  assert.throws(() => useRaisingItem(s, 'a', exp2, dex, rng()), /already active/);
  assert.equal(s.items.exp2, 1, 'a refused boost is not spent');
  s = useRaisingItem(s, 'a', bead, dex, rng()).save;
  assert.deepEqual(activeBeads(s, 'a'), [{kind: 'energy_bead', item: 'bead', uid: 'a', battles_left: 1, stats: {atk: 5}}]);
  s = tickBoosts(s);
  assert.deepEqual([boostMultiplier(s, 'exp'), activeBeads(s, 'a')], [2, []]);
  s = tickBoosts(s);
  assert.deepEqual(s.boosts, []);
  assert.equal(tickBoosts(s), s, 'nothing to count down returns the same save');
});
