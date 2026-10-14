// Builds a Dex from already-parsed data files. No IO here: the game/CLI reads the JSON.
import type { Dex, Nature, Skill, Species } from "./types.ts";

export function makeDex(data: { species: Species[]; skills: Skill[]; natures: Nature[] }): Dex {
  const sp = new Map(data.species.map((s) => [s.id, s]));
  const sk = new Map(data.skills.map((s) => [s.id, s]));
  const na = new Map(data.natures.map((n) => [n.id, n]));
  const get = <K, V>(m: Map<K, V>, k: K, what: string): V => {
    const v = m.get(k);
    if (v === undefined) throw new Error(`unknown ${what} ${String(k)}`);
    return v;
  };
  return {
    species: (id) => get(sp, id, "species"),
    skill: (id) => get(sk, id, "skill"),
    nature: (id) => get(na, id, "nature"),
    natures: () => data.natures,
  };
}
