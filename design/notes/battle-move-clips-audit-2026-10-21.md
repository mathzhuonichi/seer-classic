# Move clips: why 鲁斯王's special attack jumped, the fix, and an audit of every species

## Report

On 2026-10-21 the user reported that 鲁斯王 (306) jumps during its special attack, and asked whether many species do the same and how every species' special attack is built. In a later message the user suggested that creature size and the jump were one problem. They are two mechanisms. Native sizing ([battle-native-size](battle-native-size.md), commit 5441566) makes some creatures larger, which leaves their moves less room, so the arena limit compresses more. The jump came from what that limit counted as the creature. Both are measured below, under the former per-stage sizing and under native sizing.

## How a move clip plays

Original clips (`public/battle-animations/<id>.json.gz`, ignored by Git) hold the sequences standby, attack, sa, cp and hited. A physical move plays attack, a special move sa, a status move cp, and a hit plays hited (`battle-animation.ts`). `ui/creature-animation-mount.ts` computes `sequencePaths(clip, home)` once per clip and `containPath(path, home, room)` at each layout, where `home` is the standby mesh extent and `room` is the arena box in clip units. Before each draw it applies the frame's offset. `containPath` compresses a move's travel on each side where it would leave the arena. Toward the opponent it keeps the travel up to the hit frame (`FORWARD_KEPT_SHARE`), so the move still lands. This came from the 2026-10-20 fix for 闪光波克尔 (166), whose attack climbed out of the arena.

## Root cause

The old body of a frame was every visible triangle within `BODY_REACH` (one standby size) of the frame's median triangle centre. 306's sa flickers a beam from frame 33, three frames on and three off. The beam reaches 0.8 standby sizes below the creature and 1.8 forward. It fell within reach, so it counted as body. On the frames that drew it, the body reached below the arena floor, and `containPath` lifted the whole frame by up to 0.45 standby sizes (0.57 under native sizing). On the next frame it dropped back. Any effect, afterimage or flung part near the creature did the same, and so did a body that changed shape from one frame to the next.

## Fix (`src/features/battle/battle-animation-path.ts`)

- **The creature's own sprites.** Every frame of every clip is made of 4-vertex quads, each drawing one atlas rectangle (checked on all 1,483 clips). The rectangles that the standby draws are the creature. A rectangle that only a move draws is an effect: beams, splashes, particles, projectiles. The region key is the triangle's UV rectangle. Pieces are visible triangles (some corner not fully transparent) joined where they share vertices.
- **HD clips.** The HD repacks map atlas regions one-to-one onto the originals for all 1,483 species, and give the same paths as the original clips for all of them (checked 2026-10-21). The key works for either.
- **Copies.** A move may draw one of the creature's regions more often than any standby frame does, as afterimages, clones or a trail. The creature is then the copies nearest where it had that part in the previous frame; the rest are copies of it and do not count as body.
- **Body.** The body is the own pieces within `BODY_REACH` of their area-weighted median, so a part flung far away (a held orb thrown at the opponent) is not body. A frame that draws no own piece, as when a move redraws the whole creature with sprites of its own, takes everything it draws as the body.
- **Motion.** `SequencePath.motions` is how far the creature moved into each frame on each axis: the area-weighted median displacement of its own pieces matched by region (copies in drawing order while their number holds, otherwise nearest first). Failing that, it is the displacement of any region both frames draw. For a creature redrawn frame by frame, it is the displacement of its largest piece, and there is no limit when the two drawings do not overlap. Next to a frame that draws nothing there is no limit either.
- **Rate limit.** `containPath` computes the same per-frame targets as before. `limitRate` then lets the offset change by at most the creature's own motion plus `OFFSET_CREEP` per frame. `OFFSET_CREEP` is 0.02 standby sizes, below what the eye catches at battle size. At 1000x650 the creature box is 260 px and the median pose fills .72 of it, so the creep is about 4 px per frame. Each target binds the frames around it, loosening by a step per frame, so the creature eases into an offset before it is needed and out of it afterwards. Where opposite targets come too close, the upward one wins.
- **Ends at rest.** The offset starts from none before the first frame and returns to none after the last, so a move begins and ends exactly where the standby is drawn. Before the fix, 13 room and sizing cases in 5 sequences snapped at the end, for example 165 cp by 1.1 sizes.
- **Unchanged.** `FORWARD_KEPT_SHARE` (0.75), the compression rules and the mount API (`OPEN_ROOM`, `sequencePaths`, `containPath`, `SequencePath`) are unchanged.

