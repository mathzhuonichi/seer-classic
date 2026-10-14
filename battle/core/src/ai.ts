// Enemy decision making. Every random choice goes through battle.rng so AI
// turns replay deterministically.

import type { Action } from './types.ts';
import type { Battle, Mon, Side } from './battle.ts';
import { STRUGGLE_SKILL } from './battle.ts';

export function chooseAiAction(battle: Battle, side: Side): Action {
  const mon = battle.active(side.index);
  const usable = mon.skills.filter((id) => mon.pp[id] > 0);
  if (!usable.length) return { kind: 'move', skill: STRUGGLE_SKILL.id };
  if (mon.vol.forcedSkill !== undefined && usable.includes(mon.vol.forcedSkill)) {
    const id = mon.vol.forcedSkill;
    delete mon.vol.forcedSkill;
    return { kind: 'move', skill: id };
  }
  const ai = mon.ai ?? side.ai ?? { kind: side.kind === 'wild' ? 'random' : 'smart' };
  const move = (skill: number): Action => ({ kind: 'move', skill });

  switch (ai.kind) {
    case 'sequence': {
      const list = (ai.skills ?? mon.skills);
      for (let k = 0; k < list.length; k++) {
        const id = list[(mon.aiCursor + k) % list.length];
        if (usable.includes(id)) {
          mon.aiCursor = (mon.aiCursor + k + 1) % list.length;
          return move(id);
        }
      }
      return move(battle.rng.pick(usable));
    }
    case 'weighted': {
      const w = usable.map((id) => Math.max(0, ai.weights?.[String(id)] ?? 0));
      const total = w.reduce((a, b) => a + b, 0);
      if (total <= 0) return move(battle.rng.pick(usable));
      let r = battle.rng.next() * total;
      for (let k = 0; k < usable.length; k++) {
        r -= w[k];
        if (r < 0) return move(usable[k]);
      }
      return move(usable[usable.length - 1]);
    }
    case 'random':
      return move(battle.rng.pick(usable));
    case 'script': {
      const a = battle.callScript(ai.id!, { side, mon }, ai.params) as Action | undefined;
      return a ?? move(battle.rng.pick(usable));
    }
    case 'smart':
    default:
      return move(smartPick(battle, mon, usable));
  }
}

/**
 * Boss default ("裸伤" logic): take a KO if one exists, otherwise use each
 * status skill once (setup), otherwise the highest raw damage skill.
 */
function smartPick(battle: Battle, mon: Mon, usable: number[]): number {
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
