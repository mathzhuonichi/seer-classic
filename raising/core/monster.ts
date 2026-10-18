// Rules that act on one raised monster: creation, 个体, 学习力, 性格, EXP/levels, skills,
// evolution. Every function is pure: it returns a new Monster plus the events that happened.
import type { Dex, Monster, PartialStats, RaisingEvent, Rng, Species, StatBlock, StatKey } from "./types.ts";
import { STAT_KEYS } from "./types.ts";
import { computeStats, EV_STAT_CAP, EV_TOTAL_CAP, evTotal, IV_MAX, IV_MIN, IV_NATURAL_MIN } from "./stats.ts";
import { expToNext, MAX_LEVEL } from "./growth.ts";

export const MAX_EQUIPPED = 4;

export interface Result { mon: Monster; events: RaisingEvent[] }

const clone = (m: Monster): Monster => structuredClone(m);
const zeroStats = (): StatBlock => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });

export function makeUid(rng: Rng): string {
  let s = "";
  for (let i = 0; i < 12; i++) s += rng.int(0, 15).toString(16);
  return s;
}

// ---------- 个体值 / 性格 rolls ----------

// New monsters (caught, hatched, gifted) roll 1-31; re-roll items roll 0-31.
export function rollIv(rng: Rng, min = IV_NATURAL_MIN): number {
  return rng.int(min, IV_MAX);
}

export function rollNature(dex: Dex, rng: Rng): string {
  const all = dex.natures();
  return all[rng.int(0, all.length - 1)].id;
}

// ---------- skills ----------

// Every skill the species knows at or below `level`, in learnset order, no duplicates.
export function learnsetUpTo(sp: Species, level: number): number[] {
  const out: number[] = [];
  for (const e of [...sp.learnset].sort((a, b) => a.level - b.level)) {
    if (typeof e.level === 'number' && e.level <= level && !out.includes(e.skill)) out.push(e.skill);
  }
  return out;
}

function learnSkill(mon: Monster, skill: number, dex: Dex, events: RaisingEvent[]): void {
  if (mon.learned.includes(skill)) return;
  mon.learned.push(skill);
  const equipped = mon.skills.length < MAX_EQUIPPED;
  if (equipped) {
    mon.skills.push(skill);
    mon.pp[String(skill)] = dex.skill(skill).pp;
  }
  events.push({ kind: "skill_learned", uid: mon.uid, skill, equipped });
}

// Seer lets you swap equipped skills freely outside battle among everything learned.
export function equipSkills(mon: Monster, skills: number[], dex: Dex): Monster {
  if (skills.length < 1 || skills.length > MAX_EQUIPPED) throw new Error("equip 1-4 skills");
  if (new Set(skills).size !== skills.length) throw new Error("duplicate skill");
  for (const s of skills) if (!mon.learned.includes(s)) throw new Error(`skill ${s} not learned`);
  const m = clone(mon);
  const pp: Record<string, number> = {};
  for (const s of skills) pp[String(s)] = mon.pp[String(s)] ?? dex.skill(s).pp;
  m.skills = [...skills];
  m.pp = pp;
  return m;
}

// ---------- creation ----------

export interface CreateOptions {
  uid?: string;
  iv?: number;
  nature?: string;
  evs?: PartialStats;
  how?: string;
  at?: string;
}

export function createMonster(dex: Dex, speciesId: number, level: number, rng: Rng, opts: CreateOptions = {}): Monster {
  const sp = dex.species(speciesId);
  if (level < 1 || level > MAX_LEVEL) throw new Error(`level ${level} out of range`);
  const learned = learnsetUpTo(sp, level);
  const skills = learned.slice(-MAX_EQUIPPED); // newest four, like a wild spirit
  const mon: Monster = {
    uid: opts.uid ?? makeUid(rng),
    species: speciesId,
    nickname: null,
    level,
    exp: 0,
    iv: opts.iv ?? rollIv(rng),
    evs: { ...zeroStats(), ...opts.evs },
    nature: opts.nature ?? rollNature(dex, rng),
    skills,
    learned,
    hp: 0,
    pp: Object.fromEntries(skills.map((s) => [String(s), dex.skill(s).pp])),
    status: null,
    obtained: { how: opts.how ?? "wild", at: opts.at ?? "" }, // core has no clock; the game layer stamps `at`
  };
  if (mon.iv < IV_MIN || mon.iv > IV_MAX) throw new Error(`iv ${mon.iv} out of range`);
  mon.hp = computeStats(mon, dex).hp;
  return mon;
}

// ---------- 学习力 ----------

