import type { WorldPlanet, WorldRegion } from './types.ts';

/** Original map ID → the world theme its scene plays: `maps` of data/scene-music.json. */
export type SceneMusicTable = Readonly<Record<string, string>>;

/**
 * The world theme of a scene, as the original SoundManager chose it by map ID: the region's map's, else its planet's map's (a
 * region without a map of its own, or one the table lacks); null when neither has one. See design/notes/bgm-2026-10-24.md.
 */
export function sceneTrack(
  table: SceneMusicTable, planet: Pick<WorldPlanet, 'originalMapId'>, region: Pick<WorldRegion, 'originalMapId'>,
): string | null {
  for (const mapId of [region.originalMapId, planet.originalMapId]) {
    const track = mapId === undefined ? undefined : table[mapId];
    if (track) return track;
  }
  return null;
}
