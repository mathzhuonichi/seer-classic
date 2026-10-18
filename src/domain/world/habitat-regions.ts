import definitions from '../../../data/habitat-regions.json';
import type { WorldPlanet, WorldRegion } from './types.ts';

type HabitatRegionDefinition = (typeof definitions.regions)[number];

function habitatRegion(definition: HabitatRegionDefinition, position: number): WorldRegion {
  const levels = definition.species.flatMap(species => species.levels);
  return {
    id: definition.id, originalMapId: definition.originalMapId, name: definition.name,
    description: `在${definition.name}探索，与场景中的精灵互动开始野外对战。`,
    x: 25 + position % 3 * 25, y: 62,
    creatures: [], levels: [Math.min(...levels), Math.max(...levels)],
    backgroundMapId: definition.backgroundMapId, sceneAttribution: definition.sceneAttribution,
  };
}

/** Appends the source-backed subregions (explicit parent-artwork adaptations); the input is not modified. */
export function addHabitatRegions(planets: readonly WorldPlanet[]): WorldPlanet[] {
  const regions = new Map<string, WorldRegion[]>();
  for (const definition of definitions.regions) {
    const planet = planets.find(candidate => candidate.id === definition.planetId);
    if (!planet) throw new Error(`Missing habitat planet ${definition.planetId}`);
    const list = regions.get(planet.id) ?? [...planet.regions];
    if (!list.some(region => region.id === definition.id)) list.push(habitatRegion(definition, list.length));
    regions.set(planet.id, list);
  }
  return planets.map(planet => regions.has(planet.id) ? { ...planet, regions: regions.get(planet.id)! } : planet);
}
