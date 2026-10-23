import { createRoot } from 'react-dom/client';
import App from './app/App.tsx';
import { DESKTOP, installDesktopShell } from './app/desktop.ts';
if (DESKTOP) installDesktopShell();
createRoot(document.getElementById('root')!).render(<App />);
