// Snapshot views of the open battle.
import type { BattleResult, Mon } from '../../../battle/core/src/index.ts';
import { meetsWildCapturePrerequisite } from '../../../battle/core/src/capture.ts';
import type { BattleMonsterView, BattleView } from '../../shared/views.ts';
import { capacityReason, storageFull } from '../../kernel/acquire.ts';
import { concealHp, type BattlePresentationState } from './battle-presentation.ts';
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
/** An encounter (a Boss, trainer, tower floor, campaign stage or facility), not a wild monster: its outcome is worded as a challenge's. */
export const isChallenge = (session: BattleSession) => !!session.encounter;

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

/**
 * The settled outcome as the player reads it: the battle's last dialogue line, and the scene's notice once the battle closes.
 * It names the outcome once, a challenge's in challenge wording, with what it gave or what to do next: where a capture went,
 * or another attempt for a challenge and going on exploring for a wild battle. A challenge's own message (a floor passed, a
 * stage completed, an essence or a skill gained) stands for its win. The settlement's notes follow: what a victory paid, and
 * why an automatic evolution was kept back. The log's last line says only how the battle ended (战斗结束。, the turn cap, the
 * retreat), so it does not name the outcome again; only a wild win's end line names the win (战斗胜利！), since this text then
 * names only the reward.
 */
export function resultText(session: BattleSession): string {
  const result = session.battle.result;
  return result ? outcomeText(session, result) + session.resultNotes.join('') : '';
}

function outcomeText(session: BattleSession, result: BattleResult): string {
  if (session.resultMessage) return session.resultMessage;
  const challenge = isChallenge(session);
  if (result.success) return challenge ? '挑战成功，奖励已入账。' : '';
  if (result.reason === 'flee') return '本次撤离不发放战斗奖励。';
  const next = challenge ? '可恢复后再次挑战。' : '可恢复精灵后继续探索。';
  if (result.reason === 'turn_cap') return `本场平局，${next}`;
  return `${challenge ? '挑战失败' : '战斗失败'}，${next}`;
}

export function battleView(rt: Runtime, session: BattleSession): BattleView {
  const { battle } = session, state = presentationState(rt.ctx, session), blocked = captureBlockedReason(rt, session);
  return {
    name: session.name, turn: battle.turn, player: state.player, enemy: foeView(session, state.enemy), party: state.party,
    enemyParty: state.enemyParty.map(mon => foeView(session, mon)), log: [...session.logs], finished: !!battle.result, won: !!battle.result?.success,
    resultReason: battle.result?.reason, result: resultText(session), challenge: isChallenge(session), canCapture: !blocked, captureBlockedReason: blocked,
    captured: battle.result?.reason === 'capture', needsSwitch: battle.sides[0].needsReplacement,
    animation: { revision: rt.animation.revision, frames: session.frames },
  };
}