// Adds 学习力 respecting 255 per stat and 510 total. Stats are filled in STAT_KEYS order
// when the total cap cuts a yield short.
export function addEvs(mon: Monster, gain: PartialStats): Result {
  const m = clone(mon);
  const gained: PartialStats = {};
  let room = EV_TOTAL_CAP - evTotal(m.evs);
  for (const k of STAT_KEYS) {
    const want = Math.max(0, Math.floor(gain[k] ?? 0));
    const add = Math.min(want, EV_STAT_CAP - m.evs[k], room);
    if (add > 0) {
      m.evs[k] += add;
      room -= add;
      gained[k] = add;
    }
  }
  const events: RaisingEvent[] = Object.keys(gained).length ? [{ kind: "evs_gained", uid: m.uid, gained }] : [];
  return { mon: m, events };
}

// 学习力遗忘: clears the listed stats (all when omitted). Current HP shifts with max HP.
export function resetEvs(mon: Monster, dex: Dex, stats: StatKey[] = [...STAT_KEYS]): Result {
  const m = restat(mon, dex, (x) => { for (const k of stats) x.evs[k] = 0; });
  return { mon: m, events: [{ kind: "evs_reset", uid: m.uid, stats }] };
}

// ---------- 性格 / 个体 changes ----------

export function changeNature(mon: Monster, nature: string, dex: Dex): Result {
  dex.nature(nature); // throws on unknown id
  const m = restat(mon, dex, (x) => { x.nature = nature; });
  return { mon: m, events: [{ kind: "nature_changed", uid: m.uid, from: mon.nature, to: nature }] };
}

export function rerollNature(mon: Monster, dex: Dex, rng: Rng): Result {
  return changeNature(mon, rollNature(dex, rng), dex);
}

export function setIv(mon: Monster, iv: number, dex: Dex): Result {
  if (!Number.isInteger(iv) || iv < IV_MIN || iv > IV_MAX) throw new Error(`iv ${iv} out of range`);
  const m = restat(mon, dex, (x) => { x.iv = iv; });
  return { mon: m, events: [{ kind: "iv_changed", uid: m.uid, from: mon.iv, to: iv }] };
}

export function rerollIv(mon: Monster, dex: Dex, rng: Rng): Result {
  return setIv(mon, rollIv(rng, IV_MIN), dex);
}

// 精灵还原: back to level 1 with a fresh 个体 and 性格 and no 学习力; species is kept.
export function restoreMonster(mon: Monster, dex: Dex, rng: Rng): Result {
  const fresh = createMonster(dex, mon.species, 1, rng, {
    uid: mon.uid, iv: rollIv(rng, IV_MIN), how: mon.obtained.how, at: mon.obtained.at,
  });
  fresh.nickname = mon.nickname;
  if (mon.skinSpecies !== undefined) fresh.skinSpecies = mon.skinSpecies;
  if (mon.generation !== undefined) fresh.generation = mon.generation;
  return {
    mon: fresh,
    events: [
      { kind: "iv_changed", uid: mon.uid, from: mon.iv, to: fresh.iv },
      { kind: "nature_changed", uid: mon.uid, from: mon.nature, to: fresh.nature },
      { kind: "evs_reset", uid: mon.uid, stats: [...STAT_KEYS] },
    ],
  };
}

// Copies `mon`, applies a change that may move its max HP, and shifts current HP with it.
function restat(mon: Monster, dex: Dex, change: (m: Monster) => void): Monster {
  const m = clone(mon);
  change(m);
  shiftHp(m, computeStats(mon, dex).hp, computeStats(m, dex).hp);
  return m;
}

// Keeps a fainted monster at 0 and otherwise shifts current HP by the change in max HP,
// clamped to [1, max], so stat changes never heal or faint a monster by themselves.
function shiftHp(m: Monster, oldMax: number, newMax: number): void {
  if (m.hp > 0) m.hp = Math.max(1, Math.min(newMax, m.hp + newMax - oldMax));
}

// ---------- EXP and levels ----------

export interface ExpResult extends Result { overflow: number }

// Adds EXP, levelling up as many times as it covers. A level-100 monster takes no EXP:
// the amount comes back as `overflow` for the player's 积累经验 pool.
export function gainExp(mon: Monster, amount: number, dex: Dex): ExpResult {
  const m = clone(mon);
  const events: RaisingEvent[] = [];
  let left = Math.max(0, Math.floor(amount));
  if (m.level >= MAX_LEVEL) return { mon: m, events, overflow: left };
  events.push({ kind: "exp_gained", uid: m.uid, amount: left });
  const growth = dex.species(m.species).growth;
  while (left > 0 && m.level < MAX_LEVEL) {
    const need = expToNext(growth, m.level) - m.exp;
    if (left < need) {
      m.exp += left;
      left = 0;
      break;
    }
    left -= need;
    levelUpOnce(m, dex, events);
  }
  // Anything past level 100 is kept for the pool rather than lost.
  return { mon: m, events, overflow: m.level >= MAX_LEVEL ? left : 0 };
}

