// Public entry for the explorable world.
// Data: world/classic-planets.ts, world-expansion.ts, world-habitat-regions.ts and data/habitats.json,
// assembled once by world/assemble.ts. Lookups, the scene's theme included: world/locations.ts. UI preference: world/preference.ts.
export type { WorldLocationId, WorldPlanet, WorldRegion } from './types.ts';
export { WORLD_GALAXIES } from './classic-planets.ts';
export { GENERATED_HABITATS, WORLD_PLANETS } from './planets.ts';
export {
  BRAVE_TOWER_LOCATION, LABORATORY_LOCATION, findChallengeLocation, findSceneChallenges, isWorldLocation, locationTrack, resolveWorldLocation,
} from './locations.ts';
export { readWorldPreference, writeWorldPreference } from './preference.ts';
