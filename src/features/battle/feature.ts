// features/battle's registration: the actions that open, play and close battles, and the battle slice.
import type { BattleView } from '../../shared/views.ts';
import type { Feature } from '../../kernel/api.ts';
import { battleActions } from './battle-actions.ts';
import { battleView } from './battle-view.ts';

export type BattleAction =
  | {type: 'startBattle'; bossId: string}
  | {type: 'startTower'; floor: number}
  | {type: 'enterTower'; floor: number}
  | {type: 'startFacility'; facilityId: string; teamId?: string}
  | {type: 'startCampaignStage'; campaignId: string; stageId: string}
  | {type: 'resetCampaign'; campaignId: string}
  | {type: 'startTraining'; species?: number; level?: number; planetId?: string; regionId?: string}
  | {type: 'move'; skillId: number}
  | {type: 'switch'; uid: string}
  | {type: 'battleItem'; itemId: string; targetUid?: string}
  | {type: 'capture'; itemId: string}
  | {type: 'flee'} | {type: 'closeBattle'};
export interface BattleSlice { battle: BattleView | null }

export const battleFeature: Feature<BattleAction, BattleSlice> = {
  actions: battleActions,
  inBattle: ['move', 'switch', 'battleItem', 'capture', 'flee', 'closeBattle'],
  slice: () => rt => ({ battle: rt.session ? battleView(rt, rt.session) : null }),
};
