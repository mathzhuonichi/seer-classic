# Save slots (2026-10-24)

Status: current. The design of the save slots, with the measurements it rests on. `raising/SPEC.md` §9 states the rules in force.

## Request

The user, 2026-10-24: 「存档要能在设置里管理，例如新存档和读取存档列表」 — manage saves in the settings: start a new save, and a list
of saves to load. Until now there was one save: the browser's `localStorage` key `seer-classic-save-v1` for the origin
http://127.0.0.1:1426 (the browser package, [browser-package-2026-10-23](browser-package-2026-10-23.md)), with unreadable saves
kept beside it under `seer-classic-save-v1.unreadable.<time>-<n>`.

## Measurements

**Save size.** A collection of 3000 monsters (the most a player holds), built with the real raising code (`createMonster`,
`addMonster`, `rollTrait`, a real engraving from the controller): mixed species and levels, every fifth at Lv 100 with full
学习力 and an engraving, 99 of every catalogue item, every encounter cleared. Text lengths are UTF-16 code units (the unit both
browsers count `localStorage` in); the saves are ASCII apart from nicknames, so UTF-8 bytes equal the length.

| Save, as the game writes it | Characters | Per monster | UTF-16 | UTF-8 |
| --- | ---: | ---: | ---: | ---: |
| 200 monsters (the dispatch budget's collection) | 91,628 | 458 | 0.17 MiB | 0.09 MiB |
| 3000 monsters, every fifth Lv 100 | 1,261,361 | 420 | 2.41 MiB | 1.20 MiB |
| 3000 monsters, all Lv 100 and engraved (worst case) | 1,421,485 | 474 | 2.71 MiB | 1.36 MiB |

On this Mac (Node 26, the machine under other load), the 3000-monster save serialises in 3–4 ms and parses, migrates and validates
(`loadJourney`) in 8–9 ms; a controller of it is built in 100–180 ms, a controller of a new journey (with the game context) in
40–56 ms.

**Browser quotas**, probed in a fresh headless context of each engine on an http origin (a scratch script, not kept): the longest
value `localStorage` accepts, the most it accepts over several keys, and five worst-case documents stored in IndexedDB.

| Engine | `localStorage`, one value | `localStorage`, all keys | IndexedDB, five 1,421,485-character documents |
| --- | ---: | ---: | --- |
| Chrome 156 | 5,241,856 characters | 5,241,858 characters | all stored |
| Playwright WebKit 26 (Safari's engine) | 5,241,856 characters | 5,241,858 characters | all stored |

`localStorage` holds about 5 Mi characters per origin (10 MiB counted in UTF-16), one quota shared by every key: the pre-slot
save, the audio settings and the world position live there too. A worst-case save takes 1.42 M of them, so three fit and a fourth
does not, and until it is adopted (below) the pre-slot save already takes one place. Desktop Safari was not probed; its documented
limit has been 5 MB, which, counted in UTF-16, would hold only one. **The slots therefore live in IndexedDB**, whose quota is a share of the
disk (gigabytes). The save document format is unchanged (`SAVE_VERSION` stays 5; no migration).

## Storage layout

IndexedDB database `seer-classic-saves`, version 1 (`SLOT_DATABASE` in `src/kernel/slot-backends.ts`), three object stores:

| Store | Key | Value |
| --- | --- | --- |
| `slots` | `id` (in the record) | the slot record: `{id, name, savedAt, summary, unreadable}` |
| `documents` | the slot id | the save's text, exactly what `serialize` writes (and what an export downloads) |
| `meta` | `'active'` | the id of the active slot |

The slot index is the `slots` store plus `meta.active`; there is one document per slot. A record's `id` sorts in creation order
(the time and a counter in base 36, then a random tail), `savedAt` is when the game last wrote it (ISO 8601), `summary` is what
the list shows without opening the save (monsters, the highest level, the owned dex forms, the cleared encounters), and
`unreadable` is why the slot could not be opened, or null. Every transaction spans the three stores, so IndexedDB applies them
in the order they are made, across pages too.

## Modules and contracts

```
src/kernel/persistence.ts    the pre-slot saves (read; deleted once adopted) and the write-problem report (saveWriteSettled → SaveProblem.tsx)
src/kernel/save-slots.ts     SlotStore over a SlotBackend: records, documents, the active id; legacy adoption; moves text only
src/kernel/slot-backends.ts  indexedDbBackend, memoryBackend, openBrowserSlotStore (IndexedDB, else memory with the problem shown)
src/kernel/save-library.ts   SaveLibrary: the game of the active slot; newSave, load, remove, importSave, exportSlot
src/kernel/save-state.ts     journeys, summarize(save), the JourneyWriter that writes to a JourneySlot
src/kernel/controller.ts     runGame(ctx, journey, slot, notices): the controller of one journey (moved out of game.ts)
src/kernel/game.ts           createGame(catalog, save?): a game kept in memory (tests, tools)
src/app/SaveSlots.tsx        设置 > 航行存档: the list, 新存档, 读取, 删除, the file export and import
```

- `SlotBackend` is the storage seam: `apply(change)` applies a change without reading first (the save writes),
  `update(plan)` reads what is stored and applies the plan's change in one atomic transaction (opening, deleting), and
  `read(id)` returns a document. The unit tests (`save-slots.test.mjs`) run the store on `memoryBackend`, on a copy of it that
  reports itself durable (as IndexedDB does), and on a wrapper that refuses writes beyond a size, as a full storage does.
- The store never reads a save; the library decides what a slot holds. The kernel's game writes only through a `JourneySlot`
  (`write(text, summary)`), which the library binds to the slot it opened.
- **One game context per library.** Opening a slot, a new save or an import builds a new controller (`runGame`) from that slot's
  save on the library's read-only `GameContext`: a new runtime, snapshot builder and writer, so nothing of the previous slot's game
  carries over, and no catalogue work is repeated. The app mounts the new controller's `Game` under a new React key, so no screen
  state (open windows, selections, the modifier) carries over either. Only the UI preferences outside the save stay: the audio
  settings and the explorer's position on the map (`seer-classic.world-ui.v1`), which the game has always kept apart from the save.
- **Asynchronous storage, synchronous game.** IndexedDB is asynchronous; the game is not. The app opens the store and reads the
  active document while the catalogue loads, and builds the game once both are in. Writes keep their timing: the writer still
  queues one write per synchronous run of actions in a microtask, and the slot store issues that write's transaction (record and
  document) at once and asks it to commit before control returns to the page, as `localStorage.setItem` did. Its outcome arrives
  later: a refusal is reported (`saveWriteSettled`) and makes the writer forget the text, so the next action writes again. Only
  the slot list (`savedAt`, `summary`) waits for the outcome.

## Adopting the existing save

On the first start of this version the slot store is empty. Inside the transaction that opens it, it reads the pre-slot save
from `localStorage` and stores it, byte for byte, as **存档 1**, the active slot, followed by the kept unreadable saves (each as
**存档 n**, marked 旧版本中无法读取，已原样保留, saved at the time its key records). Once that transaction (opened with strict
durability) has committed, the adopted `localStorage` keys are deleted (user, 2026-10-24), each only while it still holds the text
that was adopted; a page-only store (IndexedDB unavailable) keeps them. This version never reads them again once the store has a
slot (an empty store is the only trigger, and the active slot can never be deleted, so a store never empties).
Then the game opens 存档 1 as it opened the save before: migrated and settled, and written
back to its slot, which leaves a current save's text unchanged. A player upgrading finds the same journey, now listed as the
active 存档 1. An older folder run in the same browser afterwards finds no save and starts a new journey, which this version does
not see.

## Operations (设置 > 航行存档)

- **新存档**, after a confirmation that names the slot kept: a new journey in a new slot 「存档 n」 (one past the highest such
  name), created atomically with its first document and made active; the previous slot keeps its save.
- **The list**, in creation order: name, 当前 on the active slot, the last save time, and 精灵 n · 最高 Lv n · 图鉴 n · 已通关 n, or
  无法读取：reason for an unreadable slot.
- **读取** (重试读取 on an unreadable slot): reads the slot, opens its save (parse, migrate, validate) and only then makes it active
  and switches the game. A save that cannot be opened marks the slot unreadable, keeps the current game and says why.
- **删除**, for a slot that is not active, after a confirmation (which suggests an export for an unreadable one).
- **导出存档** downloads the active game's save as before; an unreadable slot has its own 导出, which downloads its text as kept.
- **导入存档** (in settings and in the bag's 存档管理) opens the file in a **new slot**, made active (decision below).
- 新存档, 读取 and 导入 are refused while a battle is open (the buttons are disabled and the library refuses them too).

## Failure modes

| Failure | What happens |
| --- | --- |
| A save write refused (`QuotaExceededError`, a closed database) | The game keeps running; the red banner (`SaveProblem.tsx`) asks for an export until a write succeeds; the stored save and the list keep the last good write; the next action writes again. |
| 新存档 or an import refused | Nothing is created (one atomic change); the current game stays; the toast says why. |
| The active slot unreadable at start (a newer format, an emptied or corrupt text, a missing document) | The slot is kept as it is, marked with the reason and never written; a new journey opens in a new slot, and the notice names both. If storage refuses that slot too, the journey stays in memory and the banner shows. |
| 读取 of an unreadable slot | Refused with the reason; the slot is marked; the game stays. |
| IndexedDB cannot be opened (blocked site storage) | The slots live in memory for this run, adopting the pre-slot save from `localStorage` if any; the banner says saving failed, so the player exports. |
| A record or an active id that is not readable | A document without a readable record gets a record (no stored save goes unlisted); an active id that names no slot falls back to the first slot. |
| Two pages of the game open | Transactions apply in order; each page writes its own slot; a page cannot delete the slot that is stored as active (another page may be playing it). Each page's list shows the slots it knew at its start plus its own changes. |
| A page closed right after an action | The write was handed to IndexedDB with `commit()` in the same task, as with `localStorage`; a browser crash before IndexedDB commits can lose that last action, as it could before. |

## Capacity

No slot cap. A worst-case slot is 1.42 M characters; both engines stored five of them in IndexedDB without complaint, and the
quota, a share of the disk, leaves room for hundreds. A refused write is the only limit, and it is handled as above. Safari's rule that a site unused for 7 days of browsing
may lose its storage applies to IndexedDB as it did to `localStorage` (the player guide says to export).

## Decisions (the user may override)

- **Import goes into a new slot**, made active, rather than replacing the active slot as before: nothing is overwritten without
  a confirmation, and 新存档 then 导入 is no longer needed to keep the current journey. Alternative: import into the active
  slot after a confirmation.
- **Default names 「存档 n」**, one past the highest such name; there is no renaming (not asked for).
- **Unreadable slots** can be retried (重试读取), exported and deleted, never written.
- **The explorer's position stays shared** by every slot (a UI preference, as before); a new or loaded save opens where the robot
  last stood.
- The adopted pre-slot `localStorage` keys are deleted once a durable (IndexedDB) store has committed them, and kept by a
  page-only store (user, 2026-10-24).

## Tests

- `src/kernel/save-slots.test.mjs` (npm test): the index and creation order, legacy adoption (byte for byte, once only, the
  keys deleted after a durable adoption and kept by a page-only store or a refused adoption), create, switch, write and delete
  across reloads of the backend, the refusals of deleting the active or stored-active slot, a refused write and a refused new
  slot on a full storage, unreadable marks, orphan documents. `persistence.test.mjs`: the pre-slot reader, the deletion of only
  the keys that still hold what was adopted, and the problem report.
- `tools/verification/save-library.ts` (gate): adoption with no notice; 新存档 and 读取 rebuilding the game from the slot alone
  (the snapshot equals a fresh controller's of that save), the active slot after a reload, no switch in battle; an unreadable
  active slot, an unreadable 读取, an emptied save, an unreadable import, a refused new slot; import and delete; a 3000-monster slot
  written and opened again. `controller-snapshots.ts` checks the write timing and the dispatch budget on a slot; `golden-saves`
  opens the released saves through adoption.
- `tools/verification/browser-save-slots.mjs` (needs-browser, Chrome and WebKit, fresh silent contexts): adoption of a seeded
  pre-slot save as the active 存档 1 with its key deleted; 新存档, 读取, a reload opening the slot loaded last, and 删除.
  The browser suites seed their saves through the pre-slot key, which the game adopts.
