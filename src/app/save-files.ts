// Saving a save's text as a file the player keeps: the browser downloads it; the desktop app asks where to save it (the
// macOS web view cancels <a download> without a download handler).
import { DESKTOP, invoke } from './desktop.ts';

export const SAVE_FILE_NAME = '赛尔号-星际存档.json';

function downloadSave(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), link = document.createElement('a');
  link.href = url; link.download = fileName; link.click();
  // Some browsers fetch the blob well after the click is handled, so the URL outlives it by a generous margin.
  setTimeout(() => URL.revokeObjectURL(url), 40_000);
}

/** Saves `text` as a file; false when the player cancelled the desktop app's save dialog. */
export async function exportSaveFile(text: string, fileName = SAVE_FILE_NAME): Promise<boolean> {
  if (DESKTOP) return await invoke<string | null>('export_save', { text, fileName }) !== null;
  downloadSave(text, fileName);
  return true;
}
