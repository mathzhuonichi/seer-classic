import assert from 'node:assert/strict';
import test from 'node:test';
import { backupUnreadableSave, readLocalSave, UNREADABLE_SAVE_PREFIX, writeLocalSave } from './persistence.ts';

function memoryStorage() {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key),
  };
  return memory;
}

test('the save round-trips through local storage', () => {
  memoryStorage();
  assert.equal(readLocalSave(), null);
  writeLocalSave('{"version":2}');
  assert.equal(readLocalSave(), '{"version":2}');
});

test('unreadable saves are kept under their own keys and never overwrite the save or each other', () => {
  const memory = memoryStorage();
  writeLocalSave('not json');
  const first = backupUnreadableSave('not json'), second = backupUnreadableSave('also broken');
  assert.notEqual(first, second);
  assert(first.startsWith(UNREADABLE_SAVE_PREFIX) && second.startsWith(UNREADABLE_SAVE_PREFIX));
  assert.equal(memory.get(first), 'not json');
  assert.equal(memory.get(second), 'also broken');
  assert.equal(readLocalSave(), 'not json');
});

test('without local storage nothing is read, written or backed up', () => {
  delete globalThis.localStorage;
  assert.equal(readLocalSave(), null);
  assert.doesNotThrow(() => writeLocalSave('x'));
  assert.equal(backupUnreadableSave('x'), null);
});
