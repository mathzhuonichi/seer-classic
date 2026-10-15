# Original map contacts and wildlife placement, revision 44

The scene renderer now separates the player's free interaction plane from each map's wildlife habitat. Wildlife uses the retained local terrain and roaming radii; dense populations receive distinct interior positions instead of a wide grid projected onto the polygon boundary. Boss contacts are keyed by encounter ID rather than spread around one generic scene center.

## Source evidence and limits

The audit covers all 52 Boss areas, including the death-river background and the single neutral Puni campaign contact. Their 60 selectable contacts are explicitly classified in `public/maps/actors/manifest.json`:

| Evidence class | Contacts | Meaning |
| --- | ---: | --- |
| Original visible actor | 12 | A visually matched original map pose with its source matrix, opacity, masks, crop and file hashes. |
| Original interaction | 34 | A named Boss, summon object or hit target supplies the contact position. This does not claim that a shell, statue, trigger, or transparent hit shape is the visible monster. The existing species portrait remains. |
| Authored variant offset | 4 | The two Clafin battles and two Kelanite battles each share one original contact. Each pair is separated by 90 source units so both choices remain selectable. |
| Retained remake placement | 10 | The current source does not establish that encounter's exact position. The previous remake placement is retained and explicitly identified. |

The ten retained contacts are Ersaila, Yalunsi, Kawoer, Parodiya, Alike, the Qigesa trial, and the four guardian battles sharing the Phoenix sanctuary. These are not certified original positions. No story actor is substituted merely because it is nearby or has a generic `boss` instance name.

The source files are the official `https://seer.61.com/resource/map/<id>.swf` display lists. The manifest preserves each inspected source SHA-256, named instance, symbol, source matrix or geometric bounds, and the reason for retaining a fallback. The local audit downloaded 52 SWFs and inspected 57 independent first-pose sprite exports. Static source inspection does not run ActionScript and cannot resolve actors inserted only by the original map controller.

## Original vector poses

Twelve SVGs are delivered: Steeltooth Shark, Rios, Akexiya, the four Dragon Temple actors, Blake, Plante, Luolasike, Yisuoli and Puni. Original paths, colors, internal transforms and source opacity are preserved. Only the original global registration and a tight SVG viewport are restored. These are static source poses, not reconstructed animations, and contain no enlarged raster portrait.

Steeltooth Shark keeps its original parent mask: symbol 61 at depth 3 clips through depth 9 around actor 67. Removing the mask would expose the lower body outside the cave and produce a false foot position. The retained crop is `[829,35,84,98]`, with bottom center `[871,133]` on the 960 by 560 source stage. The unrelated sibling at depth 1 is excluded.

Puni comes from the visible `depth_mc.hh` symbol 163, not the empty first frame of `top_mc.puli_mc`. Its crop is `[357,80,165,165]` and source bottom center `[439.5,245]`. It remains one neutral campaign contact. Rei's `bossBtn` has source alpha zero, so it supplies contact geometry but is not published as a visible actor. The 325 button includes its non-unit vertical scale; the hit target's bottom is 302.0006408691406, not the unscaled 274.

A source-stage coordinate is evidence about placement; it is not proof of a walkable point. Bosses can occupy a raised platform, cave or suspended position. Wildlife stays on its own habitat, while the player can approach using the free scene plane. Existing manually authored terrain refinements remain identified as such in `map-presentation.ts`; this revision does not certify every source road-mask cell or remake habitat against the Flash controller.

## Validation

`node tools/verification/maps-placement-v44.mjs` passes 14 groups. It covers 162 regions, 113 populated regions, every one of the 52 Boss areas and all 60 contact records. It checks 34,182 distinct population homes and 36,450 projection proposals, including concave polygons, narrow habitats and populations of 120. All delivered vectors have matching SHA-256 and byte counts, self-contained source geometry, and exact crop-to-anchor dimensions. Source button transforms, shared variants, the cave mask, Puni's single campaign entry and the transparent Rei target are checked separately.

The verification server uses its own `artifacts/.validation-cache` directory with dependency discovery, HMR and websocket transport disabled. It cannot rewrite the active browser's Vite dependency cache. TypeScript compilation also passed. Independent source composites were visually inspected for every delivered actor; browser interaction and final viewport checks are recorded by the integrating task.

## Area inventory

The full coordinate and hash evidence is in the public manifest. This inventory keeps each area linked to its explicitly scoped evidence class.

