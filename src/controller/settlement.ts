// Settling a finished battle into the save: team resources, experience, capture and victory rewards.
import type { Battle, Mon } from '../../battle/core/src/index.ts';
import { applyBattleRewards, computeStats, findMon, tickBoosts } from '../../raising/core/index.ts';
import { BRAVE_TOWER_FLOORS, braveTowerFloor, braveTowerRewards, clearBraveTowerFloor, type BraveTowerRewardSource } from '../progression/brave-tower.ts';
import { CHALLENGE_CAMPAIGNS } from '../progression/challenge-campaigns.ts';
import { isSpeciesRepeatable } from '../progression/recruitment.ts';
import { allowance, boundedAutoEvolve, storeMonster } from './acquisition.ts';
import { SEER_BEANS_ITEM_ID, victoryReward } from './economy.ts';
import { engravingLoadout, settleEngravingResource } from './engravings.ts';
import { campaignProgress } from './progress-views.ts';
import { commit, notice, replaceMonster, type BattleSession, type Runtime } from './runtime.ts';

type EncounterReward = BraveTowerRewardSource & { learn_skill?: { species: number; skill: number } };

export function settle(rt: Runtime) {
  const session = rt.session;
  if (!session?.battle.result || session.settled) return;
  session.settled = true;
  const { battle } = session, result = battle.result!;
  settleTeam(rt, battle);
  rt.save.items = { ...battle.sides[0].items };
  rt.rng.s = [...battle.rng.s];
  commit(rt, applyBattleRewards(rt.save, result.defeated, rt.ctx.dex, { autoEvolve: false }).save);
  for (const uid of new Set(result.defeated.flatMap(entry => entry.participants))) replaceMonster(rt, boundedAutoEvolve(rt, findMon(rt.save, uid)));
  if (result.reason === 'capture' && battle.capturedMon && session.wild) storeCapture(rt, session, battle.capturedMon);
  else if (result.success) grantVictory(rt, session);
  else if (session.campaign) {
    const campaign = CHALLENGE_CAMPAIGNS.find(entry => entry.id === session.campaign!.id)!;
    if (campaign.resetOnLoss) rt.save.game.campaigns[campaign.id] = [];
    if (result.winner === 0) session.resultMessage = '对手已倒下，但本关的特训条件尚未满足，请按场景中的要求重试。';
  }
  commit(rt, tickBoosts(rt.save));
}

/** Saved HP/PP return to the unengraved scale; spent engraving bonus is kept as a deficit. */
function settleTeam(rt: Runtime, battle: Battle) {
  const { save, ctx } = rt, { data, dex } = ctx;
  for (const entry of battle.exportTeam(0)) {
    const mon = findMon(save, entry.uid!), engraving = engravingLoadout(save, data, mon), pp: Record<string, number> = { ...entry.pp };
    const deficit = { hp: 0, pp: { ...engraving.deficit.pp } };
    for (const [id, extra] of Object.entries(engraving.ppBonus)) {
      if (pp[id] === undefined) continue;
      const restored = settleEngravingResource(pp[id], data.skills.get(Number(id))!.pp, extra, deficit.pp[id] ?? 0, 0);
      pp[id] = restored.base;
      if (restored.deficit) deficit.pp[id] = restored.deficit; else delete deficit.pp[id];
    }
    const hp = entry.hp > 0
      ? settleEngravingResource(entry.hp, computeStats(mon, dex).hp, engraving.hpBonus, engraving.deficit.hp, 1) : { base: 0, deficit: 0 };
    deficit.hp = hp.deficit;
    const modules = save.game.modules;
    if (deficit.hp || Object.keys(deficit.pp).length) modules[mon.uid] = { ...(modules[mon.uid] ?? { engravings: [] }), engravingDeficit: deficit };
    else if (modules[mon.uid]) delete modules[mon.uid].engravingDeficit;
    replaceMonster(rt, { ...mon, hp: hp.base, pp, status: null });
  }
}

function storeCapture(rt: Runtime, session: BattleSession, capturedMon: Mon) {
  const wild = session.wild!;
  const captured = {
    ...wild, hp: Math.min(capturedMon.hp, computeStats(wild, rt.ctx.dex).hp), pp: { ...capturedMon.pp }, status: null,
    obtained: { how: 'capture', at: new Date().toISOString() },
  };
  storeMonster(rt, captured);
  notice(rt, `捕捉成功：${rt.ctx.speciesName(captured.species)}已加入${rt.save.party.includes(captured.uid) ? '背包' : '仓库'}！`);
}

