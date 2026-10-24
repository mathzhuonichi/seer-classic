// The desktop app's side of the Tauri shell (src-tauri). Only `vite build --mode desktop` (and the desktop development
// window) sets DESKTOP, so the browser build carries none of it.

/** True in the desktop app's build. */
export const DESKTOP = import.meta.env.MODE === 'desktop';

/** Tauri's global API (app.withGlobalTauri), injected before the page's scripts. */
interface TauriGlobal { core: { invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> } }

/** Calls one of the shell's commands. */
export function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return (window as unknown as { __TAURI__: TauriGlobal }).__TAURI__.core.invoke<T>(command, args);
}

/** Writes a line to the app's log file; a failure to log is ignored. */
export function logLine(level: 'info' | 'warn' | 'error', message: string) {
  invoke('log_web', { level, message }).catch(() => {});
}

/** The window fills the screen through the shell: WebView2 does not resize the window for HTML fullscreen. */
export const toggleWindowFullscreen = () => invoke<boolean>('toggle_fullscreen');

/** F5, Ctrl+R and Ctrl+P (Cmd on macOS) would reload or print the game: a reload abandons a battle in progress. */
function blocksReloadOrPrint(event: KeyboardEvent) {
  const command = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
  return event.key === 'F5' || (command && (key === 'r' || key === 'p'));
}

const described = (reason: unknown) => reason instanceof Error ? reason.stack ?? reason.message : String(reason);

/** Blocks the reload and print keys and the context menu (which offers both), and sends page errors to the log. */
export function installDesktopShell() {
  window.addEventListener('keydown', event => { if (blocksReloadOrPrint(event)) event.preventDefault(); }, true);
  window.addEventListener('contextmenu', event => event.preventDefault());
  window.addEventListener('error', event => logLine('error', `${event.message} at ${event.filename}:${event.lineno}`));
  window.addEventListener('unhandledrejection', event => logLine('error', `unhandled rejection: ${described(event.reason)}`));
}
