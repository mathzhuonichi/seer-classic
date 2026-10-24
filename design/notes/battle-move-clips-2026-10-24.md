# Move clips, 2026-10-24: teleporting bodies and hit markers

This note follows up the open points of [battle-move-clips-audit-2026-10-21](battle-move-clips-audit-2026-10-21.md), as the [2026-10-22 handoff](handoff-2026-10-22.md) lists them. That note stays current for how a move clip plays, the creature's own sprites and the audit method; the body and the rate limit are as amended below.

## Hit markers

兰特 (1327) attack and 阿克希亚 (50) cp were the only attack, sa or cp clips without a hit marker. Playback then waited for the whole clip before the hit (`battle-playback.ts`), and the clip's forward travel compressed without keeping its landing (`FORWARD_KEPT_SHARE`).

**Where the original hits.** The clips come from the Unity client, which converted the Flash combat SWFs and turned each move timeline's `hit = 1` frame script into an `action_hit` label. For these two sequences the label is missing, but the original SWFs (`https://seer.61.com/resource/fightResource/pet/swf/<id>.swf`, scripts exported with FFDec) still set `hit`:

- **1327 attack.** The pet's `attack` label places `_1327_fla.Timeline_2`, a 45-frame sprite like the clip. Its `addFrameScript(21, …)` sets `hit = 1`, so the hit frame is 21 (0-based). 1327 is not in PetLabelXMLInfo.
- **50 cp.** The `cp` label places `050_fla.Timeline_13`, 75 frames like the clip, whose `addFrameScript(38, …)` sets `hit = 1`: frame 38. PetLabelXMLInfo (PetFightDLL_201308) gives cp frame 39, 1-based, which is the same frame.
- **The convention holds.** The labelled sequences of both species match their SWF scripts the same way: 1327 sa 17 and cp 16, and 50 attack 34 and sa 32. Over the 446 PetLabelXMLInfo species we have, the table's frame minus one equals the clip's label in 1,309 of 1,337 sequences.

**The fix.** `tools/assets/original-clip-hits.json` records the two frames with the SWF hashes and the script evidence. `export_battle_animation.mjs` takes a sequence's hit frame from its `action_hit` label, or from that table where the label is missing, and writes it into the published `manifest.json` and `runtime-index.json`; both files were updated to what the exporter now writes. The runtime index is the one source of the marker: `battleAnimationTiming` reads it for the timing, and `battleAnimationHitFrames` hands it to `sequencePaths` for the travel, which no longer reads the clip's labels. Both moves now hand over at their hit and keep their landing, like every other move.

**Checks.** `battle-move-clips.mjs` checks that every attack, sa and cp has a hit marker. The inventory (`battle-move-clips-inventory.mjs`) counts 1,483 of 1,483 for each.

## Teleporting clips

