import { addHabitatRegions } from '../world-habitat-regions.ts';
import type { FusionHabitat, GeneratedHabitat, MapArtwork, WorldPlanet, WorldRegion } from './types.ts';

export interface WorldSources {
  /** Authored planets in display order; never modified. */
  planets: readonly WorldPlanet[];
  fusionHabitats: readonly FusionHabitat[];
  extraRegions: readonly { planetId: string; region: WorldRegion }[];
  generatedHabitats: readonly GeneratedHabitat[];
  /** Offline backgrounds keyed by original map ID. */
  artwork: Readonly<Record<string, MapArtwork>>;
}

const clone = (planet: WorldPlanet): WorldPlanet => ({ ...planet, regions: planet.regions.map(region => ({ ...region })) });
const unique = (values: readonly number[]) => [...new Set(values)];

function planetOf(planets: readonly WorldPlanet[], planetId: string): WorldPlanet {
  const planet = planets.find(candidate => candidate.id === planetId);
  if (!planet) throw new Error(`Unknown world planet ${planetId}`);
  return planet;
}
function regionOf(planets: readonly WorldPlanet[], planetId: string, regionId: string): WorldRegion {
  const region = planetOf(planets, planetId).regions.find(candidate => candidate.id === regionId);
  if (!region) throw new Error(`Unknown world region ${planetId}/${regionId}`);
  return region;
}

function placeGeneratedHabitat(region: WorldRegion, habitat: GeneratedHabitat) {
  region.creatures = unique([...region.creatures, habitat.species]);
  region.creatureLevels = { ...region.creatureLevels, [habitat.species]: habitat.levels };
  if (habitat.scarce) region.scarceCreatures = [...(region.scarceCreatures ?? []), habitat.species];
  if (habitat.route === 'recruitment') region.recruitmentSpecies = [...(region.recruitmentSpecies ?? []), habitat.species];
}

// The public manifests retain complete provenance; the game receives only
// offline paths and cache identities.
const artworkUrl = (entry: MapArtwork) => `${entry.path}?v=${entry.sha256.slice(0, 12)}`;
const isRemastered = (entry: MapArtwork) => entry.path.startsWith('/maps/hd/');
const artworkAttribution = (entry: MapArtwork) => isRemastered(entry)
  ? 'Conservative AI restoration of the existing scene; original retained. See public/maps/hd/manifest.json.'
  : 'Recovered official background; see public/maps/original-manifest.json for provenance.';

function applyArtwork(planet: WorldPlanet, artwork: WorldSources['artwork']) {
  const base = artwork[String(planet.originalMapId)];
  if (base) { planet.background = artworkUrl(base); planet.sceneAttribution = artworkAttribution(base); }
  for (const region of planet.regions) {
    const mapId = [region.originalMapId, region.backgroundMapId, planet.originalMapId].find(id => id !== undefined && artwork[String(id)]);
    const image = artwork[String(mapId)];
    if (!image) continue;
    region.background = artworkUrl(image); region.backgroundAssetMapId = mapId;
    region.backgroundKind = isRemastered(image) ? 'remastered' : 'official'; region.sceneAttribution = artworkAttribution(image);
  }
}

/** Builds the playable world from its authored sources; the result is a fresh copy. */
export function assembleWorld(sources: WorldSources): WorldPlanet[] {
  const authored = sources.planets.map(clone);
  for (const habitat of sources.fusionHabitats) {
    const region = regionOf(authored, habitat.planetId, habitat.regionId);
    region.creatures = unique([...region.creatures, ...habitat.species]);
    region.levels = habitat.levels;
    region.description = habitat.description;
  }
  for (const { planetId, region } of sources.extraRegions) planetOf(authored, planetId).regions.push({ ...region });
  const world = addHabitatRegions(authored);
  for (const habitat of sources.generatedHabitats) placeGeneratedHabitat(regionOf(world, habitat.planetId, habitat.regionId), habitat);
  for (const planet of world) applyArtwork(planet, sources.artwork);
  return world;
}
