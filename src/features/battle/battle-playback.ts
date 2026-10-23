// Timing of the battle presentation: how long each frame of a turn stays on screen.
import type { BattlePresentationFrame } from '../../shared/views.ts';
import type { MoveTiming } from './battle-animation.ts';

type FrameKind = BattlePresentationFrame['kind'];

/** Default on-screen time per frame kind. */
export const FRAME_MS: Record<FrameKind, number> = { physical: 680, special: 700, status: 620, hit: 490, heal: 530, switch: 620, capture: 2200, message: 480 };
export const CRITICAL_HIT_MS = 800;
/**
 * A hit followed straight away by another on the same creature is one of a move's several hits: the next one lands this long
 * after it, while the attacker is still at the target. Only the last hit waits for the attacker's clip to end.
 */
export const FOLLOW_UP_HIT_MS = 250;
/** Under reduced motion every frame except a capture, and every skill effect, takes this long. */
export const REDUCED_MOTION_MS = 160;
/** The capture dialogue reveals the outcome this long into the capsule animation. */
export const CAPTURE_OUTCOME_MS = 1700;
/**
 * A damage or healing number stays on screen this long from when it last changed, however fast the frames and turns move on.
 * The original held its one number per move for 1.5 s; the user chose 4 s, up from the 3 s shown before (2026-10-23).
 */
export const DAMAGE_NUMBER_MS = 4000;
/** Numbers shown at once on one side stack in this many rows; a further one replaces the oldest. */
export const DAMAGE_NUMBER_ROWS = 5;

export interface FramePlan {
  /** Minimum time before the next frame. */
  delayMs: number;
  /** The skill effect overlay: start a new one, clear it (a move without one) or keep the current one. */
  effect: { delayMs: number; durationMs: number } | 'clear' | 'keep';
  /** How long the actor's original clip plays; null when no clip plays for this frame. */
  actionMs: number | null;
  /** Also wait for the running clip and effect to end before advancing. */
  awaitRunning: boolean;
  /** The part of delayMs that waits for the effect to hurt the target; an effect that does not show hands over without it. */
  hurtDelayMs: number;
}

/**
 * A move's original skill effect, while it can play: when it starts and when it hurts the target, both from the attacker
 * clip's hit marker (the start may come before it), and how long it plays.
 */
export interface SkillEffectTiming { startMs: number; durationMs: number; hurtMs: number }

export const isMoveFrame = (frame: BattlePresentationFrame) => frame.kind === 'physical' || frame.kind === 'special' || frame.kind === 'status';

/**
 * Plan one frame. `timing` is the actor's loaded clip for this move and `effect` the move's original skill effect; both are
 * absent when the asset is unavailable. With an effect, a move followed by its hit hands over when the effect hurts the target.
 */
export function planBattleFrame(frame: BattlePresentationFrame, following: BattlePresentationFrame | undefined,
  { reducedMotion, timing, effect }: { reducedMotion: boolean; timing?: MoveTiming | null; effect?: SkillEffectTiming }): FramePlan {
  let delayMs = frame.kind === 'capture' ? FRAME_MS.capture
    : reducedMotion ? REDUCED_MOTION_MS
    : frame.kind === 'hit' && frame.critical ? CRITICAL_HIT_MS
    : FRAME_MS[frame.kind];
  const move = isMoveFrame(frame);
  if (frame.kind === 'hit' && following?.kind === 'hit' && following.side === frame.side) {
    return { delayMs: reducedMotion ? REDUCED_MOTION_MS : FOLLOW_UP_HIT_MS, effect: 'keep', actionMs: null, awaitRunning: false, hurtDelayMs: 0 };
  }
  if (!move) return { delayMs, effect: 'keep', actionMs: null, awaitRunning: frame.kind === 'hit', hurtDelayMs: 0 };
  const clip = reducedMotion ? null : timing ?? null;
  const shown = !effect ? 'clear' as const : reducedMotion ? { delayMs: 0, durationMs: REDUCED_MOTION_MS }
    : { delayMs: Math.max(0, (clip?.hitMs ?? 0) + effect.startMs), durationMs: effect.durationMs };
  // A move followed by its hit hands over at the hit marker, or when its effect hurts the target; otherwise the whole clip plays.
  const hitMs = following?.kind === 'hit' ? clip?.hitMs ?? null : null, hurtDelayMs = hitMs !== null && effect ? effect.hurtMs : 0;
  if (clip) delayMs = hitMs !== null ? hitMs + hurtDelayMs : clip.durationMs;
  return { delayMs, effect: shown, actionMs: clip?.durationMs ?? null, awaitRunning: following?.kind !== 'hit', hurtDelayMs };
}

/** Dialogue while a capsule is in flight, before the outcome is revealed. */
export const captureDialogue = (frame: BattlePresentationFrame) => `正在使用${frame.capsuleName || '精灵胶囊'}捕捉${frame.enemy.name}…`;
