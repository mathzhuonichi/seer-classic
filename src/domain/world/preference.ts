import { HOME_LOCATION, resolveWorldLocation } from './locations.ts';
import type { WorldLocationId } from './types.ts';

/** The explorer's last scene and position: a UI preference, separate from the gameplay save. */
export interface WorldPreference extends WorldLocationId { x: number; y: number; visited: string[] }

const PREFERENCE_KEY = 'seer-classic.world-ui.v1';
const HOME_POSITION = { x: 42, y: 80 };
const VISITED_LIMIT = 100;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

const defaultPreference = (): WorldPreference =>
  ({ ...HOME_LOCATION, ...HOME_POSITION, visited: [`${HOME_LOCATION.planetId}/${HOME_LOCATION.regionId}`] });

export function readWorldPreference(): WorldPreference {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFERENCE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return defaultPreference();
    const { planet, region } = resolveWorldLocation(raw.planetId, raw.regionId);
    return {
      planetId: planet.id, regionId: region.id,
      x: Number.isFinite(raw.x) ? clamp(raw.x, 6, 94) : HOME_POSITION.x,
      y: Number.isFinite(raw.y) ? clamp(raw.y, 35, 88) : HOME_POSITION.y,
      visited: Array.isArray(raw.visited) ? raw.visited.filter((entry: unknown) => typeof entry === 'string').slice(0, VISITED_LIMIT) : [],
    };
  } catch { return defaultPreference(); }
}

export function writeWorldPreference(preference: WorldPreference) {
  try { localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preference)); } catch { /* Exploration remains usable without local storage. */ }
}
