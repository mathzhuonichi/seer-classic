// The save slots: one record and one document (the save's text, in the save format of save.ts) per slot, and the active slot's
// id, kept by a SlotBackend (IndexedDB in the browser, slot-backends.ts). The store moves text and never reads a save; the game
// layer (save-library.ts) decides what a slot holds. Design: design/notes/save-slots-2026-10-24.md.
import { LEGACY_UNREADABLE_PREFIX, readLegacySaves, saveWriteSettled, type LegacySaves } from './persistence.ts';

/** What the slot list shows of a save without opening it; the game writes it with every save. */
export interface SlotSummary { monsters: number; topLevel: number; owned: number; cleared: number }

export interface SlotRecord {
  /** Sorts in creation order: the creation time and a counter in base 36, then a random tail. */
  readonly id: string;
  readonly name: string;
  /** When the slot's document was last written (ISO 8601); null before the game first writes it. */
  readonly savedAt: string | null;
  readonly summary: SlotSummary | null;
  /** Why the slot's save could not be opened, in the player's words; null while it can. The game never writes such a slot. */
  readonly unreadable: string | null;
}

/** One atomic change: records stored (each with its document's text when that changes), slots deleted, the active slot set. */
export interface SlotChange {
  readonly put?: readonly { record: SlotRecord; text?: string }[];
  readonly remove?: readonly string[];
  readonly active?: string;
}

/** What a backend holds, besides the documents' text: records as stored (not yet checked), the active id and the document ids. */
export interface StoredSlots { readonly records: readonly unknown[]; readonly active: unknown; readonly documents: readonly string[] }

export interface SlotBackend {
  /** Applies `change` without reading first, all of it or none: the save writes. Rejects when the storage refuses it. */
  apply(change: SlotChange): Promise<void>;
  /**
   * In one atomic transaction, reads what is stored, asks `plan` for the change (null for none; a throw refuses it and the
   * transaction applies nothing) and applies it. Resolves to what is stored afterwards.
   */
  update(plan: (stored: StoredSlots) => SlotChange | null): Promise<StoredSlots>;
  /** A document's text; undefined when the slot has none. */
  read(id: string): Promise<string | undefined>;
}

/** What `change` leaves of `stored`; both backends report their state through it. */
export function applyChange(stored: StoredSlots, change: SlotChange | null): StoredSlots {
  if (!change) return stored;
  const puts = change.put ?? [], removed = new Set(change.remove), replaced = new Set([...removed, ...puts.map(({ record }) => record.id)]);
  const written = puts.filter(({ text }) => text !== undefined).map(({ record }) => record.id);
  return {
    records: [...stored.records.filter(record => !replaced.has(recordId(record) ?? '')), ...puts.map(({ record }) => record)],
    active: change.active ?? stored.active,
    documents: [...new Set([...stored.documents.filter(id => !removed.has(id)), ...written])],
  };
}

const recordId = (value: unknown) => {
  const id = typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : undefined;
  return typeof id === 'string' ? id : undefined;
};
const isCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;
const isSummary = (value: unknown): value is SlotSummary => typeof value === 'object' && value !== null
  && ['monsters', 'topLevel', 'owned', 'cleared'].every(key => isCount((value as Record<string, unknown>)[key]));
const textOrNull = (value: unknown) => typeof value === 'string' ? value : null;

