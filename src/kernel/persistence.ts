// Where the save is stored: the browser's local storage, under SAVE_KEY, with unreadable saves under UNREADABLE_SAVE_PREFIX.
// The kernel reads and writes through these functions; write failures are reported to the shell.
const SAVE_KEY = 'seer-classic-save-v1';
/** Unreadable saves are copied under this prefix before a new journey replaces them. */
export const UNREADABLE_SAVE_PREFIX = `${SAVE_KEY}.unreadable.`;

/** An unreadable save kept beside the save: its key and its text. */
export interface UnreadableSave { name: string; text: string }

let backups = 0;
const localStorageReady = () => typeof localStorage !== 'undefined';

/** The stored save's text; null on a first start. */
export const readLocalSave = () => localStorageReady() ? localStorage.getItem(SAVE_KEY) : null;

/** Stores the save's text. A refusal, such as full storage, throws. */
export function writeLocalSave(text: string) {
  if (!localStorageReady()) return;
  localStorage.setItem(SAVE_KEY, text);
  saveWriteSettled();
}

/** Keeps an unreadable save under a key of its own, never overwriting an earlier one; returns the key. */
export function backupUnreadableSave(text: string) {
  if (!localStorageReady()) return null;
  const key = `${UNREADABLE_SAVE_PREFIX}${Date.now()}-${++backups}`;
  localStorage.setItem(key, text);
  return key;
}

/** The unreadable saves kept so far. */
export function unreadableSaves(): UnreadableSave[] {
  if (!localStorageReady()) return [];
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) ?? '');
  return keys.filter(key => key.startsWith(UNREADABLE_SAVE_PREFIX)).sort().map(name => ({ name, text: localStorage.getItem(name) ?? '' }));
}

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
