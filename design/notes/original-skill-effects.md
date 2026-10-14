# Original combat skill effects

Sixty-seven exact skill-ID resources are recovered from the official `https://seer.61.com/resource/fightResource/skill/swf/<skill-id>.swf` route used by the original client's `BefLoad`. This is a bounded current-CDN recovery, not a claim that every historical effect or every catalog skill is supported. No scene or world resource is changed. Battle countdowns remain excluded.

## Assets and provenance

`public/battle-effects/manifest.json` pins each original SWF, parsed XML and delivered lossless WebP sheet with SHA-256 values, byte counts, the named `skill` character ID, the source viewport and the original frame rate. FFDec 26.3.0 statically renders the named sprite's display list; ActionScript is never executed. All frames share a fixed transparent viewport. A uniform reduction caps the longer frame dimension at 512 pixels; the original relative placement between frames is preserved. Five columns pack the frames into one sheet per skill. The 67 delivered sheets total 38,014,942 bytes (36.25 MiB), requested only when used. Lossless WebP uses `exact=True` to preserve RGB values behind transparent pixels.

| Skill IDs | Coverage | Source timeline |
|---|---|---|
| 10001–10007 | The three starter families' early attacks | 20–83 frames |
| 20001, 20002, 20004 | Common starter status moves | 22–83 frames |
| 10175, 10176, 10825 | Rei's electric attacks and training attack | 19–22 frames |
| 11000, 20500 | Puni's signature attack and status move | 40 and 29 frames |

All selected sources run at 25 fps. Additional common-source exports take approximately 2–32 seconds each with two bounded FFDec workers; individual measurements appear as `exportSeconds` in their manifest records. The first fifteen exports predate timing instrumentation. Current exact-ID resources sometimes differ visually from an intuitive reading of their skill names. They are not substituted by name, type or category. Some source timelines include their own translucent rectangular color fields; those are preserved as part of the original sprite. Static display-list export cannot certify behaviors controlled by source ActionScript, external movie clips or the original combat camera. All 60 skill IDs prioritized by frequency among currently obtainable creatures and modeled enemies export successfully. Their union with the initial starter, Rei and Puni selections contains 67 distinct IDs. The other 5,258 catalog IDs are unexported, rather than asserted missing at the official server. The manifest's `unsupported` table records actual failed attempts when the exporter is extended.

## Component integration

`BattleSkillEffect` accepts `skillId`, `eventKey`, `side`, `targetSide`, optional `phase`, optional `startDelayMs`, and optional `durationMs`. The actor side controls horizontal facing. The adapter's actual skill target supplies `targetSide`, including self-target actions; the component does not infer target semantics from names or categories. Mount it inside the positioned creature area. Its 25% and 75% anchors follow the two creature columns. The manifest records original SVG normalization bounds and hashes. PNG bounds additionally include filter padding; centering this raster at the target is a documented presentation placement, not a claim to reproduce the original battle camera.

Keep the active move identity and target through subsequent damage events. The component starts once per `eventKey`, plays the source frames at their native duration, and removes itself on completion. Changing `phase` to a hit event does not restart the effect. A scheduler may pass `startDelayMs` and `durationMs` when deliberately aligning a source effect with the recovered creature action. Reduced-motion playback selects one source frame with the largest nonempty alpha coverage and hides it with a completion timer. New moves and unmounting cancel both the delayed start and any active animation or completion timer. `hasSkillEffect` allows generic flashes to be omitted only for recovered IDs, and `getSkillEffectDurationMs` provides the native effect duration.

Unexported IDs render no additional effect. The battle retains its creature action and ordinary damage/status feedback; it does not borrow another skill's artwork or manufacture an original-looking substitute. Effect resources are requested only when used, and resource URLs include the delivered asset hash.

## Reproduction and verification

The command below reproduces the initial starter and signature selection; all 67 exact IDs are recorded as keys in the manifest for the full replay. The exporter requires Pillow and the already downloaded FFDec/Java runtime. From the repository root:

```sh
.cache/unity-swf-audit/venv/bin/python tools/assets/export_original_skill_effects.py \
  --java .cache/vector-export/jre/jdk-17.0.20.1+1-jre/Contents/Home/bin/java \
  --ffdec .cache/vector-export/ffdec/ffdec.jar \
  10001 10002 10003 10004 10005 10006 10007 \
  20001 20002 20004 10175 10176 10825 11000 20500
```

Verification parsed all 67 delivered WebP sheets, checked every hash and byte count, confirmed sheet dimensions against the manifest, required RGBA transparency and nonempty frames, and checked each source sprite's frame count against the exported PNG count. Every delivered frame was also compared byte-for-byte in all four RGBA channels with its original exported PNG after the documented uniform resizing. The initial fifteen-effect contact sheet was visually inspected. Four expanded contact sheets are saved under ignored `artifacts/gamefeel-resources/original-skill-effects-1.png` through `original-skill-effects-4.png`; the exact-pixel and coverage results are in `original-skill-effects-verification.json`. TypeScript passes. These checks certify extraction and asset structure. Integrated creature positioning, move scheduling and battle playback are validated separately by the game integration pass.
