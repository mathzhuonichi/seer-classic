// The desktop app's save store: save files in the app data folder, written by the shell (src-tauri/src/saves.rs), which is the
// primary store (design/notes/platform.md 4.8). The page reads them once at start; each write is handed to the shell's writer.
import { localSaveStore, saveWriteSettled, type SaveStore, type UnreadableSave } from '../kernel/persistence.ts';
import { invoke, logLine } from './desktop.ts';

/** What the shell read at start: the save file's text (null when there is none yet) and the unreadable saves kept. */
interface SaveFiles { save: string | null; unreadable: UnreadableSave[] }

/**
 * Reads the save files. On the first start with no save file, the save the web view's local storage holds (the 0.2 app's,
 * in this same origin) becomes the journey once: its first write creates the save file.
 */
export async function openDesktopSaveStore(): Promise<SaveStore> {
  const files = await invoke<SaveFiles>('read_save');
  const initial = files.save ?? localSaveStore.read(), unreadable = [...files.unreadable];
  let kept = 0;
  return {
    read: () => initial,
    write(text) {
      invoke('write_save', { text }).then(() => saveWriteSettled(), error => saveWriteSettled(error));
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
