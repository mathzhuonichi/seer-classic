import assert from 'node:assert/strict';
import test from 'node:test';
import { LEGACY_SAVE_KEY, LEGACY_UNREADABLE_PREFIX, saveWriteProblem } from './persistence.ts';
import { LEGACY_UNREADABLE_REASON, nextSlotName, openSlotStore, SLOT_IN_USE } from './save-slots.ts';
import { memoryBackend } from './slot-backends.ts';

const SUMMARY = { monsters: 3, topLevel: 5, owned: 3, cleared: 0 };
const RAISED = { monsters: 40, topLevel: 100, owned: 52, cleared: 9 };

/** Local storage as the browser's: a map behind the Storage methods. */
function localStorageWith(entries = {}) {
  const memory = new Map(Object.entries(entries));
  globalThis.localStorage = {
    getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key),
    key: index => [...memory.keys()][index] ?? null, get length() { return memory.size; },
  };
  return memory;
}

/** A memory backend whose documents may hold at most `limit` characters in all, like a full browser storage. */
function limitedBackend(limit) {
  const inner = memoryBackend(), sizes = new Map();
  const refuse = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  const fits = change => {
    const next = new Map(sizes);
    for (const id of change?.remove ?? []) next.delete(id);
    for (const { record, text } of change?.put ?? []) if (text !== undefined) next.set(record.id, text.length);
    return [[...next.values()].reduce((sum, size) => sum + size, 0) <= limit, next];
  };
  return {
    ...inner,
    async apply(change) {
      const [ok, next] = fits(change);
      if (!ok) throw refuse();
      await inner.apply(change);
      sizes.clear(); for (const [id, size] of next) sizes.set(id, size);
    },
    update: plan => inner.update(stored => {
      const change = plan(stored), [ok, next] = fits(change);
      if (!ok) throw refuse();
      sizes.clear(); for (const [id, size] of next) sizes.set(id, size);
      return change;
    }),
  };
}

test('a first start without a pre-slot save has no slot; each new slot is named after the highest and becomes active', async () => {
  localStorageWith();
  const store = await openSlotStore(memoryBackend());
  assert.deepEqual([store.slots(), store.activeId()], [[], null]);
  const first = await store.create('{"a":1}', SUMMARY), second = await store.create('{"b":2}', RAISED);
  assert.deepEqual(store.slots().map(slot => [slot.name, slot.summary]), [['存档 1', SUMMARY], ['存档 2', RAISED]]);
  assert.equal(store.activeId(), second.id);
  assert.equal(await store.read(first.id), '{"a":1}');
  assert(first.savedAt && first.id < second.id, 'slots sort in creation order');
  assert.equal(nextSlotName([{ name: '存档 7' }, { name: '我的存档' }]), '存档 8');
});

test('the pre-slot save is adopted unchanged as the active 存档 1, its unreadable saves after it, and local storage is left as it was', async () => {
  const kept = `${LEGACY_UNREADABLE_PREFIX}1760000000000-1`, save = '{"version":5,"seed":7}';
  const memory = localStorageWith({ [LEGACY_SAVE_KEY]: save, [kept]: 'not json' }), before = [...memory];
  const backend = memoryBackend(), store = await openSlotStore(backend), [adopted, unreadable] = store.slots();
  assert.equal(store.slots().length, 2);
  assert.deepEqual([adopted.name, adopted.unreadable, adopted.savedAt, store.activeId()], ['存档 1', null, null, adopted.id]);
  assert.equal(await store.read(adopted.id), save, 'the text is the pre-slot save, byte for byte');
  assert.deepEqual([unreadable.name, unreadable.unreadable, unreadable.savedAt], ['存档 2', LEGACY_UNREADABLE_REASON, new Date(1760000000000).toISOString()]);
  assert.equal(await store.read(unreadable.id), 'not json');
  assert.deepEqual([...memory], before, 'the pre-slot keys are neither changed nor deleted');
  memory.set(LEGACY_SAVE_KEY, '{"version":5,"seed":8}');
  const reopened = await openSlotStore(backend);
  assert.deepEqual(reopened.slots(), store.slots(), 'a store with slots adopts nothing again');
  assert.equal(reopened.activeId(), adopted.id);
});

