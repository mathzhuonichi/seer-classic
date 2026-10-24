// Action handlers that play and close battles; features/challenges and features/world start them.
import { abandonSession, playTurn } from './battle-session.ts';
import { captureBlockedReason } from './battle-view.ts';
import { battleInProgress, requireSession, type Feature } from '../../kernel/api.ts';
import type { BattleAction } from './feature.ts';

export const battleActions = {
  move: (rt, action) => playTurn(rt, { kind: 'move', skill: action.skillId }),
  switch: (rt, action) => {
    const { battle } = requireSession(rt);
    playTurn(rt, { kind: 'switch', slot: battle.sides[0].team.findIndex(mon => mon.uid === action.uid) });
  },
  battleItem: (rt, action) => {
    const { battle } = requireSession(rt), side = battle.sides[0];
    const target = action.targetUid ? side.team.findIndex(mon => mon.uid === action.targetUid) : side.active;
    playTurn(rt, { kind: 'item', item: action.itemId, target });
  },
  capture: (rt, action) => {
    const blocked = captureBlockedReason(rt, requireSession(rt));
    if (blocked) throw new Error(blocked);
    playTurn(rt, { kind: 'capture', item: action.itemId });
  },
  flee: rt => playTurn(rt, { kind: 'flee' }),
  abandonBattle: abandonSession,
  closeBattle: rt => {
    if (battleInProgress(rt)) throw new Error('请先结束战斗。');
    rt.session = null;
  },
} satisfies Feature<BattleAction>['actions'];
