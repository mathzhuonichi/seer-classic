# Full encyclopedia battle media and engine integration, revision 22

The requested scope is all retained creature motion plus engine adaptation. Acquisition
content is outside this pass, following the user's explicit scope choice. Original
scene art, scene music, combat formulas, collection exclusions and acquisition routes
retain their current behavior.

## Resource delivery

All 1,483 actual catalog IDs now have offline original battle timelines and atlases;
1,099 clips were added to the previous 384. Every clip contains standby, physical,
special, property and hit-reaction sequences. There are no conversion failures or
material warnings. Official source identity, resumable authenticated export, original
pixels and atlas format choices are documented in [full-dex-motion-v22.md](full-dex-motion-v22.md).

Complete verification covers 340,780 mesh frames, 4,447 source hit markers, official
source hashes, exported hashes, array/index/submesh consistency and independent RGBA
pixel replay for all 1,483 atlases. This establishes complete decoded coverage rather
than a claim of individual visual review of every sequence. The timeline/atlas library
is 653,130,197 bytes (622.874 MiB): 188,775,266 timeline bytes and 464,354,931 atlas
bytes, with 1,452 WebP and 31 PNG atlases. Compression is exact and lossless.

The frontend imports a runtime index of 538,844 bytes instead of the 1,981,770-byte
provenance manifest. The separate full manifest retains URLs, hashes and coverage.
Neither index loads all clip geometry or atlases into browser memory.

## Runtime and controller changes

The repository owns cancellation, leases, byte accounting and shared scheduling;
the pinned original-material renderer still handles source meshes and original blend,
mask and framebuffer effects. The manual shared clock draws only changed source frames
or explicitly invalidated poses. The idle pool is limited to two entries and 32 MiB,
with 15-second expiry. Last-owner cancellation aborts pending requests; obsolete
decoders cannot replace a newer slot. Same-species players share source geometry and
compressed atlas data. Large atlas CPU bitmaps release after GPU upload and can be
rehydrated for bounded canvas recovery. See [battle-runtime-v22.md](battle-runtime-v22.md).

The controller isolates its mutable item list and encounter reward records from the
imported catalog, eliminating accumulation across repeated game creation. Static
definition tables remain shared read-only. Catalog view rows are computed once and
reused until collection or challenge progress changes. Save ledgers use indexed
membership checks and reset on imports. Event presentation copies only changed
members/fields, preserving earlier frames without cloning both teams on every event;
species lookup uses the indexed dataset. Battle loading now aborts pending image,
timeline and transition-delay work when the user leaves or its host unmounts.

Battle-rule lookup scans current member rules and then current side rules without
allocating concatenated arrays; precedence and live mutations remain unchanged.
Independent equivalence and benchmark evidence is in
[core-performance-v22.md](core-performance-v22.md).

## Verification status

Asset, focused controller, rule, registration and lifecycle checks have passed.
Independent controller comparison includes 336 complete snapshot comparisons,
1,408 retained-frame immutability checks and 20 presentation-event comparisons with
array and Map species lookup. Separate lower-engine comparison includes 208 seeded
traces. Import/reset, ownership transitions, fusion/capture-related mechanics and
the existing damage-presentation and playtest regressions retain their checks.

The offline decoder is a small repository-owned adapter with vendor types as its
interoperability contract. All 1,483 timelines pass its validation; five complete
clips and 7,460 typed arrays are bit-identical to the pinned vendor's conversion.
Malformed identity/dimensions/scalars/geometry are rejected. Removing the parser's
runtime imports also removes its Unity parser workers and PNG-compression WASM files
from the final frontend output. The material renderer remains dynamically loaded.

## Integrated browser observations

The final decoder/runtime passed these checks in the local in-app browser:

- Ordinary two-player native idle motion, physical and property actions from the
  newly added species 56, Rei's special attack and actual switching to Barlus.
  Both combatants retain visible-alpha registration and the previous switch-scale
  correction. Source-mode fixtures exercise movement independently of acquisition
  availability; they do not add normal collection routes.
