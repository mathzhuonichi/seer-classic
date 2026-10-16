// Enemy decision making. Every random choice goes through battle.rng so AI
// turns replay deterministically.

import type { Action, AiSpec } from './types.ts';
import type { Battle, Side } from './battle.ts';
import { STRUGGLE_SKILL } from './battle.ts';
import { tacticalAction, tacticalReplacement } from './tactics.ts';
import { legacySmartPick } from './legacy-ai.ts';
import { rolloutReplacement, searchAction, searchReplacement } from './search-ai.ts';

const v57 = (battle: Battle, side: Side) => (battle.active(side.index).ai ?? side.ai)?.planner === 'v57';
function trainerAction(battle: Battle, side: Side, ai: AiSpec): Action {
  return ai.planner === 'v57' ? tacticalAction(battle, side, ai) : searchAction(battle, side, ai);
}

/** Enhanced team planning belongs only to simulated-player trainer encounters. */
export function chooseAiReplacement(battle: Battle, side: Side): Action | undefined {
  // Inside a planner's world, replacements follow the cheap rollout policy.
  if (battle.planning) return rolloutReplacement(battle, side);
  if (side.kind !== 'trainer') return undefined;
  const ai = battle.active(side.index).ai ?? side.ai;
  if (ai?.kind !== 'smart' || !ai.allow_switch) return undefined;
  return v57(battle, side) ? tacticalReplacement(battle, side) : searchReplacement(battle, side);
}

export function chooseAiAction(battle: Battle, side: Side): Action {
  const mon = battle.active(side.index);
  const usable = mon.skills.filter((id) => mon.pp[id] > 0);
  const ai = mon.ai ?? side.ai ?? { kind: side.kind === 'wild' ? 'random' : 'smart' };
  // Smart trainers may restore exhausted PP before resorting to Struggle.
  if (!usable.length) return side.kind === 'trainer' && ai.kind === 'smart' ? trainerAction(battle, side, ai) : { kind: 'move', skill: STRUGGLE_SKILL.id };
  if (mon.vol.forcedSkill !== undefined && usable.includes(mon.vol.forcedSkill)) {
    const id = mon.vol.forcedSkill;
    delete mon.vol.forcedSkill;
    return { kind: 'move', skill: id };
  }
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
      return side.kind === 'trainer' ? trainerAction(battle, side, ai) : move(legacySmartPick(battle, mon, usable));
  }
}
