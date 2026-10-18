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

const pageHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/**
 * Schedules a save write for once the next frame is painted, so it stays off the path from input to screen, and returns true.
 * A hidden page may get no frame before it closes, and Node has no frames: there it schedules nothing and returns false.
 */
export function afterNextFrame(write: () => void): boolean {
  if (typeof requestAnimationFrame !== 'function' || pageHidden()) return false;
  requestAnimationFrame(() => setTimeout(write));
  return true;
}

/** Calls `flush` when the page is hidden or unloaded: after either it may be closed or frozen without running again. */
export function onPageExit(flush: () => void): void {
  if (typeof document === 'undefined') return;
  addEventListener('pagehide', flush);
  addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => { if (pageHidden()) flush(); });
}
