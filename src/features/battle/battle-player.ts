// The battle screen's turn playback and command lock, without React: the screen renders the state and lends its clock and sound.
import type { DispatchResult, GameAction } from '../../kernel/contract.ts';
import type { GameSound } from '../../shared/audio/game-audio.ts';
import type { BattlePresentationFrame, BattleView } from '../../shared/views.ts';
import type { MoveTiming } from './battle-animation.ts';
import { battleEndSound, settledDialogue } from './battle-hud.ts';
import { CAPTURE_OUTCOME_MS, DAMAGE_NUMBER_MS, DAMAGE_NUMBER_ROWS, captureDialogue, planBattleFrame } from './battle-playback.ts';
import type { FramePlan, SkillEffectTiming } from './battle-playback.ts';

/**
 * A move's original skill effect: it starts `delay` ms into the move and plays for `duration` ms. The cue stays until another
 * move's frame or the turn's end, so that the creatures do not show their own status ring or projectile once it has played.
 */
export interface SkillEffectCue {
  move: BattlePresentationFrame; delay: number; duration: number;
  /** The effect does not show after all (it could not start, or its host stopped): nothing waits for it any longer. */
  skip(): void;
}

/**
 * A damage or healing number on screen, from a hit or heal frame or a hit's counter, the −0 of a stopped move's block line,
 * or the MISS of a miss frame; it outlives its frame and turn (DAMAGE_NUMBER_MS), but not its creature's place on screen. A
 * move's later hits and riders on the same creature update it in place (`BattlePresentationFrame.numberId`).
 */