## Audit method

- **Rooms.** On 2026-10-21 the arena and the creature hosts were measured in a silent headless Chrome at 1000x650, 1280x800 and 1920x1080. The host is 442 layout px square, which is 1.7 creature boxes, and both sides have the same box. 1920x1080 has the same layout as 1280x800. In the host's layout pixels, with x measured toward the opponent, the arena is behind -18.2, ahead 941.8, top -83.2 and bottom 413.2 at 1000x650, and -39.3, 1024.2, -111 and 441 at 1280x800. The arena, combatant and creature CSS has not changed since.
- **Sizings.** "Current" is the former per-stage extent, `physicalScale` x .9 of the creature box, filled by the visible standby pose. "Native" is `battleCreatureExtent`, with the committed `battle-creature-size.json` (303 at .864, cap 1.35).
- **Jump.** For every species x attack/sa/cp/hited x sizing x room, the audit compares each frame's offset change with the clip's own motion, measured independently from quads matched by region. A jump is an offset step that exceeds that motion by more than 0.1 standby sizes; the suite's threshold is 0.05. A move "does not end at rest" when its first or last drawn frame is offset by more than 0.05 sizes.
- **Containment.** Containment is the smallest share, over a sequence's frames, of the area of the creature's own quads that lies inside the arena.
- **Modules.** "Before" is the module at 7bc81df; "after" is this one. The audit scripts were scratch work. `tools/verification/battle-move-clips.mjs` reproduces the after side as a suite.

## Results

Species, of 1,483, with a jump above 0.1 standby sizes in some move, and sequences per move:

| Sizing, room | Species before | attack | sa | cp | hited | Species after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| current, 1000x650 | 313 | 258 | 65 | 52 | 0 | 0 |
| current, 1280x800 | 234 | 186 | 51 | 40 | 0 | 0 |
| native, 1000x650 | 372 | 310 | 88 | 80 | 2 | 0 |
| native, 1280x800 | 275 | 219 | 65 | 56 | 1 | 0 |

- **Totals.** Over both sizings and both rooms, 421 species jumped by more than 0.1 sizes before the fix (539 by more than 0.05). That is 540 species x move pairs and 8,231 jump frames. After the fix none jump. The largest remaining step beyond the clip's own motion is 0.049 sizes (300 attack), under even the suite's 0.05.
- **Native sizing made it worse.** Larger creatures leave less room, so more moves are compressed: 372 against 313 species at 1000x650.
- **Worst before.** attack: 1131 (6.26 sizes), 205 (3.80), 730 (3.27), 319 (3.14). sa: 111 (3.50), 883 (2.18), 478 (2.11), 598 (1.76). cp: 14 (2.02), 79 (1.75), 418 (1.44). hited: 755 (0.17).
- **306 sa.** Before, it jumped by 0.45 sizes on 12 frames (current, 1000x650) and by 0.57 sizes on 15 frames (native, 1000x650). After, it does not move at all: its own sprites never leave the arena.
- **Ends.** 13 cases in 5 sequences did not end at rest before; none do after.

Sequences whose containment falls below 0.9 (below 0.5 in parentheses):

| Sizing, room | attack before | after | sa before | after | cp before | after |
| --- | --- | --- | --- | --- | --- | --- |
| current, 1000x650 | 46 (29) | 52 (24) | 22 (6) | 19 (3) | 11 (3) | 8 (2) |
| current, 1280x800 | 39 (22) | 47 (19) | 16 (4) | 16 (2) | 9 (1) | 7 (2) |
| native, 1000x650 | 61 (36) | 65 (30) | 30 (8) | 25 (5) | 18 (5) | 13 (3) |
| native, 1280x800 | 49 (31) | 53 (29) | 21 (5) | 20 (5) | 13 (4) | 9 (3) |

No hited fell below 0.9 before. After, one does: 1459 at native 1000x650 (0.88). Its creature stays at home, and copies of it shake out behind the arena edge, as in the first group below.

