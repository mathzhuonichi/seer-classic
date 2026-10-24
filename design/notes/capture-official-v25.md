# Capture official-source audit, revision 25

The seven retained capsule factors agree with the official Flash client table. The ordinary capture equation remains an explicitly chosen remake calibration: the inspected official client sends a capsule request to the server and renders the returned result. This audit does not certify official probability parity. A source-proven prerequisite for capturing Niao (species 416) is now enforced before a capsule or random draw can be consumed.

## Direct sources and boundaries

On 2026-10-04 UTC, the audit downloaded the official [PetFightDLL](https://seer.61.com/dll/PetFightDLL.swf), 2,927,135 bytes, SHA-256 `1e6987a4e9bc8a78180f9946b1770afaee54b00959e1861450dcaef729b57970`. FFDec 26.3.0 successfully exported all 68 classes selected by `com.robot.petFightModule.**`. Downloads, decompiled source and export logs are under ignored `.cache/capture-official-v25/`; source identities are under ignored `artifacts/capture-official-v25/source-index.json`.

The relevant official classes establish the following:

- `CatchPetItemCategory.useItem` sends command `CATCH_MONSTER` with only the capsule ID and decrements the displayed capsule count when it sends the request. Official `CommandID` assigns this command number 2409.
- `PetFightController.onCatchMonster` receives a `CatchPetInfo` from the socket and passes it to the fighter renderer. Core `CatchPetInfo` reads two unsigned integers, `catchTime` and `petID`; `BaseFighterMode.catchPet` treats an absent result or `catchTime == 0` as failure, and a nonzero `catchTime` as success.
- `FightPetInfo` reads `catchType` from the server. `ToolBtnPanelObserver.isCanCatch` enables capture only when this value is positive. `CatchPetItemCategory` disables all capsules for type 0; type 1 excludes capsule IDs 300141–300150, and type 2 requires that range. These encounter permissions are distinct from the species table's `CatchRate`.
- For target 416 in an ordinary fight (`FightManager.info.type == 0`), `CatchPetItemCategory.useItem` sends no capture request unless the active player species belongs to `[77,78,79,310,311,312]`. This is an explicit client gate, independent of capsule strength. The six retained names are 尼尔, 菲斯利, 艾斯菲亚, 闪光尼尔, 闪光菲斯利 and 闪光艾菲亚. The target is 尼奥 (Niao).

The inspected capture path contains no probability calculation or capture random draw. Consequently, server RNG distribution, HP/status/level modifiers, rounding, shake checks, pity counters and encounter-specific exceptions cannot be recovered from this path. The absence of a local calculation does not prove that the server lacks those modifiers. No original-game login, account action or server-side capture experiment was performed.

An initial whole-DLL export reached unrelated application classes with decompilation timeouts and heap errors; it was stopped. The successful targeted export is the evidence used here. The optional `PetFightDLL_201308.swf` download requires the official `FightdllLoader` wrapper decoding (skip seven bytes and inflate); a complete export of that alternative was not obtained, and it is not used to assert historical parity.

## Capsule and species tables

The cached decoded official [RobotCoreDLL](https://seer.61.com/dll/RobotCoreDLL.swf), previously source-audited in `unity-and-swf-source-audit.md`, contains binary symbol 43 for `ItemFilterXMLInfo`. Its extracted XML has SHA-256 `df87d040b336ce82d0954e691c03b77b214501a47825d952cf357b907da10c02` and is retained as `artifacts/capture-official-v25/ItemFilter.xml`.

| Retained capsule | Official ID | Official Bonus | Runtime representation |
|---|---:|---:|---:|
| Basic | 300001 | 1 | 1 |
| Medium | 300002 | 1.5 | 1.5 |
| Advanced | 300003 | 2 | 2 |
| Super | 300004 | 3 | 3 |
| Special | 300005 | 4 | 4 |
| Master | 300006 | 256 | null, guaranteed by remake |
| Hertz | 300008 | 2 | 2 |

The core `ItemFilterXMLInfo.catchRate` function classifies Bonus 256 separately from other nonzero values; it does not return a numeric probability. Its `parseInt` storage truncates the medium capsule value for this classification. That truncation is not evidence that the server ignores the original 1.5 factor.

The official Monster XML in cached binary symbol 23 was compared with all 1,483 retained species. Initially, 1,479 `CatchRate` values matched; four local zero values differed: species 1034 had official 20, 1036 had 5, 1038 had 5, and 1040 had 1. `artifacts/capture-official-v25/species-rate-audit.json` preserves this pre-correction audit. Corrections to those catalog records are coordinated by the main integration task. A positive species value does not add an encounter location or recover a server `catchType`.

The local Hertz item note claims use only on Helka. The inspected capture selection class does not enforce a location restriction, and the extracted filter table provides only Bonus 2 for this item. Location validation may occur elsewhere or on the server; this pass has no verified location rule and adds none.

## Local runtime and actual probabilities

`battle/RULES.md` already labels the equation as chosen and Pokémon-style. `battle/core/src/capture.ts` now makes that provenance explicit without replacing it with another unsupported equation. With maximum HP H, current HP h, species CatchRate r, capsule multiplier m and status factor b, the runtime uses:

```
a = ((3H - 2h) * r * m / (3H)) * b
success = a >= 255 || nextRandom() * 255 < a
b = 2 for any control status; otherwise 1.5 for any status; otherwise 1
```

There is no explicit level factor. Level affects maximum HP indirectly. The status implementation currently boosts any non-control condition marked `kind: status`, including conditions beyond poison/burn/freeze; that is the existing calibration, not a source-verified official mapping. Multiple statuses do not stack, and a control status takes precedence. The fallback for a missing species rate is 45.

For a rate-45 target with maximum HP 100, the current theoretical success rates are:

| HP and status | Basic capsule | Advanced capsule |
|---|---:|---:|
| Full HP, no status | 5.882353% | 11.764706% |
| 1 HP, no status | 17.529412% | 35.058824% |
| Full HP, control status | 11.764706% | 23.529412% |
| 1 HP, control status | 35.058824% | 70.117647% |
| Full HP, non-control status | 8.823529% | 17.647059% |
| 1 HP, non-control status | 26.294118% | 52.588235% |

These percentages describe the remake equation, not measured official capture probabilities. The seeded generator has a finite 32-bit grid; an unsaturated threshold admits exactly the grid values strictly below `a/255`.

A master capsule succeeds without a capture RNG draw, including when the species rate is zero, if the encounter permits the action. A saturated non-master attempt also skips the capture draw. Every unsaturated attempt, including rate zero, consumes one capture draw. Opponent AI/action selection can consume other draws before resolution. A rejected action consumes neither a capsule nor RNG. Capture success ends combat immediately; failure spends the capsule and permits the opponent action. The preserved helper maintains the previous comparison arithmetic and short-circuit behavior.

## Implemented correction and verification

**2026-10-24:** the Niao prerequisite below is replaced by the period behaviour (user decision; [wild-flee-2026-10-24](wild-flee-2026-10-24.md), `battle/RULES.md` 9.1): any active species may throw a capsule, but with none of the six partner forms out 尼奥 flees at the capsule (spent, no roll) and at its own action. `NIAO_CAPTURE_PARTNERS`, `meetsWildCapturePrerequisite` and the view's refusal are deleted; the client list above is now `wild_flee.unless_player_active` in `data/monsters/0416.json`, which the acquisition routes read too. `capture-official-v25.ts` checks the six forms' captures and the flee instead of the refusal.

The core's ordinary-wild capture action list now includes the source-proven Niao prerequisite. A nonqualifying active species cannot submit either a normal or master capsule; rejection occurs before inventory mutation. The exported `NIAO_CAPTURE_PARTNERS` and `meetsWildCapturePrerequisite` support the adapter's acquisition explanation. Boss encounters and explicit `no_capture` rules remain blocked.

The core has no official `catchType` input and therefore cannot claim all official encounter blockers. In particular, species CatchRate zero is not substituted for server catchType zero. No unsupported blanket rare-species, level or status rule was added.

`tools/verification/capture-official-v25.ts` passed seven focused categories: all six accepted Niao forms, ordinary/boss/no-capture distinctions, rejected inventory/RNG preservation, reconstructed probability boundary, master/saturation draw skips, rate-zero draw behavior and control-status precedence. The existing `tools/verification/capture-v3.ts` also passed its eight integrated categories: capture and identity transfer, inventory decrement/save persistence, full-party storage, boss rejection, knockout without recruitment, failed-capture persistence, item categories and actual poison cure. Fixtures use no player save. The main integration task performs the shared TypeScript check after merging its concurrent changes.

This is a development/debug audit and focused correction. No production build, native package, portable release or publication was created.

## Integrated metadata correction

Root integration corrected the four original CatchRate differences in standalone species and the compact runtime bundle:1034=20,1036=5,1038=5,1040=1. An independent XML replay now matches all 1483 retained species with zero differences; `artifacts/capture-official-v25/metadata-after-integration.json` preserves the result. Inferred wild metadata adds no new scene placement. GameSnapshot now explains and disables capture when the Niao partner prerequisite is unmet. The source boundary on full server probability and catchType is unchanged.