export interface FloatingNumber {
  /** The id of its first frame or counter. */
  id: number;
  /** The frame or counter that last changed it: its first, or the latest one that added to it. */
  frame: number;
  side: 0 | 1;
  /** The creature it is on (`BattleMonsterView.uid`); it leaves when another creature of its side enters. */
  uid: string;
  amount: number;
  /** −amount for damage, +amount for healing, MISS for a move that missed the creature. */
  kind: 'damage' | 'healing' | 'miss';
  /** Any of its hits was critical. */
  critical: boolean;
  /** Its row among its side's numbers on screen, from 0 (DAMAGE_NUMBER_ROWS rows), so numbers on one creature stack instead of overlapping. */
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
  /** One frame's timing inputs: reduced motion, the actor's loaded clip and the move's skill effect, if it can play. */
  motion(frame: BattlePresentationFrame): { reducedMotion: boolean; timing?: MoveTiming | null; effect?: SkillEffectTiming };
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
type TimerName = 'advance' | 'outcome' | 'action';

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

/** The creature that `frame` shows on `side`, its own unless named. */
const activeUid = (frame: BattlePresentationFrame, side = frame.side) => (side === 1 ? frame.enemy : frame.player).uid;

/** A number as a frame shows it, before it has a row. */
type ShownNumber = Omit<FloatingNumber, 'row'>;

/**
 * The numbers a frame shows: a hit's or heal's own, on the attacker the counter a hit drew (`BattlePresentationFrame.counter`),
 * −0 on the target of a damaging move that a block stopped entirely (`stopped`), and a miss's MISS on its target.
 */
function frameNumbers(frame: BattlePresentationFrame): ShownNumber[] {
  const shown: ShownNumber[] = [], own = { id: frame.numberId ?? frame.id, frame: frame.id, side: frame.side, uid: activeUid(frame) };
  if ((frame.kind === 'hit' || frame.kind === 'heal') && frame.amount !== undefined) {
    shown.push({ ...own, amount: frame.amount, kind: frame.kind === 'heal' ? 'healing' : 'damage', critical: !!frame.critical });
  }
  if (frame.stopped) shown.push({ ...own, amount: 0, kind: 'damage', critical: false });
  if (frame.kind === 'miss') shown.push({ ...own, amount: 0, kind: 'miss', critical: false });
  const { counter } = frame, side = frame.side === 1 ? 0 : 1;
  if (counter) {
    shown.push({ id: counter.numberId ?? counter.id, frame: counter.id, side, uid: activeUid(frame, side), amount: counter.amount,
      kind: 'damage', critical: false });
  }
  return shown;
}

/**
 * Shows each frame's numbers (`frameNumbers`) for DAMAGE_NUMBER_MS, in the lowest free row of their side. A frame that adds to a number
 * on screen sets its amount, keeps its row and starts its time again; one that changes neither its amount nor its critical style
 * (a 0-damage hit) leaves it as it is. A creature entering (a switch frame of another creature) takes the place of the numbers on
 * the one it replaced; a transform keeps them. A frame shown again (a replayed turn) changes nothing.
 */
function floatingNumbers(clock: PlaybackClock, current: () => PlaybackState, set: Patch) {
  const timers = new Map<number, number>();
  const remove = (id: number) => {
    clock.clearTimeout(timers.get(id));
    timers.delete(id);
    set({ numbers: current().numbers.filter(number => number.id !== id) });
  };
  /** A new number in the lowest free row of its side; one beyond the rows replaces the side's oldest. */
  const added = (next: ShownNumber): FloatingNumber[] => {
    const sideNumbers = () => current().numbers.filter(number => number.side === next.side);
    if (sideNumbers().length >= DAMAGE_NUMBER_ROWS) remove(sideNumbers()[0].id);
    const taken = new Set(sideNumbers().map(number => number.row));
    let row = 0;
    while (taken.has(row)) row++;
    return [...current().numbers, { ...next, row }];
  };
  const update = (next: ShownNumber) => {
    const { id, frame, amount } = next, shown = current().numbers.find(number => number.id === id);
    const critical = !!shown?.critical || next.critical;
    if (shown && (frame <= shown.frame || amount === shown.amount && critical === shown.critical)) return;
    set({ numbers: shown ? current().numbers.map(number => number === shown ? { ...shown, frame, amount, critical } : number) : added(next) });
    clock.clearTimeout(timers.get(id));
    timers.set(id, clock.setTimeout(() => remove(id), DAMAGE_NUMBER_MS));
  };
  /** The numbers of the creatures of `frame`'s side that it no longer shows leave with them. */
  const retire = (frame: BattlePresentationFrame) => {
    const uid = activeUid(frame);
    for (const number of current().numbers) if (number.side === frame.side && number.uid !== uid) remove(number.id);
  };
  return {
    show(frame: BattlePresentationFrame) {
      if (frame.kind === 'switch') retire(frame);
      for (const number of frameNumbers(frame)) update(number);
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
 * screen and `settle` once it has played; the returned function cancels whatever is still pending. A skipped skill effect stops
 * holding the frame on screen: its move hands over at the hit marker, and a later frame no longer waits for the effect's end.
 */
function playFrames(batch: BattlePresentationFrame[], host: PlayerHost, set: Patch,
  { last, settle, shown }: { last(): void; settle(): void; shown(frame: BattlePresentationFrame): void }) {
  const { clock } = host, timers: Partial<Record<TimerName, number>> = {};
  const schedule = (name: TimerName, run: () => void, ms: number) => { clock.clearTimeout(timers[name]); timers[name] = clock.setTimeout(run, ms); };
  let cursor = 0, actionEndsAt = 0, effectEndsAt = 0, cue: SkillEffectCue | null = null;
  /** The frame on screen, its plan and when it showed; null once the batch has played or was cancelled. */
  let current: { frame: BattlePresentationFrame; plan: FramePlan; at: number } | null = null;
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
  /** The next frame shows `delayMs` after the current one did, and also waits for the running clip and effect if its plan says so. */
  const handOver = (delayMs: number) => {
    const { plan, at } = current!, due = at + delayMs, now = clock.now();
    schedule('advance', advance, Math.max(0, (plan.awaitRunning ? Math.max(due, actionEndsAt, effectEndsAt) : due) - now));
  };
  const endEffect = () => { cue = null; effectEndsAt = 0; set({ skillEffect: null }); };
  const skip = (skipped: SkillEffectCue) => {
    if (cue !== skipped || !current) return;
    endEffect();
    handOver(current.frame === skipped.move ? current.plan.delayMs - current.plan.hurtDelayMs : current.plan.delayMs);
  };
  const advance = () => {
    if (cursor >= batch.length) { current = null; settle(); return; }
    const next = batch[cursor++];
    show(next);
    if (cursor === batch.length) last();
    const plan = planBattleFrame(next, batch[cursor], host.motion(next));
    current = { frame: next, plan, at: clock.now() };
    if (plan.effect === 'clear') endEffect();
    else if (plan.effect !== 'keep') {
      const { delayMs, durationMs } = plan.effect, started: SkillEffectCue = { move: next, delay: delayMs, duration: durationMs, skip: () => skip(started) };
      cue = started;
      set({ skillEffect: started });
      effectEndsAt = clock.now() + delayMs + durationMs;
    }
    if (plan.actionMs !== null) {
      set({ sourceAction: next });
      actionEndsAt = clock.now() + plan.actionMs;
      schedule('action', () => set({ sourceAction: null }), plan.actionMs);
    }
    handOver(plan.delayMs);
  };
  advance();
  return () => {
    current = null;
    for (const timer of Object.values(timers)) clock.clearTimeout(timer);
  };
}
