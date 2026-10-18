import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import {
  getSkillEffect, representativeFrame, skillEffectFrameAt, skillEffectFrameUrl, skillEffectRatio, skillEffectSourceMs, skillEffectSpriteStyle,
  type OriginalSkillEffect,
} from '../../presentation/battle-skill-effects.ts';
import { SkillFrameBuffer, loadSkillFrame } from '../../presentation/skill-frame-buffer.ts';
import { REDUCED_MOTION_MS } from '../../presentation/battle-playback.ts';
import { prefersReducedMotion } from './reduced-motion.ts';
import './battle-skill-effect.css';

export interface BattleSkillEffectProps {
  skillId?: number;
  /** Preserve this move's identity while its following damage events are shown. */
  eventKey: string | number;
  side: 0 | 1;
  /** The move's actual target from the battle adapter, including self-target moves. */
  targetSide: 0 | 1;
  /** Optional scheduler alignment; source timing is the default. */
  durationMs?: number;
  startDelayMs?: number;
}

/** Frame value once playback has ended. */
const FINISHED = -1;

/** A schedule at the reduced-motion floor, or a reduced-motion viewer, sees one representative frame. */
const showsStill = (effect: OriginalSkillEffect, durationMs?: number) =>
  (durationMs ?? skillEffectSourceMs(effect)) <= REDUCED_MOTION_MS || prefersReducedMotion();

function OriginalFrameCanvas({ effect, frame, firstFrame, className, style, onFailure }: {
  effect: OriginalSkillEffect;
  frame?: number;
  firstFrame: number;
  className: string;
  style: CSSProperties;
  onFailure: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const buffer = useRef<SkillFrameBuffer | undefined>(undefined);
  const activeFrame = useRef(frame);
  activeFrame.current = frame;
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    const hd = effect.hd;
    if (!element || !context || !hd) {
      onFailure();
      return;
    }
    element.width = hd.width;
    element.height = hd.height;
    const frames = new SkillFrameBuffer({
      frames: effect.frames,
      load: (index, signal) => loadSkillFrame(skillEffectFrameUrl(hd, index), signal),
      clear: () => context.clearRect(0, 0, element.width, element.height),
      draw: (index, bitmap) => {
        if (activeFrame.current !== index) return;
        context.clearRect(0, 0, element.width, element.height);
        context.drawImage(bitmap.image, 0, 0, element.width, element.height);
      },
      onError: onFailure,
    });
    buffer.current = frames;
    // Decode during the existing wind-up delay without starting the frame clock.
    frames.seek(activeFrame.current ?? firstFrame);
    return () => {
      frames.dispose();
      buffer.current = undefined;
      element.width = 0;
      element.height = 0;
    };
  }, [effect, firstFrame, onFailure]);
  useLayoutEffect(() => {
    if (frame !== undefined) buffer.current?.seek(frame);
  }, [frame]);
  return <canvas ref={canvas} className={className} style={style}
    width={effect.hd?.width} height={effect.hd?.height}
    data-original-skill-frame={frame} aria-hidden="true" />;
}

/** The source frame for this event: undefined during the start delay, FINISHED after the end. */
function usePlaybackFrame(effect: OriginalSkillEffect | undefined, eventKey: string | number, durationMs?: number, startDelayMs?: number) {
  const [playback, setPlayback] = useState<{ key: string | number; frame: number }>();
  useEffect(() => {
    setPlayback(undefined);
    if (!effect) return;
    const duration = Math.max(1, durationMs ?? skillEffectSourceMs(effect));
    const show = (frame: number) => setPlayback(current => current?.key === eventKey && current.frame === frame ? current : { key: eventKey, frame });
    let request = 0;
    let completion: ReturnType<typeof setTimeout> | undefined;
    const delay = setTimeout(() => {
      if (showsStill(effect, duration)) {
        show(representativeFrame(effect));
        completion = setTimeout(() => show(FINISHED), duration);
        return;
      }
      const started = performance.now();
      const tick = (now: number) => {
        const elapsed = now - started;
        if (elapsed >= duration) {
          show(FINISHED);
          return;
        }
        show(skillEffectFrameAt(effect, elapsed, duration));
        request = requestAnimationFrame(tick);
      };
      show(0);
      request = requestAnimationFrame(tick);
    }, Math.max(0, startDelayMs ?? 0));
    return () => {
      clearTimeout(delay);
      clearTimeout(completion);
      cancelAnimationFrame(request);
    };
  }, [effect, eventKey, durationMs, startDelayMs]);
  return playback?.key === eventKey ? playback.frame : undefined;
}

/** Static original Flash display-list frames; this component never executes Flash code. */
export default function BattleSkillEffect({ skillId, eventKey, side, targetSide, durationMs, startDelayMs }: BattleSkillEffectProps) {
  const effect = getSkillEffect(skillId);
  const frame = usePlaybackFrame(effect, eventKey, durationMs, startDelayMs);
  const [failedKey, setFailedKey] = useState<string | number>();
  const onFrameFailure = useCallback(() => setFailedKey(eventKey), [eventKey]);
  if (!effect || frame === FINISHED) return null;
  const className = `battle-original-skill-effect target-${targetSide} actor-${side}`;
  if (effect.hd && failedKey !== eventKey) {
    const firstFrame = showsStill(effect, durationMs) ? representativeFrame(effect) : 0;
    return <OriginalFrameCanvas key={eventKey} effect={effect} frame={frame} firstFrame={firstFrame}
      className={className} style={{ '--effect-ratio': skillEffectRatio(effect) } as CSSProperties}
      onFailure={onFrameFailure} />;
  }
  if (frame === undefined) return null;
  return <div className={className} style={skillEffectSpriteStyle(effect, frame)} aria-hidden="true" />;
}
