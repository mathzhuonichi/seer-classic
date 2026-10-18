import assert from 'node:assert/strict';
import test from 'node:test';
import { reuseUnchanged } from './structural-sharing.ts';

test('an equal rebuild returns the previous value itself', () => {
  const prev = { monsters: [{ uid: 'a', hp: 10, skills: [1, 2] }], coins: 5, battle: null };
  assert.equal(reuseUnchanged(prev, structuredClone(prev)), prev);
  assert.equal(reuseUnchanged([1, 'x', null], [1, 'x', null]).length, 3);
});

test('changed parts are new and unchanged siblings keep their identity', () => {
  const prev = { monsters: [{ uid: 'a', hp: 10 }, { uid: 'b', hp: 7 }], party: ['a'], coins: 5 };
  const next = reuseUnchanged(prev, { monsters: [{ uid: 'a', hp: 10 }, { uid: 'b', hp: 3 }], party: ['a'], coins: 5 });
  assert.notEqual(next, prev);
  assert.notEqual(next.monsters, prev.monsters);
  assert.equal(next.monsters[0], prev.monsters[0]);
  assert.deepEqual(next.monsters[1], { uid: 'b', hp: 3 });
  assert.equal(next.party, prev.party);
});

test('added, removed and renamed keys and resized arrays are changes', () => {
  assert.deepEqual(reuseUnchanged({ a: 1 }, { a: 1, b: undefined }), { a: 1, b: undefined });
  assert.deepEqual(reuseUnchanged({ a: undefined }, { b: undefined }), { b: undefined });
  const prev = { list: [{ id: 1 }, { id: 2 }] };
  const shorter = reuseUnchanged(prev, { list: [{ id: 1 }] });
  assert.equal(shorter.list.length, 1);
  assert.equal(shorter.list[0], prev.list[0]);
  const longer = reuseUnchanged(prev, { list: [{ id: 1 }, { id: 2 }, { id: 3 }] });
  assert.deepEqual(longer.list.map(row => row.id), [1, 2, 3]);
  assert.equal(longer.list[1], prev.list[1]);
});

test('arrays and objects never stand in for each other, and other objects keep their own identity', () => {
  assert.deepEqual(reuseUnchanged({ value: [] }, { value: {} }).value, {});
  const map = new Map([[1, 2]]);
  assert.equal(reuseUnchanged({ value: new Map([[1, 2]]) }, { value: map }).value, map);
});

test('neither argument is modified', () => {
  const prev = { rows: [{ id: 1 }, { id: 2 }] }, next = { rows: [{ id: 1 }, { id: 3 }] };
  const prevText = JSON.stringify(prev), nextRow = next.rows[0];
  reuseUnchanged(prev, next);
  assert.equal(JSON.stringify(prev), prevText);
  assert.equal(next.rows[0], nextRow);
});
