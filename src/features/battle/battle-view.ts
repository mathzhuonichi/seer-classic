// Snapshot views of the open battle.
import { MAX_TURNS, type Mon } from '../../../battle/core/src/index.ts';
import { meetsWildCapturePrerequisite } from '../../../battle/core/src/capture.ts';
import type { BattleMonsterView, BattleView } from '../../shared/views.ts';
import { victoryReward } from '../../domain/economy.ts';
import { capacityReason, storageFull } from '../../kernel/acquire.ts';
import { concealHp, type BattlePresentationState } from './battle-presentation.ts';
import { victoryText } from './settlement.ts';
import type { BattleSession, GameContext, Runtime } from '../../kernel/api.ts';
import { portrait, skillView, statusLabel, typeLabel } from '../../shared/view-common.ts';

export function battleMonsterView(ctx: GameContext, session: BattleSession, mon: Mon): BattleMonsterView {
  const original = mon.side === 0 ? session.appearances.get(mon.slot) : undefined;
  const transformed = session.transformedSlots.has(`${mon.side}:${mon.slot}`);
  const appearance = original?.species === mon.species.id && !transformed ? original.appearanceSpecies : mon.species.id;
  return {
    uid: mon.uid ?? `foe-${mon.slot}`, slot: mon.slot, species: mon.species.id, appearanceSpecies: appearance, name: mon.name, level: mon.level,
    hp: mon.hp, maxHp: mon.maxHp, fainted: mon.fainted, types: mon.types.map(typeLabel), portrait: portrait(appearance),
    skills: mon.skills.map(id => skillView(ctx.data, id, mon.pp, mon.skillOverrides?.[id])),
    statuses: mon.conditions.filter(c => c.def.kind === 'status').map(c => statusLabel(c.id) ?? c.def.name?.zh ?? c.id),
    stages: { ...mon.stages }, evidence: mon.side === 1 && session.encounter ? session.hooks.evidence?.(session.encounter, mon.slot) : undefined,
  };
}

/** Trainer foes show only their HP bar ratio. */
export const hidesFoeHp = (session: BattleSession) => session.encounter?.category === 'trainer';
export const foeView = (session: BattleSession, mon: BattleMonsterView) => hidesFoeHp(session) ? concealHp(mon) : mon;

/** The engine's current teams, as the player sees them, before foe HP concealment. */
export function presentationState(ctx: GameContext, session: BattleSession): BattlePresentationState {
  const { battle } = session, view = (mon: Mon) => battleMonsterView(ctx, session, mon);
  return { player: view(battle.active(0)), enemy: view(battle.active(1)), party: battle.sides[0].team.map(view), enemyParty: battle.sides[1].team.map(view) };
}

/** Why the player cannot throw a capsule now, or undefined when they can; the capture action refuses with the same text. */
export function captureBlockedReason(rt: Runtime, session: BattleSession): string | undefined {
  const { battle, encounter } = session;
  if (encounter) return encounter.category === 'trainer' ? '训练师的精灵不可捕捉。' : '首领与招募挑战不可捕捉，胜利后通过精元或任务获取。';
  if (!meetsWildCapturePrerequisite(battle.active(1).species.id, battle.active(0).species.id)) return '捕捉尼奥需要派出尼尔、菲斯利、艾斯菲亚或其闪光形态。';
  if (storageFull(rt.save)) return '仓库已满';
  return capacityReason(rt.ctx, rt.save, battle.active(1).species.id);
}

/** The settled outcome's consequence: where a capture went, what a victory paid, or what to do next. The result panel's title names the outcome. */
function resultText(session: BattleSession): string {
  const result = session.battle.result;
  if (!result) return '';
  if (session.resultMessage) return session.resultMessage;
  if (result.success) return session.encounter ? '挑战成功，奖励已入账。' : victoryText(victoryReward(null));
  if (result.reason === 'flee') return '已离开战斗。';
  if (result.reason === 'turn_cap') return `已达到 ${MAX_TURNS} 回合上限，本场平局。可恢复后再次挑战。`;
  return '挑战失败，可恢复后再试。';
}

export function battleView(rt: Runtime, session: BattleSession): BattleView {
  const { battle } = session, state = presentationState(rt.ctx, session), blocked = captureBlockedReason(rt, session);
  return {
    name: session.name, turn: battle.turn, player: state.player, enemy: foeView(session, state.enemy), party: state.party,
    enemyParty: state.enemyParty.map(mon => foeView(session, mon)), log: [...session.logs], finished: !!battle.result, won: !!battle.result?.success,
    resultReason: battle.result?.reason, result: resultText(session), canCapture: !blocked, captureBlockedReason: blocked,
    captured: battle.result?.reason === 'capture', needsSwitch: battle.sides[0].needsReplacement,
    animation: { revision: rt.animation.revision, frames: session.frames },
  };
}