## Containment trade-off

The rate limit and the new body trade a little containment for steadiness. At native 1000x650, 35 sequences lose more than 0.1 of containment on some frame and 39 gain as much. The other cases are similar: current 1000x650 31 worse and 30 better, current 1280x800 23 and 22, native 1280x800 28 and 27. The 35 at native 1000x650 fall into three groups:

- **Copies and flung parts (24).** The creature itself stays inside the arena. What leaves it are afterimages, clones or own sprites thrown beyond `BODY_REACH`, which the audit's measure counts but the body deliberately does not. The old code counted them as body when they came near and jumped when they appeared. The 24 are 52, 130, 137, 155, 279, 280, 342, 362, 464, 508, 545, 592, 698, 827, 869, 992, 1000, 1045, 1122 sa, 1183 attack and sa, 1381, 1391 and 1459.
- **End at rest (1).** 165 cp ends with the creature flying up out of the top. The offset must return to rest by the last frame, so its last few frames leave the top. The old code kept it inside and then snapped 1.1 sizes down at the end.
- **The clip teleports or swaps its body (10).** Here the creature appears or vanishes against effect-only frames, a flung own sprite outweighs the rest of the body for a frame, or a stretched body leaves a part at home. The offset then cannot follow the body without a step. Every one of the 10 jumped before by 0.36 to 2.2 sizes: 199 attack, 261 attack, 353 attack, 426 attack, 468 sa, 845 sa, 883 sa, 1059 attack, 1122 cp and 1181 attack. Now the creature is off the arena edge for a few frames instead.

Effects are no longer kept inside the arena either, because only the creature's own sprites count. The browser suite `battle-attack-reach.mjs` showed this for 闪光波克尔 (166). Its attack dives onto the opponent and then reappears behind home, under a flash sprite of its own that is larger than the creature. The body is moved just inside the left edge, and the flash reaches past it. On clip frames 69 and 70, only 0.83 to 0.88 of the attacker's opaque pixels lie inside the arena, and 0.92 on frame 71 (Chrome at 1000x650 and 1920x1080, WebKit at 1280x800). With the old module, every frame kept 0.95 or more. The suite's floor goes from 0.9 to 0.8; `battle-move-clips.mjs` checks the creature's own sprites at 0.9.

Decision: accept. A jump is the defect the user saw, and it was common: 372 species at native 1000x650. The regressions are fewer, spread over a few frames, and about as many sequences improved. The 10 teleporting clips and effect containment are open points.

## Film: 306's 海啸旋风

The scene was filmed at 1000x650 and DPR 2 in a silent browser. The record is the opaque top edge of 306's canvas on every animation frame. Before the fix, the top edge switched between 148.5 and -1.8 px twelve times, a 150 px swing every three frames while the beam flickered. The canvas also grew upward to hold the lifted frames. After the fix, the top edge moves twice, by 16 px and by 10 px, where the clip's own drawing changes, and the canvas keeps its size.

## Inventory (`tools/verification/battle-move-clips-inventory.mjs`)

The tool writes `artifacts/battle-move-clips/inventory.json`, one record per species and move. A move's "effect sprites" are regions its standby never draws. A frame is "redrawn" when it draws something but none of the creature's own sprites. "Copies" are more copies of an own region than any standby frame draws. A "huge drawing" reaches 4 standby sizes or more beyond home on some side.

| | attack | sa | cp | hited |
| --- | ---: | ---: | ---: | ---: |
| Species with the sequence | 1,483 | 1,483 | 1,483 | 1,483 |
| Frames, min / median / max | 38 / 72 / 381 | 42 / 59 / 177 | 38 / 58 / 197 | 8 / 8 / 21 |
| With a hit marker (`action_hit`) | 1,482 | 1,483 | 1,482 | 0 |
| With effect sprites of their own | 1,128 | 1,184 | 1,146 | 914 |
| With redrawn frames / mostly redrawn | 274 / 72 | 132 / 90 | 133 / 90 | 109 / 99 |
| With copies of the creature | 276 | 230 | 276 | 63 |
| With empty frames | 385 | 15 | 26 | 0 |
| With a huge drawing | 562 | 43 | 6 | 0 |

