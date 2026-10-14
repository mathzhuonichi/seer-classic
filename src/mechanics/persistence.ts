const SAVE_KEY = 'seer-classic-save-v1';
export function readLocalSave(): string | null {
  return typeof localStorage === 'undefined' ? null : localStorage.getItem(SAVE_KEY);
}
export function writeLocalSave(value: string): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(SAVE_KEY, value);
}
export function clearLocalSave(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(SAVE_KEY);
}
