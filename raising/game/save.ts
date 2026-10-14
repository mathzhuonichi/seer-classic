// Save file: create, validate, migrate, serialise. This is game-layer code (it parses
// text); the rules it checks come from the core. Storage medium (file, IndexedDB,
// Tauri fs) is the app's job: it only ever passes strings in and out.
import type { Dex, Monster, Save } from "../core/types.ts";
import { STAT_KEYS } from "../core/types.ts";
import { EV_STAT_CAP, EV_TOTAL_CAP, evTotal, IV_MAX, IV_MIN } from "../core/stats.ts";
import { expToNext, MAX_LEVEL } from "../core/growth.ts";
import { MAX_EQUIPPED } from "../core/monster.ts";
import { PARTY_MAX } from "../core/storage.ts";

export const SAVE_VERSION = 1;

export function newSave(seed: number): Save {
  return {
    version: SAVE_VERSION,
    seed: seed >>> 0,
    rng_state: null,
    party: [],
    storage: [],
    exp_pool: 0,
    items: {},
    progress: { bosses_cleared: [], boss_attempts: {} },
    dex: { seen: [], owned: [] },
  };
}

// Each entry upgrades a save from version k to k + 1. Empty until the format changes.
const MIGRATIONS: Record<number, (s: any) => any> = {};

export function migrate(raw: any): Save {
  let s = raw;
  if (typeof s?.version !== "number") throw new Error("not a Seer Classic save");
  if (s.version > SAVE_VERSION) throw new Error(`save version ${s.version} is newer than this game`);
  while (s.version < SAVE_VERSION) {
    const step = MIGRATIONS[s.version];
    if (!step) throw new Error(`no migration from save version ${s.version}`);
    s = { ...step(s), version: s.version + 1 };
  }
  return s as Save;
}

const isInt = (x: unknown): x is number => Number.isInteger(x);

export function validateMonster(m: Monster, dex: Dex | null, where = m?.uid ?? "?"): string[] {
  const e: string[] = [];
  const bad = (msg: string) => e.push(`${where}: ${msg}`);
  if (typeof m.uid !== "string" || !m.uid) bad("uid missing");
  if (!isInt(m.level) || m.level < 1 || m.level > MAX_LEVEL) bad(`level ${m.level}`);
  if (!isInt(m.iv) || m.iv < IV_MIN || m.iv > IV_MAX) bad(`iv ${m.iv}`);
  if (!m.evs || STAT_KEYS.some((k) => !isInt(m.evs[k]) || m.evs[k] < 0 || m.evs[k] > EV_STAT_CAP)) bad("evs out of range");
  else if (evTotal(m.evs) > EV_TOTAL_CAP) bad(`evs total ${evTotal(m.evs)} > ${EV_TOTAL_CAP}`);
  if (!Array.isArray(m.skills) || m.skills.length < 1 || m.skills.length > MAX_EQUIPPED) bad("1-4 skills must be equipped");
  else if (m.skills.some((s) => !m.learned?.includes(s))) bad("equipped skill not learned");
  if (!isInt(m.exp) || m.exp < 0) bad(`exp ${m.exp}`);
  if (!isInt(m.hp) || m.hp < 0) bad(`hp ${m.hp}`);
  if (m.generation !== undefined && (!isInt(m.generation) || m.generation < 0)) bad(`generation ${m.generation}`);
  if (dex) {
    try {
      const sp = dex.species(m.species);
      const need = expToNext(sp.growth, m.level);
      if (m.level < MAX_LEVEL ? m.exp >= need : m.exp !== 0) bad(`exp ${m.exp} does not fit level ${m.level}`);
      dex.nature(m.nature);
      for (const s of m.learned) dex.skill(s);
    } catch (err) {
      bad((err as Error).message);
    }
  }
  return e;
}

export function validateSave(s: Save, dex: Dex | null = null): string[] {
  const e: string[] = [];
  const uids = s.storage.map((m) => m.uid);
  if (new Set(uids).size !== uids.length) e.push("duplicate monster uid");
  if (s.party.length < 1 && s.storage.length > 0) e.push("party is empty");
  if (s.party.length > PARTY_MAX) e.push(`party has ${s.party.length} > ${PARTY_MAX}`);
  if (new Set(s.party).size !== s.party.length) e.push("party lists a monster twice");
  for (const u of s.party) if (!uids.includes(u)) e.push(`party uid ${u} not in storage`);
  if (!isInt(s.exp_pool) || s.exp_pool < 0) e.push(`exp_pool ${s.exp_pool}`);
  for (const [id, n] of Object.entries(s.items)) if (!isInt(n) || n < 0) e.push(`item ${id} count ${n}`);
  for (const b of s.boosts ?? []) {
    if (!isInt(b.battles_left) || b.battles_left < 1) e.push(`boost ${b.item} battles_left ${b.battles_left}`);
    if (b.kind === "energy_bead" && !uids.includes(b.uid)) e.push(`boost ${b.item} on missing monster ${b.uid}`);
  }
  for (const m of s.storage) e.push(...validateMonster(m, dex));
  return e;
}

export function serialize(save: Save): string {
  return JSON.stringify(save);
}

// Parses, migrates and validates. Throws with every problem listed if the save is bad.
export function deserialize(text: string, dex: Dex | null = null): Save {
  const save = migrate(JSON.parse(text));
  const errors = validateSave(save, dex);
  if (errors.length) throw new Error(`invalid save:\n- ${errors.join("\n- ")}`);
  return save;
}
