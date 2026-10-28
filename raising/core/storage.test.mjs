import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addMonster, computeStats, createMonster, deposit, hatchEssence, healAll, PARTY_MAX, rename, setPartyOrder, swapWithBox, withdraw,
} from './index.ts';
import {dex, emptySave, guard, rng} from './test-fixture.mjs';

const mon = (uid, species = 3) => ({...createMonster(dex, species, 10, rng(uid.length), {uid, nature: 'hardy'})});
const saveWith = (count) => Array.from({length: count}, (_, i) => mon(`m${i}`)).reduce((s, m) => addMonster(s, m), emptySave());
/** More monsters than the box's former 1000 places: the box has no limit. */
const LARGE_BOX = 1200;
const boxOf = (save) => save.storage.filter((m) => !save.party.includes(m.uid));

test('new monsters fill the party up to 6, then the box; the dex records them', () => {
  const s = saveWith(PARTY_MAX + 2);
  assert.deepEqual(s.party, ['m0', 'm1', 'm2', 'm3', 'm4', 'm5']);
  assert.deepEqual(boxOf(s).map((m) => m.uid), ['m6', 'm7']);
  assert.deepEqual([s.dex.owned, s.dex.seen], [[3], [3]]);
  assert.throws(() => addMonster(s, mon('m0')), /duplicate uid/);
});

test('the box takes any number of monsters once the party is full', () => {
  const s = saveWith(PARTY_MAX), crowded = {...s, storage: [...s.storage, ...Array.from({length: LARGE_BOX}, (_, i) => ({...s.storage[0], uid: `b${i}`}))]};
  const added = addMonster(crowded, mon('x'));
  assert.deepEqual([boxOf(added).length, boxOf(added).at(-1).uid, added.party], [LARGE_BOX + 1, 'x', s.party]);
});

test('a box monster takes a party monster\'s slot, also in a full party', () => {
  const s = saveWith(PARTY_MAX + 1), swapped = swapWithBox(s, 'm2', 'm6');
  assert.deepEqual([swapped.party, boxOf(swapped).map((m) => m.uid)], [['m0', 'm1', 'm6', 'm3', 'm4', 'm5'], ['m2']]);
  assert.equal(swapped.storage, s.storage);
  assert.throws(() => swapWithBox(s, 'm6', 'm2'), /not in the party/);
  assert.throws(() => swapWithBox(s, 'm2', 'm3'), /already in the party/);
  assert.throws(() => swapWithBox(s, 'm2', 'nope'), /no monster nope/);
});

test('deposit and withdraw keep at least one party monster and at most six', () => {
  const s = saveWith(PARTY_MAX + 1);
  assert.throws(() => withdraw(s, 'm6'), /背包已满/);
  const fewer = deposit(s, 'm0');
  assert.deepEqual(withdraw(fewer, 'm0').party, ['m1', 'm2', 'm3', 'm4', 'm5', 'm0']);
  assert.throws(() => withdraw(fewer, 'nope'), /no monster nope/);
  assert.throws(() => withdraw(fewer, 'm1'), /already in the party/);
  const one = saveWith(1);
  assert.throws(() => deposit(one, 'm0'), /at least one/);
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
  // m1 lacks only HP, m3 only PP (same skills, so the same PP keys) and m4 only a cleared status.
  s.storage[1] = {...s.storage[1], hp: 0};
  s.storage[3] = {...s.storage[3], pp: {1: 0}};
  s.storage[4] = {...s.storage[4], status: 'burn'};
  const unchanged = guard(s), fewer = {...s, party: s.party.slice(1)}, fewerUnchanged = guard(fewer);
  const changed = (next) => next.storage.filter((m) => !s.storage.includes(m)).map((m) => m.uid);
  const hatched = hatchEssence(s, essence, dex, rng(3)), healedSave = healAll(s, dex);
  assert.deepEqual(
    [addMonster(s, mon('new')), deposit(s, 'm0'), withdraw(fewer, 'm0'), setPartyOrder(s, [...s.party].reverse())].map(changed),
    [['new'], [], [], []]);
  assert.deepEqual([rename(s, 'm2', 'x'), healedSave, hatched.save].map(changed), [['m2'], ['m1', 'm3', 'm4'], [hatched.mon.uid]],
    'only m1, m3 and m4 need healing');
  for (const m of healedSave.storage) assert.deepEqual([m.hp, m.status, m.pp], [computeStats(m, dex).hp, null, {1: 11}], `${m.uid} is healed`);
  const refusals = [
    [() => addMonster(s, mon('m0')), /duplicate uid/], [() => withdraw(s, 'm6'), /背包已满/], [() => deposit(s, 'm6'), /not in the party/],
    [() => setPartyOrder(s, ['m0']), /permutation/],
    [() => rename(s, 'm0', '一二三四五六七八九十一二三'), /at most 12/], [() => hatchEssence(s, {...essence, id: 'none'}, dex, rng()), /no none left/],
  ];
  for (const [refused, error] of refusals) assert.throws(refused, error);
  unchanged();
  fewerUnchanged();
});
