import assert from 'node:assert/strict';
import test from 'node:test';
import {
  backupUnreadableSave, localSaveStore, readLocalSave, saveWriteProblem, saveWriteSettled, setSaveStore, subscribeSaveWriteProblem,
  UNREADABLE_SAVE_PREFIX, unreadableSaves, writeLocalSave,
} from './persistence.ts';

function memoryStorage() {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key),
    key: index => [...memory.keys()][index] ?? null, get length() { return memory.size; },
  };
  return memory;
}

test('the save round-trips through local storage', () => {
  memoryStorage();
  assert.equal(readLocalSave(), null);
  writeLocalSave('{"version":2}');
  assert.equal(readLocalSave(), '{"version":2}');
});

test('unreadable saves are kept under their own keys, never overwrite the save or each other, and are listed', () => {
  const memory = memoryStorage();
  writeLocalSave('not json');
  const first = backupUnreadableSave('not json'), second = backupUnreadableSave('also broken');
  assert.notEqual(first, second);
  assert(first.startsWith(UNREADABLE_SAVE_PREFIX) && second.startsWith(UNREADABLE_SAVE_PREFIX));
  assert.equal(memory.get(first), 'not json');
  assert.equal(memory.get(second), 'also broken');
  assert.equal(readLocalSave(), 'not json');
  assert.deepEqual(unreadableSaves(), [{ name: first, text: 'not json' }, { name: second, text: 'also broken' }]);
});

test('without local storage nothing is read, written, backed up or listed', () => {
  delete globalThis.localStorage;
  assert.equal(readLocalSave(), null);
  assert.doesNotThrow(() => writeLocalSave('x'));
  assert.equal(backupUnreadableSave('x'), null);
  assert.deepEqual(unreadableSaves(), []);
});

test('a write failure is kept until a later write succeeds, and listeners hear each change', () => {
  memoryStorage();
  let heard = 0;
  const stop = subscribeSaveWriteProblem(() => heard++);
  saveWriteSettled(new Error('QuotaExceededError'));
  saveWriteSettled(new Error('QuotaExceededError'));
  assert.equal(saveWriteProblem(), 'QuotaExceededError');
  assert.equal(heard, 1);
  writeLocalSave('{"version":5}');
  assert.equal(saveWriteProblem(), null);
  assert.equal(heard, 2);
  stop();
});

test('the entry point can replace the store', () => {
  const written = [];
  setSaveStore({ read: () => 'file save', write: text => written.push(text), keepUnreadable: () => 'unreadable-1.json', unreadable: () => [] });
  try {
    assert.equal(readLocalSave(), 'file save');
    writeLocalSave('next');
    assert.deepEqual(written, ['next']);
    assert.equal(backupUnreadableSave('bad'), 'unreadable-1.json');
  } finally {
    setSaveStore(localSaveStore);
  }
});
