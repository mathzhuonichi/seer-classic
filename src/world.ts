// Public entry for the explorable world.
// Data: world/classic-planets.ts, world-expansion.ts, world-habitat-regions.ts and data/habitats.json,
// assembled once by world/assemble.ts. Lookups: world/locations.ts. UI preference: world/preference.ts.
export type { GeneratedHabitat, WorldGalaxy, WorldLocationId, WorldPlanet, WorldRegion } from './world/types.ts';
export { WORLD_GALAXIES } from './world/classic-planets.ts';
export { GENERATED_HABITATS, WORLD_PLANETS } from './world/planets.ts';
export {
  BRAVE_TOWER_LOCATION, LABORATORY_LOCATION, findChallengeLocation, findSceneChallenges, isWorldLocation, resolveWorldLocation,
} from './world/locations.ts';
export { readWorldPreference, writeWorldPreference, type WorldPreference } from './world/preference.ts';
