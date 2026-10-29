// The battle lifecycle: start a session, play turns, and keep the log and animation frames.
import type { Action, Battle, BattleEvent } from '../../../battle/core/src/index.ts';
import { findMon, type Monster } from '../../../raising/core/index.ts';
import { groupedBattleLog, openingEvents } from './battle-log.ts';
import { eventFrames, type BattlePresentationState } from './battle-presentation.ts';
import { setupBattle, type BattleSetup, type Foe } from './battle-setup.ts';
import { foeView, hidesFoeHp, isChallenge, presentationState } from './battle-view.ts';
import { battleInProgress, requireSession, type BattleSession, type GameContext, type Runtime, type SessionHooks } from '../../kernel/api.ts';
import { settle } from './settlement.ts';
import { typeMatchup } from './type-matchup.ts';

/** The battle log keeps this many most recent lines. */
const LOG_LIMIT = 160;

interface SessionOptions {
  /** The party members who fight, in order; the whole party by default. */
  roster?: Monster[];
  hooks?: SessionHooks;
}

/** The word that opens an encounter's first log line, unless its name already says it (a field recruit's 野外挑战：X). */
const CHALLENGE_WORD = '挑战';
const openingLine = (rt: Runtime, { wild, name }: BattleSetup) => wild ? `遭遇野生的${rt.ctx.speciesName(wild.species)}。`
  : name.includes(CHALLENGE_WORD) ? `${name}。` : `${CHALLENGE_WORD}${name}。`;

/** Opens the battle session against `foe`; an encounter counts as an attempt unless the hooks keep no record (its win counts at settlement). */
export function startSession(rt: Runtime, foe: Foe, { roster, hooks = {} }: SessionOptions = {}) {
  if (battleInProgress(rt)) throw new Error('请先完成当前战斗。');
  const { save } = rt, setup = setupBattle(rt.ctx, save, rt.rng, foe, roster ?? save.party.map(uid => findMon(save, uid)));
  const session: BattleSession = { ...setup, hooks, resultMessage: '', resultNotes: [], settled: false, logs: [openingLine(rt, setup)], frames: [] };
  rt.session = session;
  rt.animation.revision++;
  logEvents(rt.ctx, session, openingEvents(setup.battle.initialEvents));
  countAttempt(rt, session, 1);
  prepareTurn(rt, setup.battle);
}

/**
 * Leaves a battle before its first turn, as when the player leaves its loading screen: the battle never began, so it has no
 * result and settles nothing (no loss, no boost spent, no challenge progress), and its start's attempt is taken back. A battle
 * that has begun is left by fleeing.
 */
export function abandonSession(rt: Runtime) {
  const session = requireSession(rt);
  if (session.battle.turn > 0 || session.battle.result) throw new Error('战斗已经开始，请从战斗中撤离。');
  countAttempt(rt, session, -1);
  rt.session = null;
}

/** Counts the session's fight in its encounter's attempts (`change` 1) or takes it back (-1); a session whose hooks keep no record counts none. */
function countAttempt({ save }: Runtime, { encounter, hooks }: BattleSession, change: 1 | -1) {
  if (!encounter || hooks.unrecorded) return;
  const attempts = save.progress.boss_attempts, count = (attempts[encounter.id] ?? 0) + change;
  if (count > 0) attempts[encounter.id] = count;
  else delete attempts[encounter.id];
}

/**
 * Submits the player's action, resolves the turn and settles a finished battle, then presents the turn. The outcome is kept
 * before the log and the frames are built, so an error in presenting the turn is reported and cannot drop its settlement.
 */
export function playTurn(rt: Runtime, action: Action) {
  const session = requireSession(rt), { battle } = session;
  const before = presentationState(rt.ctx, session);
  battle.submit(0, action);
  const events = battle.resolveTurn();
  rt.save.items = { ...battle.sides[0].items };
  settle(rt);
  logEvents(rt.ctx, session, events, before);
  recordAnimation(rt, session, events, before);
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
  const context = {
    data: ctx.data, initialPlayer: before.player, initialEnemy: before.enemy, hideEnemyHp: hidesFoeHp(session), challenge: isChallenge(session),
  };
  session.logs.push(...groupedBattleLog(events, context));
  session.logs = session.logs.slice(-LOG_LIMIT);
}

/** The line of a turn's closing frame while the battle goes on; a finished battle's closing frame adds none to its `battle_end`. */
const NEXT_TURN_TEXT = '请选择下一步行动。';

/** Builds the turn's frames, then publishes them under a new revision; frames that fail to build leave the last turn's unplayed. */
function recordAnimation(rt: Runtime, session: BattleSession, events: BattleEvent[], before: BattlePresentationState) {
  const { ctx, animation } = rt;
  const frames = eventFrames(events, before, {
    data: ctx.data, hideEnemyHp: hidesFoeHp(session), challenge: isChallenge(session), transformedSlots: session.transformedSlots,
    seenFoeSlots: session.seenFoeSlots,
    nextFrameId: () => ++animation.frameId,
  });
  const now = presentationState(ctx, session), enemy = foeView(session, now.enemy);
  frames.push({
    id: ++animation.frameId, side: 0, kind: 'message', text: session.battle.result ? '' : NEXT_TURN_TEXT, playerHp: now.player.hp, enemyHp: enemy.hp,
    player: now.player, enemy, party: now.party, enemyParty: now.enemyParty.map(mon => foeView(session, mon)),
    matchup: typeMatchup(ctx.data.types, now.player, enemy),
  });
  animation.revision++;
  session.frames = frames;
}
