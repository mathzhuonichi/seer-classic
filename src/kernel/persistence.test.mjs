import assert from 'node:assert/strict';
import test from 'node:test';
import {
  forgetLegacySaves, LEGACY_SAVE_KEY, LEGACY_UNREADABLE_PREFIX, readLegacySaves, saveWriteProblem, saveWriteSettled,
  subscribeSaveWriteProblem,
} from './persistence.ts';

function memoryStorage(entries = {}) {
  const memory = new Map(Object.entries(entries));
  globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key),
    key: index => [...memory.keys()][index] ?? null, get length() { return memory.size; },
  };
  return memory;
}

test('the pre-slot save and its kept unreadable saves are read, oldest first, and nothing is written', () => {
  const second = `${LEGACY_UNREADABLE_PREFIX}1760000000002-2`, first = `${LEGACY_UNREADABLE_PREFIX}1760000000001-1`;
  const memory = memoryStorage({ [LEGACY_SAVE_KEY]: '{"version":5}', [second]: 'also broken', [first]: 'not json', other: 'x' });
  const before = [...memory];
  assert.deepEqual(readLegacySaves(), { save: '{"version":5}', unreadable: [{ key: first, text: 'not json' }, { key: second, text: 'also broken' }] });
  assert.deepEqual([...memory], before);
});

test('forgetting the adopted saves deletes only the keys that still hold what was adopted', () => {
  const kept = `${LEGACY_UNREADABLE_PREFIX}1760000000001-1`, changed = `${LEGACY_UNREADABLE_PREFIX}1760000000002-2`;
  const memory = memoryStorage({ [LEGACY_SAVE_KEY]: '{"version":5}', [kept]: 'not json', [changed]: 'also broken', other: 'x' });
  const adopted = readLegacySaves();
  memory.set(changed, 'rewritten by an older build');
  forgetLegacySaves(adopted);
  assert.deepEqual([...memory], [[changed, 'rewritten by an older build'], ['other', 'x']]);
  memory.set(LEGACY_SAVE_KEY, '{"version":5,"seed":2}');
  forgetLegacySaves(adopted);
  assert.equal(memory.get(LEGACY_SAVE_KEY), '{"version":5,"seed":2}', 'a pre-slot save written after the adoption is kept');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
  assert.doesNotThrow(() => forgetLegacySaves(adopted), 'a blocked local storage keeps its keys quietly');
  delete globalThis.localStorage;
});

test('an emptied pre-slot save is read as an empty text, not as no save', () => {
  memoryStorage({ [LEGACY_SAVE_KEY]: '' });
  assert.equal(readLegacySaves().save, '');
});

test('without local storage, or when it is blocked, there is no pre-slot save', () => {
  delete globalThis.localStorage;
  assert.deepEqual(readLegacySaves(), { save: null, unreadable: [] });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
  assert.deepEqual(readLegacySaves(), { save: null, unreadable: [] });
  delete globalThis.localStorage;
});

test('a write failure is kept until a later write succeeds, and listeners hear each change', () => {
  let heard = 0;
  const stop = subscribeSaveWriteProblem(() => heard++);
  saveWriteSettled(new DOMException('', 'QuotaExceededError'));
  saveWriteSettled(new DOMException('', 'QuotaExceededError'));
  assert.equal(saveWriteProblem(), 'QuotaExceededError', 'an error without a message is named');
  assert.equal(heard, 1);
  saveWriteSettled();
  assert.equal(saveWriteProblem(), null);
  assert.equal(heard, 2);
  stop();
});
