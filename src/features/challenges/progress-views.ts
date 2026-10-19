// Challenge campaigns and the Brave Tower: progress records and their snapshot views.
import { findMon } from '../../../raising/core/index.ts';
import type { GameSave } from '../../kernel/api.ts';
import {
  BRAVE_TOWER_FLOORS, braveTowerCheckpoints, braveTowerFloor, braveTowerPosition, braveTowerRewards, type BraveTowerRewardSource,
} from '../../domain/challenges/brave-tower.ts';
import { CHALLENGE_CAMPAIGNS, type Campaign, type CampaignStage } from '../../domain/challenges/challenge-campaigns.ts';
import type { BraveTowerView, CampaignStageView, CampaignView } from '../../shared/views.ts';
import type { GameContext } from '../../kernel/api.ts';
import { encounterHonors, learnSkillLabel, opponentViews, towerRewardLabel } from '../../domain/challenges/encounter-rows.ts';

/** Cleared stage ids; a campaign without a record starts from its stages already cleared as Bosses. */
export function campaignProgress(save: GameSave, campaign: Campaign): string[] {
  if (!save.game.campaigns[campaign.id]) {
    const cleared: string[] = [];
    for (const stage of campaign.stages) {
      if (!stage.bossIds.every(id => save.progress.bosses_cleared.includes(id))) break;
      cleared.push(stage.id);
    }
    save.game.campaigns[campaign.id] = cleared;
  }
  return save.game.campaigns[campaign.id];
}

/** Why the party cannot enter this stage, or undefined. */
export function stageRequirement(ctx: GameContext, save: GameSave, stage: CampaignStage): string | undefined {
  if (!stage.requiredSpecies) return undefined;
  const candidates = save.party.map(uid => findMon(save, uid)).filter(mon => mon.species === stage.requiredSpecies);
  const name = ctx.speciesName(stage.requiredSpecies), minLevel = stage.minLevel ?? 1;
  if (!candidates.length) return `请将自己的${name}放入精灵背包。`;
  if (!candidates.some(mon => mon.level >= minLevel)) return `本关需要 Lv.${stage.minLevel} 的${name}。`;
  if (!candidates.some(mon => mon.hp > 0 && mon.level >= minLevel)) return `请先恢复${name}的体力。`;
  return undefined;
}

type StageParts = Omit<CampaignStageView, 'cleared' | 'available' | 'blockedReason'>;

/** The parts of a stage view that only the catalogue decides: its opponents and the reward. */
function stageParts(ctx: GameContext, campaign: Campaign, index: number): StageParts {
  const stage = campaign.stages[index], encounters = stage.bossIds.map(id => ctx.bosses.find(boss => boss.id === id));
  const reward = encounters[0]?.reward as { learn_skill?: { species: number; skill: number } } | undefined;
  const rewardText = reward?.learn_skill ? learnSkillLabel(ctx, reward.learn_skill.skill)
    : index === campaign.stages.length - 1 && campaign.reward === 'essence' ? `获得${ctx.speciesName(campaign.species)}精元`
      : '完成本阶段，开启下一项挑战';
  return {
    ...stage, requiredSpeciesName: stage.requiredSpecies ? ctx.speciesName(stage.requiredSpecies) : undefined, rewardText,
    opponents: encounters.flatMap(encounter => encounter ? opponentViews(ctx, encounter) : []),
  };
}

/** The campaign rows, built once per game: each stage's catalogue parts are built once and keep their identity. */
export function campaignViews(ctx: GameContext): (save: GameSave) => CampaignView[] {
  const parts = CHALLENGE_CAMPAIGNS.map(campaign => campaign.stages.map((_, index) => stageParts(ctx, campaign, index)));
  return save => CHALLENGE_CAMPAIGNS.map((campaign, row) => {
    const cleared = campaignProgress(save, campaign), completed = cleared.length;
    return {
      id: campaign.id, name: campaign.name, species: campaign.species, speciesName: ctx.speciesName(campaign.species), location: campaign.location,
      description: campaign.stages[Math.min(completed, campaign.stages.length - 1)].description, reward: campaign.reward, completed,
      nextStageId: campaign.stages[completed]?.id ?? null,
      finished: completed === campaign.stages.length, resetOnLoss: !!campaign.resetOnLoss,
      stages: campaign.stages.map((stage, index): CampaignStageView => {
        const blockedReason = index > completed ? `请先完成「${campaign.stages[index - 1].name}」。` : stageRequirement(ctx, save, stage);
        return { ...parts[row][index], cleared: cleared.includes(stage.id), available: index <= completed && !blockedReason, blockedReason };
      }),
    };
  });
}

export function towerView(ctx: GameContext, save: GameSave): BraveTowerView {
  const cleared = new Set(save.progress.bosses_cleared);
  const milestones = ctx.towerEncounters.flatMap(boss => braveTowerRewards(boss.reward as BraveTowerRewardSource)
    .filter(reward => reward.firstClear).map(reward => {
    const item = ctx.catalog.items.find(entry => entry.id === reward.id), species = typeof item?.hatches === 'number' ? item.hatches : undefined;
    return {
      floor: braveTowerFloor(boss.id)!, ...(species !== undefined ? { species } : {}),
      name: species !== undefined ? ctx.speciesName(species) : (item?.name as { zh?: string })?.zh ?? reward.id,
      description: `首次通关：${towerRewardLabel(ctx, reward.id, reward.count)}`, cleared: cleared.has(boss.id),
    };
  }));
  const honors = [...new Set(ctx.towerEncounters.filter(boss => cleared.has(boss.id)).flatMap(boss => encounterHonors(boss.reward)))];
  const progress = save.game.braveTower;
  return {
    ...progress, totalFloors: BRAVE_TOWER_FLOORS, position: braveTowerPosition(progress), checkpoints: braveTowerCheckpoints(progress), milestones, honors,
  };
}
