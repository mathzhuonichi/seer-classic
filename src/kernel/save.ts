// Save file: create, validate, migrate, serialise. This is game-layer code (it parses
// text); the rules it checks come from the core. The storage medium (local storage,
// persistence.ts) is the app's job: it only ever passes strings in and out.
import type { Dex, Monster, Save } from "../../raising/core/types.ts";
import { STAT_KEYS } from "../../raising/core/types.ts";
import { EV_STAT_CAP, EV_TOTAL_CAP, evTotal, IV_MAX, IV_MIN } from "../../raising/core/stats.ts";
import { expToNext, MAX_LEVEL } from "../../raising/core/growth.ts";
import { MAX_EQUIPPED } from "../../raising/core/monster.ts";
import { PARTY_MAX } from "../../raising/core/storage.ts";

export const SAVE_VERSION = 5;

/** Per-monster later-era mechanics state: equipped engravings and spent engraving resources. */
export interface SavedModules {
  engravings: string[];
  /** Spent bonus resources that cannot fit in the nonnegative base HP/PP save fields. */
  engravingDeficit?: { hp: number; pp: Record<string, number> };
}

/** The game controller's per-player state, saved beside the raising core's fields. */
export interface GameExtras {
  coins: number;
  /** Trait id per monster uid. */
  traits: Record<string, string>;
  /** Claimed quest ids. */
  quests: string[];
  battlesWon: number;
  modules: Record<string, SavedModules>;
  engravingStock: Record<string, number>;
  /** Cleared stage ids per challenge campaign. */
  campaigns: Record<string, string[]>;
  /** Items listed in the shop because the player has earned them. */
  shopUnlocked: string[];
  recruitmentClaims: Record<string, number>;
  braveTower: { highestCleared: number; resumeFloor: number | null };
  /** Cleared variant ids per encounter (the weekday objectives and fields the player picks before a Boss fight). */
  bossVariants: Record<string, string[]>;
}

export type GameSave = Save & { game: GameExtras };

export function newSave(seed: number): Save {
  return {
    version: SAVE_VERSION,
    seed: seed >>> 0,
    rng_state: null,
    party: [],
    storage: [],
    exp_pool: 0,
    items: {},
    progress: { bosses_cleared: [], boss_attempts: {}, boss_wins: {} },
    dex: { seen: [], owned: [] },
  };
}

/** Catalog facts that a migration needs but a save does not record; the game controller supplies them. */
export interface MigrationContext {
  /** Recruitment quests whose version-1 claims were recorded only in `game.quests`. */
  recruitments: readonly { questId: string; itemId: string }[];
  /** Items introduced during version 1, granted once without replacing existing stock. */
  introducedItems: Readonly<Record<string, number>>;
  /** Items version 3 retired, each with the item that takes over its stock and shop listing. */
  replacedItems: Readonly<Record<string, string>>;
  /** First-clear items per encounter, which version 2 never paid: a save that cleared the encounter receives them once. */
  firstClearItems: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /**
   * The variant ids of each encounter with a title for clearing every variant (厄尔塞拉's 七色光羽). Version 3 showed that title after
   * a plain clear, so a version-3 save that cleared the encounter records every variant and keeps it.
   */
  allVariantTitles: Readonly<Record<string, readonly string[]>>;
}

const isRecord = (x: unknown): x is Record<string, any> => typeof x === "object" && x !== null && !Array.isArray(x);

// Version 1 repaired these on every load or write; version 2 records them once.
// Malformed fields are left for validateSave to report.
function fromVersion1(s: any, context: MigrationContext | undefined): any {
  if (!context) throw new Error("version 1 saves need the game's migration context");
  if (isRecord(s.items)) for (const [id, count] of Object.entries(context.introducedItems)) if (!(id in s.items)) s.items[id] = count;
  const game = s.game;
  if (!isRecord(game) || !Array.isArray(game.quests)) return s;
  // Old direct-creature quest rewards keep their repeat-claim entitlement and shop listing.
  game.recruitmentClaims ??= {};
  game.shopUnlocked ??= [];
  if (!isRecord(game.recruitmentClaims) || !Array.isArray(game.shopUnlocked)) return s;
  for (const { questId, itemId } of context.recruitments) {
    if (!game.quests.includes(questId)) continue;
    game.recruitmentClaims[questId] = Math.max(1, game.recruitmentClaims[questId] ?? 0);
    if (!game.shopUnlocked.includes(itemId)) game.shopUnlocked.push(itemId);
  }
  return s;
}

