// Battles for the suites, decided as the game decides them: the engine with battle/ai's policy, which
// src/kernel/context.ts injects into every game battle, unless the options name another policy.
import {Battle, type BattleOptions} from '../../battle/core/src/index.ts';
import {AI_POLICY} from '../../battle/ai/src/index.ts';

export const createBattle = (options: BattleOptions): Battle => new Battle({...options, policy: options.policy ?? AI_POLICY});
