# Fusion delivery

The creature window now contains an internal **精灵融合** tab. This preserves the eight main tools and opens fusion in the existing game frame. The player selects two distinct owned creatures from party or storage, sees the output chances, and confirms fusion. Search, an owned-parent filter, and distinct parent subtitles make the thirty-four recipes navigable.

## Approved behavior

- Both actual parents remain unchanged, including their party/storage positions, level, training, skills and traits.
- No minerals, currency, energy collection, waiting or failure outcome is required.
- Karu has a 5% chance against 95% shiny Nier. Each eligible Hige recipe has a 5% Hige chance against its 95% ordinary output. The three beige-bead infants are equally likely.
- Fusion samples the saved game RNG once and creates a species-bound spirit bead. Reloading or hatching never rerolls that species.
- Spirit beads reuse `kind: essence` and the existing immediate hatcher. They hatch at level 1 with the existing fresh potential/nature rules and join storage when the six-member party is full.
- Fusion requires the source-supported final primary form and an eligible secondary family form. It cannot run during active combat.

The probability constants are user-approved remake choices. The period sources disagree on Karu's exact historical rates; this delivery does not describe the chosen 5% as a verified official server probability. Parent formulas and source boundaries are in [fusion-source-v17.md](fusion-source-v17.md).

## Acquisition boundary

The registry covers all **33 retained fusion infant species through 34 recipes**. Normal acquisition currently supplies the parents of **22 recipes and 21 infant outputs**. Thirteen prerequisite seeds were added to their documented maps. Twelve later infant outputs still lack one or more normal parent routes; their formulas work if the player already owns those parents, including through the optional modifier.

The recipe list distinguishes an owned valid pair, an obtainable but uncollected pair, and a missing parent route. It never presents an unavailable parent as a completed normal acquisition path. The encyclopedia preserves the fusion recipe ID through subsequent level evolution and opens the correct recipe. [fusion-acquisition-v17.md](fusion-acquisition-v17.md) records the exact habitats, remaining parent gaps and graph checks.

## Verification performed

`tools/verification/fusion-audit.ts` ran through Vite SSR without browser storage. It exercised every recipe against the real controller, checking unchanged parents and resources, a generated essence-compatible bead, save reload, the expected level-1 infant, and executable downstream level evolutions. It also checked identical-parent rejection, an unevolved-primary rejection, a full-party storage hatch and collection registration. Fixed-seed rare fixtures generated, reloaded and hatched both Karu and Hige; Karu then evolved into Karuyeck. Twenty thousand saved-RNG samples for each rare family produced 4.86%, consistent with the declared 5%.

The integrated browser check used only the independent port-1426 save. Fixture parents were added through the ordinary modifier interface. The normal creature interface generated a green bead from Bubu Flower and Bean Sprout; inventory consumed it and hatched Golden Bubu. Reload preserved the infant and both unchanged parents. The Karuyeck encyclopedia entry opened the shiny Nier/Karu recipe and displayed 95% and 5%. The inventory and recipe interfaces remained inside the existing game window.

The new Nigu'er cliff was reached through the actual atlas. Its official background, six level-labeled Chas instances and reciprocal exit rendered successfully; the scene contained no broken image elements. The acquisition task separately checked thirteen real capsule transactions, twenty-two parent evolution actions and reloads, graph fixed points, and the map artwork/door source bindings.

The final application TypeScript check and whitespace check passed. No production frontend bundle, native package, or update to a historical packaged application was made. The existing port-1425 preview and its separate save were retained.

## Integration

Three GPT-6.1 Sol agents with high reasoning handled recipe/source recovery, fusion presentation, and prerequisite acquisition. The root integrated the game action, RNG/inventory persistence, application navigation, focused audit and live interface checks. Source, UI and acquisition edits were reviewed together; ignored research caches and fixtures remain outside tracked source.