| Map | Area | Contacts and evidence |
| ---: | --- | --- |
| 12 | `klose/forest` | `boss_spt_moguguai`: original-interaction |
| 27 | `cloud/summit` | `boss_spt_tiyasi`: original-interaction |
| 22 | `ocean/seabed` | `boss_spt_gangyasha`: original-visible-actor |
| 17 | `volcano/depths` | `boss_spt_liaosi`: original-visible-actor |
| 32 | `helka/temple` | `boss_rei`: original-interaction |
| 40 | `cecilia/peak` | `boss_spt_akexiya`: original-visible-actor |
| 61 | `tuck/light-city` | `boss_spt_eersaila`: retained-remake-placement |
| 495 | `tuck/underground` | `boss_spt_sipulinte`: original-interaction |
| 325 | `eddy/landing` | `boss_spt_nainifenduo`: original-interaction |
| 348 | `hamo/dragon-temple` | `boss_spt_hamoleite`: original-visible-actor; `boss_spt_takelin`: original-visible-actor; `boss_spt_taxiya`: original-visible-actor; `boss_spt_saiweier`: original-visible-actor |
| 423 | `big/wolf-cave` | `boss_spt_laokemengde`: original-interaction |
| 435 | `dase/death-river` | `boss_spt_kelanite1`: authored-variant-offset; `boss_spt_kelanite2`: authored-variant-offset |
| 438 | `modusa/stone-city` | `boss_spt_moduosa`: original-interaction |
| 106 | `alpha/surface` | `boss_spt_naduolei`: original-interaction |
| 46 | `alpha/energy` | `boss_spt_sibinsai`: original-interaction |
| 49 | `beta/surface` | `boss_spt_leinaduo`: original-interaction |
| 54 | `lucio/surface` | `boss_spt_kelaifen1`: authored-variant-offset; `boss_spt_kelaifen2`: authored-variant-offset |
| 53 | `snow/cave` | `boss_spt_moshidilu`: original-interaction |
| 314 | `byron/deck` | `boss_spt_younasi`: original-interaction |
| 464 | `kaku/jungle` | `boss_spt_ajiasha`: original-interaction |
| 688 | `twitter/galia` | `boss_spt_ruiersi`: original-interaction |
| 429 | `toti/surface` | `boss_spt_yalunsi`: retained-remake-placement |
| 441 | `rabol/surface` | `boss_spt_kenpeide`: original-interaction |
| 445 | `white/surface` | `boss_kaxiusi`: original-interaction |
| 486 | `white/mine` | `boss_spt_delasa`: original-interaction |
| 450 | `white/temple` | `boss_spt_difute`: original-interaction |
| 479 | `white/cavern` | `boss_spt_minuosi`: original-interaction |
| 507 | `grace/altar` | `boss_buleike`: original-visible-actor |
| 666 | `planet-662/sanctuary` | `boss_campaign_xuanwu_body`: retained-remake-placement; `boss_campaign_qinglong_body`: retained-remake-placement; `boss_campaign_baihu_body`: retained-remake-placement; `boss_campaign_zhuque_body`: retained-remake-placement |
| 676 | `ability/guardians` | `boss_spt_guerzhadi`: original-interaction |
| 684 | `tairow/jungle` | `boss_spt_pitesaluo`: original-interaction |
| 686 | `tairow/beast-valley` | `boss_spt_anyebinghu`: original-interaction |
| 702 | `giant/island` | `boss_spt_lansite`: original-interaction |
| 706 | `giant/forest` | `boss_spt_kawoer`: retained-remake-placement |
| 710 | `allen/coral` | `boss_spt_kailuoya`: original-interaction |
| 717 | `bast/mist` | `boss_spt_kalunni`: original-interaction |
| 722 | `bast/dragon-realm` | `boss_paluodiya`: retained-remake-placement |
| 724 | `bast/dragon-temple` | `boss_spt_silipu`: original-interaction |
| 731 | `lainna/village` | `boss_spt_pulante`: original-visible-actor |
| 735 | `lainna/pirate-lab` | `boss_spt_bokate`: original-interaction |
| 746 | `small-phantom/remains` | `boss_spt_basuoer`: original-interaction |
| 762 | `demon/falls` | `boss_spt_palisi`: original-interaction |
| 780 | `devil/tower` | `boss_spt_sikelu`: original-interaction |
| 782 | `devil/temple` | `boss_ailike`: retained-remake-placement |
| 784 | `devil/abyss` | `boss_spt_nate`: original-interaction |
| 789 | `pumpkin/treasure` | `boss_spt_situerte`: original-interaction |
| 795 | `pegasus/island` | `boss_spt_kuli`: original-interaction |
| 799 | `pegasus/crystal-cave` | `boss_spt_luolasike`: original-visible-actor |
| 803 | `pegasus/ice-palace` | `boss_spt_yisuoli`: original-visible-actor |
| 810 | `pegasus/tree` | `boss_spt_fuxisi`: original-interaction |
| 10032 | `space-station/mystery` | `campaign:puni`: original-visible-actor |
| 402 | `fortress/trial` | `boss_trial_brave_qigesa`: retained-remake-placement |

## Nonstandard source viewports

Source anchor coordinates remain unmodified in the manifest. Map 54 uses background viewBox `[-1,0,961,560]`; map 325 uses `[-3.65,-1,970.3,561]`. Map 314 retains the original H5 962-by-560 bitmap canvas at source origin `(-1.65,0)`, obtained from the original background registration and offset. Their contact positions are normalized as `(source - origin) / extent`, rather than divided by the standard stage size. All twelve native map actors use the standard 960-by-560 viewport.
