import { useEffect, useState, type CSSProperties } from 'react';
import { getSkillEffect } from './battle-skill-effects';
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

/** Static original Flash display-list frames; this component never executes Flash code. */
export default function BattleSkillEffect({ skillId, eventKey, side, targetSide, durationMs, startDelayMs }: BattleSkillEffectProps) {
  const effect = getSkillEffect(skillId);
  const [playback, setPlayback] = useState<{ key: string | number; frame: number }>();
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
        completion = setTimeout(() => setPlayback(undefined), duration);
        return;
      }
      const started = performance.now();
      setPlayback({ key: eventKey, frame: 0 });
      const tick = (now: number) => {
        const elapsed = now - started;
        if (elapsed >= duration) {
          setPlayback(undefined);
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


  if (!effect || !playback || playback.key !== eventKey) return null;
  const column = playback.frame % effect.columns;
  const row = Math.floor(playback.frame / effect.columns);
  const style = {
    '--effect-ratio': `${effect.width} / ${effect.height}`,
    backgroundImage: `url("${effect.path}?v=${effect.sha256.slice(0, 12)}")`,
    backgroundSize: `${effect.columns * 100}% ${effect.rows * 100}%`,
    backgroundPosition: `${column / (effect.columns - 1) * 100}% ${effect.rows === 1 ? 0 : row / (effect.rows - 1) * 100}%`,
  } as CSSProperties;
  return <div className={`battle-original-skill-effect target-${targetSide} actor-${side}`} style={style} aria-hidden="true" />;
}
