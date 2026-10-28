# Changelog

Newest first. Each entry links the design note with its details and checks; [design/notes/INDEX.md](design/notes/INDEX.md) gives each note's current status. The follow-ups between version 0.3.2 and revision 18 had no revision number; their headings use the design note's version where it has one. No note or commit is labeled revision 55. Versions 0.1 and 0.2 have no design note with their checks, so their entries carry them.

## The launcher window closes by itself (2026-10-27)

- **Launchers.** Both package launchers and the development launcher `../test.command` now only start the game: the console checks the files, starts the game server as a background process of its own, opens the browser and closes (on macOS also when the Terminal profile keeps finished windows). The server stops by itself about a minute after the last game page closes, through a presence stream the server adds to the page (Vite's client connection in development); failures are still explained in the window, which waits for a key. The player guide says to close the game page instead of the window ([browser-package-2026-10-23](design/notes/browser-package-2026-10-23.md), "The launcher window closes").
- **Checks.** `npm test` 308 tests (`server.test.mjs` no longer fails in about half its runs: its top-level await let the runner delete the test folder early); a staged folder with this server and the macOS launcher, run from Terminal with a stubbed browser on this Mac: the console exits at once, the background server answers and stops 60 s after the last page, and the window closes with both a closing and a keeping Terminal profile. The 0.0.1 ZIP predates the change.

## Battle entry without the long task (2026-10-24, evening)

- **Battle entry.** The battle mounts hidden behind its loading screen from the 「部署出战精灵…」 step, so both creatures' HD atlases upload there and not as the battle shows. In Chrome the measured battles show with no long task and no frame over 16.8 ms. Before, a task of 50-195 ms came at about 95 MiB of atlas at 1280x800 and at about 60 MiB at 1920x1080@2: 4-23 % of wild encounters, and every battle of a lead of 100 MiB or more. Each session's first battle also loses its ~105 ms frame from the battle-UI SVGs. The loading time is unchanged; a pet switched in mid-battle still uploads as it shows ([battle-entry-longtask-2026-10-24](design/notes/battle-entry-longtask-2026-10-24.md)).
- **Checks.** `npm test` 307 tests; `npm run verify` 77/77 (`--jobs 2`); new `needs-browser` suite `battle-entry-longtask` (Chrome and WebKit); `browser-regressions` 66, `battle-skill-effects` 10, `battle-hd-display` 12, `battle-move-clips` 6, `battle-attack-reach` 3 and `browser-save-slots` 4 pass.
- **Package.** The stale 0.0.1 ZIP was deleted and rebuilt from 7c194eb as `releases/SeerClassic-0.0.1-browser.zip` (2.79 GiB), still the one package for Windows and macOS. Its `payload` gate had stopped on the bundled scene-music note, which named an excluded file; the note now names none. The `browser-package` release gate passes 11 checks in Chrome and WebKit, with `battle-skill-effects` 10 and `browser-regressions` 66 against the package.

## Save slots, map music, fleeing monsters and Boss rules (2026-10-24, later)

- **Save slots.** 设置 › 航行存档 lists every save with its summary: 新存档, 读取 and 删除 (never the active save, after a confirmation); an imported file becomes a new save. Saves live in IndexedDB, one record and one document per slot (a 3,000-monster save is about 1.4 M characters, and local storage holds only three); the save of earlier versions is adopted unchanged as 「存档 1」 and its local-storage keys are deleted once it is stored ([save-slots-2026-10-24](design/notes/save-slots-2026-10-24.md)).
- **Map music.** The ship and every planet play the 2013 client's map themes: 90 period files from the official Flash server on 153 maps, ignored by Git and packaged, fading between maps, giving way to the battle theme and starting over after a fight; the 战斗音乐 slider is now 音乐 ([bgm-2026-10-24](design/notes/bgm-2026-10-24.md)).
- **Wild monsters that flee.** Wild 该伊 and 尼尔 flee at their action from their 5th and 10th turn, with no reward; 尼奥 flees whenever no 尼尔-line pet is out, also at once at a capsule from another pet, and then says its farewell in the scene; the 尼奥 capture gate is gone ([wild-flee-2026-10-24](design/notes/wild-flee-2026-10-24.md)).
- **Type ratings on the damage numbers.** A move's number on its target carries the original's 克制, 微弱 or 无效, and a type immunity shows a grey 无效−0; counters, recoil, status, turn-end and critical numbers carry none ([damage-display-2026-10-23](design/notes/damage-display-2026-10-23.md)).
- **Boss rules.** 必中 boosts such as 气机锁定 count for 谱尼's 虚无 seal, its sure-hit damage filter (riders included) and 战虎's clear exception; 迪普利德 loses its unsourced clear immunity and 暗夜冰狐's covers only its double defence; 422 of 440 Boss rule nodes are still recorded without a source, mostly by the evidence ledger's default ([boss-clear-immunity-2026-10-24](design/notes/boss-clear-immunity-2026-10-24.md)).
- **Boss AI.** A Boss no longer re-casts a status move whose effect is still in place (51 moves; in-place re-casts 8.1 → 0 per 100 Boss turns); 先手无效 ends with the turns in which it works ([boss-ai-engine-2026-10-24](design/notes/boss-ai-engine-2026-10-24.md)).
- **Checks.** `npm test` 305 tests; `npm run verify` 77/77 gate suites (`--jobs 3`; the architecture gate re-run after trimming `types.ts`); new gates `save-library` and `scene-music`, new `needs-browser` suites `browser-save-slots` and `scene-music-browser`; `browser-regressions` (66 checks), `battle-skill-effects` and `battle-hd-display` pass in Chrome and WebKit.

## Battle follow-ups (2026-10-24)

- **Damage display.** The log now orders a move's lines as the dialogue shows them; a damaging move that a block (`protected`, `damage_blocked`) stops entirely shows −0 with its block line; a creature knocked out by a counter is counted down on its team strip only when it greys ([damage-display-2026-10-23](design/notes/damage-display-2026-10-23.md)).
- **Boss AI.** 奈尼芬多 no longer re-casts 药剂反噬 while the foe is still under it, and its re-cast after a faint replacement is checked to come on time; `boss-ai-isolation-v56` no longer depends on its seeds (binomial bounds, the status chance right after a status move, recorded priorities); the `when.ts` turn-order fallback is measured and deferred ([boss-ai-engine-2026-10-24](design/notes/boss-ai-engine-2026-10-24.md)).
- **Move clips.** A creature whose body teleports or is taken over (the 10 listed clips, among 18 at live sizes) now stays inside the arena; move paths are computed at clip load in short tasks (169's longest task 80 ms -> 30 ms); 1327's attack and 50's status move hit at their original frames ([battle-move-clips-2026-10-24](design/notes/battle-move-clips-2026-10-24.md)).
- **Skill effects and loading.** Leaving a battle's loading screen no longer counts as a lost fight or spends anything (the contract action `abandonBattle`); a skill effect whose SWF failed or stalled is requested once more, so it plays from a later use; no encounter gains moves mid-battle today; Chrome's first-battle long task is 皮皮's HD atlas upload ([skill-effects-seamless-2026-10-22](design/notes/skill-effects-seamless-2026-10-22.md)).
- **Period evidence.** Six open rules researched in 2009-2013 mainland sources, with no code change ([period-evidence-2026-10-24](design/notes/period-evidence-2026-10-24.md)).

## The browser package, 0.0.1 (2026-10-23 to 2026-10-24)

- **One folder for Windows and macOS.** `npm run package` builds `releases/SeerClassic-0.0.1-browser.zip` (2.77 GiB, 3.10 GiB unpacked): 启动游戏-Windows.bat, 启动游戏-macOS.command, the official Node 24 runtimes (win-x64, darwin-arm64, darwin-x64), `server.mjs` on 127.0.0.1:1426 (the origin of the dev server, so a browser's save carries over), the web build and the checked payload. Windows opens Edge as an app window; macOS opens Chrome or Edge when installed, because Safari may delete a site's storage after 7 days without a visit ([browser-package-2026-10-23](design/notes/browser-package-2026-10-23.md)).
- **Player guide.** `运行说明.md` at the ZIP root and beside it: unpacking, the first-open dialogs of Windows and macOS, saves (export, import, which replaces the save, Safari), updating, and every message of the server and the launchers. The server explains a busy or reserved port, another running version, a folder macOS denies and an incomplete folder in Chinese and waits for a key.
- **The Tauri desktop app is removed.** `src-tauri`, the desktop build mode and scripts, `desktop.ts` and `desktop-saves.ts` with every desktop branch, the DMG packer and packaged smoke test, and the `desktop-shell` and `desktop-identity` gates are gone; the save lives in local storage only; Pixi loads without its unsafe-eval entry; the branding art is in `design/branding`. The payload tools are `stage_payload.py`, `payload-exclusions.json` and the `payload` gate.
- **Cache cleanup.** The HD battle caches v44-v62, the regenerable `.cache` exports, `artifacts/` and 18 superseded map renders (5.8 GiB) were deleted at the user's request, without a backup; the V62 stroke calibration is tracked in `tools/assets`, and the unregistered `hd-assets-v44.py` audit is deleted.
- **Version and checks.** The version is 0.0.1 (nothing orders app versions; the save format stays 5). `npm run verify` gates 75 suites; `npm test` 260 tests (1 skipped where local TCP is refused); the `browser-package` release gate unpacks the ZIP and plays it in Chrome and WebKit through the package's own server.

## Cleanup and the desktop package (2026-10-23)

- **Cleanup.** Dead exports and functions, the runtime Boss evidence ledger, the dead and needs-cache verification scripts, the mobile and Store icons, `public/laboratory`, the browser playtest package and the source packer are gone; `public/branding` moved to `src-tauri/icons/source` and `approved-plan.json` to `design/`.
- **Desktop app.** The executable holds only the code (about 20 MiB); the files of `public/` the game can request ship beside it as a checked payload, served through Tauri's own protocol so the page keeps the origin of the 0.2 app. `npm run package` builds the arm64 macOS `.app` and a 2.7 GiB DMG with a player README and THIRD-PARTY-NOTICES.txt; Windows is not built yet ([desktop-package-2026-10-23](design/notes/desktop-package-2026-10-23.md)).
- **Saves.** On the desktop, saves are files with atomic writes and three backups, and the 0.2 app's save is imported once. Both builds show a lasting notice when a write is refused, keep unreadable saves for export, name the version of a newer save and catch render errors with 导出存档 and 重新载入. Settings has a 关于 section with the version and the notices.
- **Checks.** `npm run verify` gates 76 suites; `npm test` 239 tests; `cargo test` 16 tests in the shell; new statuses `release` (the `desktop-payload` gate run by `npm run package`) and `needs-rust`; a silent packaged macOS smoke test (`npm run smoke:macos`).

## Battle rules, Boss AI and move clips (2026-10-21 to 2026-10-23)

- **Battle screen.** Creatures are drawn at their original native size, so 哈莫雷特 is no longer as small as 丽莎布布 ([battle-native-size](design/notes/battle-native-size.md)). Battle items act on the creature in battle with one click.
- **Move clips.** A move no longer jumps when its own effect flickers (鲁斯王's 海啸旋风). The arena limit follows the creature's own sprites, so beams and particles never move it, and every move eases in and out. Before, 421 of 1483 species jumped in some arena size ([battle-move-clips-audit-2026-10-21](design/notes/battle-move-clips-audit-2026-10-21.md)).
- **Stages.** Accuracy raises follow the September 2010 table: +n gives (2+n)/2, like the other stats.
- **先手权.** When the other side switches, uses an item or throws a capsule, your move counts as moving first, so 疾风追击-type moves double and 冲撞-type moves no longer do. 先出手/后出手 ×2 (effects 40/30, 102 skills) doubles the damage, not the power ([engine-fixes-2026-10-21](design/notes/engine-fixes-2026-10-21.md)).
- **Statuses and 必中.** Fire monsters cannot be burned and ice monsters cannot be frozen, as grass monsters resist 寄生; a dual type counts if either type matches. The evasion shields of effects 78/106 and the trait 虚无 no longer stop 必中 moves; 圣洁 still stops 必中 status moves.
- **Traits.** 免爆 gives each critical hit it takes a 1/16 chance to deal 0 and no longer lowers the crit rate. 反击类 trigger on any foe move that reaches the holder, status moves included. 回神 works at 0 HP but only on damage from the foe's move. 单属性增伤 no longer boosts dual-type skills. 虚无 only dodges the foe's attacks ([classic-traits-2026-10-21](design/notes/classic-traits-2026-10-21.md)).
- **Boss AI.** The 裸伤 model: a Boss takes a knockout first; otherwise it uses its strongest expected-damage attack, with a 20% seeded chance of a status move that still changes something. Bosses at 0 PP stand still instead of struggling. 奈尼芬多 re-casts 药剂反噬 whenever it is not in place, and 提亚斯 now flees after its second 精神干涉 ([boss-ai-raw-damage-2026-10-21](design/notes/boss-ai-raw-damage-2026-10-21.md)).
- **Boss rules.** Stat-drop immunity and innate boosts from 哈莫雷特 on, shown from the start. 米诺斯 never misses, has unlimited PP, is immune to status, gains +1 to all five stats and a 1/4 crit rate below half HP, and every pet that enters starts at accuracy -2. 塔西亚 gains special attack +2 below a quarter of its HP. 麒麟·幻化之轮 is immune to status. 普兰特 now takes stat drops from attacks; Wednesday's 厄尔塞拉 refuses only accuracy drops, plus burn and freeze. 哈莫雷特's PP and era are kept, with the sources recorded ([boss-innate-rules-2026-10-21](design/notes/boss-innate-rules-2026-10-21.md)).
- **Skill effects.** Every in-scope skill (5,273) now plays its original SWF with Ruffle 0.7.1, placed as the original client did: at the acting creature, scaled by the creatures' separation, mirrored from the right, clipped by the arena and drawn under the HUD, so 叶绿光束 beams from 丽莎布布 to the foe and tints the whole battlefield. Ruffle starts behind the first battle's loading screen; without it the battle plays on with no effect ([skill-effects-ruffle-2026-10-22](design/notes/skill-effects-ruffle-2026-10-22.md)).
- **Skill effects, version 2 (尽量无感).** One Ruffle host per page, started in the first loading screen after its art and kept between battles, so no loading screen lasts longer than without effects and every battle has its host from its first frame. Effects follow the original fight module's timing: a 24 fps stage, the effect starting with the attacker's hit frame for the 446 label-timed species and one frame later for the others, and the target hurt two frames after the effect starts instead of before it. A lost, stalled or panicked host never makes a move wait and never shows Ruffle's panic screen; a request that never answers holds only the first loading screen (3 s at most); a loading screen waits only for the two opening creatures' effects; a resize stops the effect that is playing, and the layer follows resizes that change only the display zoom ([skill-effects-seamless-2026-10-22](design/notes/skill-effects-seamless-2026-10-22.md)).
- **Damage numbers.** A move's hits and its extra damage on one creature are one number that counts up with each hurt, with one line of the total; recoil and counters are one number on the attacker, and poison, burn and other status or turn-end damage stay separate. Numbers stay 4 s (3 s before) from their last change and leave with their creature when another enters. A counter (反击风暴, a reflecting Boss such as 肯佩德) shows with the hit that drew it, so a multi-hit's hits follow each other at the target; an attacker a counter knocks out greys once it is home. A move's blocked hits on one creature are one line (抵挡了这次伤害。, or 抵挡了部分伤害。 when some got through), and a missed move, a status move included, shows MISS on its target. Turns are as long as before, except those with counters, blocks or misses, which only lose holds ([damage-display-2026-10-23](design/notes/damage-display-2026-10-23.md)).
- **Checks.** `npm run verify` gates 74 suites; `npm test` 237 tests; new `needs-assets` suite `battle-move-clips`, tool `battle-move-clips-inventory` and `needs-browser` suite `battle-skill-effects`. The browser suites no longer hang on system Chrome's updater.

See [design/notes/handoff-2026-10-22.md](design/notes/handoff-2026-10-22.md).

## Playtest fixes (2026-10-19 to 2026-10-20)

- **Battle screen.** The record panel, skill grid and command diamond share their edges; a type-matchup indicator (my multiplier, 无效/微弱/均衡/克制, the opponent's multiplier) replaces the VS; the caption counts turns from 1.
- **Combat feedback.** Damage numbers stay 3 s and stack; attackers stay inside the arena through their move and paint in front; multi-hit moves land every hit at the target; one action's stage changes show at once in one line.
- **Details on hover.** Skill cards show multi-hit and priority, and a shared hover card gives every skill fact and effect; 性格 and 特性 explain themselves.
- **Skills.** The 94 AtkNum-only multi-hits were an import error and hit once again (雷伊's 极电千鸟 included).
- **Bosses.** The Boss AI ranks attacks by expected damage, uses status moves that still change something, and renews a boost or status once it is undone. 厄尔塞拉 has 时空裂痕 again, and five more SPT movesets follow their period sources.
- **HD art.** Battle creatures load their HD atlases again (the index import broke in the refactor); V59 re-renders vector cells at the density the display needs V60 upscales retained raster cells with a local AI model, V61 redraws locally the cells V60 left soft, and V62 gives the standby pose first claim on each atlas budget with a calibrated gate for thin strokes.
- **Checks.** `npm run verify` gates 74 suites; `npm test` 178 tests; new `needs-browser` suites `battle-hd-display` and `battle-attack-reach`.

See [design/notes/handoff-2026-10-20.md](design/notes/handoff-2026-10-20.md).

## Waves 3 to 7 (2026-10-18 to 2026-10-19)

- **PvE audit and fixes.** A six-area functional audit ran every Boss, habitat contact, campaign stage, tower floor, facility and quest through the controller. Its confirmed findings are fixed: a 挣扎 turn now settles, party rules are stated and refused in Chinese, missing world contacts exist, result texts state what was paid, quests and honours count correctly.
- **User decisions.** Every Boss is open from the start; 盖亚, 厄尔塞拉 and 劳克蒙德 offer their variants; 麒麟空间 is on the atlas with map 73's art; engraving caps stay the V50 tiers; there is no 放生 and no box limit; Boss evidence is no longer shown to players.
- **Boss fidelity.** Verified original HP, levels, skills and teams replace estimates: sourced HP for 151 Boss members (30 before), sourced levels for 111 (68 before).
- **Boss rules, first batch.** Ten SPT Bosses gain their sourced immunities and unlimited PP (塔克林 crits at 1/4); innate boosts the sources leave unstated are atk+2 on 28 Bosses; 卡修斯 has unlimited PP and 艾尔伊洛 ignores stage-downs.
- **Boss rules, second batch.** Brave Tower traits that mainland guides report: accuracy penalties, crit rates, reflection and first moves on floors 32-61, stage-down immunity on floor 60, and floor 70's last three monsters revive once. Traits only the TW server's tables give are not used.
- **Boss rules, third batch.** 谱尼 asks for six level-100 monsters and its body has speed 280; 盖亚 is one against one; 白虎·泰格尔 follows its 2011 version and the five guardians get their own traits; 卡修斯 moves first within its priority; 雷伊, the dark doors and 空气切裂 follow their sources. 白虎's 战虎 moves first and keeps its boost against all but sure-hit skills and 日月皆伤, and 电虎 paralyses its attackers. 洛拉斯克 starts at level 100 and drops 5 levels per win and 1 per loss.
- **Boss rules, fifth batch.** 瑞尔斯 passes full evasion except 盖亚's block; 尤纳斯's shadow barrier stops attacks until 贯穿水枪 breaks it; 莫尔加斯 takes a tenth from an attack right after another attack.
- **Saves.** Version 3 (first-clear collectibles, retargeted remake essences), version 4 (cleared Boss variants) and version 5 (wins per Boss). Writes happen before the task ends, so closing the window loses nothing.
- **Battle and UI.** Capture counts as a victory; the styling no longer depends on bundle order; long scene names fit; a silent Chrome and WebKit regression suite (`needs-browser`) checks the playtest fixes.
- **Checks.** `npm run verify` gates 73 suites (70 before); `npm test` 132 tests.

See [design/notes/handoff-2026-10-19.md](design/notes/handoff-2026-10-19.md).

## Refactor wave 2 (2026-10-18)

The code is grouped by feature behind fixed contracts ([design/notes/architecture-v2.md](design/notes/architecture-v2.md)):

- **Features.** Each feature registers its actions and its snapshot slice in its `feature.ts`. The kernel composes them and checks at compile time that every action and field is registered.
- **Snapshot and screens.** Screens subscribe to their slice with `useGame`, and unchanged slices and rows keep their identity. Actions report what they created through the `DispatchResult`.
- **Battle.**
  - The engine (`battle/core`) no longer imports the AI (`battle/ai`), and the battle events are one typed union.
  - Automatic sides decide when the turn opens, in an idle slot. Gates check that this replays identically and keeps decisions and turns within their latency budgets.
  - Tower, campaign, facility and training battles start and settle through per-session hooks owned by challenges and world.
- **Rule outcomes in the slices.** Brave Tower position, campaign rewards, quest claims, engraving equip modes, item use targets, dex, fusion and breeding rows, and monster boosts are computed in the slices instead of the components.
- **Data.**
  - `data/gamedata.json` is deleted; suites and generators load the per-file data.
  - Fusion recipes live in `data/fusion.json`.
  - `DELIVERY.md` is folded into this file.
- **Speed.** A non-battle action on a 200-monster save takes under 2 ms at the 95th percentile. Before, it took 7.5 ms.
- **Checks.**
  - The architecture gate lists no import violations. Before Step 0 it listed 11.
  - `npm run verify` gates 64 suites; before Step 0 it gated 57.
  - Five suites that were `known-failure` are fixed or deleted.

Production code is 1,958,568 bytes, 19 KB less than at the wave-2 base, and data and tools are 3.7 MB smaller. See [design/notes/handoff-2026-10-18-wave3.md](design/notes/handoff-2026-10-18-wave3.md) for the units, the checks and the open work.

## Repository refactor (2026-10-18)

The workspace moved to a new machine and the repository refactor began on `claude/refactor`. It added the `AGENTS.md` rules, the `npm run typecheck`, `npm test` and `npm run verify` scripts, the in-repository suite runner with `tools/verification/MANIFEST.json`, repository-relative paths, shared labels, view helpers and a verification harness, explicit `.ts`/`.tsx` import extensions, and removed dead code. See [design/notes/refactor-survey-2026-10-18.md](design/notes/refactor-survey-2026-10-18.md) for the plan and [design/notes/handoff-2026-10-18.md](design/notes/handoff-2026-10-18.md) for its progress.

## Revision 58 (2026-10-16 to 2026-10-18)

Trainer encounters choose actions with an engine-simulated search planner. It runs the real battle engine on isolated copies of the battle, models the player only from observed information, and plays a mixed-strategy equilibrium of its payoff matrix. Trainer battles hide the opposing HP numbers while the bar stays visible. The V57 planner is retired, and voluntary switches need two active turns. See [design/notes/trainer-search-ai-v58.md](design/notes/trainer-search-ai-v58.md) and [design/notes/handoff-2026-10-18.md](design/notes/handoff-2026-10-18.md).

## Revision 57 (2026-10-16)

The user's Boss decisions waive four unresolved mechanics, and Moshidilu executes first below 25% HP. A reliable first-action knockout became the top trainer priority; revision 58 retired that tier. See [design/notes/boss-user-policies-v57.md](design/notes/boss-user-policies-v57.md) and [design/notes/trainer-ko-priority-v57.md](design/notes/trainer-ko-priority-v57.md).

## Revision 56 (2026-10-16)

Field-level evidence ledgers and a rule-execution audit cover all 180 Boss encounters. Bosses return to the project's pre-V36 policy, and the tactical planner is limited to trainer encounters. See [design/notes/boss-evidence-v56.md](design/notes/boss-evidence-v56.md), [design/notes/boss-rules-v56.md](design/notes/boss-rules-v56.md), [design/notes/boss-ai-isolation-v56.md](design/notes/boss-ai-isolation-v56.md) and [design/notes/boss-audit-integration-v56.md](design/notes/boss-audit-integration-v56.md).

## Revision 54 (2026-10-15)

The Brave Tower becomes a walkable floor with one guardian per floor, and first-clear milestones grant explicit rewards. See [design/notes/tower-floor-flow-v54.md](design/notes/tower-floor-flow-v54.md) and [design/notes/tower-floor-source-v54.md](design/notes/tower-floor-source-v54.md).

## Revision 53 (2026-10-15)

The station has four scenes (hall, Brave Tower, Dark Arena and Mystery Realm), a four-destination atlas page and persistent tower checkpoints. See [design/notes/station-tower-v53.md](design/notes/station-tower-v53.md) and [design/notes/station-atlas-v53.md](design/notes/station-atlas-v53.md).

## Revision 52 (2026-10-15)

`preview.html` mounts the complete production shell for isolated UI inspection. See [design/notes/full-shell-preview-v52.md](design/notes/full-shell-preview-v52.md).

## Revision 51 (2026-10-15)

Item categories and the PetBag content tabs become compact. See [design/notes/ui-refinement-v51.md](design/notes/ui-refinement-v51.md).

## Revision 50 (2026-10-15)

Revision 50 replaces item and engraving lists with official-icon grids and hover/focus details, removes only the backpack button's circular backing, and keeps all four battle skills within the command frame. Raising items, battle supplies and capsules are unlimited for the player. Skill and species-exclusive engravings are unlimited; generic ability engravings have per-item balance caps, including one Speed +18 and two Speed +15 marks. Equipped generic marks can move directly between monsters. See [design/notes/item-icons-access-v50.md](design/notes/item-icons-access-v50.md) for rules, source coverage and checks.

## Revision 49 (2026-10-15)

Revision 49 integrates the 546 old-style ability and skill engravings, their free shop and two-slot equipment UI. Elite loadouts replace ten direct-recovery moves while retaining the 124-species pool. AI evaluates its own engraved skills and compares redundant recovery with unlimited medicine; spent bonus HP/PP persists across battles and reloads. Compact shop and PetBag controls reuse recovered official artwork. See [design/notes/engraving-integration-v49.md](design/notes/engraving-integration-v49.md) for changes, checks and source limits.

## Revision 48 (2026-10-15)

Revision 48 gives both sides unlimited, battle-only supplies in trainer and facility encounters: the documented classic 250-HP potion, the 20-PP potion, and the existing authored status cure. Opponent AI weighs supplies against attacking and switching, including the lost turn, survival and repeated-healing progress. The UI shows infinity without changing saved quantities. Unverified classic-use HP3000 and PP40 definitions are excluded at runtime while source data and legacy stock remain intact. Original bosses and wild encounters receive no unlimited grant. See [design/notes/battle-supply-integration-v48.md](design/notes/battle-supply-integration-v48.md) for implementation and checks, and [design/notes/battle-supplies-v48.md](design/notes/battle-supplies-v48.md) for dated item evidence and limits.

## Revision 47 (2026-10-15)

Revision 47 verifies individual ownership of Gaia seals, ordinary traits and energy beads across switching, fainting and support transfers. Original Boss loadouts retain their stored skills: Tower 61's historically observed sacrifice is restored, superseding V46's blanket self-KO replacement. Voluntary trainer switches must repay the lost action, paid entry and lost removable boosts, including comparison with free replacement after fainting. Historical Boss skill uncertainties remain explicit. See [design/notes/combat-fidelity-v47.md](design/notes/combat-fidelity-v47.md) for the ownership checks, switch analysis and measured results, and [design/notes/boss-loadout-fidelity-v47.md](design/notes/boss-loadout-fidelity-v47.md) for the original-Boss source review.

## Revision 46 (2026-10-15)

Revision 46 renames the elite facility to Peak Duel and expands its current pool from 103 to 124 species with twenty-one explicit four-move builds. Jimi serves as a speed/accuracy inheritance donor, with useful-recipient selection and sacrifice guards; selected high-difficulty Rei and Gaia retain their ability-training profiles. Its original-Boss self-KO exclusion was superseded by V47's source-based restoration. Contemporary player accounts support five additional tactical roles, while engraving-dependent candidates retain concrete designs pending separately collected source material. See [design/notes/elite-integration-v46.md](design/notes/elite-integration-v46.md) for loadouts, AI behavior and verification, and [design/notes/classic-pvp-sources-v46.md](design/notes/classic-pvp-sources-v46.md) for historical evidence and retained candidate plans.

## Revision 45 (2026-10-15)

Revision 45 distinguishes classic ability training from ordinary species stats. The two authored trained teams use Rei's six documented ability additions and one selected Gaia training trait per member. Original bosses, ordinary opponents, player saves and the 103-member elite admission pool retain their previous rules. Team details show the selected training state and Rei's level-100 neutral-stat equivalent of 612 against the retained raw total of 532. A separate sub-600 candidate audit informs a future pool decision. See [design/notes/npc-training-v45.md](design/notes/npc-training-v45.md) and [design/notes/elite-candidates-v45.md](design/notes/elite-candidates-v45.md) for sources, implementation boundaries and verification.

## Revision 44 (2026-10-15)

Revision 44 restores all 134 scene backgrounds, all 1,483 static portraits, the classic UI and graphical atlas through original vector recovery, direct source rendering, or reviewed conservative AI restoration. All 67 original skill effects now use source-rendered frames with bounded decoding. All 1,483 battle animations have verified HD atlases that preserve the complete timelines and retain unmatched original pixels; 524 have higher-resolution detail in every nonconstant cell. Atlases load on demand, with original-asset fallback. Boss contacts and wild roaming follow their scene geometry; ancestor skins use their own physical size, capsules act on one click, and approaching a creature stops on the incoming side. The requested forest extension removes map 726's black exterior gaps. Original files remain intact and source limits are documented. See [design/notes/hd-integration-v44.md](design/notes/hd-integration-v44.md) for coverage, provenance, browser evidence and local asset transfer requirements.

## Revision 43 (2026-10-14)

Revision 43 scales the interface consistently for 4K and HiDPI displays, including window dragging, type menus and tooltips. Battle canvases track device pixel ratio and layout zoom while retaining their animation player. Missions, inventory and creature navigation now use their existing true vector artwork. Original low-resolution scene bitmaps and raster portraits retain their source detail limits. See [design/notes/display-density-v43.md](design/notes/display-density-v43.md) for measured browser checks and scope.

## Revision 42 (2026-10-14)

Revision 42 aligns the bottom map control to the original rail's circular seat, balances the other seven controls around it, and centers shared window titles and close buttons. Short windows use compact encyclopedia and SPT identity blocks, while classic team details scroll as one complete panel. All eight navigation entries were checked at normal and 640-pixel widths. See [design/notes/ui-calibration-v42.md](design/notes/ui-calibration-v42.md).

## Revision 41 (2026-10-14)

Revision 41 centers Puni's actual foot point on the recovered platform's top face. The name label sits outside the portrait layout, keeping the placement stable when the window changes size.

## Revision 40 (2026-10-14)

Revision 40 restores the Mystery Realm's missing original platform and green energy surface beneath Puni by retaining the official `animator_mc` first frame alongside the background. All seven multi-stage challenge pages now use opaque panels for titles, stages, details, rewards and controls. Narrow windows retain a readable scrolling detail pane. See [design/notes/challenge-presentation-v40.md](design/notes/challenge-presentation-v40.md) for source provenance and verification.

## Revision 39 (2026-10-14)

Revision 39 puts missions, SPT and settings on the same bottom navigation rail as inventory, the map and creature management, leaving scene headings clear. Battle portraits are centered using their visible artwork bounds; type badges use the correct icon selector and frame slots, and the opponent level field no longer covers its label. Battle settings remain available inside the command area. Browser checks cover the campaign page, battle header and settings at normal and 640-pixel widths.

## Revision 38 (2026-10-14)

Revision 38 places Puni's neutral campaign contact on the Mystery Realm's central platform and gives all seven seals and the body the same destination and battle backdrop. Entry follows saved seal progress instead of presenting the body as the default map opponent. The tactical room now separates ten fixed teams into trained mains, foundational classics, thematic specialists and legendary rosters. Its trained core pairs original-form Rei, Gaia and Hamoret with Lisa Bubu, Lusi King and Magic Flame Ape; Rei equips the actual task-earned moves. Every member has a visible role and four inspectable skills. These are authored tactical groups, not calibrated competitive tiers or historical trainer rosters. See [design/notes/puni-location-v38.md](design/notes/puni-location-v38.md) and [design/notes/classic-teams-v38.md](design/notes/classic-teams-v38.md).

## Revision 37 (2026-10-14)

Revision 37 adds three Space Station battle facilities beside the existing tower routes: uniform random teams from all 1,479 collectible forms, random teams from the 103 forms with base-stat total at least 600, and three fixed classic-species tactical teams. Every opponent team has six distinct Lv.100 creatures with ordinary legal builds. Player teams keep their actual levels and roster; wins grant currency/experience without boss progress or collection rewards. The facilities occupy authored rooms using retained station art. A 200-turn cap is now presented as a draw, full PP restoration is finite, and AI move-history scanning is shared within each decision. See [design/notes/station-battle-facilities-v37.md](design/notes/station-battle-facilities-v37.md) for liveness, performance and validation evidence.

## Revision 36 (2026-10-14)

Revision 36 adds a fully local tactical AI: useful recovery, status and stage evaluation, accuracy-aware finishing attacks, and opt-in switching with entry-damage and cooldown checks. Three authored Lv.80 trainer teams (offense, control and attrition) are available under the challenge archive's trainer category. They use legal ordinary builds and grant currency/experience without changing collection routes. Hidden player builds and pending actions are excluded from decision scoring; historical boss sequences and ordered teams retain their order. See [design/notes/offline-battle-ai-v36.md](design/notes/offline-battle-ai-v36.md) for research, implementation boundaries and verification.

## Revision 35 (2026-10-14)

Revision 35 makes all 32 special transitions manual and raises the three former Lv.1 special gates to an explicit remake Lv.60. Ordinary mechanical evolution remains automatic. Each owned creature can now wear its current appearance or any directed ancestor skin; sibling and future forms stay unavailable. Skins preserve the real species, abilities and acquisition rules, persist across reloads, and yield to battle transformations. All 1,479 eligible forms retain executable routes. See [design/notes/evolution-skins-v35.md](design/notes/evolution-skins-v35.md) for the policy and validation.

## Revision 34 (2026-10-14)

Revision 34 completed executable acquisition and evolution routes for all 1,479 eligible forms: all 632 non-NPC families are complete, with no missing forms. Its 32 formerly missing special evolutions used the six explicit source-level gates or documented remake levels of 60/70/80 where source levels are unavailable. The two added special forks retain explicit selection and repeatable initial capture. All 34 fusion recipes, eight breeding pairs and 316 collection rewards remain reachable. See [design/notes/evolution-completion-v34.md](design/notes/evolution-completion-v34.md) for the exact levels, source boundaries and verification. The development preview remains at port 1426; no updated release package was built.

## Revision 33 (2026-10-14)

Revision 33 added 43 source-level automatic mechanical evolutions and explicit choices for six branch families (16 targets), with repeat acquisition within the existing six-copy allowance. Its closure reached 1,447 of 1,479 eligible forms; the 32 deferred special forms are now resolved by revision 34. See [design/notes/evolution-simplification-v33.md](design/notes/evolution-simplification-v33.md) for that earlier policy and validation.

## Revision 32 (2026-10-14)

The revision-32 Codex continuation completes normal acquisition entries for all 632 eligible initial forms. It adds 316 collection-essence rewards (covering all 113 source-classified paid/VIP/lottery families), a shared six-copy allowance, 29 source-identified subregions and guarded location-only recruitment entries. All 34 fusion recipes and eight breeding pairs have obtainable parents. At revision 32, 77 non-initial evolution/transformation routes remained unimplemented; revisions 33 and 34 resolve those omissions. See [design/notes/acquisition-completion-v32.md](design/notes/acquisition-completion-v32.md) for that completion audit, source boundaries, tests and browser evidence.

## Revision 31 (2026-10-14)

Initial-form habitats are generated from the original client's map configuration ([design/notes/habitat-placement-v31.md](design/notes/habitat-placement-v31.md)). Codex then continued development from this commit on `codex/seer-takeover` ([design/notes/codex-takeover-v31.md](design/notes/codex-takeover-v31.md)).

## Revision 30

The current revision-30 source was built and packaged on 2026-10-14 as `releases/seer-classic-linux-playtest-v30.zip` and `.tar.gz`. It includes the development changes through the PetBag frame correction described below. Two smaller ordinary ZIP parts support ChatGPT's per-file upload limit; extract both into the same directory before starting. `releases/seer-classic-linux-playtest-v30-DOWNLOAD.md` provides their hashes and instructions. Run `python3 start.py` after extraction. The package contains the full offline browser assets and no player save; actual Linux/browser acceptance remains separate. See [design/notes/browser-playtest-package-v30.md](design/notes/browser-playtest-package-v30.md) for archive identities, verification and delivery status. Earlier statements that revisions 23–30 were not built describe those original development passes.

The revision-30 frame correction expands the six slots' dark interior with the original frame's nine-slice artwork, preserving creature size and enclosing the existing breathing animation. Filled and empty frames pass wide and narrow browser checks; evidence is appended to [design/notes/petbag-preview-v29.md](design/notes/petbag-preview-v29.md).

The revision-30 source delivery is `releases/seer-classic-v30-source.zip`, with the complete offline `public/` assets in `seer-classic-v30-assets-1-of-2.zip` and `seer-classic-v30-assets-2-of-2.zip`. Extract all three archives into the same destination; they share the root `seer-classic-v30-source/`. The source ZIP contains the current modified and untracked application source, battle and raising engines, data, documentation, tools, Tauri source, and dependency lockfiles. With Node.js 22.18 or newer, run `npm ci`, then `npm run dev -- --port 1426`; `npm run build` checks and compiles the project. See `releases/seer-classic-v30-SOURCE-README.md` for complete instructions and hashes, and [design/notes/source-package-v30.md](design/notes/source-package-v30.md) for scope and verification. The earlier portable browser exports contain compiled files rather than editable application source.

## Revision 29

Revision 29 enlarges and condenses the original PetBag frame, normalizes its six party previews, reduces attribute icons, replaces gender prose with colored symbols below the level, removes generation/count/duplicate rows and keeps one skill-edit shortcut. Normal previews are top-aligned; the old bottom-positioned diagnostic URL redirects to the developer game. Existing saves and raising actions are retained. See [design/notes/petbag-preview-v29.md](design/notes/petbag-preview-v29.md) for actual browser evidence and scope. No build or package was made.

## Revision 28

Revision 28 uses a graphical original-art navigation tree through the universe, one galaxy and one planet landing diagram, without ancestor tabs or a right scene preview. The creature window now uses the actual PetBag frame at its native aspect ratio, with staggered left controls, a central portrait, four original detail tabs and six bottom party slots. Journey and recruitment tasks have persistent pagination; the encyclopedia attribute filter includes original icons, and laboratory facility captions are raised cream/gold logos. Source-native layouts and composed adaptations are distinguished in [design/notes/graphical-atlas-v28.md](design/notes/graphical-atlas-v28.md); integration and actual browser checks are recorded in [design/notes/graphical-management-integration-v28.md](design/notes/graphical-management-integration-v28.md).

## Revision 27

Revision 27 restores source-family live typography, original outlined navigation lettering and sharper original mission/SPT/bag assets. Settings uses a readable light well, while the modifier covers the footer and keeps an explicit held-instance selector and persistent current-target portrait above its scrolling editor. Matching local developer fonts remain in ignored cache and are excluded from production source assets. See [design/notes/typography-modifier-integration-v27.md](design/notes/typography-modifier-integration-v27.md) and [design/notes/ui-typography-source-v27.md](design/notes/ui-typography-source-v27.md). These revisions remain developer/debug source changes without a production build or package.

## Revision 26

Revision 26 binds fusion and breeding to the two separate original rear laboratory chambers, preserves the central free shop, and replaces the generic header toolbar with recovered official navigation artwork. Shared windows, management, breeding, the atlas and battle controls now reuse source-authenticated official skins. Combat follows the classic left record, two-by-two skills and right diamond arrangement, while the efficient mechanics and free/immediate flows remain in place. Social chat and player-base interfaces are omitted; settings contains the developer modifier. The source report and integrated validation are recorded in [design/notes/official-ui-source-v26.md](design/notes/official-ui-source-v26.md) and [design/notes/official-ui-integration-v26.md](design/notes/official-ui-integration-v26.md). This is an adapted development interface, not a pixel-exact claim for one historical release; no build or package was produced.

## Revision 25

Revision 25 adds a unified free laboratory item shop, repairs collection credit for all directed ancestors of an acquired advanced form, and aligns level-editor automatic evolution with pooled experience. Ordinary zero-stock supplies remain available; earned essences and fusion beads stay replenishable after consumption and reload. Fusion, breeding and shopping now bind to the original laboratory machinery with small authored interface emblems, Dr. Pat's marker is removed, and the breeding index has a bounded scroll area. The official-source audit confirms all capsule factors, all 1,483 species CatchRate parameters after four corrections, the 324 single-type cells, 29,241 composite coefficient combinations and all nature multipliers; it adds the original Niao capture prerequisite and corrects the impish label. Full capture probability and damage/stat server arithmetic remain explicitly unverified. See [design/notes/debug-integration-v25.md](design/notes/debug-integration-v25.md). No build or package was produced.

## Revision 24

Revision 24 adds eight original-client breeding pairs with exact three-outcome probabilities, mature-form/Lv50/first-generation-male validation, preserved parents, immediate free offspring and persistent descendant generation. Enter through Dr. Pat in the laboratory; encyclopedia offspring links open the corresponding pair. Official sources identify repeat breeding for the paid Shike and Miya families; other purchase-repeat candidates remain distinguished from confirmed routes. The normal acquisition closure now reaches 453 eligible forms, leaving 1,026 missing. Run `node tools/verification/export-acquisition-status.mjs` to regenerate the complete species CSV and directed initial-family list under `artifacts/acquisition-v24/`. See [design/notes/breeding-integration-v24.md](design/notes/breeding-integration-v24.md) for implementation, verification and source boundaries. This remains a development/debug delivery without a build or package.

## Revision 23

Revision 23 is a development/debug integration, without a new build or package. Encyclopedia links target actual initial-form acquisition entries and display subsequent evolution separately. Forty-two initial-form rewards backed by official premium-currency products now require five named lower-number ordinary SPT clears each, excluding divine beasts and Puni. Seville is a direct solo challenge granting Sevi's essence. Battles freeze the actual displayed entry picture below creature motion and HUD; campaign entries reuse existing rendezvous pictures. Source/controller and browser checks are recorded in [design/notes/debug-acquisition-battle-v23.md](design/notes/debug-acquisition-battle-v23.md). The current executable acquisition closure reaches 451 eligible forms, leaving 1,028 without a normal route; this does not claim complete historical paid classification or complete collection coverage.

## Revision 22

Revision 22 completes offline original motion for all 1,483 retained species, with authenticated source export and independent exact-pixel verification of every atlas. An offline decoder, shared source-frame scheduler, cancellable byte-bounded resource pool, large-atlas CPU release and bounded canvas recovery adapt the original-material renderer. Controller-owned reward records eliminate shared-catalog pollution; reusable collection views and event-state copies reduce allocation while preserving earlier battle frames. Independent engine/controller comparisons, large same-species pairs, forced canvas recovery, repeated switching, actual capture/reload and final package checks pass. Acquisition content retains the preceding audit's coverage, as selected by the user. See [design/notes/battle-media-v22.md](design/notes/battle-media-v22.md) for measured local performance, explicit verification boundaries and the portable revision-22 ZIP.

## Revision 21

The subsequent full-catalog audit finds official animation bundle entries for all 1,483 retained species. Every source URL passes a live HTTP HEAD and manifest-size check; five previously unexported samples also pass full-body integrity checks and decoding. At the time of that audit, 384 clips were delivered; full conversion was pending. See [design/notes/full-dex-animation-audit.md](design/notes/full-dex-animation-audit.md). The fresh acquisition audit finds 367 normally obtainable species, four excluded NPC-partner forms (122–125), and 1,112 species without an implemented normal route. Among the 632 eligible evolution families, 110 are complete, 62 are partial, and 460 have no route. Only 22 of 34 fusion recipes have obtainable parents, supporting 21 of 33 infant outputs. These are executable route and dependency checks, not full campaign-difficulty playthroughs; modifier grants and hidden remote-recruitment fallbacks are excluded. See [design/notes/dex-acquisition-review-v21.md](design/notes/dex-acquisition-review-v21.md) for the complete missing list and verification boundaries.

## Revision 20

The revision-20 official-source follow-up sets fighting against evil to 0.5; all 324 retained single-type coefficients match the official Unity configuration. Original combat motion covers all 382 currently obtainable or encountered species, with 384 delivered clips. Sixty-seven original skill effects, battle music, eight interaction/result sounds and persisted audio settings are integrated. Scene artwork and scene music are outside this pass, and battle countdowns are excluded. See [design/notes/battle-media-v20.md](design/notes/battle-media-v20.md) for integrated verification and the portable revision-20 ZIP; [design/notes/official-game-feel-resources.md](design/notes/official-game-feel-resources.md) preserves source discovery and boundaries.

## Revision 19

The revision-19 playtest follow-up restores original six-point status-skill symbols, preserves explicitly typed exceptions, and fixes grass leech immunity, lethal recoil settlement, Puni immunity targeting, potion defaults and ineffective use, strategy text and energy-bead messages. A separate portable ZIP preserves revision 18 for comparison. See [design/notes/status-skills-and-playtest-v19.md](design/notes/status-skills-and-playtest-v19.md) for source evidence, focused checks, all special source records and unresolved report items.

Development prioritizes the integrated playable result. Existing large test suites were not repeated merely to reconfirm earlier reports. Current delivery checks cover TypeScript, focused retreat/critical-hit/stat-edit regressions, and representative real-interface walking, management, battle, reward, essence-hatching and quest flows. The revision-19 follow-up adds a freshly verified production browser export; no updated native application has been packaged.

## Revision 18

The requested Linux playtest export is a portable browser package, with ZIP and tar.gz archives under ignored `releases/`. Run `python3 start.py` after extraction. Its bundled assets require neither npm nor a native application; actual target-environment verification remains separate. See [distribution/PLAYTEST.md](distribution/PLAYTEST.md) and [design/notes/linux-playtest-package-v18.md](design/notes/linux-playtest-package-v18.md).

## Revision 17: fusion

Fusion is accessed through the left rear chamber in the laboratory, with breeding in the separate right chamber, independently of the creature-management tool. Thirty-four source-backed recipes cover the recovered catalog's 33 fusion infant forms. Both parents remain unchanged, with no mineral, currency, energy collection or waiting requirements. Karu and Hige each have a user-approved 5% chance; the three beige-bead infants are equally likely. Each fusion fixes its output in a named spirit bead, which uses the existing immediate essence-hatching flow and persists across reloads. Encyclopedia fusion links travel to the laboratory and open the matching recipe. Not every later recipe's parents have a normal acquisition route yet; see [design/notes/fusion-acquisition-v17.md](design/notes/fusion-acquisition-v17.md) for that boundary and [design/notes/fusion-delivery-v17.md](design/notes/fusion-delivery-v17.md) for the initial implementation checks.

## Challenge archive follow-up

The challenge archive removes the redundant long-campaign category. Legendary campaign entries retain their ordered stages under legendary challenges, while Rei training remains a task challenge. Brave Tower lists sort by floor number and Dark Arena lists by door number; other categories retain species-number ordering. The live archive was checked across tower and arena pagination, and TypeScript passed without a production build.

## Revision 15: encounter follow-up

The encounter follow-up replaces wild-status badges with actual instance levels, keeps rare and simplified special encounters singular, and returns automatically to the triggering scene after combat finishes. Battle entry clears the previous encounter dialogue while retaining map position. See [design/notes/encounter-labels-and-return-v15.md](design/notes/encounter-labels-and-return-v15.md).

## Revision 14: interaction follow-up

The interaction follow-up opens 96% of each scene to map clicks, expands independent roaming, and restores original scene doorway directions and arrivals. Arrows display destination text on hover and sit below creatures. Original twelve-frame player walking cycles animate both feet in eight directions. YiYi and four additional base families receive simple capsule encounters on source-supported maps. The encyclopedia groups acquisition by evolution family; it exposes real routes and their remaining gaps. Infant essence bindings, omitted manual evolutions and evolved-form collection registration are repaired. See [design/notes/map-interaction-v14.md](design/notes/map-interaction-v14.md), [design/notes/dex-acquisition-review-v14.md](design/notes/dex-acquisition-review-v14.md) and [design/notes/robot-walking-v14.md](design/notes/robot-walking-v14.md). At that stage, collection coverage was 79 complete, 60 partial and 493 missing families after excluding the two requested NPC families; the game does not claim complete acquisition coverage.

## Revision 13: scenery follow-up

The scenery follow-up recovers 133 official backgrounds and connects every modeled region to offline artwork. The scene and atlas preserve the original aspect ratio; character placements use compact floor geometry derived from official layouts and explicit visual refinements. Current official sources include later redesigns, so this is not a claim of exact 2009 scenery. See [design/notes/original-map-asset-delivery.md](design/notes/original-map-asset-delivery.md) and [design/notes/map-scene-layout-v13.md](design/notes/map-scene-layout-v13.md). A separate comparison with 4399 and other tools agrees on 324 single-type cells and twelve representative single/dual outputs; complete classic damage rounding remains unresolved. See [design/notes/calculator-parity-audit.md](design/notes/calculator-parity-audit.md).

## Dual-type follow-up

The dual-type follow-up restores the second component of 294 retained skill types from official client configuration and connects both components to attack calculation and type-dependent conditions. Original composite icons cover all 217 dual-type species and all 29 restored skill pairs. Dex cards, details, management and battle presentation share the icons and immediate Chinese tooltips; dex and storage filters support single types, dual types, components and exact pairs. See [design/notes/dual-type-mechanics-audit.md](design/notes/dual-type-mechanics-audit.md) for verified source fields, focused tests, live delivery and the remaining historical-calibration boundaries.

## Destination follow-up

The destination follow-up removes the second in-scene route button and adds Rift and Helix. The atlas now includes all 55 destinations in the official client table's first five galaxies, a separately qualified small-Phantom route, and three bases. All 48 current SPT encounters have explicit mapped habitats, including Kenpeide on Rogue's Rabol. Tower and dark-arena travel now lands on the actual space station. Backgrounds still reuse authored scenery; newly exposed destinations do not imply complete recovered terrain or wildlife. See [design/notes/challenge-location-expansion-sources.md](design/notes/challenge-location-expansion-sources.md) for source identities, route qualifications and delivery checks.

## Map population follow-up

The map population follow-up removes the redundant right-hand transporter. Existing ordinary wild habitats now contain six independently roaming, individually selectable creatures; rare species remain singular, and empty habitats retain their previous contents. The next scenery pass will replace the illustrative backgrounds with recovered higher-quality online map assets. See [design/notes/classic-navigation-and-presentation.md](design/notes/classic-navigation-and-presentation.md) for the current delivery and planned art work.

## Campaign follow-up

The campaign follow-up adds seven dedicated routes with 30 ordered stages for the four divine beasts, Qilin, Rei training and Puni. Their 17 additional encounters preserve continuous guardian/avatar teams and multi-life bodies; stage progress and the appropriate skill or essence rewards now persist. The archive sorts by species number. Original official attribute artwork, immediate Chinese tooltips, faster idle cycles and an inline scrolling battle record replace the previous presentation. See [design/notes/campaign-delivery.md](design/notes/campaign-delivery.md) and [design/notes/classic-challenge-campaign-sources.md](design/notes/classic-challenge-campaign-sources.md) for verification and historical calibration boundaries.

## Compact HUD follow-up

The compact HUD follow-up merges the eight tools into one header, moves resources into inventory, and puts numeric HP inside red-on-blue bars. Attribute icons and team counts reveal details on hover, while idle creatures breathe subtly. Challenge archive actions travel to a scene before its opponent dialogue starts a visibly staged battle load. Twenty-one catalog encounters resolve to existing map destinations; the remaining 141 use authored rendezvous areas pending their individual maps. See [design/notes/compact-hud-and-challenge-travel.md](design/notes/compact-hud-and-challenge-travel.md).

## Battle visibility follow-up

The battle visibility follow-up centers visible creature silhouettes, adds both teams' portrait/count strips, and displays full damage including overkill in popups and logs. Team indicators follow the animation's event order, while HP loss and damage-dependent mechanics retain their actual-loss semantics. See [design/notes/combat-visibility.md](design/notes/combat-visibility.md).

## Character and damage follow-up

The character follow-up reconstructs every original nested placement matrix and direction-specific layer order, correcting missing waist/feet and Roger's overlapping boots. Image URLs include their asset hashes, and character containers no longer inherit name-label backgrounds. The damage follow-up restores ordinary critical hits' post-damage defense-boost removal and fixes shield charges, sequential damage reductions and true self-costs. See [public/robots/classic/ASSEMBLY.md](public/robots/classic/ASSEMBLY.md), [design/notes/damage-formula-research.md](design/notes/damage-formula-research.md) and [design/notes/damage-implementation-audit.md](design/notes/damage-implementation-audit.md). Exact historical intermediate rounding remains unverified.

## Version 0.3.2

Version 0.3.2 adds three selectable galaxies, complete original eight-direction Seer character art, randomized bounded creature routes, capsule-free boss item panels, and ordered cylindrical capture feedback. The navigation window covers Pano, Kalan and Rogue with 13 destinations and 39 landing regions. The captain and scientist wear their official NPC equipment, battle portraits no longer repeat the health-panel names, and the capture outcome appears only after the capsule closes and shakes. It was a development delivery; nothing was packaged. See [design/notes/classic-navigation-and-presentation.md](design/notes/classic-navigation-and-presentation.md).

## Version 0.3.1

Version 0.3.1 adds capsule capture for ordinary wild creatures, three battle-item categories and locally roaming creatures. A captured creature keeps its encounter level, individual value, nature, HP and skills. The recovered item catalog has no status cure, so the status-removal category uses an authored supply that is not presented as an original record. Roaming creatures turn their original 2D portraits through simulated directional poses. The reported broken assets were caused by the development process ending with the previous task; the port-1421 server then moved to an independent local launchd job. Nothing was packaged. See [design/notes/capture-and-roaming.md](design/notes/capture-and-roaming.md).

On the original development machine, independent launchd jobs served the development preview at ports 1421, 1424 and 1425, each with its own origin-specific browser save, while `npm run dev` kept port 1420 for Tauri. Those jobs did not move to the current machine.

## Version 0.3

Version 0.3 turns the interface into a fixed game frame: the map fills the scene, eight visible tools open draggable in-scene windows, and battles return to the same location and player position. Actual portrait resources load behind a progress screen before combat opens. Creature details and the complete dex show base stats; learning values can be edited and saved directly in the regular creature window. Classic command panels use selection and confirmation, action logs combine their consequences, and critical hits have explicit visual feedback. Retreat works in the replacement phase and grants no encounter rewards. Original vector viewports, including Rei, are calibrated from their own rendered silhouettes. See [design/notes/experience-v3.md](design/notes/experience-v3.md) for the implementation and completion audit.

Version 0.3 is a development delivery served by `npm run dev:preview`, with version identifiers 0.3.0; no production bundle or native package was made. The previously packaged 0.2 application is historical and is not updated by this work.

## Version 0.2

Version 0.2 adds seven destinations with 21 locations, walking, local creature interactions, SPT entry points, recovery and missions. Catalog species without a map place stay reachable through recruitment commissions, and mapped Bosses open their destination. Creature management separates party and storage, and items are grouped into essences, combat supplies, raising items and capsules. The classic battle, item, creature and escape panels sit below the battlefield and a central dialogue strip; physical, special, status and hit animations play in the engine's event order with staged HP changes, and enemy art is mirrored. 143 original official vectors replace the low-resolution portraits, covering all 114 originals under 100 pixels on the longest edge, and every species has a measured silhouette position and evolution-stage scaling. Map scenery is authored for this remake, and the battle layout follows the official guide's command structure rather than a pixel comparison. See [design/notes/experience-v2.md](design/notes/experience-v2.md).

`npm run package` produced a 33.21 MiB macOS app at version 0.2.0, which launched and rendered the map and starter vectors in the native webview. A production-interface check entered Mushroom Monster's location from the map and won in three physical-attack turns; the commands stayed locked during playback, and HP matched the engine's events. The four command panels, the categorized raising items, party management and the return from the result were also checked; the battle agent checked status and special-attack playback, the exploration agent walking, region selection, Boss interaction and the recruitment route for unplaced species, and the asset agent the vectors' provenance and uncropped rendering.

## Version 0.1

Version 0.1 recovers the original Claude project into this independent repository as a playable desktop game. It has the Chinese single-player interface for the party, raising, challenges, collection, inventory and saves; an optional modifier for level, individual value, learning values, nature, trait, collection and resources; and an offline catalog of 1,483 species, 5,325 skills, 162 encounters and 1,483 original official portraits. Bosses are available at any time and their first-clear essences hatch immediately; ordinary recruitment challenges and explicit quest rewards replace complicated acquisition routes. Forty-five classic traits work; at this version Hui Xin and Mian Bao lacked their critical-rate mapping, Luan Wu needed multi-target combat, and the fifth-skill, soul-mark and engraving datasets were empty. Tower floor 69 uses the documented substitute team because its recovered record is empty.

`npm run build` passed, and `npm run package` produced a locally signed 31.85 MiB Apple Silicon app that launched at `tauri://localhost` and exported a save. A manual playthrough raised a starter to level 35, evolved Bubu Seed into Bubu Flower, defeated the level-15 Mushroom Monster, hatched its essence and kept the progress across a reload. Separate controller checks covered recruitment, quest claims, save roundtrips and first-clear rewards, and representative trait checks exercised the actual battle hooks. The earlier large test suites were not rerun, and not every encounter was played.
