import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addMonster, BOX_MAX, boxOf, computeStats, createMonster, deposit, hatchEssence, healAll, PARTY_MAX, release, rename, setPartyOrder, withdraw,
} from './index.ts';
import {dex, emptySave, guard, rng} from './test-fixture.mjs';

const mon = (uid, species = 3) => ({...createMonster(dex, species, 10, rng(uid.length), {uid, nature: 'hardy'})});
const saveWith = (count) => Array.from({length: count}, (_, i) => mon(`m${i}`)).reduce((s, m) => addMonster(s, m), emptySave());

test('new monsters fill the party up to 6, then the box; the dex records them', () => {
  const s = saveWith(PARTY_MAX + 2);
  assert.deepEqual(s.party, ['m0', 'm1', 'm2', 'm3', 'm4', 'm5']);
  assert.deepEqual(boxOf(s).map((m) => m.uid), ['m6', 'm7']);
  assert.deepEqual([s.dex.owned, s.dex.seen], [[3], [3]]);
  assert.throws(() => addMonster(s, mon('m0')), /duplicate uid/);
  assert.throws(() => addMonster({...s, storage: [...s.storage, ...Array.from({length: BOX_MAX}, (_, i) => ({uid: `b${i}`}))]}, mon('x')), /仓库已满/);
});

test('deposit, withdraw and release keep at least one party monster and at most six', () => {
  const s = saveWith(PARTY_MAX + 1);
  assert.throws(() => withdraw(s, 'm6'), /背包已满/);
  const fewer = deposit(s, 'm0');
  assert.deepEqual(withdraw(fewer, 'm0').party, ['m1', 'm2', 'm3', 'm4', 'm5', 'm0']);
  assert.throws(() => withdraw(fewer, 'nope'), /no monster nope/);
  assert.throws(() => withdraw(fewer, 'm1'), /already in the party/);
  const one = saveWith(1);
  assert.throws(() => deposit(one, 'm0'), /at least one/);
  assert.throws(() => release(one, 'm0'), /last party monster/);
  assert.deepEqual(release(s, 'm6').storage.length, PARTY_MAX);
  assert.throws(() => release(s, 'nope'), /no monster nope/);
});

test('setPartyOrder takes only a permutation of the party', () => {
  const s = saveWith(3);
  assert.deepEqual(setPartyOrder(s, ['m2', 'm0', 'm1']).party, ['m2', 'm0', 'm1']);
  for (const bad of [['m0', 'm1'], ['m0', 'm0', 'm1'], ['m0', 'm1', 'x']]) assert.throws(() => setPartyOrder(s, bad), /permutation/);
  assert.deepEqual(s.party, ['m0', 'm1', 'm2'], 'the input save is never changed');
});

test('rename trims, clears on blank and allows at most 12 characters', () => {
  const s = saveWith(1);
  assert.equal(rename(s, 'm0', '  小火  ').storage[0].nickname, '小火');
  assert.equal(rename(s, 'm0', '   ').storage[0].nickname, null);
  assert.equal(rename(s, 'm0', '一二三四五六七八九十一二').storage[0].nickname.length, 12);
  assert.throws(() => rename(s, 'm0', '一二三四五六七八九十一二三'), /at most 12/);
  assert.throws(() => rename(s, 'nope', 'x'), /no monster nope/);
});

test('healAll refills HP, PP and status for every owned monster', () => {
  const s = saveWith(PARTY_MAX + 1);
  for (const m of s.storage) Object.assign(m, {hp: 0, status: 'burn', pp: {1: 0}});
  const healed = healAll(s, dex);
  for (const m of healed.storage) {
    assert.deepEqual([m.hp, m.status, m.pp], [computeStats(m, dex).hp, null, {1: 11}]);
  }
});

test('hatchEssence spends one 精元 and hatches a level-1 monster into the party or box', () => {
  const essence = {id: 'essence_x', kind: 'essence', hatches: 40};
  const s = {...saveWith(PARTY_MAX), items: {essence_x: 1}};
  const r = hatchEssence(s, essence, dex, rng(3), 'today');
  assert.deepEqual([r.mon.species, r.mon.level, r.mon.obtained], [40, 1, {how: 'essence', at: 'today'}]);
  assert.equal(boxOf(r.save).at(-1).uid, r.mon.uid);
  assert.equal('essence_x' in r.save.items, false, 'an emptied stack leaves the bag');
  assert.throws(() => hatchEssence(r.save, essence, dex, rng(3)), /no essence_x left/);
});

test('storage operations never change the save they are given and keep every record they do not change', () => {
  const s = {...saveWith(PARTY_MAX + 1), items: {essence_x: 1}}, essence = {id: 'essence_x', kind: 'essence', hatches: 40};
  s.storage[1] = {...s.storage[1], hp: 0};
  const unchanged = guard(s), fewer = {...s, party: s.party.slice(1)};
  const changed = (next) => next.storage.filter((m) => !s.storage.includes(m)).map((m) => m.uid);
  const hatched = hatchEssence(s, essence, dex, rng(3));
  assert.deepEqual(
    [addMonster(s, mon('new')), deposit(s, 'm0'), withdraw(fewer, 'm0'), setPartyOrder(s, [...s.party].reverse()), release(s, 'm6')].map(changed),
    [['new'], [], [], [], []]);
  assert.deepEqual([rename(s, 'm2', 'x'), healAll(s, dex), hatched.save].map(changed), [['m2'], ['m1'], [hatched.mon.uid]], 'only m1 needs healing');
  const refusals = [
    [() => addMonster(s, mon('m0')), /duplicate uid/], [() => withdraw(s, 'm6'), /背包已满/], [() => deposit(s, 'm6'), /not in the party/],
    [() => setPartyOrder(s, ['m0']), /permutation/], [() => release(s, 'nope'), /no monster nope/],
    [() => rename(s, 'm0', '一二三四五六七八九十一二三'), /at most 12/], [() => hatchEssence(s, {...essence, id: 'none'}, dex, rng()), /no none left/],
  ];
  for (const [refused, error] of refusals) assert.throws(refused, error);
  unchanged();
});
