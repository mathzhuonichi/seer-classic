import { createRoot } from 'react-dom/client';
import App, { BootScreen } from './app/App.tsx';
import { DESKTOP, installDesktopShell } from './app/desktop.ts';
import { openDesktopSaveStore } from './app/desktop-saves.ts';
import { setSaveStore } from './kernel/persistence.ts';

const root = createRoot(document.getElementById('root')!);
/** The desktop app reads its save files before the game opens; the browser keeps local storage. */
async function openSaveStore() {
  if (!DESKTOP) return;
  installDesktopShell();
  setSaveStore(await openDesktopSaveStore());
}
openSaveStore().then(() => root.render(<App />), error => root.render(<BootScreen message={`存档无法读取：${String(error)}`}/>));