- Two 8192-square originals, 431 and 502, become ready with tracked CPU atlas bytes
  and transient upload bytes returning to zero. Shared geometry and compressed data
  retain 21,971,324 bytes. The atlas-only GPU estimate remains 536,870,912 bytes;
  this is not a total process-memory measurement or a peak-memory claim.
- Two same-species 431 players share one source entry and two leases. Their tracked
  CPU atlas bytes return to zero; original-resolution GPU textures remain separate.
- Forced left-canvas loss restores both native players with one rehydration and
  recovery, no recorded render/load errors and no lost same-species ownership.
- Twenty successive pair switches finish with two current players/resources, no
  pending work, no recorded errors and no increase beyond two concurrent players.
  Final exit leaves zero source resources, leases, queued/pending loads, tracked
  resident bytes, players or scheduled RAF.
- A real map interaction in the portable build enters native combat. A master
  capsule changes stock from five to four, captures Shiny Pipi and returns to the
  same scene. The four-member party survives reloading the final packaged build.
  The final package's normal loading screen also supports immediate return, leaving
  the scene usable and no native canvases. Isolated load cancellation also leaves
  zero resources/leases/pending work.

Actual canvas-render-call comparison uses the two originals 1 and 70 at their source
rates of 25 and 24 fps. The original standalone path averages **169.002 calls/s** over
37.219 seconds; the source-aware path averages **48.987 calls/s** over 41.787 seconds,
approximately **71.0% fewer calls**. These are `Application.render` invocations in this
browser, not individual GL draw calls, GPU time or a promised FPS increase. The raw
record is `artifacts/battle-media-v22/browser-render-comparison.json`.

The separate full-catalog controller benchmark runs five 200-action Node/Vite SSR
samples of heal, resource adjustment and notice dismissal. With three stored monsters,
the median is **0.4402 → 0.1180 ms/action**; with 100 stored monsters and full collection
ownership, it is **1.5898 → 0.5955 ms/action**. Unchanged collection-array replacements
drop from 1,000 to zero in each sample group. This is a bounded controller benchmark,
not a whole-game or graphical performance claim. Results are in
`artifacts/battle-media-v22/controller-benchmark.json`.

## Portable package and handoff

`releases/seer-classic-linux-playtest-v22.zip` is **740,685,513 bytes** (706.37 MiB),
with archive SHA-256 `6ce066411593f0ab465a2a235c42693f557def040fc869c7d13b9ce145753ef6`
and content identity `7e95fb5d8208071a35325b3f8ad89fbd7eb8ba963d46d1351f8d99003e44e71c`.
The package contains 4,916 inventoried files; all sizes and SHA-256 hashes match after
archive replay. Its Python launcher serves all 4,913 game files successfully through
eight concurrent HTTP workers, with every body matching its recorded hash and size.
Raw-gzip and Vite transport-decoded timeline responses both pass the actual loader.

The final TypeScript/Vite build and whitespace check pass. The pre-existing large
main catalog chunk remains; this pass does not claim to optimize the entire initial
catalog distribution. Hashing the large archive now streams in 1 MiB blocks rather
than reading it into one large allocation. Revision 20 remains unchanged, with its
previous archive SHA-256 `3ba591e638c3dedc1f9ece8a0e225c2a580a12b4cab3ed4f4001e034711bbf24`.

Three GPT-6.1 Sol workers at medium reasoning handled asset export, runtime adaptation
and core/controller review. Their completed changes are integrated in the current
working source. Generated media, benchmarks and package files stay under the existing
ignore rules. No commit, hosted publication or native application rebuild was part of
this delivery. Temporary verification servers are closed after the checks; the user's
existing development preview is retained. Actual target Linux playtesting remains
separate from the local browser, controller and package verification.
