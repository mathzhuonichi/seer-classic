# Codex takeover of Seer Classic

Date: 2026-10-14 (America/Los_Angeles).

## Verified starting point

The previous development checkout is `../seer-classic-v30-source`, on `main`
at `04d6196` (source-driven initial-form habitats). Its working tree was clean.
The earlier V30 import is `21a1567`. Work continues in this separate checkout
on `codex/seer-takeover`, preserving the previous checkout and releases.
Installed dependencies and ignored media files are linked from the previous
checkout; this worktree is not a standalone distribution package.

The acquisition report was rerun against the starting commit:

| Metric | Starting value |
| --- | ---: |
| Obtainable eligible forms | 805 / 1479 |
| Missing eligible forms | 674 |
| Initial forms with direct entries | 338 / 632 |
| Initial forms without direct entries | 294 |
| Ready fusion recipes | 30 / 34 |
| Ready breeding pairs | 7 / 8 |

The previous habitat note's 307 remaining candidates describes an intermediate
placement list, before newly available parents unlock fusion and breeding.
It is not the number of missing initial entries after the dependency closure.
These counts describe executable routes, not full-difficulty playthroughs.

## Recovered user decisions

The previous conversation and its answered choice confirm these requirements:

- Complete simple normal acquisition routes for initial forms, prioritizing
  source-supported map habitats.
- Replace all paid, VIP and lottery acquisition with prerequisite-creature
  collection rewards that grant essences, designed together with named
  boss-defeat rewards.
- Preserve repeat acquisition where the original route permits repetition.
- Limit the same species to six copies, including constraints on repeated
  essence claims and shop replenishment.
- Limit each reward to six prerequisite conditions in total, combining
  creature collection and named boss defeats.
- Consider map and interface improvements after the acquisition mechanism.

`approved-plan.json` now records these decisions. Updating that specification
does not mean the new recruitment and six-copy rules are implemented.

## Recovered unfinished work

Claude completed the first habitat batch, then stopped during research for the
unified prerequisite-reward design. No implementation of that design exists in
the starting commit. The current 42 paid-recruitment quests still grant direct
creatures once, and the free essence shop still accepts quantities up to 999.

Useful earlier research is preserved outside the checkout:

- `../analysis/prereq-design/`: controller probes of rewards and save behavior.
- `../analysis/tier-b-unmodeled-maps.json`: species with source habitats that
  are not represented by current destinations.
- `../analysis/tier-c-no-habitat.json`: candidates without a mapped habitat.
- `../analysis/ui-review/shots/`: five earlier screenshots; no completed UI
  review was recovered.

Recompute candidate membership after each route change. The intermediate lists
must not be treated as current coverage reports.

## First correction

Twenty-five encounters declare an initial-form `reward.monster`, but the
essence resolver previously ignored that field and used the defeated final
form. The resolver now honors an explicit `reward_hatches`, then the declared
monster reward, then the final opponent as a fallback. The controller and
encyclopedia share this resolver.

The existing essence item IDs are retained. Already earned, unhatched essences
therefore use the corrected target on reload without rewriting the save.
Previously hatched creatures remain unchanged. The regression checks all 25
declared rewards, old essence inventories, item and shop targets, initial-form
navigation, fallback and explicit bindings, campaign-stage exclusions, and an
actual Agasha victory followed by reload and hatching.

The before/after route comparison also exposed a missing forward evolution:
1220 Bojiesi had no executable path to 1221 Bokate. The official
[RobotCoreDLL.swf](https://seer.61.com/dll/RobotCoreDLL.swf), downloaded and parsed
as data on this date, supplies both required fields: PetXMLInfo binary 23 sets
`EvolvingLv="40"` and `EvolvFlag="52"`; EvolveXMLInfo binary 44 maps flag 52 to
`Branch MonTo="1221"` without a resource requirement. The correction uses the
existing manual level-evolution mechanism (`automatic: false`), matching the
earlier recovered chamber evolutions. Source records and the runtime catalog
are kept consistent. No new evolution mechanism is introduced.

The extracted pet XML SHA-256 is
`bc1fd07bdad0f5086807a8c91d6e27e9638f8ec6fed28c44468a15281d08214d`;
the evolution XML SHA-256 is
`f88fa14c15e7fe725e848c152de4a30bdd3e4bb2988429be66290ba6184ad80d`.
Both match the v14 audit's retained configuration. Downloaded and decoded
hashes plus the XML files are recorded in the new evidence directory's
`provenance/source-manifest.json`. This is a retained official configuration,
not a claim to reproduce every historical server condition.

The outdated full-HP potion test was also corrected: a rejected use must not
consume a potion or advance combat, while use on an injured target consumes
one potion. It now creates its own output directory in a fresh worktree.

Final acquisition coverage is **815 / 1479** eligible forms, with **348 / 632**
initial entries and **284** missing initial entries. All 805 previously
obtainable forms remain obtainable. Ten new initial forms are reachable:
924, 944, 956, 1011, 1044, 1146, 1353, 1430, 1452 and 1476. Ready fusion and
breeding counts remain 30/34 and 7/8. There are still 664 unavailable eligible
forms, including unsupported forward transformations and missing dependencies.

## Next implementation sequence

1. Represent collection and named-boss prerequisites in one explicit reward
   definition, including essence target, repeatability and source evidence.
   Keep historical repeatability that has not been verified visibly unresolved.
2. Add one shared allowance calculation for held creatures and unhatched
   essences. Use it in reward claims, replenishment and hatching so alternate
   actions cannot bypass the six-copy rule. Preserve existing saves with more
   than six copies; block further grants rather than deleting old creatures.
3. Migrate existing paid quests to essence rewards, retain earned progress,
   and connect the same definitions to task cards and encyclopedia routes.
   Reject definitions with more than six combined prerequisites or unreachable
   prerequisite cycles.
4. Fill the remaining source-supported habitats and alternative collection
   rewards, prioritizing parents of blocked fusion and breeding recipes.
5. Review densely populated scenes and task navigation after the route changes.

Steps above are pending implementation, not completed features. The allowance
and save-migration details are a proposed implementation approach under the
confirmed limits, rather than additional user decisions.

## Evidence and preview

Fresh reports are stored under
`../analysis/codex-takeover-2026-10-14/`, separately from previous evidence.
The development preview is served from this worktree at
`http://127.0.0.1:1426/`. Browser inspection confirmed the scene and the corrected
Ice Fox initial-form route, plus Bokate's level-40 manual evolution route.
Representative animation, compressed animation metadata and audio resources
returned HTTP 200 and matched the existing local bytes. No browser console
warnings or errors were captured during the inspection. Browser save data
remains origin-specific.

Final checks passed: TypeScript without emit; `boss-essence-targets.mjs`;
the repaired `game-v3.ts`; and the base-form acquisition, encyclopedia,
campaign progression, collection shop and paid-SPT controller checks.
The acquisition exporter independently replayed the dependency closure, and
a before/after comparison confirmed that no previously available form was lost.
This was focused verification, not a full boss-difficulty or platform audit.

No production build, distribution package, push or release was made.
