// Preserve the local Boss policy from d7e87e9, immediately before tactical AI.
// This is recovered project behavior, not recovered official Seer server code.
import type { Battle } from './engine/battle.ts';
import type { Mon } from './engine/state.ts';

/** KO first, unused status moves next, highest raw damage otherwise. */
export function legacySmartPick(battle: Battle, mon: Mon, usable: number[]): number {
  const foe = battle.foeOf(mon);
  const scored = usable.map((id) => {
    const s = battle.skill(id);
    return { id, s, d: battle.estimateDamage(mon, foe, s), pri: battle.priority(mon, s) };
  });
  const kos = scored.filter((x) => x.d >= foe.hp && x.d > 0);
  if (kos.length) {
    kos.sort((a, b) => b.pri - a.pri || b.d - a.d);
    return kos[0].id;
  }
  const setup = scored.find((x) => x.s.category === 'status' && !mon.usedSkills.has(x.id));
  if (setup) return setup.id;
  const attacks = scored.filter((x) => x.d > 0).sort((a, b) => b.d - a.d);
  if (attacks.length) return attacks[0].id;
  return battle.rng.pick(usable);
}
