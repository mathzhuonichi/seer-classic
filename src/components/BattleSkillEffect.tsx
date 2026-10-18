import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { getSkillEffect, type OriginalSkillEffect } from './battle-skill-effects.ts';
import { SkillFrameBuffer, loadSkillFrame } from './skill-frame-buffer.ts';
import './battle-skill-effect.css';

export interface BattleSkillEffectProps {
  skillId?: number;
  /** Preserve this move's identity while its following damage events are shown. */
  eventKey: string | number;
  side: 0 | 1;
  /** The move's actual target from the battle adapter, including self-target moves. */
  targetSide: 0 | 1;
  phase?: string;
  /** Optional scheduler alignment; source timing is the default. */
  durationMs?: number;
  startDelayMs?: number;
}

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
      load: (index, signal) => loadSkillFrame(`${hd.path}/${index}.webp?v=${hd.sha256.slice(0, 12)}`, signal),
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

/** Static original Flash display-list frames; this component never executes Flash code. */
export default function BattleSkillEffect({ skillId, eventKey, side, targetSide, durationMs, startDelayMs }: BattleSkillEffectProps) {
  const effect = getSkillEffect(skillId);
  const [playback, setPlayback] = useState<{ key: string | number; frame: number }>();
  const [failedKey, setFailedKey] = useState<string | number>();
  const onFrameFailure = useCallback(() => setFailedKey(eventKey), [eventKey]);
  useEffect(() => {
    if (!effect) {
      setPlayback(undefined);
      return;
    }
    const duration = Math.max(1, durationMs ?? effect.frames / effect.fps * 1000);
    let request = 0;
    let completion: ReturnType<typeof setTimeout> | undefined;
    setPlayback(undefined);
    const delay = setTimeout(() => {
      const reduced = duration <= 160 || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        setPlayback({ key: eventKey, frame: effect.representativeFrame ?? Math.floor(effect.frames / 2) });
        completion = setTimeout(() => setPlayback({ key: eventKey, frame: -1 }), duration);
        return;
      }
      const started = performance.now();
      setPlayback({ key: eventKey, frame: 0 });
      const tick = (now: number) => {
        const elapsed = now - started;
        if (elapsed >= duration) {
          setPlayback({ key: eventKey, frame: -1 });
          return;
        }
        const frame = Math.min(effect.frames - 1, Math.floor(elapsed / duration * effect.frames));
        setPlayback(current => current?.key === eventKey && current.frame === frame ? current : { key: eventKey, frame });
        request = requestAnimationFrame(tick);
      };
      request = requestAnimationFrame(tick);
    }, Math.max(0, startDelayMs ?? 0));
    return () => {
      clearTimeout(delay);
      clearTimeout(completion);
      cancelAnimationFrame(request);
    };
  }, [effect, eventKey, durationMs, startDelayMs]);


  if (!effect) return null;
  const frame = playback?.key === eventKey ? playback.frame : undefined;
  if (frame === -1) return null;
  const className = `battle-original-skill-effect target-${targetSide} actor-${side}`;
  if (effect.hd && failedKey !== eventKey) {
    const reduced = (durationMs ?? effect.frames / effect.fps * 1000) <= 160
      || (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const firstFrame = reduced ? effect.representativeFrame ?? Math.floor(effect.frames / 2) : 0;
    return <OriginalFrameCanvas key={eventKey} effect={effect} frame={frame} firstFrame={firstFrame}
      className={className} style={{ '--effect-ratio': `${effect.width} / ${effect.height}` } as CSSProperties}
      onFailure={onFrameFailure} />;
  }
  if (frame === undefined) return null;
  const column = frame % effect.columns;
  const row = Math.floor(frame / effect.columns);
  const style = {
    '--effect-ratio': `${effect.width} / ${effect.height}`,
    backgroundImage: `url("${effect.path}?v=${effect.sha256.slice(0, 12)}")`,
    backgroundSize: `${effect.columns * 100}% ${effect.rows * 100}%`,
    backgroundPosition: `${column / (effect.columns - 1) * 100}% ${effect.rows === 1 ? 0 : row / (effect.rows - 1) * 100}%`,
  } as CSSProperties;
  return <div className={className} style={style} aria-hidden="true" />;
}
