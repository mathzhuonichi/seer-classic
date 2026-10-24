// The player's saves: the slot store (save-slots.ts) and the game of the active slot. Opening a slot, a new save or an import
// builds a new controller from that slot's save on the one game context, so nothing of the previous slot's game carries over.
// Design: design/notes/save-slots-2026-10-24.md.
import type { CatalogData } from '../domain/catalog/catalog.ts';
import type { GameController } from './contract.ts';
import { createGameContext, type GameContext, type GameDependencies } from './context.ts';
import { runGame } from './controller.ts';
import { saveWriteSettled } from './persistence.ts';
import { SAVE_VERSION, serialize, storedVersion } from './save.ts';
import { loadJourney, startJourney, summarize, type Journey, type JourneySlot } from './save-state.ts';
import type { SlotRecord, SlotStore } from './save-slots.ts';

/** The game being played and the slot it writes; `serial` counts the games this library has opened. */
export interface SaveSession { readonly game: GameController; readonly slotId: string | null; readonly serial: number }

export interface SaveLibrary {
  /** The game of the active slot; a new session after each switch. */
  current(): SaveSession;
  /** Every slot, in creation order. */
  slots(): readonly SlotRecord[];
  /** Hears a new session and every change to the slot list. */
  subscribe(listener: () => void): () => void;
  /** Starts a new journey in a new slot, which becomes active; the previous slot keeps its save. */
  newSave(): Promise<void>;
  /** Opens the slot's save as the game. A slot that cannot be read is marked so, the game stays, and this rejects with the reason. */
  load(id: string): Promise<void>;
  /** Deletes a slot other than the active one. */
  remove(id: string): Promise<void>;
  /** Opens a save file's text in a new slot, which becomes active. A text that cannot be read throws and changes nothing. */
  importSave(text: string): Promise<void>;
  /** The slot's save text: the game's latest for the active slot, else what is stored (an unreadable save as it was kept). */
  exportSlot(id: string): Promise<string>;
}

/** Why a slot switch is refused while a battle is open. */
export const SWITCH_IN_BATTLE = '战斗结束后才能切换存档。';

/** Why a stored save cannot be opened, in the player's words. */
function unreadableReason(text: string | null) {
  if (text === null) return '内容缺失';
  const version = storedVersion(text);
  if (version !== null && version > SAVE_VERSION) return `来自更新版本的游戏（存档格式 ${version}，本游戏为 ${SAVE_VERSION}）`;
  return '无法读取';
}

const writerFor = (store: SlotStore, id: string): JourneySlot => ({ write: (text, summary) => store.write(id, text, summary) });

/** Opens the library on `store`: the active slot's game, or a new journey in a new slot on a first start or after an unreadable one. */
export async function openSaveLibrary(catalog: CatalogData, store: SlotStore, dependencies: GameDependencies = {}): Promise<SaveLibrary> {
  const ctx = createGameContext(catalog, dependencies), listeners = new Set<() => void>(), notify = () => listeners.forEach(listener => listener());
  let session: SaveSession | null = null;
  const begin = (journey: Journey, slotId: string | null, notices: string[]) => {
    session = { game: runGame(ctx, journey, slotId === null ? null : writerFor(store, slotId), notices), slotId, serial: (session?.serial ?? 0) + 1 };
    notify();
  };
  const current = () => session!;
  const nameOf = (id: string) => store.slots().find(slot => slot.id === id)?.name ?? id;
  const noBattle = () => { if (session?.game.snapshot().battle) throw new Error(SWITCH_IN_BATTLE); };
  store.subscribe(notify);
  await openAtStart(ctx, store, begin);
  return {
    current, slots: store.slots,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async newSave() {
      noBattle();
      const journey = startJourney(ctx), record = await store.create(serialize(journey.save), summarize(journey.save));
      begin(journey, record.id, [`新存档「${record.name}」已开始。`]);
    },
    async load(id) {
      noBattle();
      if (id === current().slotId) return;
      const opened = await readSlot(ctx, store, id);
      if (typeof opened === 'string') throw new Error(`「${nameOf(id)}」${opened}。`);
      await store.activate(id);
      begin(opened, id, [`已读取「${nameOf(id)}」。`]);
    },
    async remove(id) {
      if (id === current().slotId) throw new Error('当前存档不能删除。');
      await store.remove(id);
    },
    async importSave(text) {
      noBattle();
      const journey = loadJourney(ctx, text), record = await store.create(text, summarize(journey.save));
      begin(journey, record.id, [`存档已导入为「${record.name}」。`]);
    },
    exportSlot: async id => id === current().slotId ? current().game.exportSave() : (await store.read(id)) ?? '',
  };
}

/** The slot's journey, or why it cannot be read; an unreadable slot is marked so (its save is never written). */
async function readSlot(ctx: GameContext, store: SlotStore, id: string): Promise<Journey | string> {
  const text = await store.read(id);
  try {
    if (text === null) throw new Error('missing document');
    return loadJourney(ctx, text);
  } catch {
    const reason = unreadableReason(text);
    await store.markUnreadable(id, reason).catch(() => {});
    return reason;
  }
}

/**
 * The first game: the active slot's, or a new journey in a new slot when there is none or the active one cannot be read. When
 * storage refuses the new slot, the journey stays in memory and the refusal is reported (slot store), so the player can export.
 */
async function openAtStart(ctx: GameContext, store: SlotStore, begin: (journey: Journey, slotId: string | null, notices: string[]) => void) {
  const active = store.activeId(), opened = active === null ? null : await readSlot(ctx, store, active);
  if (opened !== null && typeof opened !== 'string') return begin(opened, active, []);
  const journey = startJourney(ctx), name = active && store.slots().find(slot => slot.id === active)?.name;
  try {
    const record = await store.create(serialize(journey.save), summarize(journey.save));
    begin(journey, record.id, name ? [`「${name}」${opened}，已原样保留，可在设置中导出；已开始新存档「${record.name}」。`] : []);
  } catch (error) {
    saveWriteSettled(error);
    begin(journey, null, name ? [`「${name}」${opened}，已原样保留，可在设置中导出。`] : []);
  }
}