test('an emptied pre-slot save is adopted as a slot, not dropped', async () => {
  localStorageWith({ [LEGACY_SAVE_KEY]: '' });
  const store = await openSlotStore(memoryBackend());
  assert.equal(await store.read(store.activeId()), '');
});

test('switching, writing and deleting slots persist; the active slot and the stored active slot cannot be deleted', async () => {
  localStorageWith();
  const backend = memoryBackend(), store = await openSlotStore(backend);
  const first = await store.create('one', SUMMARY), second = await store.create('two', SUMMARY), third = await store.create('three', SUMMARY);
  await store.activate(first.id);
  await store.write(first.id, 'one, raised', RAISED);
  assert.equal(saveWriteProblem(), null);
  const reopened = await openSlotStore(backend);
  assert.equal(reopened.activeId(), first.id, 'the active slot survives a reload');
  assert.deepEqual(reopened.slots()[0].summary, RAISED);
  assert.equal(await reopened.read(first.id), 'one, raised');
  await assert.rejects(store.remove(first.id), { message: SLOT_IN_USE });
  await backend.apply({ active: second.id });
  await assert.rejects(store.remove(second.id), { message: SLOT_IN_USE }, 'another page made it active');
  await store.remove(third.id);
  assert.deepEqual(store.slots().map(slot => slot.id), [first.id, second.id]);
  assert.equal(await store.read(third.id), null, 'its document is deleted with it');
  assert.deepEqual((await openSlotStore(backend)).slots().map(slot => slot.id), [first.id, second.id]);
});

test('a write that storage refuses is reported and keeps the stored save; the next write that fits clears the report', async () => {
  localStorageWith();
  const store = await openSlotStore(limitedBackend(10)), slot = await store.create('12345', SUMMARY);
  await assert.rejects(store.write(slot.id, '12345678901', RAISED), { name: 'QuotaExceededError' });
  assert.equal(saveWriteProblem(), 'The quota has been exceeded.');
  assert.equal(await store.read(slot.id), '12345');
  assert.deepEqual(store.slots()[0].summary, SUMMARY, 'the list keeps what is stored');
  await store.write(slot.id, '1234567', RAISED);
  assert.equal(saveWriteProblem(), null);
  assert.equal(await store.read(slot.id), '1234567');
});

test('a new slot that storage refuses is not added and the active slot stays', async () => {
  localStorageWith();
  const backend = limitedBackend(10), store = await openSlotStore(backend), slot = await store.create('12345', SUMMARY);
  await assert.rejects(store.create('123456', SUMMARY), { name: 'QuotaExceededError' });
  assert.deepEqual([store.slots().length, store.activeId()], [1, slot.id]);
  assert.deepEqual((await openSlotStore(backend)).slots().map(slot => slot.id), [slot.id]);
});

test('an unreadable slot keeps its document and its reason across a reload', async () => {
  localStorageWith();
  const backend = memoryBackend(), store = await openSlotStore(backend), slot = await store.create('{"version":99}', SUMMARY);
  await store.markUnreadable(slot.id, '来自更新版本的游戏');
  const reopened = await openSlotStore(backend);
  assert.equal(reopened.slots()[0].unreadable, '来自更新版本的游戏');
  assert.equal(await reopened.read(slot.id), '{"version":99}');
});

test('opening lists a document without a record and moves an active id that names no slot to the first slot', async () => {
  localStorageWith({ [LEGACY_SAVE_KEY]: 'never adopted: the store is not empty' });
  const backend = memoryBackend(), named = { id: 'b', name: '存档 4', savedAt: null, summary: null, unreadable: null };
  await backend.apply({ put: [{ record: named, text: 'kept' }, { record: { id: 'a', name: 7 }, text: 'orphan' }], active: 'gone' });
  const store = await openSlotStore(backend);
  assert.deepEqual(store.slots().map(slot => [slot.id, slot.name]), [['a', '存档 5'], ['b', '存档 4']]);
  assert.equal(store.activeId(), 'a');
  assert.equal(await store.read('a'), 'orphan');
});
