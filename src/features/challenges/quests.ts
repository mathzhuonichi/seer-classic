// Journey quests and SPT recruitment quests: views and claims.
import type { GameSave } from '../../kernel/save.ts';
import { recruitmentProgress, type RecruitmentReward } from '../../domain/acquisition/recruitment.ts';
import type { QuestView } from '../../kernel/contract.ts';
import { acquire, allowance, capacityReason } from '../../kernel/acquire.ts';
import type { GameContext } from '../../kernel/context.ts';
import { notice, type Runtime } from '../../kernel/api.ts';

interface JourneyQuest {
  id: string; name: string; description: string; species: number;
  goal: number;
  count(ctx: GameContext, save: GameSave): number;
}

const wins = (_ctx: GameContext, save: GameSave) => save.game.battlesWon;
const JOURNEY_QUESTS: readonly JourneyQuest[] = [
  { id: 'first-victory', name: '初次胜利', description: '赢得一次野外遭遇或首领挑战，领取皮皮。', species: 10, goal: 1, count: wins },
  { id: 'three-victories', name: '成长之路', description: '赢得三场战斗，领取比比鼠。', species: 13, goal: 3, count: wins },
  {
    id: 'first-spt', name: 'SPT 挑战者', description: '完成任意一个 SPT 挑战，领取巴鲁斯。', species: 6, goal: 1,
    count: (ctx, save) => Number(save.progress.bosses_cleared.some(id => ctx.ordinarySPTs.has(id))),
  },
];

const ready = (ctx: GameContext, save: GameSave, quest: JourneyQuest) => quest.count(ctx, save) >= quest.goal;

function journeyView(ctx: GameContext, save: GameSave, quest: JourneyQuest): QuestView {
  const claimed = save.game.quests.includes(quest.id), blockedReason = capacityReason(ctx, save, quest.species), complete = ready(ctx, save, quest);
  return {
    id: quest.id, name: quest.name, description: quest.description, rewardSpecies: quest.species, complete, claimed,
    claimable: complete && !claimed && !blockedReason, blockedReason,
    progress: `${Math.min(quest.goal, quest.count(ctx, save))}/${quest.goal}`, group: 'journey',
  };
}

function recruitmentView(ctx: GameContext, save: GameSave, reward: RecruitmentReward): QuestView {
  const progress = recruitmentProgress(reward, save.dex.owned, save.progress.bosses_cleared), claimCount = save.game.recruitmentClaims[reward.questId] ?? 0;
  const claimed = !reward.repeatable && claimCount > 0, blockedReason = claimed ? '此奖励已领取。' : capacityReason(ctx, save, reward.rewardSpecies);
  return {
    id: reward.questId, name: `${reward.name} · 精灵招募`,
    description: `完成以下收集与挑战条件，领取${reward.name}精元。已收集记录永久有效，前置精灵不会被消耗。`,
    rewardSpecies: reward.rewardSpecies, rewardItemId: reward.itemId, group: 'spt-recruitment', complete: progress.complete, claimed,
    progress: `${progress.completed}/${progress.total}`, repeatable: reward.repeatable, claimCount,
    claimable: progress.complete && !claimed && !blockedReason, blockedReason, allowance: allowance(ctx, save, reward.rewardSpecies),
    requiredBossIds: reward.prerequisites.filter(p => p.kind === 'boss').map(p => p.bossId),
    prerequisites: reward.prerequisites.map((condition, index) => condition.kind === 'species'
      ? { kind: 'species' as const, species: condition.species, name: ctx.speciesName(condition.species), complete: progress.conditions[index] }
      : {
        kind: 'boss' as const, bossId: condition.bossId, name: ctx.bosses.find(boss => boss.id === condition.bossId)?.name?.zh ?? condition.bossId,
        complete: progress.conditions[index],
      }),
  };
}

export function questViews(ctx: GameContext, save: GameSave): QuestView[] {
  return [...JOURNEY_QUESTS.map(quest => journeyView(ctx, save, quest)), ...ctx.recruitments.map(reward => recruitmentView(ctx, save, reward))];
}

export function claimQuest(rt: Runtime, questId: string) {
  const { ctx, save } = rt;
  const reward = ctx.recruitments.find(entry => entry.questId === questId);
  if (reward) {
    const view = recruitmentView(ctx, save, reward);
    if (!view.claimable) throw new Error(view.blockedReason ?? '任务奖励尚不可领取。');
    save.items[reward.itemId] = (save.items[reward.itemId] ?? 0) + 1;
    save.game.recruitmentClaims[reward.questId] = (save.game.recruitmentClaims[reward.questId] ?? 0) + 1;
    if (!save.game.quests.includes(reward.questId)) save.game.quests.push(reward.questId);
    notice(rt, `已领取${reward.name}精元，可到道具背包孵化。`);
    return;
  }
  const quest = JOURNEY_QUESTS.find(entry => entry.id === questId);
  if (!quest || !ready(ctx, save, quest) || save.game.quests.includes(quest.id)) throw new Error('任务奖励尚不可领取。');
  acquire(rt, quest.species);
  rt.save.game.quests.push(quest.id);
}
