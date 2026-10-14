# Official battle audio integration

The application now plays the recovered official `FightBg_Sound` battle theme while the battle layer is visible, together with a small set of original interface, healing, acquisition and result cues. This pass leaves exploration scenes and their assets unchanged and introduces no battle countdown or command deadline.

## Source selection and mappings

`public/audio/source-manifest.json` records the official CDN bundle URLs, package version `20260930181402`, original bundle SHA-256 values, selected decoded filenames, duration and final output SHA-256 values. The named battle and effects bundles were already recovered and audited in [official-game-feel-resources.md](official-game-feel-resources.md).

| Application cue | Official source |
|---|---|
| Battle music | `FightBg_Sound` |
| Button selection | `Effect_ClickOnButton` |
| Toolbar/tab selection | `Effect_ClickOnTab` |
| Healing | Original `resource/active/sound/cure.mp3` |
| Successful capture | `Effect_GetPet` |
| Victory / defeat | `Sound_Win` / `Sound_Lost` |
| Reward / level increase | `Effect_GetItems` / `Effect_Upgrade` |

The healing MP3 was copied unchanged. Eight selected decoded WAVs were compressed locally with macOS `afconvert`, using MPEG-4 AAC at 44,100 Hz and 64 kbps. Explicitly setting the sample rate was necessary for this host's AAC converter. The nine media files total approximately 696 KB. No unrelated scene music, event voices or event songs were imported.

These assets are official recordings. Their application event assignments are explicit remake choices based on their named roles; the prior extraction audit did not certify every historical controller binding, battle music selection policy or exact classic-era release date.

## Playback ownership and settings

`src/audio/game-audio.ts` exposes one `gameAudio` owner. `unlock()` resumes a Web Audio context from a pointer or keyboard gesture and primes a silent source for mobile WebKit. Audio buffers load asynchronously and cache locally in memory. Repeated unlocks and repeated activation cannot create overlapping music owners. Repeated instances of the same effect replace the previous instance.

`App.tsx` starts battle music after preparation completes, stops it when the battle closes, handles general interface selection and recovery cues, and exposes the Chinese audio controls in the existing settings window. Combat presentation owns its event cues through `playSfx()`. The UI controller compares snapshots before and after normal actions: newly claimed quests, added fusion beads, consumed essence/bead items accompanied by a newly hatched creature, and changed evolution species receive the reward cue. Experience allocation and consumed raising items receive the level cue only when the affected creature actually gains a level. Rejected actions, stat edits and cheat actions do not receive these outcome cues. Initial battle-party levels are captured at encounter entry; a finished victory with an actual party level gain schedules one level cue after close, following the audio epoch transition so it is not cancelled immediately. Import/reset or loading cancellation does not schedule this settlement cue. General click capture excludes the battle layer to avoid duplicate combat selection cues.

Mute, music volume and effect volume persist under the separate `seer-classic-audio-settings-v1` local-storage key. They do not modify game saves. Volumes clamp to the valid interval and malformed or unavailable storage falls back to defaults. Hiding the document stops all active cues and pauses the music at its playback position; becoming visible resumes active battle music. Muting preserves the music position. Normal combat exit stops music, clears its position, stops other effects and invalidates every pending music/effect request. An already-started victory or defeat cue may finish naturally across the automatic return to the scene. A new battle, mute, hidden document or `shutdown()` interrupts that retained result cue. App unmount calls `shutdown()` to stop all sources even when combat has already closed. Late capture or victory/defeat requests outside combat are ignored. Failed downloads or denied audio unlocks do not block gameplay.

## Verification and limits

- `node --experimental-strip-types --test src/audio/*.test.mjs`: seven focused tests passed. They exercise no playback before unlock, one music owner, repeated-cue suppression, hidden-document cleanup/resume, mute/unmute, persisted bounded settings, pending result cancellation, delayed download cancellation a subsequent battle entry, natural completion of a started result across normal exit, and interruption of lingering results on new combat, mute, hide and unmount.
- Pure before/after classifier fixtures verify successful and rejected quest claims, fusion rewards, essence/bead hatching, evolution, experience allocation and raising-item level gains, together with editor exclusions and party-level detection.
- macOS `afinfo` read all nine delivered files successfully. The compressed battle theme retains its source duration of 68.545306 seconds; the healing MP3 remains 2.860000 seconds.
- `tsc --noEmit` passes after the peer battle-effect manifest arrived. `git diff --check -- src/App.tsx` also passes.
- The unit tests use a mocked Web Audio context. They verify playback ownership and asynchronous cancellation, not audible rendering, actual browser autoplay behavior or subjective sound balance. Live browser audio decoding and game integration should be assessed separately by the parent task.

No production build or game-save mutation was performed by this audio subtask.
