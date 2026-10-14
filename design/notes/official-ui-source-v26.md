# Official UI skin extraction, revision 26

## Outcome and scope

Selected original toolbar, navigation, window, pet-bag, breeding and battle skins
are delivered under `public/ui/classic/`. The remake retains its efficient
mechanics and live controls. Chat, home/base navigation, paid advertisements,
account benefits and unrelated activity overlays are excluded from integration.
This record describes source extraction; integrated browser fidelity remains a
separate check by the integration owner. No build, package or commit was made.

## Source identities

The cached [official UI library](https://seer.61.com/dll/UI.swf), parsed in the
previous robot-source pass, supplies the toolbar and common skins. Its original
`ToolBarMC` symbol 6016 nests a reusable blue rail shape 5919 independently of
the chat panel, tool icons and utility overlays. The original core's
`NormalSkillBtn.getMC()` explicitly requests `ui_Normal_PetSkilBtn`, symbol
6501. That skin is a transparent cyan outline; `NormalSkillBtn_UI` symbol 5474
also retains a navy/cyan alternative, whose blank skin is shape 5468.

The cached [official breeding module](https://seer.61.com/module/com/robot/module/app/PetBreedPanel.swf)
supplies `breed_ui` symbol 66 and `hatch_ui` symbol 118. The extracted title,
navy grid and lower metallic rail are decorative parts of symbol 66; live
selection buttons and runtime text are excluded from those crops.

The cached [official fight library](https://seer.61.com/dll/PetFightDLL.swf)
supplies `ui_mainPanel` symbol 1029. It is a regular compressed SWF and needs
no release-wrapper decoding. Symbol 1029 nests `controlMC` 999, `MyInfoPanel`
764, `OtherInfoPanel` 1021 and the left log panel 1013. Its classic grid
command theme, cyan machinery and silver HP trays form the final delivered
battle skin. `controlMC` nests lined middle rail 4, right command frame 961,
capture 978, items 974, central fight 998, creatures 982 and escape 970.
The escape caption is the original text, while the remake retains its retreat
mechanics. The parent HP panels name sprite 751 `hpBar`; that sprite names
sprite 750 `barMC`. The matching `BaseFighterPropView` constructor accesses
`param1["hpBar"]["barMC"]`, and its update writes the displayed HP ratio from
`mode.hp` and `mode.maxHP`. This establishes that the orange/yellow fill is
HP rather than experience.

The clean HUD export preserves original child transforms and excludes only
`hp_txt`, `name_txt`, `level_txt` and `txtMask` from 764/1021, and the live
fill `barMC` from 751. The clean combined lower rail excludes the five named
commands from 999 while retaining the relative positions of rail 4 and frame
961. This selection is applied to an ignored copy of the source XML/SWF; the
official cache remains unchanged. The extraction tool reproduces these
selections before rendering. The static LV graphic and original empty portrait
grid remain; the remake supplies live values and portrait content.

`public/ui/classic/manifest.json` records exact URLs, cached source identities,
symbol IDs, rendered exports, alpha/source crops, logical dimensions and PNG
SHA-256 values. It distinguishes symbol IDs from separately rendered decorative
crops. Raw SWF/XML, exports and contact sheets remain ignored in
`.cache/classic-ui-v26/`.

## Asset selection

| Delivered name | Official symbol | Interpretation |
| --- | --- | --- |
| `toolbar-rail` | UI shape 5919 | Blue glossy bottom rail and central disk, no controls |
| `map` | UI sprite 5931 | Original `mapBtn` nested in toolbar |
| `creatures` | UI sprite 3520 | Original pet-bag icon |
| `bag` | UI sprite 3139 | Original toolbar bag icon |
| `dex` | UI button 752 | Pet-bag `pictureBookBtn`, no baked caption |
| `restore` | UI button 745 | Pet-bag `cureBtn`, medical cross |
| `mission` | UI sprite 1648 | Original `task_main_icon` |
| `spt` | UI sprite 3019 | Original SPT shortcut retained in symbol mapping |
| `profile` | UI sprite 5969 | Original right utility profile glyph |
| `settings-frame` | UI sprite 5944 | Original right utility chrome, 108.5 by 87.5 logical pixels |
| `close` | UI button 4965 | Original circular cross, up state |
| `map-nameplate` | UI shape 2799 | Blank navy/cyan trapezoid |
| `panel-background` | UI shape 1432 / sprite 1433 | Cyan panel with white side trim |
| `petbag-well`, `petbag-projector`, `petbag-header-circuit` | UI sprite 812 | Exact clean decorative crops of the original pet-bag panel |
| `breeding-title`, `breeding-grid`, `breeding-bottom-rail` | Breeding sprite 66 | Original machinery branding, grid and rail crops |
| `battle-skill-outline` | UI sprite 6501 | Actual `NormalSkillBtn` source skin |
| `skill-button` | UI shape 5468 | Blank alternate original skill skin |
| `battle-command-rail` | Fight sprite 999 | Clean combined lined middle rail and right command frame |
| `battle-skill-rail`, `battle-command-frame` | Fight sprites 4, 961 | Independent clean middle and right frame parts |
| `battle-log-panel` | Fight shape 1001, nested in sprite 1013 | Original empty well and side/bottom chrome cropped below the bitmap-baked header; separate scrollbar instances excluded |
| `battle-hud-player`, `battle-hud-opponent` | Fight sprites 764, 1021 | Original HUD with live text and fill instances excluded |
| `battle-hp-bar` | Fight sprite 750 | Original clean HP fill; mirror for opponent |
| `battle-capture`, `battle-items`, `battle-fight`, `battle-creatures`, `battle-retreat` | Fight 978, 974, 998, 982, 970 | Original first-frame grid controls with original captions |

`guide` contains the original baked caption for the guide and should not be
presented as the encyclopedia icon. `recover` is a whole recovery panel, not a
toolbar icon. The source contains no recovered gear in the selected utility
frame. Reusing `profile` for the remake's settings access is an explicit
integration adaptation. `settings` and `recovery-icon` are byte-identical alias
exports, documented as such; the integration uses the direct names.

## Scaling and verification

FFDec 26.3.0 renders selected frame 1 or button up states at twice their original
logical size. PNGs are alpha-cropped with a two-pixel edge margin. Decorative
panel crops use explicit rectangles recorded in the manifest. Selected shapes
also have original SVG exports, preserving curves, fills and gradients without
bitmap enlargement. SVGs were checked for embedded images and active script.
Preserve aspect ratio for icons and rails. Mirroring the HP image reproduces
the opposite-side slant without raster repainting.

The original `Panel_Background` sprite 1433 has a nine-slice splitter at twip
coordinates x=520..4259 and y=330..5540. The manifest preserves these coordinates
and an approximate twice-resolution CSS border-image slice. Panel corners should
remain fixed while the interior stretches; uniform full-frame stretching is
less faithful. Shapes 5919, 2799 and 5468 have no recovered nine-slice record and
should retain their aspect ratios unless the integration intentionally adapts
their horizontal geometry.

The original `PetSkillPanel.createSkillBtns()` source places four buttons in two
columns and two rows: x=132+(width+5)*(index mod 2),
y=25+(height+3)*floor(index/2). These are logical Flash coordinates, with
five-pixel horizontal and three-pixel vertical gaps.

The initial toolbar/window/breeding sheet, nested toolbar parts, navigation
parts, whole alternate and final battle controls, clean HP HUD and individual
battle controls were visually inspected. Every delivered PNG's dimensions and
SHA-256 digest were checked against its manifest. The first complete tool replay
verified 36 exact PNGs before the final standard-library battle replacement;
the final replay verified 41 exact PNGs and is recorded in
`.cache/classic-ui-v26/reproduce-current.log`. The final log-header crop then
passed the 41-file manifest verification and a focused original-shape export
replay. The log well uses an original 299 by 163 bitmap mapped by shape 1001;
its twice-resolution export preserves that original material but does not add
detail or claim to be a vector upgrade. Four common toolbar/window shapes have
genuine static SVG variants; the selected final battle assets are PNGs.
Source extraction reads display lists and does not execute
ActionScript. `tools/assets/export_classic_ui.py` reproduces the PNG selections
and verifies their hashes using the existing cached sources. These checks establish
source-derived skins and extraction integrity, not an integrated screenshot match
or an exact historical-client appearance for every remake window.
