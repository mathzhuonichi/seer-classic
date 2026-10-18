// Routes each player action to its domain handler and reports failures as notices.
import type { DispatchResult, GameAction } from './contract.ts';
import {battleActions} from '../features/battle/index.ts';
import {engravingActions} from '../features/engravings/index.ts';
import {itemActions} from '../features/items/index.ts';
import {raisingActions} from '../features/raising/index.ts';
import { battleInProgress, notice, type ActionHandlers, type Runtime } from './api.ts';

const handlers: ActionHandlers = {
  ...battleActions, ...raisingActions, ...engravingActions, ...itemActions,
  dismissNotice: rt => { rt.notices = []; },
};

/** Actions that stay available while a battle is unresolved. */
const IN_BATTLE = new Set<GameAction['type']>(['move', 'switch', 'battleItem', 'capture', 'flee', 'closeBattle', 'dismissNotice']);

/** Engine rejections are shown in the player's terms. */
function failureText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (text.startsWith('illegal action')) return '当前指令不可用，请选择可用的技能、道具或精灵。';
  return text === 'battle has ended' ? '本场战斗已结束，请返回场景。' : text;
}

export function runAction(rt: Runtime, action: GameAction): DispatchResult {
  const before = rt.notices;
  try {
    if (!IN_BATTLE.has(action.type) && battleInProgress(rt)) throw new Error('战斗结束后才能进行培养或编辑。');
    // An action type without a handler does nothing.
    (handlers[action.type] as ((rt: Runtime, action: GameAction) => void) | undefined)?.(rt, action);
  } catch (error) {
    notice(rt, failureText(error));
    return { ok: false, notice: rt.notices[0] };
  }
  return rt.notices === before ? { ok: true } : { ok: true, notice: rt.notices[0] };
}
