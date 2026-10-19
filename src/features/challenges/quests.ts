// Journey quests and SPT recruitment quests: views and claims.
import type { GameSave } from '../../kernel/api.ts';
import { JOURNEY_QUESTS, type JourneyQuest } from '../../domain/acquisition/acquisition-model.ts';
import { recruitmentProgress, type RecruitmentReward } from '../../domain/acquisition/recruitment.ts';
import { encounterCategory } from '../../domain/challenges/encounter-rows.ts';
import type { QuestView } from '../../shared/views.ts';
import { acquire, allowance, capacityReason } from '../../kernel/acquire.ts';
import type { GameContext } from '../../kernel/api.ts';
import { notice, type Runtime } from '../../kernel/api.ts';

/** An encounter the challenge archive lists under SPT首领: an SPT-category Boss of its own, not a campaign stage. */
function sptChallenge(ctx: GameContext, id: string): boolean {
  const boss = ctx.encounterById.get(id);
  return !!boss && encounterCategory(boss) === 'spt' && !ctx.campaignForBoss(id);
}
/** What counts toward a journey quest's goal: won battles (a successful capture is one), or cleared SPT首领. */
const COUNTERS: Record<JourneyQuest['counts'], (ctx: GameContext, save: GameSave) => number> = {
  wins: (_ctx, save) => save.game.battlesWon,
  'spt-clears': (ctx, save) => save.progress.bosses_cleared.filter(id => sptChallenge(ctx, id)).length,
};
const count = (ctx: GameContext, save: GameSave, quest: JourneyQuest) => COUNTERS[quest.counts](ctx, save);
const ready = (ctx: GameContext, save: GameSave, quest: JourneyQuest) => count(ctx, save, quest) >= quest.goal;

/** The owned species and cleared Bosses that recruitment progress reads, built once per pass over the rewards. */
interface Records { owned: ReadonlySet<number>; cleared: ReadonlySet<string> }
const records = (save: GameSave): Records => ({ owned: new Set(save.dex.owned), cleared: new Set(save.progress.bosses_cleared) });

/** A journey reward is a monster, so it needs the six-copy allowance; it joins the party, or else the box. */
function journeyView(ctx: GameContext, save: GameSave, quest: JourneyQuest): QuestView {
  const blockedReason = capacityReason(ctx, save, quest.species);
  const claimed = save.game.quests.includes(quest.id), complete = ready(ctx, save, quest);
  const claimable = complete && !claimed && !blockedReason;
  const rewardName = ctx.speciesName(quest.species);
  return {
    id: quest.id, name: quest.name, description: `${quest.task}，领取${rewardName}。`, rewardSpecies: quest.species, rewardName, complete, claimed,
    claimable, newReward: claimable, blockedReason,
    progress: `${Math.min(quest.goal, count(ctx, save, quest))}/${quest.goal}`, group: 'journey',
  };
}

function recruitmentView(ctx: GameContext, save: GameSave, reward: RecruitmentReward, { owned, cleared }: Records): QuestView {
  const progress = recruitmentProgress(reward, owned, cleared), claimCount = save.game.recruitmentClaims[reward.questId] ?? 0;
  const claimed = !reward.repeatable && claimCount > 0, blockedReason = claimed ? '此奖励已领取。' : capacityReason(ctx, save, reward.rewardSpecies);
  const claimable = progress.complete && !claimed && !blockedReason;
  return {
    id: reward.questId, name: `${reward.name} · 精灵招募`,
    description: `完成以下收集与挑战条件，领取${reward.name}精元。已收集记录永久有效，前置精灵不会被消耗。`,
    rewardSpecies: reward.rewardSpecies, rewardName: ctx.speciesName(reward.rewardSpecies), group: 'spt-recruitment', complete: progress.complete, claimed,
    rewardItemId: reward.itemId, rewardHeld: (save.items[reward.itemId] ?? 0) > 0,
    progress: `${progress.completed}/${progress.total}`, repeatable: reward.repeatable, claimCount,
    claimable, newReward: claimable && !claimCount, blockedReason, allowance: allowance(ctx, save, reward.rewardSpecies),
    prerequisites: reward.prerequisites.map((condition, index) => condition.kind === 'species'
      ? { kind: 'species' as const, species: condition.species, name: ctx.speciesName(condition.species), complete: progress.conditions[index] }
      : {
        kind: 'boss' as const, bossId: condition.bossId, name: ctx.encounterById.get(condition.bossId)?.name?.zh ?? condition.bossId,
        complete: progress.conditions[index],
      }),
  };
}

/**
 * The quest rows, built once per game and rebuilt only when a save field they read changes: the owned species, the cleared Bosses,
 * the claims, the battles won, the held items (essences reserve copies) and the stored species (the six-copy allowance).
 */
export function questViews(ctx: GameContext): (save: GameSave) => QuestView[] {
  let inputs = '', rows: QuestView[] = [];
  return save => {
    const { dex, progress, game } = save, species = save.storage.map(mon => mon.species);
    const next = JSON.stringify([
      dex.owned, progress.bosses_cleared, game.quests, game.recruitmentClaims, game.battlesWon, save.items, species,
    ]);
    if (next === inputs) return rows;
    inputs = next;
    const done = records(save);
    return rows = [...JOURNEY_QUESTS.map(quest => journeyView(ctx, save, quest)), ...ctx.recruitments.map(reward => recruitmentView(ctx, save, reward, done))];
  };
}

export function claimQuest(rt: Runtime, questId: string) {
  const { ctx, save } = rt;
  const reward = ctx.recruitments.find(entry => entry.questId === questId);
  if (reward) {
    const view = recruitmentView(ctx, save, reward, records(save));
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
