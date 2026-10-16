# V52: use the complete application shell in UI previews

## Cause

The V50/V51 isolated inspection pages reimplemented the shell with one footer button and an always-mounted `GameWindow`. Their close callback selected the monster panel again, so the monster window had no closed state. This produced the empty navigation rail and non-closing window reported by the user.

The production `Game` already retains all eight toolbar entries while a window is open, replaces the current window when another entry is selected, and closes to the exploration scene. No production navigation or stylesheet change was necessary.

## Correction

- Add `/preview.html` and `src/dev/preview.tsx` as a reusable inspection entry that mounts the exported production `Game` with the six-creature fixture. All windows, toolbar entries, shields and close callbacks now come from the application itself.
- Replace the old ignored V50/V51 preview entry scripts with imports of the shared preview. Preserve their historical screenshots.
- Install page-local in-memory `localStorage` and `sessionStorage` before dynamically importing application modules. `createGame(data, '')` alone is insufficient: it skips loading a save but still performs automatic writes. The preview now reads and writes only its memory maps; reloading resets it. The normal production entry does not import this preview.

Future UI inspection pages should mount `Game` instead of reconstructing its footer or navigation state.

## Verification

- `npx tsc --noEmit` and `git diff --check` passed.
- Independently reviewed storage initialization order and the absence of imports from the production entry to the preview.
- Ran the actual application on a temporary separate origin, including the corrected legacy V51 URL.
- Switched from the item bag to each of the other seven toolbar destinations. Every destination retained eight visible toolbar entries and exactly one dialog; its close button returned to the world with no dialog or interaction shield remaining.
- Repeated the requested item bag -> monster window -> close sequence through the corrected preview entry.
- Verified that clicking the active monster entry again and pressing Escape both close the current window.
- At 640 x 480, all eight toolbar button centers were visible and hit their own buttons; item bag -> monster window -> close also passed.
- Captured the real application at 1280 x 720 and the narrow layout. The browser warning/error log was empty.

Ignored evidence is in `artifacts/navigation-v52/screenshots/`, including the full-toolbar bag and monster screenshots, the restored world, the narrow layout and `navigation-checks.json`.

No player save was inspected, no production build or app package was created, and no remote changes were pushed.
