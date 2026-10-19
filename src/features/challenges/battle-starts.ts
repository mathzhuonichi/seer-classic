// Starting challenge battles: Boss and trainer encounters, Brave Tower floors, campaign stages and battle facilities,
// each with the session hooks that settle its progress (features/battle runs them).
import { Rng, type BossEncounter } from '../../../battle/core/src/index.ts';
import { findMon } from '../../../raising/core/index.ts';
import { createFacilityEncounter } from '../../domain/challenges/battle-facilities.ts';
import {
  BRAVE_TOWER_FLOORS, braveTowerBossId, braveTowerFloor, braveTowerRewards,
  canStartBraveTowerFloor, clearBraveTowerFloor, type BraveTowerRewardSource,
} from '../../domain/challenges/brave-tower.ts';
import { CHALLENGE_CAMPAIGNS, type Campaign, type CampaignStage } from '../../domain/challenges/challenge-campaigns.ts';
import { SEER_BEANS_ITEM_ID } from '../../domain/economy.ts';
import { notice, type Feature, type GameContext, type GameSave, type Runtime, type SessionHooks } from '../../kernel/api.ts';
import { NO_STAMINA_MESSAGE, startSession } from '../battle/index.ts';
import { buildBossEvidence } from '../../domain/challenges/boss-evidence.ts';
import { campaignProgress, stageRequirement } from './progress-views.ts';

export type ChallengeStartAction =
  | {type: 'startBattle'; bossId: string}
  | {type: 'startTower'; floor: number}
  | {type: 'enterTower'; floor: number}
  | {type: 'startFacility'; facilityId: string; teamId?: string}
  | {type: 'startCampaignStage'; campaignId: string; stageId: string}
  | {type: 'resetCampaign'; campaignId: string};

/** Generated facility teams keep no attempt count or clear record. */
const FACILITY_HOOKS: SessionHooks = { unrecorded: true, evidence: buildBossEvidence };

/**
 * A Boss, trainer or recruit encounter; a Brave Tower floor climbs the tower, a campaign Boss starts from its stage,
 * and a Tower side challenge starts like any Boss: every Boss is open from the start (user decision, 2026-10-19).
 */
export function startEncounter(rt: Runtime, encounter: BossEncounter) {
  const campaign = rt.ctx.campaignForBoss(encounter.id), floor = braveTowerFloor(encounter.id);
  if (campaign) throw new Error(`请从「${campaign.name}」的阶段场景开始挑战。`);
  if (floor !== undefined) startTowerFloor(rt, floor);
  else startSession(rt, { encounter }, { hooks: { evidence: buildBossEvidence } });
}

function towerEncounter(ctx: GameContext, save: GameSave, floor: number): BossEncounter {
  if (!canStartBraveTowerFloor(save.game.braveTower, floor)) throw new Error('此楼层尚未开放，请选择已解锁的十层起点或继续上次挑战。');
  const boss = ctx.encounters.find(entry => entry.id === braveTowerBossId(floor));
  if (!boss) throw new Error('此楼层的挑战资料暂不可用。');
  return boss;
}

function startTowerFloor(rt: Runtime, floor: number) {
  startSession(rt, { encounter: towerEncounter(rt.ctx, rt.save, floor) }, { hooks: towerHooks(floor) });
  // Save the attempted floor only after the battle has successfully started.
  rt.save.game.braveTower = { ...rt.save.game.braveTower, resumeFloor: floor };
}

/** A floor pays its explicit rewards, seer beans as coins and milestones only on a first clear; a victory advances the climb. */
const towerHooks = (floor: number): SessionHooks => ({
  evidence: buildBossEvidence,
  rewards: (boss, firstClear) => {
    const items = braveTowerRewards(boss.reward as BraveTowerRewardSource | undefined).filter(item => firstClear || !item.firstClear);
    return {
      coins: items.reduce((coins, item) => coins + (item.id === SEER_BEANS_ITEM_ID ? item.count : 0), 0),
      items: items.filter(item => item.id !== SEER_BEANS_ITEM_ID).map(({ id, count }) => [id, count] as const),
      blocked: '挑战已完成；同种精灵与待孵化精元已达六份，本次未增加精元。',
    };
  },
  settled: (rt, session, result) => {
    if (!result.success) return;
    rt.save.game.braveTower = clearBraveTowerFloor(rt.save.game.braveTower, floor);
    const text = floor === BRAVE_TOWER_FLOORS ? `勇者之塔 ${BRAVE_TOWER_FLOORS} 层全部通过，可选择已解锁的起点再次挑战。`
      : `第 ${floor} 层通过，可继续第 ${floor + 1} 层。`;
    session.resultMessage = [text, session.resultMessage].filter(Boolean).join(' ');
  },
});

