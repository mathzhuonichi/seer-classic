# External calculator parity audit

At the time of this comparison, the single-type chart agreed with the live 4399 attribute tool for all 324 combinations of the 18 retained base types. Twelve explicit single/dual-type examples also agreed. Actual execution of other calculators exposed inconsistent table cells and a different mobile-game damage formula. No battle-engine or type-data changes were justified by that comparison. A subsequent direct official-source audit and the user's authority instruction changed fighting against evil to 0.5; the replay now checks this one official override explicitly. See [official-game-feel-resources.md](official-game-feel-resources.md) for the current result.

This audit verifies calculator outputs and the local reconstruction. It does not certify the original server's exact damage routine. In particular, an accessible classic-browser damage calculator with independently validated historical rounding was not recovered. That part of the requested calibration remains unresolved.

## Sources and actual operations

Downloads were made on 2026-10-03. Original bytes, decoded HTML, executable scripts, SHA-256 hashes, generated output, failed-download records and all integer damage rolls are preserved under ignored `.cache/calculator-parity/`. `fetch-manifest.json` identifies downloads; `parity-results.json` contains replay inputs and results. No external software was installed and no original-game account or battle was used.

| Source | Function inspected | Operation and scope |
| --- | --- | --- |
| [4399 attribute tool](https://news.4399.com/seer/ssxxk/) | Interactive single/dual attribute lookup | Downloaded 3,041,611 original bytes; parsed the published output under `#1rt<ID>`. Its `sh(id)` function selects precomputed rows rather than calculating damage. This is a live browser-game type reference. |
| [4399 creature calculator](https://news.4399.com/seer/jsq/) | Ability values and individual values | Downloaded the actual linked calculator and inspected its title, instructions and controls. It offers neither attack damage nor a damage range. Its external calculation script returned HTTP 403; the HTML is sufficient to establish its scope. |
| [BWIKI attribute widget source](https://wiki.biligame.com/seer/index.php?title=Widget:%E5%B1%9E%E6%80%A7%E5%85%8B%E5%88%B6&action=raw) | Attribute coefficients | Downloaded the raw widget and executed its own JavaScript. DOM sinks captured its original generated output. Only the registration closure was instrumented to expose its existing `jis()` function; arithmetic was unchanged. |
| [SeerHelp source repository](https://github.com/tanglaoji/seer-help) | Type selection and damage simulation | Downloaded and executed `赛尔不求人v21.8.4.html` at immutable commit `a96655eb02073dba894f4026a96e3350a84a01fc`. Its Vue configuration was captured by a minimal constructor and DOM stub; its original `chooseAttr`, `setTwoMultiple`, `setMultiple` and `startSimulation` methods ran unchanged. The author's README explicitly identifies **mobile-game data**. Its damage values are excluded from classic-browser calibration. |
| [4399 period damage example](https://news.4399.com/seer/jingyanxinde/201209-05-194310.html) | Published approximate range | Downloaded the article and replayed its complete numeric setup through the actual local `calcAttack`. This is a published worked example, not an interactive calculator or an original-game measurement. |

The discovered browser-battle simulator at `http://180.76.235.54:2000/` closed the download connection without returning content. Search results about Seer Plan, Seer 2, Pokémon and Raid: Shadow Legends were excluded. The Windows-oriented Orange/Waking calculator and the non-distributed Linglong calculator were not executed; search mentions are not reported as successful damage comparisons.

The calculator agent inspected published 4399 HTML and original generated widget HTML directly, and captured the mobile tool's numeric output fields after its own methods ran. The parent task then opened the actual 4399 attribute UI in the in-app browser and clicked its visible Ground and Water/Shadow selectors. The displayed output blocks confirmed Ground→Fire/Flying `0.25` and Water/Shadow→Fighting/Fire `1.25`; the inspected rows and their visible state are recorded in ignored `artifacts/maps-v13/4399-live.json`. This distinguishes the live UI check from the broader source/output replay.

## Type outputs compared

All 18×18 local single-type cells agree with 4399: **124 explicit non-neutral values and 200 neutral values inferred from omission**. Omission is not treated as a reliable neutral value for newer dual-type rows, which contain incomplete coverage. Consequently this audit does not claim full parity with the entire modern 138-attribute table.

| Attacking type | Defending type | Explicit 4399 output | Local output |
| --- | --- | ---: | ---: |
| Fire | Grass | 2 | 2 |
| Fire | Water | 0.5 | 0.5 |
| Electric | Ground | 0 | 0 |
| Fire | Grass/Psychic | 1.5 | 1.5 |
| Ground | Flying/Psychic | 0.125 | 0.125 |
| Electric | Fighting/Ground | 0.25 | 0.25 |
| Light | Grass/Psychic | 0.5 | 0.5 |
| Mechanical | Ice/Dragon | 1.5 | 1.5 |
| Water/Shadow | Fire | 1.5 | 1.5 |
| Fire | Ice/Fire | 1.25 | 1.25 |
| Mechanical/Ground | Electric | 1.25 | 1.25 |
| Water/Shadow | Fighting/Fire | 1.25 | 1.25 |

Three explicit discrepancies are retained as external-source inconsistencies:

| Input | 4399 table | Engine | Independent check |
| --- | ---: | ---: | --- |
| Ground → Fire/Flying | 0.25 | 0.5 | The downloaded BWIKI calculator generates 0.5. Ground→Fire=2 and Ground→Flying=0 also give `(2+0)/4=0.5` under the published rule. |
| Fighting/Fire → Ice/Psychic | 0.375 | 2.375 | Against Ice, both components give 2, combining to 4; against Psychic they give 0.5 and 1, combining to 0.75. Averaging by defending component gives 2.375. |
| Mechanical/Psychic → Fighting/Ground | 1.5 | 2.5 | The two defending-component results are 4 and 1, giving 2.5 under the same rule. |

The grouping follows the source author's [2018 controlled browser-game experiment](https://news.4399.com/gonglue/seer/jingyanxinde/825548.html), already audited in `damage-formula-research.md`. The current table's isolated discrepancies are insufficient grounds for reversing that grouping. The BWIKI forward dataset also contains two conflicting Psychic rows, while its Fighting→Evil value of 0.5 differs from the retained chart and the inferred neutral 4399 cell. Its executable output is useful evidence for the selected cases, not an authoritative complete replacement chart. Its native incoming Holy/Nature→Fire output is 4; this modern pair is outside the local chart and was not added.

## Executed damage comparisons

All following inputs use level 100, power 100, attack 300, defense 200, neutral stages, no conditions/equipment/traits and no critical hit. The STAB column is both the mobile tool's selected multiplier and the local owner's matching-type rule. Local results enumerate all 39 retained integer rolls from 217 to 255 through `calcAttack`, then floor ordinary final damage; this is a deterministic range replay, not a sampled RNG histogram.

| Attack → defender | STAB | Coefficient | SeerHelp minimum–maximum | Local minimum–maximum |
| --- | ---: | ---: | ---: | ---: |
| Fire → Grass | 1.5 | 2 | 321–378 | 326–384 |
| Fire → Grass/Psychic | 1.5 | 1.5 | 241–283 | 245–288 |
| Fire → Grass/Psychic; Water owner | 1 | 1.5 | 160–189 | 163–192 |
| Electric → Ground | 1.5 | 0 | 0–0 | 0–0 |
| Grass → Water/Ground | 1.5 | 4 | 643–756 | 653–768 |
| Water/Shadow → Fighting/Fire | 1.5 | 1.25 | 201–236 | 204–240 |
| Ground → Fire/Flying | 1.5 | 0.5 | 80–94 | 81–96 |

The external simulator agrees on each coefficient, including immunity, double weakness and the dual-versus-dual direction. Its native formula omits the additive `+2`, fixes the level contribution at 42, and labels a `236.5/255` roll as average. For example, Fire→Grass has its unmodified base 126 and maximum `126×1.5×2=378`; the local reconstruction uses base 128 and maximum 384. These are material formula differences, not evidence that the classic engine should omit `+2`. The true midpoint of the local integer-roll interval is 236; its mean after final flooring is also different from the mobile label. Native output fields and every local roll are saved in `parity-results.json`.

The period article's setup, `L=100, P=85, A=366, D=208, STAB=1.5, T=2`, publishes an approximate **326–383** range. The local engine actually produces **324–381**. Full precision before final flooring would produce **325–382**. The article rounds its endpoints approximately and contradicts its own STAB prose, as recorded in the existing source audit. It establishes neither an exact integer interval nor historical intermediate truncation. This discrepancy is recorded without changing the existing rounding convention.

## Verification and handoff

Run the focused replay from the repository root with the downloaded snapshots present:

```sh
node --experimental-strip-types tools/verification/calculator-parity.ts
```

The command passed. It checks 324 single cells, 12 explicit representative cells, three preserved discrepancies, two native widget output cases and seven executed mobile damage cases, and reproduces the period example through the current engine. The generated JSON retains exact inputs, outputs, URLs and source hashes. To replenish snapshots, download the source-register URLs to their recorded cache filenames; decode 4399 pages from GB18030 before replay. `4399-types.decoded.html`, `bwiki-widget-raw.txt`, `seerhelp.html` and `4399-formula.txt` are the replay prerequisites.

Battle source and type data were frozen without changes. No production build, native package, broad legacy suite, world/UI/map edit or speculative damage framework was introduced. Classic STAB 1.5, the additive term and existing integer boundaries remain the documented reconstruction. Further exact-damage calibration needs a classic-browser calculator with a trustworthy implementation or controlled original-game results that distinguish intermediate rounding; mobile agreement and successful script execution do not fill that evidence gap.
