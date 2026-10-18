const SAVE_KEY = 'seer-classic-save-v1';
/** Unreadable saves are copied under this prefix before a new journey replaces them. */
export const UNREADABLE_SAVE_PREFIX = `${SAVE_KEY}.unreadable.`;
let backups = 0;

export function readLocalSave(): string | null {
  return typeof localStorage === 'undefined' ? null : localStorage.getItem(SAVE_KEY);
}
export function writeLocalSave(value: string): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(SAVE_KEY, value);
}
/** Keeps an unreadable save under its own key, never overwriting an earlier backup. Returns the key. */
export function backupUnreadableSave(value: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  const key = `${UNREADABLE_SAVE_PREFIX}${Date.now()}-${++backups}`;
  localStorage.setItem(key, value);
  return key;
}
