# Move clips, 2026-10-24: hit markers from the original SWFs

This note follows up the open points of [battle-move-clips-audit-2026-10-21](battle-move-clips-audit-2026-10-21.md), as the [2026-10-22 handoff](handoff-2026-10-22.md) lists them. That note stays current for how a move clip plays, the body, the rate limit and the audit method.

## Hit markers

兰特 (1327) attack and 阿克希亚 (50) cp were the only attack, sa or cp clips without a hit marker. Playback then waited for the whole clip before the hit (`battle-playback.ts`), and the clip's forward travel compressed without keeping its landing (`FORWARD_KEPT_SHARE`).

**Where the original hits.** The clips come from the Unity client, which converted the Flash combat SWFs and turned each move timeline's `hit = 1` frame script into an `action_hit` label. For these two sequences the label is missing, but the original SWFs (`https://seer.61.com/resource/fightResource/pet/swf/<id>.swf`, scripts exported with FFDec) still set `hit`:

- **1327 attack.** The pet's `attack` label places `_1327_fla.Timeline_2`, a 45-frame sprite like the clip. Its `addFrameScript(21, …)` sets `hit = 1`, so the hit frame is 21 (0-based). 1327 is not in PetLabelXMLInfo.
- **50 cp.** The `cp` label places `050_fla.Timeline_13`, 75 frames like the clip, whose `addFrameScript(38, …)` sets `hit = 1`: frame 38. PetLabelXMLInfo (PetFightDLL_201308) gives cp frame 39, 1-based, which is the same frame.
- **The convention holds.** The labelled sequences of both species match their SWF scripts the same way: 1327 sa 17 and cp 16, and 50 attack 34 and sa 32. Over the 446 PetLabelXMLInfo species we have, the table's frame minus one equals the clip's label in 1,309 of 1,337 sequences.

**The fix.** `tools/assets/original-clip-hits.json` records the two frames with the SWF hashes and the script evidence. `export_battle_animation.mjs` takes a sequence's hit frame from its `action_hit` label, or from that table where the label is missing, and writes it into the published `manifest.json` and `runtime-index.json`; both files were updated to what the exporter now writes. The runtime index is the one source of the marker: `battleAnimationTiming` reads it for the timing, and `battleAnimationHitFrames` hands it to `sequencePaths` for the travel, which no longer reads the clip's labels. Both moves now hand over at their hit and keep their landing, like every other move.

**Checks.** `battle-move-clips.mjs` checks that every attack, sa and cp has a hit marker. The inventory (`battle-move-clips-inventory.mjs`) counts 1,483 of 1,483 for each.
