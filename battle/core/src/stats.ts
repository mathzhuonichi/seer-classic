// Stat formula is owned by the raising thread (raising/core/stats.ts); the
// battle core uses the same function so raised and in-battle stats agree.

import { computeStatsFrom } from '../../../raising/core/stats.ts';
import type { Nature, Stats, StatKey } from './types.ts';

export const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const NEUTRAL: Nature = { id: 'neutral', plus: 'atk', minus: 'atk' };

export function computeStats(
  base: Stats, level: number, iv = 0, evs: Partial<Stats> = {}, nature?: Nature,
): Stats {
  const full = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...evs };
  const n = nature ?? NEUTRAL;
  return computeStatsFrom(base, iv, full, level, { ...n, name: n.name ?? { zh: n.id } });
}