// Changes the level by `levels`: up as if exactly enough EXP was gained (升级秘药), or
// down (降级秘药, never below 1). Going down keeps every learned skill and resets the
// EXP bar; it never un-evolves.
export function gainLevels(mon: Monster, levels: number, dex: Dex): Result {
  if (levels < 0) {
    if (mon.level <= 1) return { mon: clone(mon), events: [] };
    const m = restat(mon, dex, (x) => { x.level = Math.max(1, x.level + levels); x.exp = 0; });
    return { mon: m, events: [{ kind: "level_down", uid: m.uid, level: m.level, stats: computeStats(m, dex) }] };
  }
  const m = clone(mon);
  const events: RaisingEvent[] = [];
  for (let i = 0; i < levels && m.level < MAX_LEVEL; i++) levelUpOnce(m, dex, events);
  return { mon: m, events };
}

// Max HP never drops on a level-up, so shiftHp only ever raises current HP here.
function levelUpOnce(m: Monster, dex: Dex, events: RaisingEvent[]): void {
  const before = computeStats(m, dex).hp;
  m.level += 1;
  m.exp = 0;
  const after = computeStats(m, dex);
  shiftHp(m, before, after.hp);
  events.push({ kind: "level_up", uid: m.uid, level: m.level, stats: after });
  const sp = dex.species(m.species);
  for (const e of sp.learnset) if (e.level === m.level) learnSkill(m, e.skill, dex, events);
  const options = levelEvolutions(m, dex);
  if (options.length) events.push({ kind: "evolution_ready", uid: m.uid, options });
}

// ---------- evolution ----------

export interface EvolveContext { item?: string; special?: string[] }

// Branches always need an explicit choice, even if just one target is unlocked yet.
export function requiresEvolutionChoice(mon: Monster, dex: Dex): boolean {
  return new Set(dex.species(mon.species).evolution.map(entry => entry.to)).size > 1;
}

// Level evolutions whose level is reached. Branching species can return several.
export function levelEvolutions(mon: Monster, dex: Dex): number[] {
  return dex
    .species(mon.species)
    .evolution.filter((e) => e.method === "level" && e.automatic !== false && e.level !== undefined && mon.level >= e.level)
    .map((e) => e.to);
}

// Every evolution allowed right now. `special` lists the special conditions the game has
// confirmed (by `script` id, else `condition` text).
export function evolutionOptions(mon: Monster, dex: Dex, ctx: EvolveContext = {}): number[] {
  return dex
    .species(mon.species)
    .evolution.filter((e) => {
      if (e.method === "level") return e.level !== undefined && mon.level >= e.level;
      if (e.method === "item") return e.item !== undefined && e.item === ctx.item;
      return (ctx.special ?? []).includes(e.script ?? e.condition ?? "");
    })
    .map((e) => e.to);
}

// Keeps level, EXP, 个体, 学习力, 性格, learned skills and equipped skills. The new form
// also knows its own learnset up to the current level, and HP shifts by the max HP change.
export function evolve(mon: Monster, to: number, dex: Dex, ctx: EvolveContext = {}): Result {
  if (!evolutionOptions(mon, dex, ctx).includes(to)) {
    throw new Error(`species ${mon.species} cannot evolve into ${to} now`);
  }
  const m = restat(mon, dex, (x) => { x.species = to; });
  const events: RaisingEvent[] = [{ kind: "evolved", uid: m.uid, from: mon.species, to }];
  for (const s of learnsetUpTo(dex.species(to), m.level)) learnSkill(m, s, dex, events);
  return { mon: m, events };
}

// Applies level evolutions after a battle the way Seer did (automatic). If a species has
// several level branches, nothing happens and the caller must ask the player.
export function autoEvolve(mon: Monster, dex: Dex): Result {
  let cur = mon;
  const events: RaisingEvent[] = [];
  for (;;) {
    if (requiresEvolutionChoice(cur, dex)) return { mon: cur, events };
    const opts = levelEvolutions(cur, dex);
    if (opts.length !== 1) return { mon: cur, events };
    const r = evolve(cur, opts[0], dex);
    cur = r.mon;
    events.push(...r.events);
  }
}
