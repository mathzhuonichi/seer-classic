// The battle screen's turn playback and command lock, without React: the screen renders the state and lends its clock and sound.
import type { DispatchResult, GameAction } from '../../kernel/contract.ts';
import type { GameSound } from '../../shared/audio/game-audio.ts';
import type { BattlePresentationFrame, BattleView } from '../../shared/views.ts';
import type { MoveTiming } from './battle-animation.ts';
import { battleEndSound, settledDialogue } from './battle-hud.ts';
import { CAPTURE_OUTCOME_MS, captureDialogue, planBattleFrame } from './battle-playback.ts';

export interface SkillEffectCue { move: BattlePresentationFrame; delay: number; duration: number }

/** What the battle screen shows of the playback. */
export interface PlaybackState {
  /** The frame on screen, or null between turns. */
  frame: BattlePresentationFrame | null;
  /** The move whose original clip is playing. */
  sourceAction: BattlePresentationFrame | null;
  skillEffect: SkillEffectCue | null;
  /** A turn is being submitted or plays; commands wait. */
  busy: boolean;
  dialogue: string;
  /** The last capsule in this battle caught its target. */
  captureResolved: boolean;
}

export interface PlaybackEvents {
  /** A new turn starts playing. */
  onStart(): void;
  /** Playback settled on a fainted combatant that must be replaced. */
  onNeedsSwitch(battle: BattleView): void;
  /** The controller accepted the replacement for a fainted combatant. */
  onReplaced(): void;
}

/** The timers playback runs on; the screen passes the browser's. */
export interface PlaybackClock {
  setTimeout(run: () => void, ms: number): number;
  clearTimeout(id: number | undefined): void;
  now(): number;
}

/** What the player takes from the screen. */
export interface PlayerHost extends PlaybackEvents {
  /** The battle as the screen last rendered it. */
  battle(): BattleView;
  dispatch(action: GameAction): DispatchResult;
  sound(cue: GameSound): void;
  /** One frame's timing inputs: reduced motion, the actor's loaded clip and the move's skill effect length. */
  motion(frame: BattlePresentationFrame): { reducedMotion: boolean; timing?: MoveTiming | null; effectMs?: number };
  clock: PlaybackClock;
  /** Holds the controller's idle work (turn preparation) until the returned function runs. */
  holdIdle(): () => void;
}

export interface BattlePlayer {
  state(): PlaybackState;
  subscribe(listener: () => void): () => void;
  /** Plays the battle's current frames; the returned function cancels whatever is still pending. */
  play(battle: BattleView): () => void;
  /** No turn is being submitted or plays, and the battle is still on. */
  canAct(): boolean;
  /** Sends a battle command; a command the controller rejects shows its notice and unlocks. */
  submit(action: GameAction): void;
  /** Lets go of the idle work it holds; the screen calls it when it unmounts. */
  dispose(): void;
}

const OPENING_DIALOGUE = '请选择指令。';
const REJECTED_DIALOGUE = '该指令当前无法使用，请重新选择。';
type Patch = (patch: Partial<PlaybackState>) => void;
type TimerName = 'advance' | 'outcome' | 'action' | 'effect';

export function createBattlePlayer(host: PlayerHost): BattlePlayer {
  let state: PlaybackState = {
    frame: null, sourceAction: null, skillEffect: null, busy: false, captureResolved: false, dialogue: host.battle().log.at(-1) || OPENING_DIALOGUE,
  };
  const listeners = new Set<() => void>();
  const set: Patch = patch => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const canAct = () => !state.busy && !host.battle().finished;
  // The next turn's preparation (idle work) waits from a command until the turn's last frame is on screen, so it does not take
  // the playback's frames and is still ready before the commands unlock.
  let releaseIdle: (() => void) | null = null;
  const holdIdle = () => { releaseIdle ??= host.holdIdle(); };
  const releaseHeldIdle = () => {
    releaseIdle?.();
    releaseIdle = null;
  };
  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    play(battle) {
      const batch = battle.animation.frames;
      if (!batch.length) {
        releaseHeldIdle();
        set({ busy: false, frame: null });
        return () => {};
      }
      holdIdle();
      set({ busy: true });
      host.onStart();
      const settle = () => {
        const settled = host.battle(), sound = battleEndSound(settled);
        set({ frame: null, sourceAction: null, skillEffect: null, busy: false, dialogue: settledDialogue(settled, batch.at(-1)) });
        if (sound) host.sound(sound);
        if (settled.needsSwitch) host.onNeedsSwitch(settled);
      };
      const cancel = playFrames(batch, host, set, { last: releaseHeldIdle, settle });
      return () => {
        cancel();
        set({ sourceAction: null, skillEffect: null });
      };
    },
    canAct,
    submit(action) {
      if (!canAct()) return;
      const replacing = action.type === 'switch' && host.battle().needsSwitch;
      host.sound('click');
      holdIdle();
      set({ busy: true });
      const result = host.dispatch(action);
      if (result.ok) {
        if (replacing) host.onReplaced();
        return;
      }
      releaseHeldIdle();
      set({ busy: false, dialogue: result.notice || REJECTED_DIALOGUE });
    },
    dispose: releaseHeldIdle,
  };
}

/**
 * Shows `batch` frame by frame on the host's clock, calls `last` once the last frame is on screen and `settle` once it has played;
 * the returned function cancels whatever is still pending.
 */
function playFrames(batch: BattlePresentationFrame[], host: PlayerHost, set: Patch, { last, settle }: { last(): void; settle(): void }) {
  const { clock } = host, timers: Partial<Record<TimerName, number>> = {};
  const schedule = (name: TimerName, run: () => void, ms: number) => { clock.clearTimeout(timers[name]); timers[name] = clock.setTimeout(run, ms); };
  let cursor = 0, actionEndsAt = 0, effectEndsAt = 0;
  const show = (next: BattlePresentationFrame) => {
    if (next.kind !== 'capture') {
      if (next.kind === 'heal') host.sound('heal');
      // A frame without a line keeps the one on screen.
      set(next.text ? { frame: next, dialogue: next.text } : { frame: next });
      return;
    }
    set({ frame: next, captureResolved: !!next.captureSuccess, dialogue: captureDialogue(next) });
    schedule('outcome', () => {
      set({ dialogue: next.text });
      if (next.captureSuccess) host.sound('capture');
    }, CAPTURE_OUTCOME_MS);
  };
  const advance = () => {
    if (cursor >= batch.length) { settle(); return; }
    const next = batch[cursor++];
    show(next);
    if (cursor === batch.length) last();
    const plan = planBattleFrame(next, batch[cursor], host.motion(next));
    if (plan.effect === 'clear') { set({ skillEffect: null }); effectEndsAt = 0; }
    else if (plan.effect !== 'keep') {
      const { delayMs, durationMs } = plan.effect;
      set({ skillEffect: { move: next, delay: delayMs, duration: durationMs } });
      effectEndsAt = clock.now() + delayMs + durationMs;
      schedule('effect', () => set({ skillEffect: null }), delayMs + durationMs);
    }
    if (plan.actionMs !== null) {
      set({ sourceAction: next });
      actionEndsAt = clock.now() + plan.actionMs;
      schedule('action', () => set({ sourceAction: null }), plan.actionMs);
    }
    const now = clock.now();
    schedule('advance', advance, plan.awaitRunning ? Math.max(plan.delayMs, actionEndsAt - now, effectEndsAt - now) : plan.delayMs);
  };
  advance();
  return () => { for (const timer of Object.values(timers)) clock.clearTimeout(timer); };
}