/** A stage that requires a species fields only the first qualified member of the party. */
const stageRoster = (save: GameSave, stage: CampaignStage) => !stage.requiredSpecies ? undefined : save.party.map(uid => findMon(save, uid))
  .filter(mon => mon.species === stage.requiredSpecies && mon.level >= (stage.minLevel ?? 1) && mon.hp > 0).slice(0, 1);

/** What a stage victory did to the campaign: finished it, opened the next stage, or passed a stage already cleared. */
const stageClearText = (campaign: Campaign, cleared: readonly string[], advanced: boolean) =>
  cleared.length === campaign.stages.length ? `${campaign.name}已全部完成。` : advanced ? '本阶段完成，下一阶段已开启。' : '本阶段再次通过。';

/** A victory clears the stage; a defeat restarts a campaign that resets on loss. */
const campaignHooks = (campaign: Campaign, stageId: string): SessionHooks => ({
  evidence: buildBossEvidence,
  settled: (rt, session, result) => {
    if (result.success) {
      const cleared = campaignProgress(rt.save, campaign), advanced = campaign.stages.findIndex(stage => stage.id === stageId) === cleared.length;
      if (advanced) cleared.push(stageId);
      session.resultMessage ||= stageClearText(campaign, cleared, advanced);
      return;
    }
    if (campaign.resetOnLoss) rt.save.game.campaigns[campaign.id] = [];
    if (result.winner === 0) session.resultMessage = '对手已倒下，但本关的特训条件尚未满足，请按场景中的要求重试。';
  },
});

export const challengeStarts = {
  startBattle: (rt, action) => {
    const boss = rt.ctx.encounters.find(entry => entry.id === action.bossId);
    if (!boss) throw new Error('挑战不存在。');
    startEncounter(rt, boss);
  },
  startTower: (rt, action) => startTowerFloor(rt, action.floor),
  enterTower: (rt, action) => {
    towerEncounter(rt.ctx, rt.save, action.floor);
    rt.save.game.braveTower = { ...rt.save.game.braveTower, resumeFloor: action.floor };
  },
  startFacility: (rt, action) => {
    if (!rt.save.party.some(uid => findMon(rt.save, uid).hp > 0)) throw new Error(NO_STAMINA_MESSAGE);
    // Prepare with a draft RNG so invalid input never advances the saved stream.
    const previous = rt.rng, draft = new Rng(rt.rng.s);
    const encounter = createFacilityEncounter(rt.ctx.catalog, action.facilityId, draft, action.teamId);
    try {
      rt.rng = draft;
      startSession(rt, { encounter }, { hooks: FACILITY_HOOKS });
    } catch (error) {
      rt.rng = previous;
      throw error;
    }
  },
  startCampaignStage: (rt, action) => {
    const campaign = CHALLENGE_CAMPAIGNS.find(entry => entry.id === action.campaignId);
    const index = campaign?.stages.findIndex(entry => entry.id === action.stageId) ?? -1;
    if (!campaign || index < 0) throw new Error('挑战阶段不存在。');
    if (index > campaignProgress(rt.save, campaign).length) throw new Error('请先完成前一阶段挑战。');
    const stage = campaign.stages[index], reason = stageRequirement(rt.ctx, rt.save, stage);
    if (reason) throw new Error(reason);
    const boss = rt.ctx.bosses.find(entry => entry.id === stage.bossIds[0]);
    if (!boss) throw new Error('挑战不存在。');
    startSession(rt, { encounter: boss }, { roster: stageRoster(rt.save, stage), hooks: campaignHooks(campaign, stage.id) });
  },
  resetCampaign: (rt, action) => {
    rt.save.game.campaigns[action.campaignId] = [];
    notice(rt, '本次阶段进度已重置，可以从第一阶段重新挑战。');
  },
} satisfies Feature<ChallengeStartAction>['actions'];
