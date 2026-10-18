# Agent rules

These rules apply to every agent (Claude, Codex, others) working in this repository. Design notes are history; `battle/RULES.md` and `raising/SPEC.md` are the current truth.

## Commands

```sh
npm ci
npm run typecheck   # tsc --noEmit
npm test            # node --test unit tests
npm run verify      # every `gate` suite in tools/verification/MANIFEST.json
npm run dev -- --port 1426
```

Run `typecheck`, `test` and `verify` before committing. `node tools/verification/run.mjs --status all` runs every registered suite except `tool` scripts; logs go to `artifacts/verification/`.

## Workspace layout

All paths are relative, so the workspace folder can be moved to another computer as a whole:

```
<workspace>/
  seer-classic/          this repository
    public/              runtime assets; large ones are ignored by Git and travel separately
    .cache/              ignored research inputs and HD-generation caches
  analysis/              research data and verification evidence, read as ../analysis
  seer-classic-transfer/ transfer bundle, original ChatGPT ZIPs, handoff and memory copies
```

Never write an absolute or home-directory path into a tracked file, a generated manifest or a symlink. Tools resolve paths from their own location (`import.meta.url`, `Path(__file__)`) and take overrides as arguments.

## Rules

1. **Imports point down only:** `src/app` → `src/kernel` → `src/features/*` → `src/domain` → `src/shared` → `battle/core`, `raising/core` → `data/`.
   - The full rules, the feature DAG and the reasons are in `design/notes/architecture-v2.md` §4. `tools/verification/architecture.mjs` (a gate) enforces them against a shrink-only baseline. Never add a baseline entry; remove the ones you fix.
   - Features use the kernel only through `kernel/contract.ts` (UI-facing), `kernel/api.ts` and `kernel/acquire.ts` (feature-facing). Other features are reached only through their `index.ts` (headless) or `ui.ts` (screens, for UI code only).
   - `domain/` holds pure content and rules used by several features; `shared/` holds display helpers, view types (`shared/views.ts`), labels and the UI kit.
   - The engine does not import the AI; the policy is injected.
   - Components render the snapshot and dispatch actions; `dispatch` returns a `DispatchResult`.
2. **One source per rule:** stats from `raising/core/stats.ts`; damage from the engine pipeline; limits from the raising constants; the catalog from one loader; labels from `src/shared/labels.ts`.
3. **No unnamed rule numbers.** Battle numbers go in `battle/core/src/constants.ts`, economy numbers in one economy module, and data-driven values in `data/`.
4. **YAGNI:**
   - No placeholders, single-value options or alias exports. A feature's `index.ts` and `ui.ts` and `kernel/api.ts` are the only modules that re-export.
   - Delete code with its last caller.
   - Replace an old version instead of adding a version switch.
5. **No test hooks in production, and no source-rewriting tests.** Give tests a real seam instead of a Vite `transform`.
6. **Verification:**
   - New checks are registered in `tools/verification/MANIFEST.json`. Only `gate` suites gate; the other statuses say why a suite does not.
   - A behaviour change updates or deletes the old assertions in the same commit.
7. **Saves:** change the format through `MIGRATIONS` with a version bump. Never overwrite an unreadable save.
8. **Size:**
   - New or changed functions stay under about 80 lines, and lines under about 160 characters.
   - Do not grow `src/kernel/game.ts` or `battle/core/src/battle.ts`; extract instead.
9. **Documentation:** index every design note in `design/notes/INDEX.md` with a status. Repository files are written in English.
10. **Concurrency:** keep commits small, use one branch or worktree per agent, and do not reformat whole files.

The refactor plan that these rules come from is `design/notes/refactor-survey-2026-10-18.md`.