function grantVictory(rt: Runtime, session: BattleSession) {
  const { encounter } = session, towerFloor = encounter ? braveTowerFloor(encounter.id) : undefined, reward = victoryReward(encounter);
  rt.save.game.battlesWon++;
  rt.save.game.coins += towerFloor !== undefined ? 0 : reward.coins;
  rt.save.exp_pool += reward.exp;
  if (encounter && !encounter.facility) grantEncounterRewards(rt, session, towerFloor);
  if (session.campaign) {
    const { id, stageId } = session.campaign, campaign = CHALLENGE_CAMPAIGNS.find(entry => entry.id === id)!;
    const cleared = campaignProgress(rt.save, campaign), index = campaign.stages.findIndex(stage => stage.id === stageId);
    if (index === cleared.length) cleared.push(stageId);
    session.resultMessage ||= cleared.length === campaign.stages.length ? `${campaign.name}已全部完成。` : `本阶段完成，下一阶段已开启。`;
  }
  notice(rt, session.resultMessage || `获得 ${reward.coins} 赛尔豆及 ${reward.exp} 积累经验。`);
}

/** First clears, reward items within the six-copy allowance, taught skills and Brave Tower progress. */
function grantEncounterRewards(rt: Runtime, session: BattleSession, towerFloor: number | undefined) {
  const { save, ctx } = rt, boss = session.encounter!, reward = boss.reward as EncounterReward | undefined;
  const firstClear = !save.progress.bosses_cleared.includes(boss.id);
  if (firstClear) save.progress.bosses_cleared.push(boss.id);
  const rewardItems = towerFloor !== undefined
    ? braveTowerRewards(reward).filter(item => firstClear || !item.firstClear).map(({ id, count }) => [id, count] as const)
    : Object.entries(reward?.items ?? {});
  let essenceGranted = false, essenceBlocked = false;
  for (const [id, count] of rewardItems) {
    if (towerFloor !== undefined && id === SEER_BEANS_ITEM_ID) { save.game.coins += Number(count); continue; }
    const item = ctx.itemDefinitions.get(id);
    if (item?.kind !== 'essence' || item.hatches === undefined) { save.items[id] = (save.items[id] ?? 0) + Number(count); continue; }
    if (!firstClear && !isSpeciesRepeatable(item.hatches)) continue;
    const granted = Math.min(Number(count), allowance(ctx, save, item.hatches).remaining);
    if (granted > 0) { save.items[id] = (save.items[id] ?? 0) + granted; essenceGranted = true; } else essenceBlocked = true;
  }
  if (reward?.learn_skill) session.resultMessage = teachSkill(rt, session, reward.learn_skill);
  else if (essenceGranted) session.resultMessage = '首领精元已入库，到道具背包的精元页即可孵化。';
  else if (essenceBlocked) {
    session.resultMessage = towerFloor !== undefined ? '挑战已完成；同种精灵与待孵化精元已达六份，本次未增加精元。'
      : '挑战已完成；同种精灵与待孵化精元已达六份。腾出额度后可再次挑战或到商城领取。';
  }
  if (towerFloor === undefined) return;
  save.game.braveTower = clearBraveTowerFloor(save.game.braveTower, towerFloor);
  const floorText = towerFloor === BRAVE_TOWER_FLOORS ? `勇者之塔 ${BRAVE_TOWER_FLOORS} 层全部通过，可选择已解锁的起点再次挑战。`
    : `第 ${towerFloor} 层通过，可继续第 ${towerFloor + 1} 层。`;
  session.resultMessage = [floorText, session.resultMessage].filter(Boolean).join(' ');
}

function teachSkill(rt: Runtime, session: BattleSession, learned: { species: number; skill: number }): string {
  const participant = session.battle.sides[0].team.find(mon => mon.species.id === learned.species)!;
  const mon = findMon(rt.save, participant.uid!);
  if (!mon.learned.includes(learned.skill)) replaceMonster(rt, { ...mon, learned: [...mon.learned, learned.skill] });
  return `${rt.ctx.speciesName(learned.species)}领悟了「${rt.ctx.data.skills.get(learned.skill)!.name.zh}」，可在技能管理中装备。`;
}
