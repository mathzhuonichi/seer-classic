// The battle lifecycle: start a session, play turns, and keep the log and animation frames.
import type { Action, Battle, BattleEvent } from '../../../battle/core/src/index.ts';
import { findMon, type Monster } from '../../../raising/core/index.ts';
import { groupedBattleLog } from './battle-log.ts';
import { eventFrames, type BattlePresentationState } from './battle-presentation.ts';
import { setupBattle, type Foe } from './battle-setup.ts';
import { foeView, hidesFoeHp, presentationState } from './battle-view.ts';
import { battleInProgress, requireSession, type BattleSession, type GameContext, type Runtime, type SessionHooks } from '../../kernel/api.ts';
import { settle } from './settlement.ts';

/** The battle log keeps this many most recent lines. */
const LOG_LIMIT = 160;

interface SessionOptions {
  /** The party members who fight, in order; the whole party by default. */
  roster?: Monster[];
  hooks?: SessionHooks;
}

/** Opens the battle session against `foe`; an encounter counts as an attempt unless the hooks keep no record. */
export function startSession(rt: Runtime, foe: Foe, { roster, hooks = {} }: SessionOptions = {}) {
  if (battleInProgress(rt)) throw new Error('请先完成当前战斗。');
  const { save } = rt, setup = setupBattle(rt.ctx, save, rt.rng, foe, roster ?? save.party.map(uid => findMon(save, uid)));
  const session: BattleSession = { ...setup, hooks, resultMessage: '', settled: false, logs: [`挑战${setup.name}。`], frames: [] };
  rt.session = session;
  rt.animation.revision++;
  logEvents(rt.ctx, session, setup.battle.initialEvents);
  const fought = setup.encounter;
  if (fought && !hooks.unrecorded) save.progress.boss_attempts[fought.id] = (save.progress.boss_attempts[fought.id] ?? 0) + 1;
  prepareTurn(rt, setup.battle);
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
  prepareTurn(rt, battle);
}

/**
 * Turn preparation (architecture-v2 §5): once a turn opens, the policy decides for the automatic sides in an idle slot, so the
 * decision is ready when the player acts. It runs only while the same battle waits at the same turn and phase; a player action
 * that comes first resolves the turn without it, and a prepared turn replays an unprepared one (battle/RULES.md section 11).
 */
function prepareTurn(rt: Runtime, battle: Battle) {
  const { turn, phase } = battle;
  if (!battle.result) rt.ctx.idle(() => {
    if (rt.session?.battle !== battle || battle.turn !== turn || battle.phase !== phase) return;
    battle.prepare(0);
    battle.prepare(1);
  });
}

type Shown = Pick<BattlePresentationState, 'player' | 'enemy'>;

function logEvents(ctx: GameContext, session: BattleSession, events: BattleEvent[], before: Shown = presentationState(ctx, session)) {
  const context = { data: ctx.data, initialPlayer: before.player, initialEnemy: before.enemy, hideEnemyHp: hidesFoeHp(session) };
  session.logs.push(...groupedBattleLog(events, context));
  session.logs = session.logs.slice(-LOG_LIMIT);
}

/** The line of a turn's closing frame while the battle goes on; a finished battle's closing frame adds none to its `battle_end`. */
const NEXT_TURN_TEXT = '请选择下一步行动。';

function recordAnimation(rt: Runtime, session: BattleSession, events: BattleEvent[], before: BattlePresentationState) {
  const { ctx, animation } = rt;
  animation.revision++;
  const frames = eventFrames(events, before, {
    data: ctx.data, hideEnemyHp: hidesFoeHp(session), transformedSlots: session.transformedSlots, nextFrameId: () => ++animation.frameId,
  });
  const now = presentationState(ctx, session), enemy = foeView(session, now.enemy);
  frames.push({
    id: ++animation.frameId, side: 0, kind: 'message', text: session.battle.result ? '' : NEXT_TURN_TEXT, playerHp: now.player.hp, enemyHp: enemy.hp,
    player: now.player, enemy, party: now.party, enemyParty: now.enemyParty.map(mon => foeView(session, mon)),
  });
  session.frames = frames;
}
