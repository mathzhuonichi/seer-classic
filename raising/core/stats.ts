import type { Dex, Monster, Nature, StatBlock } from "./types.ts";
import { STAT_KEYS } from "./types.ts";

/** The six stats, shared by the raising rules and the battle core. */
export type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";

export const IV_MIN = 0;
export const IV_NATURAL_MIN = 1; // new monsters roll 1-31; 0 only comes from a re-roll item
export const IV_MAX = 31;
export const EV_STAT_CAP = 255;
export const EV_TOTAL_CAP = 510;

// 性格修正: x1.1 on `plus`, x0.9 on `minus`, never on HP. Neutral natures have plus === minus.
export function natureMultiplier(nature: Pick<Nature, "plus" | "minus">, stat: StatKey): number {
  if (stat === "hp" || nature.plus === nature.minus) return 1;
  if (stat === nature.plus) return 1.1;
  if (stat === nature.minus) return 0.9;
  return 1;
}

// Retained classic stat reconstruction, excluding equipment/trait bonuses:
//   HP = floor((2*base + IV + floor(EV/4)) * L / 100) + L + 10
//   Other = floor((floor((2*base + IV + floor(EV/4)) * L / 100) + 5) * nature)
// Official client data confirms nature multipliers, but complete stats arrive
// from the server. These intermediate floors are not an official-server proof;
// see design/notes/damage-official-v25.md for the inspected source boundary.
// The battle engine must use this same function so raised stats and battle stats agree.
export function statValue(stat: StatKey, base: number, iv: number, ev: number, level: number, nature: Nature): number {
  const core = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100);
  if (stat === "hp") return core + level + 10;
  // Integer math for the nature step avoids 0.1 float drift (e.g. 110 * 1.1).
  const m = natureMultiplier(nature, stat);
  const raw = core + 5;
  return m === 1 ? raw : Math.floor((raw * Math.round(m * 10)) / 10);
}

// Dependency-free form for callers that already hold the species and nature (battle core).
export function computeStatsFrom(base: StatBlock, iv: number, evs: StatBlock, level: number, nature: Nature): StatBlock {
  const out = {} as StatBlock;
  for (const k of STAT_KEYS) out[k] = statValue(k, base[k], iv, evs[k] ?? 0, level, nature);
  return out;
}

export function computeStats(mon: Monster, dex: Dex): StatBlock {
  return computeStatsFrom(dex.species(mon.species).base, mon.iv, mon.evs, mon.level, dex.nature(mon.nature));
}

export function evTotal(evs: StatBlock): number {
  return STAT_KEYS.reduce((sum, k) => sum + evs[k], 0);
}
