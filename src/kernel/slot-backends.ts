// Where the save slots are kept (save-slots.ts): the browser's IndexedDB, or memory when it cannot be opened (and in the preview
// and the tests). Design: design/notes/save-slots-2026-10-24.md.
import { saveWriteSettled } from './persistence.ts';
import { applyChange, openSlotStore, type SlotBackend, type SlotChange, type StoredSlots } from './save-slots.ts';

/** The IndexedDB layout: the database, its version, its object stores and the key of the active slot's id. */
export const SLOT_DATABASE = { name: 'seer-classic-saves', version: 1, slots: 'slots', documents: 'documents', meta: 'meta', activeKey: 'active' } as const;
const STORES = [SLOT_DATABASE.slots, SLOT_DATABASE.documents, SLOT_DATABASE.meta];

/** Slots kept in this page's memory: they end with it. */
export function memoryBackend(): SlotBackend {
  let stored: StoredSlots = { records: [], active: undefined, documents: [] };
  const texts = new Map<string, string>();
  const apply = (change: SlotChange | null) => {
    stored = applyChange(stored, change);
    for (const { record, text } of change?.put ?? []) if (text !== undefined) texts.set(record.id, text);
    for (const id of change?.remove ?? []) texts.delete(id);
  };
  return {
    apply: async change => apply(change),
    update: async plan => { apply(plan(stored)); return stored; },
    read: async id => texts.get(id),
  };
}

function request<T>(pending: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    pending.onsuccess = () => resolve(pending.result);
    pending.onerror = () => reject(pending.error);
  });
}

/** Resolves when the transaction commits and rejects with its error (QuotaExceededError when storage is full) when it aborts. */
function settled(transaction: IDBTransaction, refusal: () => unknown = () => undefined) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(refusal() ?? transaction.error ?? new DOMException('The save transaction was aborted.', 'AbortError'));
  });
}

function put(transaction: IDBTransaction, change: SlotChange) {
  const slots = transaction.objectStore(SLOT_DATABASE.slots), documents = transaction.objectStore(SLOT_DATABASE.documents);
  for (const { record, text } of change.put ?? []) {
    slots.put(record);
    if (text !== undefined) documents.put(text, record.id);
  }
  for (const id of change.remove ?? []) { slots.delete(id); documents.delete(id); }
  if (change.active !== undefined) transaction.objectStore(SLOT_DATABASE.meta).put(change.active, SLOT_DATABASE.activeKey);
}

/**
 * Slots in IndexedDB. Every transaction spans the three stores, so transactions apply in the order they are made, across pages
 * too. A save write puts its record and document at once and asks the transaction to commit, before control returns to the page.
 */
export async function indexedDbBackend(factory: IDBFactory = indexedDB): Promise<SlotBackend> {
  const opening = factory.open(SLOT_DATABASE.name, SLOT_DATABASE.version);
  opening.onupgradeneeded = () => {
    const db = opening.result;
    db.createObjectStore(SLOT_DATABASE.slots, { keyPath: 'id' });
    db.createObjectStore(SLOT_DATABASE.documents);
    db.createObjectStore(SLOT_DATABASE.meta);
  };
  const db = await request(opening);
  // A later version upgrading the database closes this connection; this page's writes then fail and are reported.
  db.onversionchange = () => db.close();
  return {
    async apply(change) {
      const transaction = db.transaction(STORES, 'readwrite'), done = settled(transaction);
      try {
        put(transaction, change);
      } catch (error) {
        // A request refused as it is made would leave the others to commit alone.
        transaction.abort();
        throw error;
      }
      transaction.commit?.();
      return done;
    },
    async update(plan) {
      const transaction = db.transaction(STORES, 'readwrite');
      const records = transaction.objectStore(SLOT_DATABASE.slots).getAll(), active = transaction.objectStore(SLOT_DATABASE.meta).get(SLOT_DATABASE.activeKey);
      const documents = transaction.objectStore(SLOT_DATABASE.documents).getAllKeys();
      let after: StoredSlots | undefined, refused: unknown;
      const done = settled(transaction, () => refused);
      // Requests complete in order, so the last one's handler sees every result while the transaction is still active.
      documents.onsuccess = () => {
        const stored = { records: records.result, active: active.result, documents: documents.result.map(String) };
        try {
          const change = plan(stored);
          after = applyChange(stored, change);
          if (change) put(transaction, change);
        } catch (error) {
          refused = error;
          transaction.abort();
        }
      };
      await done;
      return after!;
    },
    async read(id) {
      const text = await request(db.transaction(SLOT_DATABASE.documents, 'readonly').objectStore(SLOT_DATABASE.documents).get(id));
      return typeof text === 'string' ? text : undefined;
    },
  };
}

/**
 * The browser's slot store. When IndexedDB cannot be opened (a blocked or broken site storage), the slots are kept in memory,
 * adopting the pre-slot save from local storage, and the failure is reported to the shell: the player can play and export.
 */
export async function openBrowserSlotStore() {
  try {
    return await openSlotStore(await indexedDbBackend());
  } catch (error) {
    saveWriteSettled(error);
    return openSlotStore(memoryBackend());
  }
}
