// Action handlers that play and close battles; features/challenges and features/world start them.
import { ensureAcquisitionCapacity, ensureSpeciesCapacity } from '../../kernel/acquire.ts';
import { playTurn } from './battle-session.ts';
import { TRAINER_CAPTURE_MESSAGE } from './battle-view.ts';
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
    const { battle, encounter } = requireSession(rt);
    if (encounter) throw new Error(encounter.category === 'trainer' ? TRAINER_CAPTURE_MESSAGE : '首领与招募挑战不可捕捉，请使用精元或任务获取。');
    ensureAcquisitionCapacity(rt.save);
    ensureSpeciesCapacity(rt.ctx, rt.save, battle.active(1).species.id);
    playTurn(rt, { kind: 'capture', item: action.itemId });
  },
  flee: rt => playTurn(rt, { kind: 'flee' }),
  closeBattle: rt => {
    if (battleInProgress(rt)) throw new Error('请先结束战斗。');
    rt.session = null;
  },
} satisfies Feature<BattleAction>['actions'];
