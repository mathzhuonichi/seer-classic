// The battle screen's turn playback and command lock, without React: the screen renders the state and lends its clock and sound.
import type { DispatchResult, GameAction } from '../../kernel/contract.ts';
import type { GameSound } from '../../shared/audio/game-audio.ts';
import type { BattlePresentationFrame, BattleView } from '../../shared/views.ts';
import type { MoveTiming } from './battle-animation.ts';
import { battleEndSound, settledDialogue } from './battle-hud.ts';
import { CAPTURE_OUTCOME_MS, DAMAGE_NUMBER_MS, DAMAGE_NUMBER_ROWS, captureDialogue, planBattleFrame } from './battle-playback.ts';

export interface SkillEffectCue { move: BattlePresentationFrame; delay: number; duration: number }

/** A damage or healing number on screen, from a hit or heal frame; it outlives its frame and turn (DAMAGE_NUMBER_MS). */
export interface FloatingNumber {
  /** The frame's id. */
  id: number;
  side: 0 | 1;
  amount: number;
  healing: boolean;
  critical: boolean;
  /** Its row among its side's numbers on screen, from 0 (DAMAGE_NUMBER_ROWS rows), so a run of hits stacks instead of overlapping. */
  row: number;
}

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
  /** Damage and healing numbers on screen, oldest first. */
  numbers: FloatingNumber[];
}

export interface PlaybackEvents {
  /** A new turn starts playing. */
  onStart(): void;
  /** Playback settled on a fainted combatant that must be replaced. */
  onNeedsSwitch(battle: BattleView): void;
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
  /** Sends a battle command and says whether the controller took it; a rejected command shows its notice and unlocks. */
  submit(action: GameAction): boolean;
  /** Lets go of the idle work it holds and clears the numbers; the screen calls it when it unmounts. */
  dispose(): void;
}

const OPENING_DIALOGUE = '请选择指令。';
const REJECTED_DIALOGUE = '该指令当前无法使用，请重新选择。';
type Patch = (patch: Partial<PlaybackState>) => void;
type TimerName = 'advance' | 'outcome' | 'action' | 'effect';

export function createBattlePlayer(host: PlayerHost): BattlePlayer {
  let state: PlaybackState = {
    frame: null, sourceAction: null, skillEffect: null, busy: false, captureResolved: false, dialogue: host.battle().log.at(-1) || OPENING_DIALOGUE,
    numbers: [],
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
  const numbers = floatingNumbers(host.clock, () => state, set);
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
      const cancel = playFrames(batch, host, set, { last: releaseHeldIdle, settle, shown: numbers.show });
      return () => {
        cancel();
        set({ sourceAction: null, skillEffect: null });
      };
    },
    canAct,
    submit(action) {
      if (!canAct()) return false;
      host.sound('click');
      holdIdle();
      set({ busy: true });
      const result = host.dispatch(action);
      if (result.ok) return true;
      releaseHeldIdle();
      set({ busy: false, dialogue: result.notice || REJECTED_DIALOGUE });
      return false;
    },
    dispose() {
      releaseHeldIdle();
      numbers.clear();
    },
  };
}

/**
 * Shows each hit or heal frame's number for DAMAGE_NUMBER_MS on its own timer, in the lowest free row of its side. A frame
 * shown again (a replayed turn) keeps the number it has.
 */
function floatingNumbers(clock: PlaybackClock, current: () => PlaybackState, set: Patch) {
  const timers = new Map<number, number>();
  const remove = (id: number) => {
    clock.clearTimeout(timers.get(id));
    timers.delete(id);
    set({ numbers: current().numbers.filter(number => number.id !== id) });
  };
  return {
    show(frame: BattlePresentationFrame) {
      if ((frame.kind !== 'hit' && frame.kind !== 'heal') || frame.amount === undefined || timers.has(frame.id)) return;
      const sideNumbers = () => current().numbers.filter(number => number.side === frame.side);
      if (sideNumbers().length >= DAMAGE_NUMBER_ROWS) remove(sideNumbers()[0].id);
      const taken = new Set(sideNumbers().map(number => number.row));
      let row = 0;
      while (taken.has(row)) row++;
      const shown: FloatingNumber = { id: frame.id, side: frame.side, amount: frame.amount, healing: frame.kind === 'heal', critical: !!frame.critical, row };
      set({ numbers: [...current().numbers, shown] });
      timers.set(frame.id, clock.setTimeout(() => remove(frame.id), DAMAGE_NUMBER_MS));
    },
    clear() {
      for (const timer of timers.values()) clock.clearTimeout(timer);
      timers.clear();
      if (current().numbers.length) set({ numbers: [] });
    },
  };
}

/**
 * Shows `batch` frame by frame on the host's clock, calls `shown` with each frame as it shows, `last` once the last frame is on
 * screen and `settle` once it has played; the returned function cancels whatever is still pending.
 */
function playFrames(batch: BattlePresentationFrame[], host: PlayerHost, set: Patch,
  { last, settle, shown }: { last(): void; settle(): void; shown(frame: BattlePresentationFrame): void }) {
  const { clock } = host, timers: Partial<Record<TimerName, number>> = {};
  const schedule = (name: TimerName, run: () => void, ms: number) => { clock.clearTimeout(timers[name]); timers[name] = clock.setTimeout(run, ms); };
  let cursor = 0, actionEndsAt = 0, effectEndsAt = 0;
  const show = (next: BattlePresentationFrame) => {
    shown(next);
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
