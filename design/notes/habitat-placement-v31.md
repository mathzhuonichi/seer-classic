# Source-driven initial-form habitats, revision 31

Date: 2026-10-14. Earlier habitat batches were chosen one family at a time from period guides. This revision derives placements from the original client's own map configuration, the same `Nattsu39/seer_data` dump (commit `a00bcdd`) that supplies the species catalog.

## Method

`node tools/assets/build_habitats.mjs` regenerates `data/habitats.json`. It downloads `resource/config/xml/maps.json` and `petbook.json` into ignored `.cache/seer-data-a00bcdd/` when absent and records their SHA-256 values in the output. Candidates are directed initial forms with no direct acquisition entry in the authored world, excluding the NPC families and species that the controller redirects to a named encounter. Each candidate is placed by the first matching evidence:

1. `Map.Monsters` wild spawns on a modeled region's `originalMapId`, with the source level range. Every matching region receives the species.
2. A `BossCatchable` map boss on a modeled region, at its source level and shown once per scene.
3. The pet book `Foundin` text naming a modeled region or planet, at a level shortly before the species' first level evolution (`[L-8, L-5]`, otherwise `[20, 25]`).

The ship, facilities and challenge staging regions never host placements. Species with a positive catch rate use ordinary capsule capture. The others use the controller's existing field battle that awards an essence (`essence_recruit_<id>`); the battle is now named 野外挑战. Such species appear once per scene.

`src/world.ts` applies the file after the authored habitats. Regions gain optional `creatureLevels` and `scarceCreatures`; scene population and encyclopedia route labels use the per-species level range.

## Result

The current file has 158 placements for 154 species: 124 capture and 34 field-challenge routes. The acquisition exporter now reaches 805 of 1,479 eligible forms, previously 453. 338 of 632 initial forms have a direct entry, previously 171. Family coverage is 308 complete, 55 partial and 269 missing. Ready fusion recipes rise from 23 to 30 of 34, and ready breeding pairs from 1 to 7 of 8, because their parents become obtainable.

Every placement was exercised through the actual controller. Each capture placement started a capturable battle against the placed species. Each challenge placement was won; after reloading the save, its essence hatched the placed species.

## Boundaries

The dump is the modern client, which retains Flash-era map and species identifiers; individual spawn lists may differ from a particular historical date. Of the 48 placements authored before this revision, 36 agree with these spawn lists. The pet book `Foundin` text identifies a planet rather than a specific map, so its region choice and level are remake decisions. The remaining 307 initial forms without an entry either have source maps that no modeled region represents, or have no map spawn record at all.

Four legacy checks asserted behavior from earlier revisions and now derive their expectations from current data. These are the encounter and SPT counts, Hamo's temple bosses, automatic evolution after a level edit, and controller-owned essence registration. Hatching now checks essence registration directly.
