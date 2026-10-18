import generatedHabitats from '../../../data/habitats.json';
import mapArtwork from './map-art-assets.json';
import mapHdArtwork from './map-hd-assets.json';
import { ADDITIONAL_WORLD_PLANETS } from './expansion.ts';
import { assembleWorld } from './assemble.ts';
import { CLASSIC_PLANETS, EXTRA_REGIONS, FUSION_HABITATS } from './classic-planets.ts';
import type { GeneratedHabitat, WorldPlanet } from './types.ts';

/** Initial forms placed from original map spawn lists; see tools/assets/build_habitats.mjs. */
export const GENERATED_HABITATS = generatedHabitats.habitats as unknown as GeneratedHabitat[];

/** The playable world, built once from its authored sources. */
export const WORLD_PLANETS: WorldPlanet[] = assembleWorld({
  planets: [...CLASSIC_PLANETS, ...ADDITIONAL_WORLD_PLANETS],
  fusionHabitats: FUSION_HABITATS,
  extraRegions: EXTRA_REGIONS,
  generatedHabitats: GENERATED_HABITATS,
  // HD restorations replace recovered originals of the same map.
  artwork: { ...mapArtwork, ...mapHdArtwork },
});
