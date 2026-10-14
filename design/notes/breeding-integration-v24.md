# Breeding integration and acquisition inventory, revision 24

Date: 2026-10-04. Scope: identify source-supported repeatable paid acquisition, implement original compatible breeding pairs, and organize remaining acquisition gaps. The user explicitly selected immediate random parental/hybrid offspring and free breeding. Existing one-time SPT recruitment claims remain unchanged. Work remains in development/debug mode, without a production build or package.

## Integrated behavior

Dr. Pat's laboratory dialogue now opens an independent breeding panel. It lists all eight complete retained original breeding pairs, their exact mature parent species and all three original outcome probabilities. Selecting actual owned parents enables breeding only when their species match the selected row, both levels are at least 50, identities differ, and the male is first generation. Gender follows the original species property. Existing saves without generation remain first generation; no random sex migration occurs.

One successful command immediately creates a level-1 generation-1 child, preserving both parents and all currency/items/experience. It enters the party if space exists, otherwise storage. Original breeding/hatching/recharge waits and the 5,000-bean fee are omitted by the user's explicit simplification. The controller validates ownership, compatibility, active-battle exclusion, all offspring definitions and capacity before consuming selection RNG. A full party and full storage reject without changing the save or RNG. Success reuses the existing acquisition reward sound.

Generation survives serialization, reload, level gain and evolution. A bred male descendant cannot become an eligible male parent merely by evolving to a listed mature form. The original visible client has no additional female generation check, so the helper does not invent one. Invalid negative, fractional, string or null generation values fail explicit import without changing an existing game. Creature details show fixed sex and acquired/descendant status. The panel states that IV/nature inheritance is not guaranteed: original sources contain qualitative inheritance language but no recovered numerical formula, so this version uses its existing random creature generator.

Encyclopedia entries retain initial-only navigation. Breeding routes open the exact recipe in the laboratory; parent links open their encyclopedia entries so their initial acquisition and evolution can be inspected. A recipe present in the breeding system does not imply that its parents currently have normal acquisition routes.

## Repeatable paid families

Within the 42 evidenced paid initial families, official configuration and the breeding handbook support repeat breeding for **596 史克** and **598 米娅**. Their mature parents, **597 史密斯** and **599 吉米丽娅**, produce 史克 at **50%**, 米娅 at **45%**, or **600 安洛达斯** at **5%**. The original handbook and panel explicitly permit another cycle after chamber recharge. This is source evidence about designed repeat breeding; authenticated current-server execution was not performed.

Purchase-repeatability remains separate: 29 other families are conditional candidates and 11 are unresolved. Item stack capacity is not interpreted as an unlimited purchase policy. The source registry is an audit inventory, not a game reward policy. See [repeat-acquisition evidence](repeatable-paid-acquisition-v24.md) and [all original breeding rows](breeding-source-v24.md).

## Current acquisition inventory

The independently replayed closure reaches **453 of 1,479 eligible forms**, leaving **1,026** without a normal route. Four NPC forms, 122–125, remain separately excluded. Only the 史密斯 × 吉米丽娅 breeding pair is currently reachable through normal parent acquisition; the other seven pairs have missing parent routes. Breeding newly enables **600 安洛达斯** and its implemented level-32 evolution **601 火刃**. The further source transformation to 602 is still unimplemented.

The missing inventory distinguishes 211 missing initial acquisitions, 250 unusable/unmapped wild entries, 28 unsupported transformations and 537 unavailable parent/predecessor dependencies. The categories are mutually exclusive and sum to 1,026. An available adult reward does not establish an initial-form entrance: 46 directly rewarded forms still have no initial entry. Source ancestry is used for grouping and never becomes an executable transformation by itself.

Complete ignored files are `artifacts/acquisition-v24/missing-species.csv`, `missing-initial-families.md`, `excluded-npc.csv` and `status.json`. The JSON records source hashes and generation time. The exporter independently replays executable dependencies and first-generation availability, preventing bred-only males from bootstrapping further recipes. See [inventory method](missing-acquisition-v24.md).

## Verification and handoff

Three GPT-6.1 Sol workers at medium reasoning independently handled the official breeding source/model, repeat paid-source audit, and generation-aware acquisition closure/inventory. Root integrated the controller, save schema, laboratory entry, encyclopedia links, UI and reward sound. All worker results were incorporated into the shared source; no release was built.

- Source verification compares all eight pairs and 24 probability entries with independently extracted official symbol 166 and all 1,483 genders with original symbol 23.
- Controller verification exercises all 24 exact weighted branches across eight pairs, retained parents/resources, repeat breeding through save/reload, evolved descendant male rejection, female descendant eligibility, full-party storage fallback and full-save/RNG preservation on invalid or full-capacity requests.
- Acquisition verification independently reproduces the complete generation-aware closure, exact missing partition and source immutability. The existing 42 paid recruitment controller transactions still pass after breeding integration.
- TypeScript and `git diff --check` pass.

Browser interaction on the isolated port-1440 development origin verifies laboratory entry with no eligible parents, all eight pair rows and original percentages, encyclopedia 600 opening its exact recipe, selecting real level-50 fixture parents, immediate birth of 600 at the controlled original RNG branch, repeat birth of 598 with a full party placing it in storage, unchanged parents and zero coins, exported-save reload, descendant-male disabling and the child-detail sex/generation display. Parent acquisition and specific rare selection were prepared fixtures; these checks are not a complete natural level-50 progression or empirical sampling of rarity.

Visible fixture diagnostics, screenshots and the independent controller records remain under ignored `artifacts/breeding-v24/`. Test-generated HTML, cache and historical release files are excluded from Vite's watcher so generating a report does not reset an active development game. Source-file hot updates remain enabled. The existing port-1425 preview and its origin-specific save were preserved; no save import, reset or modifier interaction was performed on that origin.
