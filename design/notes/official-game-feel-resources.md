# Official sources for the next game-feel improvements

The retained single-type chart now follows the official Unity configuration, as requested: fighting against evil is **0.5**, replacing the local neutral default. All **324** retained single-type coefficients match the official table. Original creature animation, selected original skill effects and battle audio have subsequently been integrated. The user narrowed implementation to combat and audio; scene improvements, scene music, battle countdowns and command deadlines are excluded. The initial discovery evidence below is preserved separately from the delivery records.

## Implemented official coefficient correction

`data/types.json` and the runtime `data/gamedata.json` were synchronized. The official ConfigPackage version remains `20260930183512`. Its 8,078-byte `typesRelation` asset has SHA-256 `ec04bb1ee5fc1856ce9ed4f67b139630edc70d3a377759aa0938706428f74a5e`; the independent binary reader consumes the entire input and reports 324 matches with no differences. See [the source audit](unity-and-swf-source-audit.md) for extraction and parser provenance.

The earlier 4399 page omits fighting against evil, which its omission convention treats as 1. The replay now checks exactly this one disagreement explicitly, while retaining all other assertions. The actual battle engine was exercised for all 39 random rolls, using otherwise identical evil and normal synthetic defenders. Damage against evil equals the floored half of neutral damage for every roll. The retained species catalog currently contains no evil-type creature, so this is a controlled engine verification rather than a replay of an existing evil encounter.

Current official coefficients take precedence under the user's instruction. Their historical introduction dates remain unknown. No ordinary damage rounding, random-roll distribution or dual-type combination arithmetic was changed.

## Initial resources discovered

At discovery, the battle presentation used original static portraits with generic CSS motion and fixed visual durations. The application had no audio playback layer. It already used original map backgrounds and eight-direction player walking; recovering more static backgrounds therefore offers less benefit than restoring motion, sound and interactive scene layers.

