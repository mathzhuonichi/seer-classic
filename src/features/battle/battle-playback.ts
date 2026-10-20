// Timing of the battle presentation: how long each frame of a turn stays on screen.
import type { BattlePresentationFrame } from '../../shared/views.ts';
import type { MoveTiming } from './battle-animation.ts';

type FrameKind = BattlePresentationFrame['kind'];

/** Default on-screen time per frame kind. */
export const FRAME_MS: Record<FrameKind, number> = { physical: 680, special: 700, status: 620, hit: 490, heal: 530, switch: 620, capture: 2200, message: 480 };
export const CRITICAL_HIT_MS = 800;
/** Under reduced motion every frame except a capture, and every skill effect, takes this long. */
export const REDUCED_MOTION_MS = 160;
/** The capture dialogue reveals the outcome this long into the capsule animation. */
export const CAPTURE_OUTCOME_MS = 1700;
/** A damage or healing number stays on screen this long from when it appears, however fast the frames and turns move on. */
export const DAMAGE_NUMBER_MS = 3000;
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
}

export const isMoveFrame = (frame: BattlePresentationFrame) => frame.kind === 'physical' || frame.kind === 'special' || frame.kind === 'status';

/**
 * Plan one frame. `timing` is the actor's loaded clip for this move and `effectMs` the move's
 * original skill effect length; both are absent when the asset is unavailable.
 */
export function planBattleFrame(frame: BattlePresentationFrame, following: BattlePresentationFrame | undefined,
  { reducedMotion, timing, effectMs }: { reducedMotion: boolean; timing?: MoveTiming | null; effectMs?: number }): FramePlan {
  let delayMs = frame.kind === 'capture' ? FRAME_MS.capture
    : reducedMotion ? REDUCED_MOTION_MS
    : frame.kind === 'hit' && frame.critical ? CRITICAL_HIT_MS
    : FRAME_MS[frame.kind];
  const move = isMoveFrame(frame);
  if (!move) return { delayMs, effect: 'keep', actionMs: null, awaitRunning: frame.kind === 'hit' };
  const effect = effectMs ? { delayMs: reducedMotion ? 0 : timing?.hitMs ?? 0, durationMs: reducedMotion ? REDUCED_MOTION_MS : effectMs } : 'clear';
  const clip = reducedMotion ? null : timing ?? null;
  // A move followed by its hit hands over at the hit marker; otherwise the whole clip plays.
  if (clip) delayMs = clip.hitMs !== null && following?.kind === 'hit' ? clip.hitMs : clip.durationMs;
  return { delayMs, effect, actionMs: clip?.durationMs ?? null, awaitRunning: following?.kind !== 'hit' };
}

/** Dialogue while a capsule is in flight, before the outcome is revealed. */
export const captureDialogue = (frame: BattlePresentationFrame) => `正在使用${frame.capsuleName || '精灵胶囊'}捕捉${frame.enemy.name}…`;
