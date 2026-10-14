# Acquisition source policy, revision 32

The registry in `data/acquisition-policy.json` classifies every eligible directed initial root in the classic catalog. It records evidence separately from the remake's claim rules. It contains 632 roots, including all 42 previously reviewed premium recruitment families. Categories overlap: 90 roots have paid offers, 25 have explicit VIP acquisition records, and 7 occur in the retained monster draw pool. These three categories cover 113 distinct roots.

The retained input is not a historical snapshot of 2009–2012. The same later-client data already underlies the catalog and habitat work. Every evidence row defaults to `sourceEra: "retained-client"`; only task records with an explicit date through 2012 are labeled `classic-period`. A later purchase option for an old creature is evidence of that option, not evidence that the creature originally debuted as paid or lacked a free route.

## Source boundaries

The generator pins `Nattsu39/seer_data` commit `a00bcdd5800e3bae5df881b4994a170a87541115`. All 15 cached input files were independently checked against that commit's Git blob IDs. Their SHA-256 values are also pinned in the generator and recorded beside complete source URLs in the output. The generator rejects a changed cache file. The catalog and previous paid, repeatability, and breeding audits have their own file hashes; the audits retain official SWF URLs, decoded hashes, relevant symbols, and the breeding panel hash.

Paid classification uses an explicit item-to-`BreedMonID` binding or an exact full creature name after an acquisition-only prefix. It does not match name substrings. Battle skips, evolution purchases, skins, and products for newer creatures whose names merely contain an old name are excluded. A positive price supports a paid option, never repeatability. A product's `vip` discount multiplier does not identify a VIP-only creature.

The old premium registry excluded some families because they already had free routes. That does not remove evidence of a paid option under the new rule. For example, the exact `100级艾蒂森M` offer maps through directed ancestry to 艾派 (807), while its wild route remains valid.

Explicit VIP records include the capture-enabled `VipOnly=1` map encounter for 米奈 (469), the dated `超NO` task rewards for 艾米 (360) and 杰奥 (397), and the 2013 `至尊nono` reward rows for 史克 (596) and 托克 (526). The task scan also uses the explicit `vip_limit=1` field: task 528 grants 奈落 (515), and task 533 grants higher forms belonging to eight initial families (53, 62, 77, 240, 406, 422, 430, 471). Annual-member tasks 589–599 explicitly bind hatch items to eleven more families (635, 637, 688, 718, 749, 789, 818, 866, 913, 934, 984). Those undated annual task names remain `retained-client` evidence rather than an inferred release year.

All retained task names containing membership, annual or monthly membership, NO/VIP, renewal, or related wording were inspected, together with every task-level VIP field. Psychic-type names and explicit non-VIP labels are negative cases. Current VIP pet-shop and monthly tables were scanned, but their listed creatures are outside the classic catalog. These 25 families describe this source coverage, not an exhaustive history of VIP creatures. A VIP alternative does not erase an independently evidenced free wild or breeding route.

`Monsterpool` supplies seven classic-family draw-pool entries. The `isjustone` field is preserved in the explanation, but its numeric value alone is not promoted to a verified server or lifetime limit. The entries are retained later-client evidence.

`Wishpet` supplies 558 initial families. It is classified as `wish-event`: a selected-creature anniversary progress list. It is not labeled classic lottery membership. Task reward tables supply 190 families and the free-creature list supplies five. `petbook` navigation, `gainWay` item destinations, and raw exchange type numbers were inspected but are not treated as creature acquisition proof without a binding. In particular, an exchange item's numeric ID coinciding with a creature ID is not a match.

## Directed ancestry and repeatability

An offer for an evolved creature is traced backwards using both declared `evolves_from` links and directed evolution edges. Only an unambiguous initial root receives the offer; unrelated sibling branches are never treated as ancestors. This run has no ambiguous omitted records. NPC families 122–125 are excluded.

Repeatability has three source states:

- `repeatable`: an affirmative mechanism permits another acquisition cycle. The official breeding formulas and the audited panel's restart-after-cooldown flow establish this for 24 roots.
- `once`: reserved at family level for affirmative lifetime evidence covering the whole creature. No family in these inputs meets that standard.
- `unknown`: the retained sources do not establish historical repeatability; 608 roots remain in this state.

There are also route-specific statuses on individual evidence rows. A `BossFinOnce=1` capture encounter is recorded as `once` for that encounter. It does not erase a separate breeding, paid, wild, task, or wish route, and does not prove that the creature was globally limited to one copy. Similarly, `cnt=1`, item `Max`, item `UseMax`, and monthly shop limits do not prove a lifetime one-creature restriction.

The selected remake policy is to allow unknown cases to repeat subject to the six-copy cap, while retaining `unknown` in the source registry. This is an explicit game-design choice, not a historical finding. Confirmed once-only routes may remain once; an independent repeatable or unknown normal route can still supply the same family. The registry does not itself choose prerequisite creatures or change gameplay.

## Reproduction and validation

Run from the source checkout:

```sh
node tools/assets/build_acquisition_policy.mjs --source-dir ../analysis/seer-data-a00bcdd
node tools/assets/build_acquisition_policy.mjs --source-dir ../analysis/seer-data-a00bcdd --check
node --check tools/assets/build_acquisition_policy.mjs
```

Omit `--source-dir` to use `.cache/seer-data-a00bcdd`; absent files are fetched from the pinned commit. `--check` compares the generated bytes with the checked-in output. Regeneration was byte-identical. Assertions cover all 42 old paid families, all 20 additional task-to-family membership bindings, valid eligible roots, source-reference integrity, and exact-name negative cases for battle skips, super evolutions, skins, newer-name substrings, and incomplete summon names. Explicit `vip_limit` and annual-member names are positive cases; psychic-type and non-VIP names are negative cases.

The registry does not claim exhaustive reconstruction of every historical VIP, lottery, or event mechanism. It classifies the retained evidence without converting missing records into invented history. Ten roots currently lack a binding in these particular source tables; they still have registry rows with `unknown` status and may have a separately implemented fusion, boss, or other remake route.
