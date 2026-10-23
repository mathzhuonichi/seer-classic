// The desktop app's save store: save files in the app data folder, written by the shell (src-tauri/src/saves.rs), which is the
// primary store (design/notes/platform.md 4.8). The page reads them once at start; each write is handed to the shell's writer.
import { IMPORTED_SAVE_KEY, localSaveStore, saveWriteSettled, type SaveStore, type UnreadableSave } from '../kernel/persistence.ts';
import { invoke, logLine } from './desktop.ts';

/** What the shell read at start: the save file's text (null when there is none yet) and the unreadable saves kept. */
interface SaveFiles { save: string | null; unreadable: UnreadableSave[] }

/**
 * Reads the save files. On the first start with no save file, the save the web view's local storage holds (the 0.2 app's,
 * in this same origin) becomes the journey: its first write creates the save file and marks local storage's save imported, so
 * that deleting the save files later starts a new journey instead of bringing the old one back. Local storage's save is kept.
 */
export async function openDesktopSaveStore(): Promise<SaveStore> {
  const files = await invoke<SaveFiles>('read_save');
  const importing = files.save === null && localStorage.getItem(IMPORTED_SAVE_KEY) === null;
  const initial = files.save ?? (importing ? localSaveStore.read() : null), unreadable = [...files.unreadable];
  let kept = 0, imported = !importing;
  const written = () => {
    if (!imported) localStorage.setItem(IMPORTED_SAVE_KEY, new Date().toISOString());
    imported = true;
    saveWriteSettled();
  };
  return {
    read: () => initial,
    write(text) {
      invoke('write_save', { text }).then(written, error => saveWriteSettled(error));
    },
    keepUnreadable(text) {
      const name = `unreadable-${Date.now()}-${++kept}.json`;
      unreadable.push({ name, text });
      invoke('keep_unreadable_save', { name, text }).catch(error => logLine('error', `could not keep ${name}: ${String(error)}`));
      return name;
    },
    unreadable: () => unreadable,
  };
}
