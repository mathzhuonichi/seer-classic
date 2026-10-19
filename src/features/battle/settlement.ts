// Settling a finished battle into the save: team resources, experience, capture and victory rewards.
import type { Battle, BattleResult, Mon } from '../../../battle/core/src/index.ts';
import { applyBattleRewards, computeStats, findMon, tickBoosts } from '../../../raising/core/index.ts';
import { isSpeciesRepeatable } from '../../domain/acquisition/recruitment.ts';
import { allowance, autoEvolution, storeMonster } from '../../kernel/acquire.ts';
import { victoryReward } from '../../domain/economy.ts';
import {engravingLoadout, settleEngravingResource} from '../engravings/index.ts';
import { commit, notice, replaceMonster, type BattleSession, type GameContext, type Runtime } from '../../kernel/api.ts';
import { resultText } from './battle-view.ts';

type EncounterReward = { items?: Record<string, number>; first_clear_items?: Record<string, number>; learn_skill?: { species: number; skill: number } };
/** The save's coins and pooled experience: what they grow by over a settlement is what the battle paid. */
type Purse = { coins: number; exp: number };
const purse = (rt: Runtime): Purse => ({ coins: rt.save.game.coins, exp: rt.save.exp_pool });

/** What a victory paid: its coins, if any, and its pooled experience, the victory bonus plus the knockout shares of Lv100 participants. */
const payoutText = ({ coins, exp }: Purse) => coins ? `获得 ${coins} 赛尔豆及 ${exp} 积累经验。` : `获得 ${exp} 积累经验。`;

export function settle(rt: Runtime) {
  const session = rt.session;
  if (!session?.battle.result || session.settled) return;
  session.settled = true;
  const { battle } = session, result = battle.result!, before = purse(rt);
  settleTeam(rt, battle);
  rt.save.items = { ...battle.sides[0].items };
  rt.rng.s = [...battle.rng.s];
  commit(rt, applyBattleRewards(rt.save, result.defeated, rt.ctx.dex, { autoEvolve: false }).save);
  const kept = evolveParticipants(rt, result);
  if (result.reason === 'capture' && battle.capturedMon && session.wild) storeCapture(rt, session, battle.capturedMon);
  settleOutcome(rt, session, result, before, kept);
  commit(rt, tickBoosts(rt.save));
}

/** Each participant follows its automatic evolutions; returns why the six-copy allowance kept any of them back. */
function evolveParticipants(rt: Runtime, result: BattleResult): string[] {
  const kept: string[] = [];
  for (const uid of new Set(result.defeated.flatMap(entry => entry.participants))) {
    const evolution = autoEvolution(rt, findMon(rt.save, uid));
    replaceMonster(rt, evolution.mon);
    if (evolution.blocked) kept.push(evolution.blocked);
  }
  return kept;
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

/** Stores the caught wild monster; where it went heads the result message. */
function storeCapture(rt: Runtime, session: BattleSession, capturedMon: Mon) {
  const wild = session.wild!;
  const captured = {
    ...wild, hp: Math.min(capturedMon.hp, computeStats(wild, rt.ctx.dex).hp), pp: { ...capturedMon.pp }, status: null,
    obtained: { how: 'capture', at: new Date().toISOString() },
  };
  storeMonster(rt, captured);
  session.resultMessage = `${rt.ctx.speciesName(captured.species)}已加入${rt.save.party.includes(captured.uid) ? '背包' : '仓库'}。`;
}

/**
 * A victory's rewards and the challenge's progress. The result then says what a victory paid since `before` and why evolutions
 * were `kept` back, and a notice repeats it. A capture is a wild victory: its result also says where the catch went.
 */
function settleOutcome(rt: Runtime, session: BattleSession, result: BattleResult, before: Purse, kept: readonly string[]) {
  if (result.success) grantVictory(rt, session);
  session.hooks.settled?.(rt, session, result);
  const after = purse(rt);
  if (result.success) session.resultNotes.push(payoutText({ coins: after.coins - before.coins, exp: after.exp - before.exp }));
  session.resultNotes.push(...kept);
  if (!session.resultNotes.length) return;
  const text = resultText(session);
  notice(rt, result.reason === 'capture' ? `捕捉成功：${text}` : text);
}

function grantVictory(rt: Runtime, session: BattleSession) {
  const { encounter, hooks } = session, { game } = rt.save, reward = victoryReward(encounter);
  game.battlesWon++;
  rt.save.exp_pool += reward.exp;
  if (encounter && !hooks.unrecorded) grantEncounterRewards(rt, session);
  else game.coins += reward.coins;
}

/** Victory coins, first clears and their items, reward items within the six-copy allowance, and taught skills. */
function grantEncounterRewards(rt: Runtime, session: BattleSession) {
  const { save, ctx } = rt, boss = session.encounter!, reward = boss.reward as EncounterReward | undefined;
  const firstClear = !save.progress.bosses_cleared.includes(boss.id);
  const paid = session.hooks.rewards?.(boss, firstClear)
    ?? { coins: victoryReward(boss).coins, items: encounterItems(reward, firstClear), blocked: REPEAT_LATER };
  save.game.coins += paid.coins;
  if (firstClear) save.progress.bosses_cleared.push(boss.id);
  const essences: string[] = [];
  let essenceBlocked = false;
  for (const [id, count] of paid.items) {
    const item = ctx.itemDefinitions.get(id);
    if (item?.kind !== 'essence' || item.hatches === undefined) { save.items[id] = (save.items[id] ?? 0) + Number(count); continue; }
    if (!firstClear && !isSpeciesRepeatable(item.hatches)) continue;
    const granted = Math.min(Number(count), allowance(ctx, save, item.hatches).remaining);
    if (granted > 0) { save.items[id] = (save.items[id] ?? 0) + granted; essences.push(id); } else essenceBlocked = true;
  }
  if (reward?.learn_skill) session.resultMessage = teachSkill(rt, session, reward.learn_skill);
  else if (essences.length) session.resultMessage = `${essences.map(id => itemName(ctx, id)).join('、')}已入库，到道具背包的精元页即可孵化。`;
  else if (essenceBlocked) session.resultMessage = paid.blocked;
}

/** A catalogue item's name, as the bag shows it: an essence is named after the creature it hatches. */
const itemName = (ctx: GameContext, id: string) => (ctx.catalog.items.find(item => String(item.id) === id)!.name as { zh: string }).zh;

/** An encounter's reward items, and on its first clear its first-clear items too (里奥斯's 蓝武士装). */
const encounterItems = (reward: EncounterReward | undefined, firstClear: boolean) =>
  [...Object.entries(reward?.items ?? {}), ...firstClear ? Object.entries(reward?.first_clear_items ?? {}) : []];

const REPEAT_LATER = '挑战已完成；同种精灵与待孵化精元已达六份。腾出额度后可再次挑战或到商城领取。';

function teachSkill(rt: Runtime, session: BattleSession, learned: { species: number; skill: number }): string {
  const participant = session.battle.sides[0].team.find(mon => mon.species.id === learned.species)!;
  const mon = findMon(rt.save, participant.uid!);
  if (!mon.learned.includes(learned.skill)) replaceMonster(rt, { ...mon, learned: [...mon.learned, learned.skill] });
  return `${rt.ctx.speciesName(learned.species)}领悟了「${rt.ctx.data.skills.get(learned.skill)!.name.zh}」，可在技能管理中装备。`;
}