**The problem.** After the 2026-10-21 fix, 10 sequences left the creature beyond the arena edge for a few frames: 199, 261, 353, 426, 1059 and 1181 attack, 468, 845 and 883 sa, and 1122 cp. Nine of them left their body outside by 0.29 to 1.38 standby sizes at their live size or smaller (the module's own body, beyond what its size makes unavoidable). In the tenth, 353 attack, the creature bursts into parts that fly off four ways: its body stayed inside, and what leaves are flung parts, which may cross the edge like effects. The offset could change no faster than "the creature's own motion", which was measured on every sprite of its regions, copies included, and else on any sprite both frames draw. Where the body changed place without those sprites moving, the limit held the offset, and the body left the room. There were four ways this happened:

- **It appears after frames without it.** In 199, 426, 1059, 1122 and 1181 the creature vanishes, effects stay drawn, and it reappears elsewhere. The effects that carry on measured no motion, so the offset could not return to where the creature reappeared.
- **Another part takes it over.** In 883 the creature splits: its lower half dashes at the opponent while the upper half stays at home. When the dashing half vanishes, the half at home is the body, still at the dash's offset, behind the back edge.
- **It moves while its copies stay.** In 261 the creature dashes while two translucent copies of it wait at the opponent. The copies outweighed it, so the measured motion was 0.
- **A thrown part outweighs it.** In 468 and 845 a part the creature throws grows larger than the rest of it, and the body, the parts within reach of their area-weighted middle, jumped to the part and back from frame to frame.

**The rule** (`battle-animation-path.ts`):

- **The body is followed from frame to frame.** A frame's body is the creature's parts within `BODY_REACH` of where the body's middle went with the pieces that carry it on from the frame before. Only where nothing of the body carries on does the area-weighted middle of the frame decide. A thrown part or a copy no longer takes the body over.
- **The limit follows the body.** Into each frame the offset may change by what the frame shows moving on (as before), or by how far the body moved where that is more (`bodyMotions`), plus `OFFSET_CREEP`. Where the body shares a part with the body before, it moved as its pieces did; a copy that takes it over moved as that copy did, so the copy left behind does not jump. Where other parts of the creature take it over, it moved as its largest piece did, and freely where the two do not overlap. Where it appears after a frame without it, the limit is lifted. A body drawn by the move's own sprites, not the creature's, lifts nothing.
- **A body of the creature's own sprites stays inside.** Its frames bound the offset on both sides, so no offset carried over from a neighbouring frame pushes it out on the other side (before, a frame whose body fitted at rest asked nothing).
- **Eased where the old rate suffices.** The offset still eases into each band by the old rate (what the frame shows moving on, plus the creep), ahead of the frame that needs it, and back to rest by it. It changes faster only where that leaves the body outside, and only as far as the body's band makes it. A body that dashes beside its waiting copies thus compresses into the room like any travel (one quarter of the dash per frame in the unit test).
- **Copies are paired nearest first.** Where the number of a region's copies changes, the module paired the first later copies in drawing order with their nearest earlier ones, so a copy drawn first could take another's motion. They are now paired nearest first, as the 2026-10-21 note described; the suite's own measure does the same.

**The trade-off.** Where the limit is lifted, whatever else is drawn moves with the offset: effects that carry on, copies left behind, the half at home. At live sizes, in both measured rooms, 43 sequences have a frame where the offset steps more than 0.05 sizes beyond what the frame shows moving on (135 frames). 19 of them step more than 0.5 sizes, and 3 more than 1. The largest is 1.40 sizes, in 199 attack, where the creature reappears at home and the effect band drawn over the arena moves with it. Effects may still cross the arena edge (`battle-attack-reach`, floor 0.8).

**Results** (`battle-move-clips.mjs` rooms and sizes, the body's overflow beyond what its size makes unavoidable, against `claude/refactor` at 1a6cc11):

| | before | after |
| --- | ---: | ---: |
| The 10 sequences, live size and smaller, worst overflow | 0 to 1.38 | 0 |
| Sequences whose body leaves by more than 0.05 sizes, live sizes | 37 | 19 |
| Same, any of the suite's sizes (0.4 to 2 creature boxes and live) | 885 | 551 |

At live sizes 18 sequences no longer leave the arena and none leaves it further. Over all sizes 400 do better and 12 worse, all at sizes larger than their own (2 creature boxes, and 1380 attack at 1.4), none at its live size. The 19 left at live sizes are 165 cp, which flies out of the top and must end at rest, and bodies that grow or reach out at once while the creature barely moves (132, 343 and 504, for example), which the offset may still only follow at the creep, as on 2026-10-21. No offset step exceeds the allowed limit by more than the creep (0.020 sizes); 306 sa is not moved; 166 attack keeps 0.9 of its own sprites inside; every move starts and ends at rest.

**Checks.** `battle-move-clips.mjs` now checks the jump limit against what a frame shows moving on or, where the body leads, the body's motion (`bodyMotions`), and checks that the 10 sequences keep their body inside the arena at their live size and smaller. It reports, as witnesses, the steps where the body leads (1,331 frames over all its sizes and rooms, the largest 3.98 sizes) and the 19 sequences whose body still leaves the arena at live size. The unit tests cover a creature that vanishes and reappears, one that dashes past its copies, a thrown part, a copy and a part taking the body over, and the bands. `battle-attack-reach` (Chrome at 1000x650 and 1920x1080, WebKit at 1280x800) passes its floor of 0.8, and `battle-hd-display` passes 12 of 12.
