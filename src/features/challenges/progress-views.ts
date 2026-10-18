// Challenge campaigns and the Brave Tower: progress records and their snapshot views.
import { findMon } from '../../../raising/core/index.ts';
import type { GameSave } from '../../kernel/save.ts';
import {
  BRAVE_TOWER_FLOORS, braveTowerCheckpoints, braveTowerFloor, braveTowerRewards, type BraveTowerRewardSource,
} from '../../domain/challenges/brave-tower.ts';
import { CHALLENGE_CAMPAIGNS, type Campaign, type CampaignStage } from '../../domain/challenges/challenge-campaigns.ts';
import { buildBossEncounterEvidence, mergeBossEvidence } from './boss-evidence.ts';
import type { BraveTowerView, CampaignStageView, CampaignView } from '../../kernel/contract.ts';
import type { GameContext } from '../../kernel/context.ts';
import { opponentViews, towerRewardLabel } from '../collection/encounter-views.ts';

/** The rei training campaign's last stage teaches a skill instead of granting an essence. */
const NO_ESSENCE_CAMPAIGN_ID = 'rei-training';

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

function stageView(ctx: GameContext, save: GameSave, campaign: Campaign, index: number, cleared: string[]): CampaignStageView {
  const stage = campaign.stages[index], completed = cleared.length;
  const encounters = stage.bossIds.map(id => ctx.bosses.find(boss => boss.id === id));
  const blockedReason = index > completed ? `请先完成「${campaign.stages[index - 1].name}」。` : stageRequirement(ctx, save, stage);
  const reward = encounters[0]?.reward as { learn_skill?: { species: number; skill: number } } | undefined;
  const rewardText = reward?.learn_skill ? `领悟技能：${ctx.data.skills.get(reward.learn_skill.skill)?.name.zh}`
    : index === campaign.stages.length - 1 && campaign.id !== NO_ESSENCE_CAMPAIGN_ID ? `获得${ctx.speciesName(campaign.species)}精元`
      : '完成本阶段，开启下一项挑战';
  return {
    ...stage, requiredSpeciesName: stage.requiredSpecies ? ctx.speciesName(stage.requiredSpecies) : undefined,
    cleared: cleared.includes(stage.id), available: index <= completed && !blockedReason, blockedReason, rewardText,
    evidence: mergeBossEvidence(encounters.map(encounter => encounter ? buildBossEncounterEvidence(encounter) : undefined)),
    opponents: encounters.flatMap(encounter => encounter ? opponentViews(ctx, encounter) : []),
  };
}

export function campaignViews(ctx: GameContext, save: GameSave): CampaignView[] {
  return CHALLENGE_CAMPAIGNS.map(campaign => {
    const cleared = campaignProgress(save, campaign), completed = cleared.length;
    return {
      id: campaign.id, name: campaign.name, species: campaign.species, location: campaign.location, description: campaign.stages[0].description,
      completed, nextStageId: campaign.stages[completed]?.id ?? null, finished: completed === campaign.stages.length, resetOnLoss: !!campaign.resetOnLoss,
      stages: campaign.stages.map((_, index) => stageView(ctx, save, campaign, index, cleared)),
    };
  });
}

type TowerReward = BraveTowerRewardSource & { achievement?: { zh?: string }; title?: { zh?: string } };

export function towerView(ctx: GameContext, save: GameSave): BraveTowerView {
  const cleared = new Set(save.progress.bosses_cleared);
  const milestones = ctx.towerEncounters.flatMap(boss => braveTowerRewards(boss.reward as TowerReward).filter(reward => reward.firstClear).map(reward => {
    const item = ctx.catalog.items.find(entry => entry.id === reward.id), species = typeof item?.hatches === 'number' ? item.hatches : undefined;
    return {
      floor: braveTowerFloor(boss.id)!, ...(species !== undefined ? { species } : {}),
      name: species !== undefined ? ctx.speciesName(species) : (item?.name as { zh?: string })?.zh ?? reward.id,
      description: `首次通关：${towerRewardLabel(ctx, reward.id, reward.count)}`, cleared: cleared.has(boss.id),
    };
  }));
  const honors = [...new Set(ctx.towerEncounters.filter(boss => cleared.has(boss.id)).flatMap(boss => {
    const reward = boss.reward as TowerReward | undefined;
    return [reward?.achievement?.zh, reward?.title?.zh ? `称号：${reward.title.zh}` : undefined].filter((value): value is string => !!value);
  }))];
  const progress = save.game.braveTower;
  return { ...progress, totalFloors: BRAVE_TOWER_FLOORS, checkpoints: braveTowerCheckpoints(progress), milestones, honors };
}