// Version 3 moves retired items to their replacements and pays the first-clear items of earlier clears.
// Malformed fields are left for validateSave to report.
function fromVersion2(s: any, context: MigrationContext | undefined): any {
  if (!context) throw new Error("version 2 saves need the game's migration context");
  if (!isRecord(s.items)) return s;
  for (const [retired, replacement] of Object.entries(context.replacedItems)) {
    if (isInt(s.items[retired]) && (s.items[replacement] === undefined || isInt(s.items[replacement]))) {
      s.items[replacement] = (s.items[replacement] ?? 0) + s.items[retired];
      delete s.items[retired];
    }
    const listed = s.game?.shopUnlocked;
    if (Array.isArray(listed)) s.game.shopUnlocked = [...new Set(listed.map((id: unknown) => id === retired ? replacement : id))];
  }
  const cleared: unknown = s.progress?.bosses_cleared;
  if (!Array.isArray(cleared)) return s;
  for (const [encounterId, items] of Object.entries(context.firstClearItems)) {
    if (!cleared.includes(encounterId)) continue;
    for (const [id, count] of Object.entries(items)) if (!(id in s.items)) s.items[id] = count;
  }
  return s;
}

// Version 4 records the variants cleared per encounter. Version 3 offered none: a clear stood for every variant and showed the title
// for clearing them all, so such a clear records every variant. Malformed fields are left for validateSave to report.
function fromVersion3(s: any, context: MigrationContext | undefined): any {
  if (!context) throw new Error("version 3 saves need the game's migration context");
  if (!isRecord(s.game)) return s;
  const record = s.game.bossVariants ??= {}, cleared: unknown = s.progress?.bosses_cleared;
  if (!isRecord(record) || !Array.isArray(cleared)) return s;
  for (const [encounterId, variants] of Object.entries(context.allVariantTitles)) if (cleared.includes(encounterId)) record[encounterId] = [...variants];
  return s;
}

// Version 5 counts the wins per encounter beside its attempts (洛拉斯克's level falls by one step per win and another per loss).
// Earlier versions kept only the first clear, so a cleared encounter starts at one win. Malformed fields are left for validateSave.
function fromVersion4(s: any): any {
  if (!isRecord(s.progress)) return s;
  const wins = s.progress.boss_wins ??= {}, cleared: unknown = s.progress.bosses_cleared;
  if (!isRecord(wins) || !Array.isArray(cleared)) return s;
  for (const encounterId of cleared) wins[encounterId] ??= 1;
  return s;
}

// Each entry upgrades a save from version k to k + 1.
const MIGRATIONS: Record<number, (s: any, context: MigrationContext | undefined) => any> = {
  1: fromVersion1, 2: fromVersion2, 3: fromVersion3, 4: fromVersion4,
};

/** The format version a save's text declares, or null when it declares none. */
export function storedVersion(text: string): number | null {
  try {
    const version = JSON.parse(text)?.version;
    return typeof version === "number" ? version : null;
  } catch {
    return null;
  }
}

export function migrate(raw: any, context?: MigrationContext): Save {
  let s = raw;
  if (typeof s?.version !== "number") throw new Error("not a Seer Classic save");
  if (s.version > SAVE_VERSION) throw new Error(`save version ${s.version} is newer than this game`);
  while (s.version < SAVE_VERSION) {
    const step = MIGRATIONS[s.version];
    if (!step) throw new Error(`no migration from save version ${s.version}`);
    s = { ...step(s, context), version: s.version + 1 };
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
export function deserialize(text: string, dex: Dex | null = null, context?: MigrationContext): Save {
  const save = migrate(JSON.parse(text), context);
  const errors = validateSave(save, dex);
  if (errors.length) throw new Error(`invalid save:\n- ${errors.join("\n- ")}`);
  return save;
}
