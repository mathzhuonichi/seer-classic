// features/challenges's registration: quest claims and the campaign, tower, facility and quest slices.
import type { BattleFacilityView, BraveTowerView, CampaignView, QuestView } from '../../shared/views.ts';
import type { Feature } from '../../kernel/api.ts';
import { campaignViews, towerView } from './progress-views.ts';
import { claimQuest, questViews } from './quests.ts';

export type ChallengesAction = {type: 'claimQuest'; questId: string};
export interface ChallengesSlice { campaigns: CampaignView[]; braveTower: BraveTowerView; facilities: BattleFacilityView[]; quests: QuestView[] }

export const challengesFeature: Feature<ChallengesAction, ChallengesSlice> = {
  actions: { claimQuest: (rt, action) => claimQuest(rt, action.questId) },
  slice: ctx => {
    const quests = questViews(ctx);
    return ({ save }) => ({ campaigns: campaignViews(ctx, save), braveTower: towerView(ctx, save), facilities: ctx.facilityViews, quests: quests(save) });
  },
};
