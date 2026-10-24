import sceneMusic from '../../../data/scene-music.json';
import type { ChallengeCategoryId } from '../../shared/views.ts';
import { WORLD_PLANETS } from './planets.ts';
import { sceneTrack } from './scene-music.ts';
import type { WorldLocationId, WorldPlanet, WorldRegion } from './types.ts';

/** The first landing, also the fallback for an unknown planet. */
export const HOME_LOCATION: WorldLocationId = { planetId: 'klose', regionId: 'plain' };
export const BRAVE_TOWER_LOCATION: WorldLocationId = { planetId: 'space-station', regionId: 'brave-tower' };
export const DARK_ARENA_LOCATION: WorldLocationId = { planetId: 'space-station', regionId: 'dark-arena' };
export const LABORATORY_LOCATION: WorldLocationId = { planetId: 'station', regionId: 'lab' };
/** The authored rendezvous for encounters without a modeled location. */
export const STAGING_LOCATION: WorldLocationId = { planetId: 'station', regionId: 'transport' };

export const isWorldLocation = (planet: WorldPlanet, region: WorldRegion, location: WorldLocationId) =>
  planet.id === location.planetId && region.id === location.regionId;

// Older UI preferences and links keep their destination without retaining
// duplicate rooms. These aliases never rewrite the player's gameplay save.
const LOCATION_ALIASES: Record<string, readonly [string, string]> = {
  'station/brave-tower': ['space-station', 'brave-tower'],
  'station/dark-arena': ['space-station', 'dark-arena'],
  'station/mission-dock': ['station', 'transport'],
  'station/challenge-dock': ['station', 'transport'],
  'space-station/random-arena': ['space-station', 'resources'],
  'space-station/elite-arena': ['space-station', 'resources'],
  'space-station/classic-arena': ['space-station', 'resources'],
};

/** Resolves aliases; an unknown planet falls back to the home planet and an unknown region to the planet's first. */
export function resolveWorldLocation(planetId: string, regionId: string): { planet: WorldPlanet; region: WorldRegion } {
  const [canonicalPlanet, canonicalRegion] = LOCATION_ALIASES[`${planetId}/${regionId}`] ?? [planetId, regionId];
  const planet = WORLD_PLANETS.find(candidate => candidate.id === canonicalPlanet)
    ?? WORLD_PLANETS.find(candidate => candidate.id === HOME_LOCATION.planetId)!;
  return { planet, region: planet.regions.find(candidate => candidate.id === canonicalRegion) ?? planet.regions[0] };
}

/** The world theme a location plays (data/scene-music.json), or null. */
export function locationTrack({ planetId, regionId }: WorldLocationId): string | null {
  const { planet, region } = resolveWorldLocation(planetId, regionId);
  return sceneTrack(sceneMusic.maps, planet, region);
}

/** The encounter fields that decide where it is staged. */
export interface ChallengeTarget { id: string; category: ChallengeCategoryId; location?: string }
export interface ChallengeLocation extends WorldLocationId { staging: boolean }

function namedPlanetLocation(location: string): ChallengeLocation | undefined {
  const planet = WORLD_PLANETS.find(candidate => [candidate.name, ...(candidate.aliases ?? [])].some(name => location.includes(name)));
  if (!planet) return undefined;
  // A named planet establishes the route, not an absent subregion's geometry.
  // Only existing region labels are matched; otherwise use its first landing.
  const region = planet.regions.find(candidate => {
    const localName = candidate.name.replace(planet.name, '');
    return location.includes(candidate.name) || localName.length >= 2 && location.includes(localName);
  }) ?? planet.regions[0];
  return { planetId: planet.id, regionId: region.id, staging: false };
}

/** Explicit IDs precede catalog planet names; unmodeled locations retain authored rendezvous. */
export function findChallengeLocation(boss: ChallengeTarget): ChallengeLocation {
  for (const planet of WORLD_PLANETS) for (const region of planet.regions) {
    if (region.bossIds?.includes(boss.id)) return { planetId: planet.id, regionId: region.id, staging: false };
  }
  if (boss.category === 'tower') return { ...BRAVE_TOWER_LOCATION, staging: false };
  if (boss.category === 'dark') return { ...DARK_ARENA_LOCATION, staging: false };
  return namedPlanetLocation(boss.location?.replace(/[\s()（）]/g, '') ?? '') ?? { ...STAGING_LOCATION, staging: true };
}

/** A selected encounter appears in its resolved habitat or facility. */
export function findSceneChallenges<T extends ChallengeTarget>(planetId: string, regionId: string, bosses: readonly T[], targetBossId?: string): T[] {
  const { planet, region } = resolveWorldLocation(planetId, regionId);
  // Campaigns expose one neutral contact; the Tower exposes its control panel.
  // Neither route renders individual stages that could bypass saved progression.
  if (region.campaignId || isWorldLocation(planet, region, BRAVE_TOWER_LOCATION)) return [];
  const ids = [...(region.bossIds ?? [])];
  const target = bosses.find(boss => boss.id === targetBossId);
  if (target) {
    const landing = findChallengeLocation(target);
    if (landing.planetId === planet.id && landing.regionId === region.id) ids.push(target.id);
  }
  return [...new Set(ids)].map(id => bosses.find(boss => boss.id === id)).filter((boss): boss is T => !!boss);
}
