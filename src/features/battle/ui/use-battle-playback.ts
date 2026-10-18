import { useEffect, useRef, useState } from 'react';
import type { GameAction, GameController } from '../../../kernel/contract.ts';
import type { BattlePresentationFrame, BattleView } from '../../../shared/views.ts';
import { gameAudio } from '../../../shared/audio/game-audio.ts';
import { battleAnimationTiming } from '../battle-animation.ts';
import { battleEndSound, settledDialogue } from '../battle-hud.ts';
import { CAPTURE_OUTCOME_MS, captureDialogue, isMoveFrame, planBattleFrame } from '../battle-playback.ts';
import { getSkillEffectDurationMs } from '../battle-skill-effects.ts';
import { appearanceOf } from '../../../shared/monster-views.ts';
import { prefersReducedMotion } from './reduced-motion.ts';

export interface SkillEffectCue { move: BattlePresentationFrame; delay: number; duration: number }

export interface BattlePlayback {
  /** The frame on screen, or null between turns. */
  frame: BattlePresentationFrame | null;
  /** The move whose original clip is playing. */
  sourceAction: BattlePresentationFrame | null;
  skillEffect: SkillEffectCue | null;
  busy: boolean;
  dialogue: string;
  /** The last capsule in this battle caught its target. */
  captureResolved: boolean;
  /** No turn is playing or being submitted, and the battle is still on. */
  canAct(): boolean;
  /** Send a battle command; a command the controller rejects shows its notice and unlocks. */
  submit(action: GameAction): void;
}

export interface PlaybackEvents {
  /** A new turn starts playing. */
  onStart(): void;
  /** Playback settled on a fainted combatant that must be replaced. */
  onNeedsSwitch(battle: BattleView): void;
}

/** Where frame playback writes; React state setters in the hook. */
interface FrameSink {
  setFrame(frame: BattlePresentationFrame | null): void;
  setSourceAction(frame: BattlePresentationFrame | null): void;
  setSkillEffect(cue: SkillEffectCue | null): void;
  setCaptureResolved(caught: boolean): void;
  setDialogue(text: string): void;
  /** Every frame has played. */
  settle(): void;
}

/** A finished battle returns to its scene after its last action and capsule settle. */
const CLOSE_DELAY_MS = 700;
type TimerName = 'advance' | 'outcome' | 'action' | 'effect';

/** Show `batch` frame by frame on timers; the returned function cancels whatever is still pending. */
function playFrames(batch: BattlePresentationFrame[], sink: FrameSink): () => void {
  const timers: Partial<Record<TimerName, ReturnType<typeof setTimeout>>> = {};
  const schedule = (name: TimerName, run: () => void, ms: number) => { clearTimeout(timers[name]); timers[name] = setTimeout(run, ms); };
  let cursor = 0, actionEndsAt = 0, effectEndsAt = 0;
  const show = (next: BattlePresentationFrame) => {
    sink.setFrame(next);
    if (next.kind === 'capture') sink.setCaptureResolved(!!next.captureSuccess);
    if (next.kind === 'heal') gameAudio.playSfx('heal');
    if (next.kind !== 'capture') { sink.setDialogue(next.text); return; }
    sink.setDialogue(captureDialogue(next));
    schedule('outcome', () => { sink.setDialogue(next.text); if (next.captureSuccess) gameAudio.playSfx('capture'); }, CAPTURE_OUTCOME_MS);
  };
  const advance = () => {
    if (cursor >= batch.length) { sink.settle(); return; }
    const next = batch[cursor++], move = isMoveFrame(next), actor = next.side === 0 ? next.player : next.enemy;
    show(next);
    const plan = planBattleFrame(next, batch[cursor], {
      reducedMotion: prefersReducedMotion(),
      timing: move ? battleAnimationTiming(appearanceOf(actor), next.kind) : null,
      effectMs: move ? getSkillEffectDurationMs(next.skillId) : undefined,
    });
    if (plan.effect === 'clear') { sink.setSkillEffect(null); effectEndsAt = 0; }
    else if (plan.effect !== 'keep') {
      const { delayMs, durationMs } = plan.effect;
      sink.setSkillEffect({ move: next, delay: delayMs, duration: durationMs });
      effectEndsAt = performance.now() + delayMs + durationMs;
      schedule('effect', () => sink.setSkillEffect(null), delayMs + durationMs);
    }
    if (plan.actionMs !== null) {
      sink.setSourceAction(next);
      actionEndsAt = performance.now() + plan.actionMs;
      schedule('action', () => sink.setSourceAction(null), plan.actionMs);
    }
    const now = performance.now();
    schedule('advance', advance, plan.awaitRunning ? Math.max(plan.delayMs, actionEndsAt - now, effectEndsAt - now) : plan.delayMs);
  };
  advance();
  return () => { for (const timer of Object.values(timers)) clearTimeout(timer); };
}

/** Play each new turn's presentation frames in order, and own the command lock while they run. */
export function useBattlePlayback(battle: BattleView, c: GameController, events: PlaybackEvents): BattlePlayback {
  const [frame, setFrame] = useState<BattlePresentationFrame | null>(null);
  const [sourceAction, setSourceAction] = useState<BattlePresentationFrame | null>(null);
  const [skillEffect, setSkillEffect] = useState<SkillEffectCue | null>(null);
  const [busy, setBusy] = useState(false);
  const [captureResolved, setCaptureResolved] = useState(false);
  const [dialogue, setDialogue] = useState(battle.log.at(-1) || '请选择指令。');
  const locked = useRef(false), latest = useRef(battle), handlers = useRef(events);
  latest.current = battle;
  handlers.current = events;
  const revision = battle.animation.revision;

  useEffect(() => {
    const batch = latest.current.animation.frames;
    if (!batch.length) { locked.current = false; setBusy(false); setFrame(null); return; }
    locked.current = true;
    setBusy(true);
    handlers.current.onStart();
    const settle = () => {
      const settled = latest.current, sound = battleEndSound(settled);
      setFrame(null);
      setSourceAction(null);
      setSkillEffect(null);
      if (sound) gameAudio.playSfx(sound);
      setBusy(false);
      locked.current = false;
      if (settled.needsSwitch) handlers.current.onNeedsSwitch(settled);
      setDialogue(settledDialogue(settled, batch.at(-1)));
    };
    const cancel = playFrames(batch, { setFrame, setSourceAction, setSkillEffect, setCaptureResolved, setDialogue, settle });
    return () => {
      cancel();
      setSourceAction(null);
      setSkillEffect(null);
      locked.current = false;
    };
  }, [revision]);

  useEffect(() => {
    if (!battle.finished || busy || locked.current) return;
    const timer = setTimeout(() => c.dispatch({ type: 'closeBattle' }), CLOSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [battle.finished, busy, revision, c]);

  const canAct = () => !locked.current && !busy && !battle.finished;
  const submit = (action: GameAction) => {
    if (!canAct()) return;
    gameAudio.playSfx('click');
    locked.current = true;
    setBusy(true);
    const before = battle.animation.revision;
    c.dispatch(action);
    if (c.snapshot().battle?.animation.revision !== before) return;
    locked.current = false;
    setBusy(false);
    setDialogue(c.snapshot().notices[0] || '该指令当前无法使用，请重新选择。');
  };
  return { frame, sourceAction, skillEffect, busy, dialogue, captureResolved, canAct, submit };
}
