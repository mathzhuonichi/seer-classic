# Visual playtest, 2026-10-18 (wave 3, step 1)

The first browser playtest since the refactor began, run on `claude/refactor` at `1ff8fac` and compared with the wave-2 base `88cad12`. Six scoped playtesters drove the built game, and an independent agent reproduced every finding and looked for its cause. The fixes went to the wave-3 units named in the last column.

## Result

**No refactor regression was found.** Every defect below is also present at `88cad12`. The checks the handoff asked for:

- **Narrowed screens update at once.** Shop stock, engraving stock (buy, equip, 移装, replace, unequip), bag counts, monster cards after item use and modifier edits, quests and claims, the Brave Tower floor, badge and milestone, campaign progress, and the world map after wild wins, captures, flights and losses. No stale number appeared, and no window had to be reopened.
- **Battle feedback and turn preparation.**
  - Over a 27-turn trainer battle, the median time from click to handler return was 1.85 ms (max 4.4 ms) with the idle preparation. It was 1.75 ms on the WebKit fallback path and about 35 ms when the idle task never ran; the base has no preparation and measured about 37 ms.
  - Battle logs and the saves after battle were identical across normal, no-idle and never-idle runs, the base, and WebKit.
  - The `canAct` guard and the double-submit lock held: one action per burst of clicks, and nothing could be clicked after the battle finished.
- **Deleted CSS.** Nothing visible was lost. 274 Chrome screen pairs at four window sizes, 49 WebKit pairs and 18 full-motion pairs had identical computed styles and pixels, apart from roaming creatures and animation phase. Of the 193 deleted rules, 155 match no rendered element; the other 38 are overridden by surviving rules.
- **Arrow keys behind the modifier.** Fixed on HEAD and broken on the base: there, the arrows walked the robot behind the modifier once the dialog had focus.
- **WebKit idle fallback.** Playwright WebKit (Safari 26) has no `requestIdleCallback`, so the `requestAnimationFrame` then `setTimeout` path runs; turns took 1–5 ms there.
- **Console errors.** None, on every page, in 155 scenes, and in every battle that was run.
- **200 monsters.** Opening the bag, the item bag, the dex and the quests, and switching tabs, each took 44–49 ms from click to paint, the same as at 15 monsters. About 33 ms of that is the two frames the measurement waits for.

**Notes for later work:**
- The CSS bundle order changed in wave 2 (`boss-evidence.css` now comes first, and the battle and world styles come before the management and challenge styles), with no visible effect.
- The idle preparation runs as a long task of 21–57 ms during the first frames of a turn's playback.
- On a turn where the opponent faints, the AI chooses its replacement inside the click (10–22 ms).

## Method

- **No localhost.** The outer sandbox blocks TCP to localhost, so there was no dev server. The page was served by Playwright request interception, from a Vite build without `public/` plus the checkout's `public/`. One build was made at HEAD and one at the base.
- **Saves.** Built headlessly with the Vite SSR harness: `createGame`, the `cheat*` actions, then `exportSave`. They were seeded into `localStorage`.
- **Browsers.** System Chrome headless. Playwright WebKit stood in for the Tauri WKWebView; the Tauri build itself was not run.
- **Silent.** Every page started with the game's own mute on, WebAudio contexts that could never run, and muted media elements. Chrome also ran with `--mute-audio`.
- **Comparison.** Screens were pixel-diffed, computed styles were compared element by element, and the CSS was diffed rule by rule with postcss.

## Findings

All findings are pre-existing; "major" means it blocks a player action.

| Finding | Severity | Unit |
| --- | --- | --- |
| The in-battle Boss evidence button cannot be clicked with the mouse: `.classic-health-row` covers the caption. | major | D |
| The battle result title is hidden under the dialogue panel. | minor | D |
| The expanded battle-log frame art does not stretch, and the skill-button outline is letterboxed (`preserveAspectRatio`). | minor | D |
| WebKit: the labelled toolbar icons (图鉴, 恢复, 设置) render tiny. | minor | D |
| The engraving shop filter selects clip their text (a specificity clash with `management.css`). | minor | D |
| PetBag 资料: the 精灵昵称 and 经验分配器 headings are invisible. | minor | D |
| Boss evidence links use the default link blue on the dark world dialogue. | minor | D |
| PetBag skill editor at 1024x640: the learned-skill list is a nested scroller with no visible rows. | minor | D |
| The toast covers window pagers and the dialogue's 挑战 button, and a click there dismisses the toast. | minor | D |
| Keyboard focus can return to the scene behind a window, where the arrows walk and Enter uses exits. | minor | W |
| The arrows walk the hidden explorer during a campaign stage scene. | minor | W |
| Escape in a nested picker or tooltip closes the whole window. | minor | W |
| Escape closes the world dialogue only when the scene has focus. | minor | W |
| An item tile's tooltip opens on mouse-click focus, staying over the capture animation and covering the 移装来源 picker. | minor | W |
| An inactive equipped engraving has no marker on its slot. | note | W |
| The robot arrives on top of creatures and their labels, and after a tower win it covers the floor badge. | minor | W |
| The landing name `祸乱之源 ` has a trailing space. | minor | W |
| Two 艾迪星 landings are both labelled 暮色之城. | note | H |
| The bag silently selects another item after the picked essence runs out, and 确认孵化 stays enabled. | minor | M |
| The shop's 前往道具背包孵化 link opens the bag on a different essence. | minor | M |
| The shop quantity field keeps a stale value after the allowance is used up. | minor | M |
| The modifier's number fields show `0` when cleared and then `045` when typed into. | minor | M |
| The campaign panel always shows the first stage's instruction. | minor | M |
| 重置挑战进度 wipes campaign progress without a confirmation. | minor | M |
| A capture does not count as a win for 初次胜利 and 成长之路. | note | M |
| The fainted active monster is labelled 出战中, and the deck stays on 精灵 after a forced switch. | minor | C |
| The battle creature-details modal ignores Escape. | minor | C |
| The capture success text repeats four times. | note | C |
| The condition refresh reads "技能效果效果更新为 5 回合" (the event carries no name). | minor | B |
| The battle log is ambiguous when both sides field the same species, and an opponent's `switch_out` joins the player's item line. | minor | B |

## Observations for the PvE audit

- A party of six Lv100 iv31 monsters lost the 玄武 guardian chain twice. The guardians have 3000–8000 HP each.
- A four-member team lost Brave Tower floor 70.

So the late PvE content is hard even for a maximal party. This bears on the difficulty-curve question in the wave-3 handoff, which leaves open what "can progress" means.

## Not covered

- The real Tauri build.
- HiDPI and very wide windows.
- Native `<select>` popups.
- Full Boss fights with phases.
- The final stage of an essence-reward campaign.
