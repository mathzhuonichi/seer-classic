// The one save of the versions before save slots, and the report of a failed save write.
// Until 2026-10-24 the browser's local storage held the save under LEGACY_SAVE_KEY and kept each unreadable save beside it under
// LEGACY_UNREADABLE_PREFIX. The slot store (save-slots.ts) adopts them once, as its first slots, and never writes or deletes them.
export const LEGACY_SAVE_KEY = 'seer-classic-save-v1';
/** An unreadable save's key: this prefix, the time it was kept (milliseconds since 1970) and a counter. */
export const LEGACY_UNREADABLE_PREFIX = `${LEGACY_SAVE_KEY}.unreadable.`;

/** The pre-slot save's text (null when there is none) and the unreadable saves kept beside it, oldest first. */
export interface LegacySaves { save: string | null; unreadable: { key: string; text: string }[] }

/** Reads the pre-slot saves; none when local storage is absent or blocked. */
export function readLegacySaves(): LegacySaves {
  try {
    if (typeof localStorage === 'undefined') return { save: null, unreadable: [] };
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index) ?? '');
    const unreadable = keys.filter(key => key.startsWith(LEGACY_UNREADABLE_PREFIX)).sort().map(key => ({ key, text: localStorage.getItem(key) ?? '' }));
    return { save: localStorage.getItem(LEGACY_SAVE_KEY), unreadable };
  } catch {
    return { save: null, unreadable: [] };
  }
}

let writeProblem: string | null = null;
const problemListeners = new Set<() => void>();
/** Records a write's outcome: a failure is kept until a later write succeeds. */
export function saveWriteSettled(failure?: unknown) {
  const next = failure === undefined ? null : failure instanceof Error ? failure.message || failure.name : String(failure);
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
