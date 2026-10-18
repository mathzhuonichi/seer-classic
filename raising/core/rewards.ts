// After-battle rewards: EXP split, 学习力, 积累经验 overflow and automatic evolution.
import type { Dex, RaisingEvent, Save } from "./types.ts";
import { addEvs, autoEvolve, gainExp } from "./monster.ts";
import { MAX_LEVEL } from "./growth.ts";
import { boostMultiplier } from "./items.ts";
import { findMon, putMon, withMon } from "./storage.ts";

export const BOSS_EXP_MULTIPLIER = 1.5;

export interface Defeated { species: number; level: number; boss?: boolean }

// EXP one defeated monster is worth: floor(exp_yield * level / 7), x1.5 for bosses.
export function expYield(dex: Dex, foe: Defeated): number {
  const base = Math.floor((dex.species(foe.species).exp_yield * foe.level) / 7);
  return foe.boss ? Math.floor(base * BOSS_EXP_MULTIPLIER) : base;
}

export interface RewardOptions {
  expMultiplier?: number; // e.g. 双倍经验 events
  autoEvolve?: boolean; // default true, as in Seer
}

export interface RewardResult { save: Save; events: RaisingEvent[] }

// Does not count boosts down; the game calls tickBoosts after every battle.
// `participants`: uids of the player's monsters that battled each foe and are still
// standing, in the order given by the battle core (one list per defeated foe).
// Each foe's EXP is split evenly between its participants ("经验各分一半"); each
// participant gets the foe's full 学习力 yield. Level-100 shares go to exp_pool.
export function applyBattleRewards(
  save: Save,
  defeated: { foe: Defeated; participants: string[] }[],
  dex: Dex,
  opts: RewardOptions = {},
): RewardResult {
  // The copy owns its storage array only: each rewarded monster gets a new record, and the other records are shared.
  const s: Save = { ...save, storage: [...save.storage] };
  const events: RaisingEvent[] = [];
  // Active 经验加速器 / 学习力双倍仪 multiply on top of any event multiplier.
  const mult = (opts.expMultiplier ?? 1) * boostMultiplier(s, "exp");
  const evMult = boostMultiplier(s, "ev");
  const touched = new Set<string>();
  for (const { foe, participants } of defeated) {
    const alive = participants.filter((u) => findMon(s, u).hp > 0);
    if (!alive.length) continue;
    const total = Math.floor(expYield(dex, foe) * mult);
    const share = Math.max(1, Math.floor(total / alive.length));
    const evYield = Object.fromEntries(
      Object.entries(dex.species(foe.species).ev_yield ?? {}).map(([k, v]) => [k, (v ?? 0) * evMult]),
    );
    for (const uid of alive) {
      let mon = findMon(s, uid);
      const ev = addEvs(mon, evYield);
      mon = ev.mon;
      events.push(...ev.events);
      if (mon.level >= MAX_LEVEL) {
        s.exp_pool += share;
        events.push({ kind: "exp_to_pool", uid, amount: share });
      } else {
        const r = gainExp(mon, share, dex);
        mon = r.mon;
        events.push(...r.events);
        if (r.overflow > 0) {
          s.exp_pool += r.overflow;
          events.push({ kind: "exp_to_pool", uid, amount: r.overflow });
        }
      }
      putMon(s, mon);
      touched.add(uid);
    }
  }
  if (opts.autoEvolve ?? true) {
    for (const uid of touched) {
      const r = autoEvolve(findMon(s, uid), dex);
      putMon(s, r.mon);
      events.push(...r.events);
    }
  }
  return { save: s, events };
}

// 经验分配器: moves EXP from the 积累经验 pool into one monster. Only what the monster
// can actually absorb leaves the pool.
export function allocatePoolExp(save: Save, uid: string, amount: number, dex: Dex): RewardResult {
  const want = Math.floor(amount);
  if (want <= 0 || want > save.exp_pool) throw new Error(`pool has ${save.exp_pool}, asked ${amount}`);
  const r = gainExp(findMon(save, uid), want, dex);
  const s = withMon(save, r.mon);
  s.exp_pool -= want - r.overflow;
  return { save: s, events: r.events };
}
