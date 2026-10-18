// Raising items (`kind: "raising"` in data/items.json). Each carries one `raising_effect`.
import type { Boost, Dex, Monster, PartialStats, RaisingEvent, Rng, Save } from "./types.ts";
import type { StatKey } from "./stats.ts";
import {
  addEvs, changeNature, gainExp, gainLevels, rerollIv, rerollNature, resetEvs, restoreMonster, setIv,
  type Result,
} from "./monster.ts";
import { findMon, requireItem, spendItem, withMon } from "./storage.ts";
import { MAX_LEVEL } from "./growth.ts";

export type RaisingEffect =
  | { op: "exp"; amount: number } // 经验药剂
  | { op: "levels"; amount: number } // 升级秘药
  | { op: "ev_add"; evs: PartialStats } // 学习力药剂
  | { op: "ev_reset"; stats?: StatKey[] } // 学习力遗忘药剂
  | { op: "iv_reroll" } // 个体值重塑 / 天赋改造药剂
  | { op: "iv_set"; iv: number } // 满个体 rewards
  | { op: "nature_reroll" } // 性格重塑胶囊
  | { op: "nature_set"; nature: string } // X性格转换剂
  | { op: "restore" } // 精灵还原药剂
  | { op: "boost"; what: "exp" | "ev"; multiplier: number; battles: number } // 经验加速器, 学习力双倍仪
  | {
      op: "energy_bead"; battles: number; // 能量珠, applied by the battle engine
      stats?: PartialStats; crit_rate_add?: number; damage_taken_and_dealt_multiplier?: number;
    };

export interface RaisingItem { id: string; kind: "raising"; raising_effect: RaisingEffect }

export interface ItemResult { save: Save; events: RaisingEvent[]; overflow?: number }

type BoostEffect = Extract<RaisingEffect, { op: "boost" | "energy_bead" }>;

// `unlimited` (the game's unlimited-access mode) applies the item without consuming it.
export function useRaisingItem(save: Save, uid: string, item: RaisingItem, dex: Dex, rng: Rng, options: {unlimited?: boolean} = {}): ItemResult {
  const unlimited = options.unlimited ?? false;
  if (!unlimited) requireItem(save, item.id);
  const mon = findMon(save, uid);
  const fx = item.raising_effect;
  if (fx.op === "boost" || fx.op === "energy_bead") return startBoost(save, uid, item.id, fx, unlimited);
  const r = applyEffect(mon, fx, dex, rng);
  const s = withMon(save, r.mon);
  if (!unlimited) s.items = spendItem(save, item.id);
  // EXP past level 100 from a big EXP item goes to 积累经验 instead of being lost.
  if (r.overflow) s.exp_pool += r.overflow;
  return { save: s, events: r.events, overflow: r.overflow };
}

function applyEffect(mon: Monster, fx: Exclude<RaisingEffect, BoostEffect>, dex: Dex, rng: Rng): Result & { overflow?: number } {
  if ((fx.op === "exp" || (fx.op === "levels" && fx.amount > 0)) && mon.level >= MAX_LEVEL) throw new Error(`already level ${MAX_LEVEL}`);
  if (fx.op === "levels" && fx.amount < 0 && mon.level <= 1) throw new Error("already level 1");
  switch (fx.op) {
    case "exp": return gainExp(mon, fx.amount, dex);
    case "levels": return gainLevels(mon, fx.amount, dex);
    case "ev_add": return addEvs(mon, fx.evs);
    case "ev_reset": return resetEvs(mon, dex, fx.stats);
    case "iv_reroll": return rerollIv(mon, dex, rng);
    case "iv_set": return setIv(mon, fx.iv, dex);
    case "nature_reroll": return rerollNature(mon, dex, rng);
    case "nature_set": return changeNature(mon, fx.nature, dex);
    case "restore": return restoreMonster(mon, dex, rng);
  }
}

// One exp boost, one ev boost and one bead per monster can be active at a time; using
// another of the same kind is refused so an item is never wasted.
function startBoost(save: Save, uid: string, id: string, fx: BoostEffect, unlimited: boolean): ItemResult {
  const active = save.boosts ?? [];
  const boost: Boost = fx.op === "boost"
    ? { kind: fx.what, item: id, multiplier: fx.multiplier, battles_left: fx.battles }
    : {
        kind: "energy_bead", item: id, uid, battles_left: fx.battles,
        ...(fx.stats && { stats: fx.stats }),
        ...(fx.crit_rate_add !== undefined && { crit_rate_add: fx.crit_rate_add }),
        ...(fx.damage_taken_and_dealt_multiplier !== undefined && { damage_taken_and_dealt_multiplier: fx.damage_taken_and_dealt_multiplier }),
      };
  const clash = active.some((b) => b.kind === boost.kind && (b.kind !== "energy_bead" || b.uid === uid));
  if (clash) throw new Error(`a ${boost.kind} effect is already active`);
  return { save: { ...save, boosts: [...active, boost], items: unlimited ? save.items : spendItem(save, id) }, events: [] };
}

// Product of the active player-wide boosts of one kind (1 when none).
export function boostMultiplier(save: Save, kind: "exp" | "ev"): number {
  return (save.boosts ?? []).reduce((m, b) => (b.kind === kind ? m * b.multiplier : m), 1);
}

// Energy beads the battle engine must apply to this monster.
export function activeBeads(save: Save, uid: string): Extract<Boost, { kind: "energy_bead" }>[] {
  return (save.boosts ?? []).filter((b): b is Extract<Boost, { kind: "energy_bead" }> => b.kind === "energy_bead" && b.uid === uid);
}

// Call once after every battle (won, lost or fled): counts every boost down by one.
export function tickBoosts(save: Save): Save {
  if (!save.boosts?.length) return save;
  return { ...save, boosts: save.boosts.map((b) => ({ ...b, battles_left: b.battles_left - 1 })).filter((b) => b.battles_left > 0) };
}
