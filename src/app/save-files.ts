// Saving a save's text as a file the player keeps: the browser downloads it.
export const SAVE_FILE_NAME = '赛尔号-星际存档.json';

/** Some browsers fetch the blob well after the click is handled, so its URL outlives the click by a generous margin. */
const BLOB_URL_LIFETIME_MS = 40_000;

/** Downloads `text` as a file named `fileName`. */
export function exportSaveFile(text: string, fileName = SAVE_FILE_NAME) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), link = document.createElement('a');
  link.href = url; link.download = fileName; link.click();
  setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_LIFETIME_MS);
}
