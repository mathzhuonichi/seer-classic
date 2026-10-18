// 背包 (party, max 6) and 精灵仓库 (box) over Save. Pure: each call returns a new Save.
import type { Dex, Monster, Rng, Save } from "./types.ts";
import { computeStats } from "./stats.ts";
import { createMonster } from "./monster.ts";

export const PARTY_MAX = 6;
export const BOX_MAX = 1000; // the remake's box size; Seer's 仓库 grew over time
export const NICKNAME_MAX = 12; // characters (code points)

const copy = (s: Save): Save => structuredClone(s);

export function findMon(save: Save, uid: string): Monster {
  const m = save.storage.find((x) => x.uid === uid);
  if (!m) throw new Error(`no monster ${uid}`);
  return m;
}

export function putMon(save: Save, mon: Monster): void {
  const i = save.storage.findIndex((x) => x.uid === mon.uid);
  if (i < 0) throw new Error(`no monster ${mon.uid}`);
  save.storage[i] = mon;
}

export function requireItem(save: Save, id: string): void {
  if ((save.items[id] ?? 0) < 1) throw new Error(`no ${id} left`);
}

// Takes one `id` from a save copy the caller owns; an emptied stack leaves the bag.
export function spendItem(save: Save, id: string): void {
  save.items[id] -= 1;
  if (save.items[id] === 0) delete save.items[id];
}

export function boxOf(save: Save): Monster[] {
  return save.storage.filter((m) => !save.party.includes(m.uid));
}

// A newly obtained monster joins the party if there is room, otherwise the box.
export function addMonster(save: Save, mon: Monster): Save {
  if (save.storage.some((m) => m.uid === mon.uid)) throw new Error(`duplicate uid ${mon.uid}`);
  const s = copy(save);
  const toParty = s.party.length < PARTY_MAX;
  if (!toParty && boxOf(s).length >= BOX_MAX) throw new Error("仓库已满");
  s.storage.push(structuredClone(mon));
  if (toParty) s.party.push(mon.uid);
  if (!s.dex.owned.includes(mon.species)) s.dex.owned.push(mon.species);
  if (!s.dex.seen.includes(mon.species)) s.dex.seen.push(mon.species);
  return s;
}

export function deposit(save: Save, uid: string): Save {
  if (!save.party.includes(uid)) throw new Error(`${uid} is not in the party`);
  if (save.party.length <= 1) throw new Error("the party needs at least one monster");
  const s = copy(save);
  s.party = s.party.filter((u) => u !== uid);
  return s;
}

export function withdraw(save: Save, uid: string): Save {
  if (save.party.includes(uid)) throw new Error(`${uid} is already in the party`);
  findMon(save, uid);
  if (save.party.length >= PARTY_MAX) throw new Error("背包已满");
  const s = copy(save);
  s.party.push(uid);
  return s;
}

// Reorders the party; the first monster is the one sent out first.
export function setPartyOrder(save: Save, order: string[]): Save {
  const same = order.length === save.party.length && order.every((u) => save.party.includes(u));
  if (!same || new Set(order).size !== order.length) throw new Error("order must be a permutation of the party");
  const s = copy(save);
  s.party = [...order];
  return s;
}

// 放生. The last party monster can never be released.
export function release(save: Save, uid: string): Save {
  if (save.party.includes(uid) && save.party.length <= 1) throw new Error("cannot release the last party monster");
  findMon(save, uid);
  const s = copy(save);
  s.storage = s.storage.filter((m) => m.uid !== uid);
  s.party = s.party.filter((u) => u !== uid);
  return s;
}

export function rename(save: Save, uid: string, nickname: string | null): Save {
  const s = copy(save);
  const m = findMon(s, uid);
  const name = nickname?.trim() ?? "";
  if ([...name].length > NICKNAME_MAX) throw new Error(`nickname is at most ${NICKNAME_MAX} characters`);
  m.nickname = name === "" ? null : name;
  return s;
}

// 精灵恢复舱: full HP and PP, statuses cleared, for every owned monster.
export function healAll(save: Save, dex: Dex): Save {
  const s = copy(save);
  for (const m of s.storage) {
    m.hp = computeStats(m, dex).hp;
    m.status = null;
    m.pp = Object.fromEntries(m.skills.map((id) => [String(id), dex.skill(id).pp]));
  }
  return s;
}

// Boss 精元 (`kind: "essence"`, `hatches: species`): consumed to hatch the monster at
// level 1 with a fresh 1-31 个体 and random 性格. It joins the party, or the box if full.
export function hatchEssence(
  save: Save, item: { id: string; kind: "essence"; hatches: number }, dex: Dex, rng: Rng, at = "",
): { save: Save; mon: Monster } {
  requireItem(save, item.id);
  const mon = createMonster(dex, item.hatches, 1, rng, { how: "essence", at });
  const s = addMonster(save, mon);
  spendItem(s, item.id);
  return { save: s, mon };
}