| Priority | Source route | Verification performed | Intended player benefit and remaining work |
|---|---|---|---|
| 1 | Official Unity `ppets_*` bundles, decoded with `@seer-pet-anim/swf-bundle` and displayed with [swf-renderer](https://github.com/Nattsu39/seer-pet-viewer/tree/b2135046c48245795bc218726fcbad1ea005f02d/packages/swf-renderer) | Actual Rei asset decoded independently, then displayed in the in-app browser. All five source sequences are selectable; the attack hit, end and completion events were observed. | Restore creature-specific idle, attack and hit motion. Connect the source hit markers to damage feedback, preserve creature scale and facing, and test two simultaneous combatants. The current demonstration is a single-creature specimen. |
| 2 | Official scene MP3 files and Unity AudioClips; [Seer Unity audio extractor](https://github.com/Lin-Xavier/seer-unity-audios/tree/bef23f416259523d850f408e29ead41e7810592a) | Two official scene MP3s and the healing MP3 were downloaded and recognized by macOS audio tools. Three bounded Unity bundles yielded 38 valid WAV files, including scene music, a named battle theme and UI sounds. | Add scene atmosphere, battle music and immediate audio feedback for selection, dialogue, healing, rewards and results. Add gesture-initiated playback, volume/mute settings and reliable stop/resume behavior on scene and battle transitions. |
| 3 | Official `fightResource/skill/swf/<skill-id>.swf`, identified in the original client's `BefLoad` | Attack 10001 and status 20001 downloaded directly; FFDec parsed their named `skill` symbols with 23 and 22 frames respectively. | Replace generic flashes with source skill effects. Qualify frame exports or a web renderer, registration, transparency and placement before integrating. Whole-catalog effect coverage is untested. |
| 4 | Original map SWFs, H5 resource tables and map component configuration | Map 10's SWF XML contains 89 multiframe sprites. Official configuration defines scene entries, component hit regions, click/approach actions and hover states. | Recover selected animated scenery and meaningful scene objects. Identify each layer first; the sprite count also includes nested characters and event components, not 89 independently usable scenery effects. Retain the existing movement geometry. |
| 5 | Official [UI.swf](https://seer.61.com/dll/UI.swf) and original panel classes | The recovered library contains named skill buttons and tooltips; `ui_PetBlue_PetSkillBtn` has three source frames. The status-icon correction already demonstrates a successful original-symbol export. | Recover consistent button states, panel feedback and source artwork. Establish each frame's actual semantic state from its owning class before replacing controls. This inspection does not certify every original panel's behavior. |

### Actual creature playback specimen

The isolated browser specimen uses `@seer-pet-anim/swf-renderer` **0.3.1**, its matching parser, and **PixiJS 8.19.0**. These dependencies were installed only under ignored `.cache/unity-swf-audit/parser-runtime/`; the game's `package.json` and lockfile were unchanged. The source bundle and independent pixel comparison are identified in [unity-and-swf-source-audit.md](unity-and-swf-source-audit.md).

| Raw sequence | Frames at 24 fps | Source marker, one-based frame |
|---|---:|---|
| `standby` | 29 | `action_end`: 29 |
| `attack` | 75 | `action_hit`: 23; `action_end`: 75 |
| `sa` | 75 | `action_hit`: 25; `action_end`: 75 |
| `cp` | 75 | `action_hit`: 19; `action_end`: 75 |
| `hited` | 8 | `action_end`: 8 |

The viewer labels these sequences as idle, physical attack, special attack, property action and hit reaction. The source raw names are retained above; no new action mapping was added to the battle engine. Browser screenshots show the original Rei body and changing poses. Actual attack playback emitted `action_hit` at 0.916667 seconds, `action_end` at 3.083333 seconds and completion at 3.125 seconds. These are visual-sequence markers, not command deadlines.

Saved evidence: `artifacts/gamefeel-resources/rei-standby.jpg`, `rei-attack-start.jpg`, `rei-attack-impact.jpg`, `rei-special-impact.jpg` and `rei-playback-events.json`. This does not establish complete palette, masking, visual layering, combat-camera or all-species compatibility. The experimental SWF reconstruction still fails on Rei's original transform layout; direct browser playback succeeds without that reconstruction step.

### Official audio, mappings and bounded extraction

The official DefaultPackage manifest is version **20260930181402**, with 71,433 asset paths and 7,971 bundles. Of those paths, 1,438 contain audio-related terms; this is an index candidate count, not 1,438 independently verified songs. The binary manifest is cached and hashed in `artifacts/gamefeel-resources/audit.json`.

The original official client provides a stronger mapping than guessed scene labels:

- `SoundManager.playSound()` reads `MapXMLInfo.getBgSoundIdByMapId(MapManager.getResMapID(mapId))`.
- `ClientConfig.getMapSound(name)` constructs `resource/map/sound/<name>.mp3`.
- An empty map sound identifier falls back to the map library's embedded `sound` symbol.
- `PetManager` constructs the healing sound with `ClientConfig.getActiveSound("cure")`.
- [gameBackgroundSound.xml](https://seer.61.com/resource/xml/gameBackgroundSound.xml) supplies named game/galaxy mappings; it does not replace the separate map-ID table.

The cached official map tables embedded as source symbols 155 and 238 agree on sound IDs for all **134** map IDs in the current background manifest, covering **103** distinct identifiers. Their component records can guide integration. Only the selected audio samples below were fetched or decoded; complete availability of those 103 files has not been tested. The two tables are mutable current-client snapshots, not authenticated pre-2013 tables.

| Verified sample | Source relationship | Actual result |
|---|---|---|
| `BGM_206.mp3` | Both official map tables assign it to Klose, including maps 10 and 12 | Direct MP3: 544,835 bytes, about 68.101 s, stereo. Unity bundle: 246,817 bytes; decoded WAV: 68.101224 s, mono, 22,050 Hz. Matching duration does not prove byte or waveform equality between the two encodings. |
| `BGM_003.mp3` | Official tables assign it to the ship corridors, creature center and other rooms | Direct MP3: 1,102,965 bytes, about 68.935 s; valid MPEG audio metadata. |
| `cure.mp3` | Original `PetManager` healing-sound reference | Direct MP3: 22,880 bytes, about 2.860 s; valid MPEG audio metadata. |
| `FightBg_Sound` | Official Unity asset path `Assets/Game/Audios/bgm/FightBg_Sound.mp3` | Bundle: 243,977 bytes; decoded WAV: 68.5453 s. The name establishes a useful battle-music candidate; the bounded audit did not inspect the complete runtime music-selection policy. |
| Shared effects | Official Unity `game_audios_effect` bundle, 876,667 bytes | 36 AudioClips decoded, including `Effect_ClickOnButton` (0.4702 s), `Effect_ClickOnTab` (0.5224 s), `Effcet_ClickOnDialog`, `Effect_GetPet`, `Effect_Upgrade`, `Sound_Win` and `Sound_Lost`. Event assignments still need confirmation in the relevant client controllers. |

The audio extractor was read at pinned commit `bef23f416259523d850f408e29ead41e7810592a` and actually executed with UnityPy 1.24.2. Its output filenames use Unity project paths and BGM heuristics; those labels do not certify runtime scene bindings. Only three selected audio bundles, totaling 1,367,461 bytes, were downloaded. All 38 resulting WAV files passed standard-library `wave` parsing; the first BGM also has nonzero measured PCM samples. No full-client or whole-music-library download was performed.

### Skill and scene source identities

Original `BefLoad.as` constructs `fightResource/skill/swf/<skill-id>.swf` from equipped skill IDs. The samples are [10001, Tackle](https://seer.61.com/resource/fightResource/skill/swf/10001.swf), SHA-256 `5a130f06eb5bf87afd1ce5e0445fe3db553a6efac07b1e5bbf77c8d7f374d289`, and [20001, Withdraw](https://seer.61.com/resource/fightResource/skill/swf/20001.swf), SHA-256 `c982cf32fedf8dfdbb75b0d8d4c574ffbbb4a9dc1309a8f3161d1de5fedd25cf`. Their display timelines are 25 fps. FFDec converted both files to XML without running ActionScript. They are recoverable effect data, not recovered damage formulas.

The current game uses map 10's official standalone `bg_mc` JPEG. The richer [original map SWF](https://seer.61.com/resource/map/10.swf), its separately recovered component configuration and [H5 resource table](https://seerh5.61.com/resource/assets/map/10/map_10_2734f106.json) provide further layers. They must be matched by instance identity and registration. Current resource versions can include later redesigns and temporary event content.

## Source selection and excluded alternatives

The [SeerAPI static resource mirror](https://github.com/SeerAPI/seer-unity-assets) is useful for discovery and indexing; the specimens above were fetched from official CDN hosts. Its recursive Git tree request returned HTTP 500, so complete mirror coverage was not certified. Other search results included a Seer 2 battle simulator, a mobile-game calculator and unofficial server implementations. Those are different products or reconstructions and were not promoted to authority for this game's rules. No commercial purchases, hosted deployment or account actions were needed.

The subsequent user instruction excluded scene changes. The delivered pass integrates combat timelines, skill effects, battle music and UI/result sounds; no map theme, dynamic map object or scene artwork was changed. See [battle-media-v20.md](battle-media-v20.md), [original-battle-motion.md](original-battle-motion.md), [original-skill-effects.md](original-skill-effects.md) and [battle-audio.md](battle-audio.md) for implementation and integrated checks. Battle countdowns remain excluded.

## Checks and handoff

- Official type-table replay: 324/324 single cells, zero differences; complete binary input consumption.
- Runtime catalog equals the standalone type catalog.
- External-calculator replay: passes with exactly one documented official override; existing dual examples and damage-boundary checks remain intact.
- Real damage-engine fixture: all 39 random rolls satisfy the official fighting/evil coefficient.
- `tsc --noEmit` and `npm run build`: pass. The pre-existing large main-chunk warning remains.
- Original animation: five source sequences displayed in the in-app browser; attack hit/end/completion events captured.
- Audio: extractor executed on three official bundles; 38 WAV outputs parsed; selected original MP3 metadata read by `afinfo`.
- SWF effects: both source files successfully converted to XML by FFDec 26.3.0.

Raw downloads and the isolated browser prototype remain under ignored `.cache/gamefeel-resources/`. Pinned source-file hashes are in `source-files.json`; the audio source manifests identify official URLs, logical names, byte counts and SHA-256 values. Durable verification output stays ignored under `artifacts/gamefeel-resources/`, including `audit.json`, `audio-decoded.json` and `map-audio-candidates.json`. The earlier revision-19 ZIP has not been rewritten. The subsequent revision-20 archive includes the coefficient correction and the audio/combat delivery; its evidence is recorded in battle-media-v20.md.

To replay the completed coefficient checks from the project root:

```sh
python3 tools/verification/unity-type-source.py \
  .cache/unity-swf-audit/config-text-assets/typesRelation \
  --output artifacts/unity-swf-audit/official-unity-types.json
node --experimental-strip-types tools/verification/calculator-parity.ts
```

To repeat the retained audio extraction and isolated animation specimen:

```sh
.cache/unity-swf-audit/venv/bin/python \
  .cache/gamefeel-resources/Lin-Xavier-seer-unity-audios/extract_seer_bgm.py \
  .cache/gamefeel-resources/official/unity-audio --all-audio \
  -o .cache/gamefeel-resources/official/unity-audio/decoded
node .cache/gamefeel-resources/replay/prepare-rei.mjs
./node_modules/.bin/vite --config .cache/gamefeel-resources/replay/vite.config.mjs
```

The specimen URL is `http://127.0.0.1:1433/` while that temporary Vite process is running. It does not read or write game saves. The temporary preview server was stopped after verification.
