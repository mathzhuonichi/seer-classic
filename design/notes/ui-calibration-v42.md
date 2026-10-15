# Common UI calibration, revision 42

The bottom map control previously followed an eight-column grid even though the retained rail's circular seat is offset from the image midpoint. The map control now follows that seat; four controls occupy its left side and three its right side. All eight actions, active states, mission alerts and battle/loading visibility rules remain unchanged.

The retained rail is 1577 by 181 pixels, with the fitted circle center at (822.34, 90.19). The map artwork is 398 by 310, with its circular body centered at (191.7, 155). CSS scales these source coordinates with the actual footer height and compensates for the asymmetric map ribbon. These are geometric calibration measurements, not a claim of a pixel-exact historical screen.

Shared window titles now have equal left and right padding. Close controls center vertically in the titlebar's content box. The original PetBag frame retains its own corner control and embedded title.

The fixed-aspect game can have a short content area even inside a tall browser window. The encyclopedia and SPT panels use their own container dimensions to place portraits beside identity text when space is short. Classic facilities use one scrolling content area in short windows: team choices form a row, six members and skills retain their natural height, and preparation controls follow the details. Full-height facilities retain the existing two-column presentation.

## Verification

- TypeScript and `git diff --check` passed.
- Independent review confirmed that the three component changes contain only style imports and presentation wrappers; their content, callbacks and business logic match the preceding revision.
- The existing footer behavior passed 11 focused rendering/source checks before integration. The final read-only review found no additional issues.
- An isolated browser save was used to visit all eight footer entries at 1280 by 720 and 640 by 760. Each had eight separated footer controls; visible shared titles were horizontally centered. The measured map-to-rail circle delta was below 0.02 CSS pixels on both axes at both sizes, subject to the source circle fit above.
- In the short classic facility, actual scrolling exposed all six members, Hamoret selection displayed its four moves, and the start, heal and team-management controls were reachable. The prior layout compressed the preview into approximately 39 pixels; the revised content keeps its full height inside the outer scroll area.
- The recovery and settings pages retained working scrolling to their lower controls. The original PetBag layout remained intact. Browser warnings/errors were empty.

Screenshots and measurements are in the local analysis directory `analysis/codex-takeover-2026-10-14/browser-v42/`, beside the worktree, including `toolbar-aligned.png`, `narrow-dex.png`, `facilities-narrow-actions.png` and `geometry.json`. The temporary viewport override was reset after verification. No production build or package was produced.
