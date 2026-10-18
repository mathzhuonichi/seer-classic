import assert from 'node:assert/strict';
import test from 'node:test';
import { afterNextFrame, backupUnreadableSave, onPageExit, readLocalSave, UNREADABLE_SAVE_PREFIX, writeLocalSave } from './persistence.ts';

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

/** A page with pending frames, a visibility state and window and document listeners; `remove` restores Node's globals. */
function fakePage() {
  const page = { frames: [], window: {}, document: {}, visibilityState: 'visible' };
  const on = listeners => (type, listener) => (listeners[type] ??= []).push(listener);
  globalThis.requestAnimationFrame = callback => page.frames.push(callback);
  globalThis.addEventListener = on(page.window);
  globalThis.document = { get visibilityState() { return page.visibilityState; }, addEventListener: on(page.document) };
  page.remove = () => { for (const name of ['requestAnimationFrame', 'addEventListener', 'document']) delete globalThis[name]; };
  return page;
}

test('a save write waits for the painted frame, but is not scheduled on a hidden page or without frames', async () => {
  const page = fakePage(), writes = [];
  try {
    assert.equal(afterNextFrame(() => writes.push('visible')), true);
    assert.deepEqual(writes, []);
    page.frames.shift()();
    assert.deepEqual(writes, [], 'the write follows the frame in a task of its own');
    await new Promise(resolve => setTimeout(resolve));
    assert.deepEqual(writes, ['visible']);
    page.visibilityState = 'hidden';
    assert.equal(afterNextFrame(() => writes.push('hidden')), false, 'a hidden page leaves the write to its caller');
  } finally { page.remove(); }
  assert.equal(afterNextFrame(() => writes.push('node')), false, 'Node has no frames');
  assert.deepEqual(writes, ['visible']);
  assert.deepEqual(page.frames, []);
});

test('a page exit flushes on pagehide, beforeunload and hiding, but not on showing the page', () => {
  const page = fakePage();
  let flushes = 0;
  try {
    onPageExit(() => flushes++);
    page.window.pagehide.forEach(listener => listener());
    page.window.beforeunload.forEach(listener => listener());
    assert.equal(flushes, 2);
    page.document.visibilitychange.forEach(listener => listener());
    assert.equal(flushes, 2, 'a visible page keeps its pending write');
    page.visibilityState = 'hidden';
    page.document.visibilitychange.forEach(listener => listener());
    assert.equal(flushes, 3);
  } finally { page.remove(); }
  assert.doesNotThrow(() => onPageExit(() => flushes++), 'without a page nothing is registered');
});
