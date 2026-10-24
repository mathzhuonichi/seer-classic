// Where the save is stored: the browser's local storage by default, or the store the entry point sets (the desktop app's save
// files, src/app/desktop-saves.ts). The kernel reads and writes through the store; write failures are reported to the shell.
const SAVE_KEY = 'seer-classic-save-v1';
/** Unreadable saves are copied under this prefix before a new journey replaces them. */
export const UNREADABLE_SAVE_PREFIX = `${SAVE_KEY}.unreadable.`;
/** Set by the desktop app (src/app/desktop-saves.ts) once the save under SAVE_KEY has become its save file. */
export const IMPORTED_SAVE_KEY = `${SAVE_KEY}.imported`;

/** An unreadable save kept beside the save: its key or file name and its text. */
export interface UnreadableSave { name: string; text: string }

export interface SaveStore {
  /** The stored save's text; null on a first start. */
  read(): string | null;
  /**
   * Stores the save's text. A refusal throws; a store that finishes later reports the outcome through `saveWriteSettled`
   * instead.
   */
  write(text: string): void;
  /** Keeps an unreadable save under a name of its own, never overwriting an earlier one; returns the name. */
  keepUnreadable(text: string): string | null;
  /** The unreadable saves kept so far. */
  unreadable(): UnreadableSave[];
}

let backups = 0;
const localStorageReady = () => typeof localStorage !== 'undefined';

/** The browser's local storage: the save under SAVE_KEY, unreadable saves under UNREADABLE_SAVE_PREFIX. */
export const localSaveStore: SaveStore = {
  read: () => localStorageReady() ? localStorage.getItem(SAVE_KEY) : null,
  write(text) {
    if (!localStorageReady()) return;
    localStorage.setItem(SAVE_KEY, text);
    saveWriteSettled();
  },
  keepUnreadable(text) {
    if (!localStorageReady()) return null;
    const key = `${UNREADABLE_SAVE_PREFIX}${Date.now()}-${++backups}`;
    localStorage.setItem(key, text);
    return key;
  },
  unreadable() {
    if (!localStorageReady()) return [];
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) ?? '');
    return keys.filter(key => key.startsWith(UNREADABLE_SAVE_PREFIX)).sort().map(name => ({ name, text: localStorage.getItem(name) ?? '' }));
  },
};

let store = localSaveStore;
/** Called once by the entry point, before the game is created. */
export function setSaveStore(next: SaveStore) { store = next; }

export const readLocalSave = () => store.read();
export const writeLocalSave = (text: string) => store.write(text);
export const backupUnreadableSave = (text: string) => store.keepUnreadable(text);
export const unreadableSaves = () => store.unreadable();

let writeProblem: string | null = null;
const problemListeners = new Set<() => void>();
/** Records a write's outcome: a failure is kept until a later write succeeds. */
export function saveWriteSettled(failure?: unknown) {
  const next = failure === undefined ? null : failure instanceof Error ? failure.message : String(failure);
  if (next === writeProblem) return;
  writeProblem = next;
  problemListeners.forEach(listener => listener());
}
/** Why the latest save write failed, or null when it succeeded. */
export const saveWriteProblem = () => writeProblem;
export function subscribeSaveWriteProblem(listener: () => void) {
  problemListeners.add(listener);
  return () => { problemListeners.delete(listener); };
}
