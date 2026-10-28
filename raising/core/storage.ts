// 背包 (party, max 6) and 精灵仓库 (box, no limit) over Save. Pure: each call returns a new Save and never changes its input. The new
// Save copies only the parts the call changes and shares the rest with the input, every unchanged monster record included.
import type { Dex, Monster, Rng, Save } from "./types.ts";
import { computeStats } from "./stats.ts";
import { createMonster } from "./monster.ts";

export const PARTY_MAX = 6;
export const NICKNAME_MAX = 12; // characters (code points)

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

// A copy of `save` with `mon` in place of the stored record with its uid; the other records are shared.
export function withMon(save: Save, mon: Monster): Save {
  const s = { ...save, storage: [...save.storage] };
  putMon(s, mon);
  return s;
}

export function requireItem(save: Save, id: string): void {
  if ((save.items[id] ?? 0) < 1) throw new Error(`no ${id} left`);
}

// The save's items less one `id`, as a new record; an emptied stack leaves the bag.
export function spendItem(save: Save, id: string): Save["items"] {
  const items = { ...save.items, [id]: save.items[id] - 1 };
  if (items[id] === 0) delete items[id];
  return items;
}

// A newly obtained monster joins the party if there is room, otherwise the box, which takes any number.
export function addMonster(save: Save, mon: Monster): Save {
  if (save.storage.some((m) => m.uid === mon.uid)) throw new Error(`duplicate uid ${mon.uid}`);
  const toParty = save.party.length < PARTY_MAX;
  const listed = (ids: number[]) => (ids.includes(mon.species) ? ids : [...ids, mon.species]);
  return {
    ...save,
    storage: [...save.storage, structuredClone(mon)],
    party: toParty ? [...save.party, mon.uid] : save.party,
    dex: { ...save.dex, owned: listed(save.dex.owned), seen: listed(save.dex.seen) },
  };
}

export function deposit(save: Save, uid: string): Save {
  if (!save.party.includes(uid)) throw new Error(`${uid} is not in the party`);
  if (save.party.length <= 1) throw new Error("the party needs at least one monster");
  return { ...save, party: save.party.filter((u) => u !== uid) };
}

export function withdraw(save: Save, uid: string): Save {
  if (save.party.includes(uid)) throw new Error(`${uid} is already in the party`);
  findMon(save, uid);
  if (save.party.length >= PARTY_MAX) throw new Error("背包已满");
  return { ...save, party: [...save.party, uid] };
}

// The box monster `boxUid` takes the party slot of `partyUid`, which goes to the box: a full party can still take a box monster.
export function swapWithBox(save: Save, partyUid: string, boxUid: string): Save {
  const slot = save.party.indexOf(partyUid);
  if (slot < 0) throw new Error(`${partyUid} is not in the party`);
  if (save.party.includes(boxUid)) throw new Error(`${boxUid} is already in the party`);
  findMon(save, boxUid);
  const party = [...save.party];
  party[slot] = boxUid;
  return { ...save, party };
}

// Reorders the party; the first monster is the one sent out first.
export function setPartyOrder(save: Save, order: string[]): Save {
  const same = order.length === save.party.length && order.every((u) => save.party.includes(u));
  if (!same || new Set(order).size !== order.length) throw new Error("order must be a permutation of the party");
  return { ...save, party: [...order] };
}

export function rename(save: Save, uid: string, nickname: string | null): Save {
  const m = findMon(save, uid);
  const name = nickname?.trim() ?? "";
  if ([...name].length > NICKNAME_MAX) throw new Error(`nickname is at most ${NICKNAME_MAX} characters`);
  return withMon(save, { ...m, nickname: name === "" ? null : name });
}

// 精灵恢复舱: full HP and PP, statuses cleared, for every owned monster. A monster that needs nothing keeps its record.
export function healAll(save: Save, dex: Dex): Save {
  return { ...save, storage: save.storage.map((m) => healed(m, dex)) };
}

function healed(m: Monster, dex: Dex): Monster {
  const hp = computeStats(m, dex).hp;
  const pp: Monster["pp"] = Object.fromEntries(m.skills.map((id) => [String(id), dex.skill(id).pp]));
  const keys = Object.keys(pp);
  const full = keys.length === Object.keys(m.pp).length && keys.every((k) => m.pp[k] === pp[k]);
  return m.hp === hp && m.status === null && full ? m : { ...m, hp, status: null, pp };
}

// Boss 精元 (`kind: "essence"`, `hatches: species`): consumed to hatch the monster at
// level 1 with a fresh 1-31 个体 and random 性格. It joins the party, or the box if full.
export function hatchEssence(
  save: Save, item: { id: string; kind: "essence"; hatches: number }, dex: Dex, rng: Rng, at = "",
): { save: Save; mon: Monster } {
  requireItem(save, item.id);
  const mon = createMonster(dex, item.hatches, 1, rng, { how: "essence", at });
  return { save: { ...addMonster(save, mon), items: spendItem(save, item.id) }, mon };
}
