// The battle lifecycle: start a session, play turns, and keep the log and animation frames.
import type { Action, BattleEvent, BattleResult, BossEncounter } from '../../battle/core/src/index.ts';
import { groupedBattleLog } from '../presentation/battle-log.ts';
import { eventFrames, type BattlePresentationState } from './battle-presentation.ts';
import { setupBattle, type BattleRequest } from './battle-setup.ts';
import { foeView, hidesFoeHp, presentationState } from './battle-view.ts';
import type { GameContext } from './context.ts';
import { battleInProgress, requireSession, type BattleSession, type Runtime } from './runtime.ts';
import { settle } from './settlement.ts';

/** The battle log keeps this many most recent lines. */
const LOG_LIMIT = 160;

export function startBattle(rt: Runtime, encounter: BossEncounter | null, request: Omit<BattleRequest, 'encounter'> = {}) {
  if (battleInProgress(rt)) throw new Error('请先完成当前战斗。');
  const setup = setupBattle(rt.ctx, rt.save, rt.rng, { ...request, encounter });
  const session: BattleSession = {
    ...setup, campaign: request.campaign ?? null, resultMessage: '', settled: false, logs: [`挑战${setup.name}。`], frames: [],
  };
  rt.session = session;
  rt.animation.revision++;
  logEvents(rt.ctx, session, setup.battle.initialEvents);
  const fought = setup.encounter;
  if (fought && !fought.facility) rt.save.progress.boss_attempts[fought.id] = (rt.save.progress.boss_attempts[fought.id] ?? 0) + 1;
}

/** Submits the player's action, resolves the turn, then settles a finished battle. */
export function playTurn(rt: Runtime, action: Action) {
  const session = requireSession(rt), { battle } = session;
  const before = presentationState(rt.ctx, session);
  battle.submit(0, action);
  const events = battle.resolveTurn();
  logEvents(rt.ctx, session, events, before);
  recordAnimation(rt, session, events, before);
  rt.save.items = { ...battle.sides[0].items };
  settle(rt);
}

type Shown = Pick<BattlePresentationState, 'player' | 'enemy'>;

function logEvents(ctx: GameContext, session: BattleSession, events: BattleEvent[], before: Shown = presentationState(ctx, session)) {
  const context = { data: ctx.data, initialPlayer: before.player, initialEnemy: before.enemy, hideEnemyHp: hidesFoeHp(session) };
  session.logs.push(...groupedBattleLog(events, context));
  session.logs = session.logs.slice(-LOG_LIMIT);
}

function closingText(result: BattleResult | null): string {
  if (!result) return '请选择下一步行动。';
  if (result.reason === 'capture') return '捕捉成功！';
  if (result.success) return '挑战胜利！';
  return result.reason === 'turn_cap' ? '达到回合上限，本场平局。' : '战斗结束。';
}

function recordAnimation(rt: Runtime, session: BattleSession, events: BattleEvent[], before: BattlePresentationState) {
  const { ctx, animation } = rt;
  animation.revision++;
  const frames = eventFrames(events, before, {
    data: ctx.data, hideEnemyHp: hidesFoeHp(session), transformedSlots: session.transformedSlots, nextFrameId: () => ++animation.frameId,
  });
  const now = presentationState(ctx, session), enemy = foeView(session, now.enemy);
  frames.push({
    id: ++animation.frameId, side: 0, kind: 'message', text: closingText(session.battle.result), playerHp: now.player.hp, enemyHp: enemy.hp,
    player: now.player, enemy, party: now.party, enemyParty: now.enemyParty.map(mon => foeView(session, mon)),
  });
  session.frames = frames;
}
