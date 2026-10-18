import type { CSSProperties } from 'react';
import manifest from '../../../public/battle-effects/manifest.json';

export interface OriginalSkillEffect {
  skillId: number;
  path: string;
  width: number;
  height: number;
  columns: number;
  rows: number;
  frames: number;
  fps: number;
  representativeFrame?: number;
  sha256: string;
  /** Original SWF display-list frames, rendered directly at the recorded size. */
  hd?: {
    path: string;
    width: number;
    height: number;
    sha256: string;
  };
}

const effects: Record<string, OriginalSkillEffect> = manifest.effects;
/** Cache-busting query from a content hash. */
const versioned = (path: string, sha256: string) => `${path}?v=${sha256.slice(0, 12)}`;

export function getSkillEffect(skillId?: number): OriginalSkillEffect | undefined {
  return skillId === undefined ? undefined : effects[String(skillId)];
}

/** Length of the original source timeline. */
export const skillEffectSourceMs = (effect: OriginalSkillEffect) => effect.frames / effect.fps * 1000;

export function getSkillEffectDurationMs(skillId?: number): number | undefined {
  const effect = getSkillEffect(skillId);
  return effect ? skillEffectSourceMs(effect) : undefined;
}

/** The single frame shown when the effect cannot animate. */
export const representativeFrame = (effect: OriginalSkillEffect) => effect.representativeFrame ?? Math.floor(effect.frames / 2);

/** Source frame at `elapsedMs` of a playback stretched to `durationMs`. */
export const skillEffectFrameAt = (effect: OriginalSkillEffect, elapsedMs: number, durationMs: number) =>
  Math.min(effect.frames - 1, Math.floor(elapsedMs / durationMs * effect.frames));

export const skillEffectFrameUrl = (hd: NonNullable<OriginalSkillEffect['hd']>, frame: number) => versioned(`${hd.path}/${frame}.webp`, hd.sha256);

export const skillEffectRatio = (effect: OriginalSkillEffect) => `${effect.width} / ${effect.height}`;

/** One cell of the original sprite sheet, used when the HD frames cannot load. */
export function skillEffectSpriteStyle(effect: OriginalSkillEffect, frame: number): CSSProperties {
  const column = frame % effect.columns;
  const row = Math.floor(frame / effect.columns);
  return {
    '--effect-ratio': skillEffectRatio(effect),
    backgroundImage: `url("${versioned(effect.path, effect.sha256)}")`,
    backgroundSize: `${effect.columns * 100}% ${effect.rows * 100}%`,
    backgroundPosition: `${column / (effect.columns - 1) * 100}% ${effect.rows === 1 ? 0 : row / (effect.rows - 1) * 100}%`,
  } as CSSProperties;
}
