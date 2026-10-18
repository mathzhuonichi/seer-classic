# Seer Classic catalog recovery

The existing Claude project catalog was recovered through its authenticated Chrome Library file viewer. The original downloaded bundle (`gamedata.json`) was kept in the user's Downloads folder; it contains 1,483 species, 5,325 skills, 25 natures, 41 conditions, 51 items, the type configuration, and 26 cached SPT encounters. Its `built_at` value is `2026-10-03T02:05:24.220Z`. This is an exact artifact migration, not a recreation from public sources.

Project: https://claude.ai/epitaxy/project/chan_01EWaG79X4d5ikbYkWQgJeGV

The bundle was split into the existing `data/monsters/NNNN.json`, `skills.json`, `natures.json`, `conditions.json`, `items.json`, and `types.json` layout. Original `growth.json`, `potential.json`, and `catalog_index.json` were downloaded separately. The recovered catalog IDs exactly equal the 1,483 original portrait IDs.

All 162 original boss encounter JSON files and `_modes_tower.md` were downloaded separately from `data/bosses/` in the project Library. All encounter IDs are unique. Categories are 48 SPT, 93 tower, 14 legendary, 6 story, and 1 event. They replaced the bundle's stale cached list of 26. Existing encounter source notes and confidence records were preserved.

The repository also kept the bundle itself, with these encounters in place of the cached ones, as `data/gamedata.json`, a legacy aggregate, until refactor wave 2 deleted it. The per-file data is now the only copy of the catalog; `loadCatalog()` (`src/domain/catalog/catalog.ts`) and `loadCatalogNode()` (`tools/catalog.mjs`) assemble it.

Validation checked JSON parsing, record counts, unique encounter IDs, and exact portrait/species ID equality. It does not establish the historical accuracy of every original data entry or the correctness of every battle-engine rule. The retained original source notes document those boundaries. Browser retrieval was checkpointed in batches of ten after a larger batch exceeded the browser execution time limit; all 163 encounter and mode artifacts were present at completion.
