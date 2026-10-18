// The battle engine as the game uses it: the engine (engine/) with the AI
// policy (ai.ts) injected. The engine itself never imports the AI.

import type { BattleOptions } from './types.ts';
import { Battle } from './engine/battle.ts';
import { AI_POLICY } from './ai.ts';

export { Battle } from './engine/battle.ts';
export type { ActiveCondition, BattlePhase, DamageInfo, Mon, MoveCtx, Side, WhenCtx } from './engine/state.ts';
export { STRUGGLE_SKILL } from './constants.ts';
export { NATIVE_BOSS_RULE_FIELDS, validateEncounter } from './engine/rules.ts';

/** A battle whose automatic sides are decided by the AI unless `opts.policy` says otherwise. */
export function createBattle(opts: BattleOptions): Battle {
  return new Battle({ ...opts, policy: opts.policy ?? AI_POLICY });
}