/** A stored record in its checked shape, or null when it is not one. */
function asRecord(value: unknown): SlotRecord | null {
  const raw = value as Partial<Record<keyof SlotRecord, unknown>> | null;
  if (typeof raw !== 'object' || raw === null || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  return { id: raw.id, name: raw.name, savedAt: textOrNull(raw.savedAt), summary: isSummary(raw.summary) ? raw.summary : null,
    unreadable: textOrNull(raw.unreadable) };
}

let created = 0;
const ID_TIME_DIGITS = 9, ID_COUNTER_DIGITS = 4, ID_COUNTER_WRAP = 36 ** ID_COUNTER_DIGITS, ID_TAIL_DIGITS = 6;
function newSlotId() {
  const time = Date.now().toString(36).padStart(ID_TIME_DIGITS, '0');
  const counter = (created++ % ID_COUNTER_WRAP).toString(36).padStart(ID_COUNTER_DIGITS, '0');
  return `${time}${counter}-${Math.random().toString(36).slice(2, 2 + ID_TAIL_DIGITS)}`;
}

const SLOT_NAME = /^存档 (\d+)$/;
/** 「存档 n」, one past the highest such name listed. */
export function nextSlotName(slots: readonly { name: string }[]) {
  const numbers = slots.map(slot => Number(SLOT_NAME.exec(slot.name)?.[1] ?? 0));
  return `存档 ${Math.max(0, ...numbers) + 1}`;
}

/** The reason recorded for an unreadable save that the versions before slots kept aside. */
export const LEGACY_UNREADABLE_REASON = '旧版本中无法读取，已原样保留';

const newRecord = (name: string, fields: Partial<SlotRecord> = {}): SlotRecord =>
  ({ id: newSlotId(), name, savedAt: null, summary: null, unreadable: null, ...fields });

/** When a pre-slot unreadable save was kept, from its key; null when the key does not say. */
function keptAt(key: string) {
  const time = Number(key.slice(LEGACY_UNREADABLE_PREFIX.length).split('-')[0]);
  return Number.isSafeInteger(time) && time > 0 ? new Date(time).toISOString() : null;
}

/** The first slots of an empty store: the pre-slot save, active, then its kept unreadable saves, each text unchanged. */
function adoption(legacy: LegacySaves): SlotChange | null {
  const put: { record: SlotRecord; text: string }[] = [];
  if (legacy.save !== null) put.push({ record: newRecord(nextSlotName([])), text: legacy.save });
  for (const { key, text } of legacy.unreadable) {
    put.push({ record: newRecord(nextSlotName(put.map(({ record }) => record)), { savedAt: keptAt(key), unreadable: LEGACY_UNREADABLE_REASON }), text });
  }
  return put.length ? { put, active: put[0].record.id } : null;
}

/**
 * Opening a store: an empty one adopts the pre-slot saves; a document without a readable record gets a record, so that no
 * stored save goes unlisted; an active id that names no slot falls back to the first slot.
 */
function openingChange(stored: StoredSlots): SlotChange | null {
  const records = stored.records.map(asRecord).filter(record => record !== null);
  if (!records.length && !stored.documents.length) return adoption(readLegacySaves());
  const listed = new Set(records.map(record => record.id)), put: { record: SlotRecord }[] = [];
  for (const id of stored.documents.filter(id => !listed.has(id)).sort()) {
    put.push({ record: { ...newRecord(nextSlotName([...records, ...put.map(({ record }) => record)])), id } });
  }
  const ids = [...listed, ...put.map(({ record }) => record.id)].sort();
  const active = typeof stored.active === 'string' && ids.includes(stored.active) ? undefined : ids[0];
  return put.length || active !== undefined ? { put, ...(active === undefined ? {} : { active }) } : null;
}

export interface SlotStore {
  /** Every slot, in creation order; a new array after each change. */
  slots(): readonly SlotRecord[];
  /** The slot this page's game writes; null while there is none. */
  activeId(): string | null;
  subscribe(listener: () => void): () => void;
  /** The slot's stored text; null when it has none. */
  read(id: string): Promise<string | null>;
  /** Adds a slot holding `text` and makes it the active slot, in one atomic change. */
  create(text: string, summary: SlotSummary): Promise<SlotRecord>;
  activate(id: string): Promise<void>;
  /** Stores the game's save in the slot; the outcome is reported to the shell (persistence.ts). */
  write(id: string, text: string, summary: SlotSummary): Promise<void>;
  /** Records why the slot cannot be opened; its document is kept as it is. */
  markUnreadable(id: string, reason: string): Promise<void>;
  /** Deletes a slot and its document. Refused for this page's active slot, and for the stored active slot, which another page may play. */
  remove(id: string): Promise<void>;
}

/** Why `remove` refused a slot. */
export const SLOT_IN_USE = '这个存档正在使用中，不能删除。';

/** Opens the store on `backend`, adopting the pre-slot saves into an empty one. */
export async function openSlotStore(backend: SlotBackend): Promise<SlotStore> {
  const listeners = new Set<() => void>();
  let slots: readonly SlotRecord[] = [], active: string | null = null;
  const show = (next: readonly SlotRecord[], nextActive = active) => {
    slots = [...next].sort((a, b) => a.id < b.id ? -1 : 1);
    active = nextActive;
    listeners.forEach(listener => listener());
  };
  const stored = await backend.update(openingChange), records = stored.records.map(asRecord).filter(record => record !== null);
  show(records, typeof stored.active === 'string' && records.some(record => record.id === stored.active) ? stored.active : null);
  const find = (id: string) => {
    const record = slots.find(slot => slot.id === id);
    if (!record) throw new Error(`no save slot ${id}`);
    return record;
  };
  const replace = (record: SlotRecord) => show(slots.map(slot => slot.id === record.id ? record : slot));
  return {
    slots: () => slots,
    activeId: () => active,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    read: async id => (await backend.read(id)) ?? null,
    async create(text, summary) {
      const record = newRecord(nextSlotName(slots), { savedAt: new Date().toISOString(), summary });
      await backend.apply({ put: [{ record, text }], active: record.id });
      show([...slots, record], record.id);
      return record;
    },
    async activate(id) {
      find(id);
      await backend.apply({ active: id });
      show(slots, id);
    },
    async write(id, text, summary) {
      const record = { ...find(id), savedAt: new Date().toISOString(), summary, unreadable: null };
      try {
        await backend.apply({ put: [{ record, text }] });
      } catch (error) {
        saveWriteSettled(error);
        throw error;
      }
      saveWriteSettled();
      if (slots.some(slot => slot.id === id)) replace(record);
    },
    async markUnreadable(id, reason) {
      const record = { ...find(id), unreadable: reason };
      replace(record);
      await backend.apply({ put: [{ record }] });
    },
    async remove(id) {
      find(id);
      if (id === active) throw new Error(SLOT_IN_USE);
      await backend.update(now => { if (now.active === id) throw new Error(SLOT_IN_USE); return { remove: [id] }; });
      show(slots.filter(slot => slot.id !== id));
    },
  };
}
