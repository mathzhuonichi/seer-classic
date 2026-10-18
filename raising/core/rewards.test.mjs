import assert from 'node:assert/strict';
import test from 'node:test';
import {addMonster, allocatePoolExp, applyBattleRewards, createMonster, expToNext, expYield, findMon, MAX_LEVEL} from './index.ts';
import {dex, emptySave, rng} from './test-fixture.mjs';

const team = (...members) => members.reduce(
  (s, [uid, species, level]) => addMonster(s, createMonster(dex, species, level, rng(level), {uid, nature: 'hardy'})), emptySave());
const foe = {species: 40, level: 35};

test('expYield is floor(exp_yield * level / 7), x1.5 for a boss (SPEC 5.2)', () => {
  assert.equal(expYield(dex, foe), 700);
  assert.equal(expYield(dex, {...foe, boss: true}), 1050);
});

test('EXP is split between standing participants; each gets the full 学习力 yield', () => {
  const s = team(['a', 3, 30], ['b', 3, 30], ['c', 3, 30]);
  findMon(s, 'c').hp = 0;
  const r = applyBattleRewards(s, [{foe, participants: ['a', 'b', 'c']}], dex);
  for (const uid of ['a', 'b']) {
    const m = findMon(r.save, uid);
    assert.deepEqual([m.level, m.exp, m.evs.atk, m.evs.spe], [30, 350, 3, 1]);
  }
  assert.deepEqual(findMon(r.save, 'c').evs.atk, 0, 'a fainted participant gets nothing');
  const doubled = applyBattleRewards({...s, boosts: [{kind: 'ev', item: 'x', multiplier: 2, battles_left: 1}]}, [{foe, participants: ['a']}], dex, {expMultiplier: 2});
  assert.deepEqual([findMon(doubled.save, 'a').exp, findMon(doubled.save, 'a').evs.atk], [1400, 6]);
});

test('level-100 shares and overflow go to the pool; level evolutions run after the battle', () => {
  const s = team(['top', 3, MAX_LEVEL], ['kid', 1, 15]);
  const r = applyBattleRewards(s, [{foe: {species: 40, level: 100}, participants: ['top', 'kid']}], dex);
  const share = Math.floor(expYield(dex, {species: 40, level: 100}) / 2);
  assert(r.events.some((e) => e.kind === 'exp_to_pool' && e.uid === 'top' && e.amount === share));
  assert.equal(r.save.exp_pool, share);
  assert.equal(findMon(r.save, 'kid').species, 2, '种子 evolves on reaching level 16');
  const kept = applyBattleRewards(s, [{foe: {species: 40, level: 100}, participants: ['kid']}], dex, {autoEvolve: false});
  assert.equal(findMon(kept.save, 'kid').species, 1);
});

test('the 经验分配器 takes from the pool only what the monster can absorb', () => {
  const s = {...team(['a', 3, 99]), exp_pool: 10 ** 6};
  const r = allocatePoolExp(s, 'a', 10 ** 6, dex);
  assert.equal(findMon(r.save, 'a').level, MAX_LEVEL);
  assert.equal(r.save.exp_pool, 10 ** 6 - expToNext('medium', 99));
  assert.throws(() => allocatePoolExp(s, 'a', 0, dex), /pool has/);
  assert.throws(() => allocatePoolExp(s, 'a', 10 ** 6 + 1, dex), /pool has/);
});
