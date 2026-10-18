// features/challenges's registration: quest claims, challenge battle starts, and the campaign, tower, facility and quest slices.
import type { BattleFacilityView, BraveTowerView, CampaignView, QuestView } from '../../shared/views.ts';
import type { Feature } from '../../kernel/api.ts';
import { campaignViews, towerView } from './progress-views.ts';
import { claimQuest, questViews } from './quests.ts';
import { challengeStarts, type ChallengeStartAction } from './battle-starts.ts';

export type ChallengesAction = {type: 'claimQuest'; questId: string} | ChallengeStartAction;
export interface ChallengesSlice { campaigns: CampaignView[]; braveTower: BraveTowerView; facilities: BattleFacilityView[]; quests: QuestView[] }

export const challengesFeature: Feature<ChallengesAction, ChallengesSlice> = {
  actions: { claimQuest: (rt, action) => claimQuest(rt, action.questId), ...challengeStarts },
  slice: ctx => ({ save }) => ({
    campaigns: campaignViews(ctx, save), braveTower: towerView(ctx, save), facilities: ctx.facilityViews, quests: questViews(ctx, save),
  }),
};
