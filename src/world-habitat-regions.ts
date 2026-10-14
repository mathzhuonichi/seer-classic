import definitions from '../data/habitat-regions.json';
import type { WorldPlanet } from './world';

/** Source-backed subregions with an explicit parent-artwork adaptation. */
export function addHabitatRegions(planets: WorldPlanet[]): void {
  for (const definition of definitions.regions) {
    const planet = planets.find(candidate => candidate.id === definition.planetId);
    if (!planet) throw new Error(`Missing habitat planet ${definition.planetId}`);
    if (planet.regions.some(region => region.id === definition.id)) continue;
    const levels = definition.species.flatMap(species => species.levels);
    planet.regions.push({
      id: definition.id, originalMapId: definition.originalMapId, name: definition.name,
      description: `在${definition.name}探索，与场景中的精灵互动开始野外对战。`,
      x: 25 + planet.regions.length % 3 * 25, y: 62,
      creatures: [], levels: [Math.min(...levels), Math.max(...levels)],
      backgroundMapId: definition.backgroundMapId, sceneAttribution: definition.sceneAttribution,
    });
  }
}