- **Special attacks.** Every species has its own sa, so nothing falls back to another sequence. Clips run at 24 or 25 fps. An sa lasts 2.4 s at the median, its hit lands at 0.8 s, and its only labels are `action_hit` and `action_end`. 1,184 species draw their own effect sprites inside the sa. 90 redraw the creature with sprites of the move for most of it, 230 draw copies of it, and 15 have empty frames (400, 409, 410, 411, 466, 564, 569, 996, 1050, 1084, 1086, 1092, 1132, 1364, 1450). 43 draw 4 or more standby sizes beyond home.
- **Hit timing.** Only 兰特 (1327) attack and 阿克希亚 (50) cp lack a hit marker. Playback then waits for the whole clip before the hit (`battle-playback.ts`: `clip.hitMs !== null ? clip.hitMs : clip.durationMs`).
- **Behind home.** Four cp clips land their hit with the body more than half a size behind home: 嗡嗡茧 394, 迪姆 404, 加德拉 621 and 力亚 726.
- **Separate skill effects.** Separate skill-effect SWFs come through `getSkillEffect`. The counts follow the skill-effect export of the day; the skill-effects work was in progress when this was measured. With the working-tree index (145 effects, 48 of the 1,791 special skills), 1,456 species learn a special skill. Of these, 81 have an effect for every special skill, 443 for some and 932 for none. The committed index had 67 effects, 16 of them for special skills. So the clip's own sprites carry nearly every special attack today.

## Performance

`sequencePaths` runs once per clip at load. Across the catalog it takes 1.4 ms per species at the median (node, nice 10). The worst are 169 at 69 ms and 337 at 38 ms; six species take over 30 ms. `containPath` takes at most 0.7 ms per layout.

## Verification

- **Unit tests.** `node --test src/features/battle/battle-animation-path.test.mjs`: 14 tests. They include the 306 beam case, which fails on the old module (offsets [0, 1, 0]).
- **`tools/verification/battle-move-clips.mjs` (`needs-assets`).** It reads the ignored clips, so it cannot gate. It checks 5,932 sequences in both measured rooms at standby mesh extents 0.4, 0.8, 1.4 and 2 creature boxes, plus each species' live native size. The live size is its battle extent times the mesh over the visible pose; it reaches 3.33 for 谱尼 (300), whose mesh is 2.47 times its visible pose. The suite checks four things: no offset step more than 0.05 standby sizes beyond the creature's own motion; every move starts and ends at rest; 306's sa is not moved; and 166's attack keeps 0.9 of its own parts inside the arena. All four pass in about 16 s; the worst step is 0.020 sizes. The old module fails three of the four.
- **`tools/verification/battle-display-lifecycle.mjs`.** Its fixture quads now carry UVs, as every real clip does, so the path module can tell the creature by its sprites.
- **Lifecycle result.** It passes 12 of 12; before the fixture change all eight mount scenarios failed, because the module read UVs that the fixture lacked.
- **`tools/verification/battle-attack-reach.mjs` (`needs-browser`).** It measures 166's attack in a silent Chrome and WebKit. With the new module it failed its 0.9 floor at 0.83 (see the trade-off above). At the new floor of 0.8 it passes 3 of 3.
- **Other runs.** Typecheck, `npm test` (182 of 182), `architecture.mjs` and `battle-animation-registration.mjs` (5 of 5) pass.

## Open points

- **Teleporting clips.** In the 10 sequences of the third group, the body changes place at once without moving (199, 261, 353, 426 and 1181 attack, 468, 845 and 883 sa, 1059 attack, 1122 cp). The creature now leaves the arena edge for a few frames instead of jumping. A fix would follow the body from frame to frame rather than take the area median of each frame. Freeing the offset where the creature appears from effect-only frames would make the effect jump instead.
- **Load cost.** `sequencePaths` costs about 70 ms for 169 at clip load, a main-thread long task. It could move into the clip's preparation or be cached with the clip.
- **Effect containment.** Effects may now leave the arena, as 166's flash does when it reappears behind home. One fix would be to keep the drawing within reach of the body inside on a side only where the creature itself is being moved on that side; that would leave 306 untouched. It needs its own catalog audit.
- **Effect counts.** The inventory's special-skill effect counts depend on the skill-effect export and will change as it proceeds.
