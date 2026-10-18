import manifest from '../../public/battle-effects/manifest.json';

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

export function getSkillEffect(skillId?: number): OriginalSkillEffect | undefined {
  return skillId === undefined ? undefined : effects[String(skillId)];
}

export function getSkillEffectDurationMs(skillId?: number): number | undefined {
  const effect = getSkillEffect(skillId);
  return effect ? effect.frames / effect.fps * 1000 : undefined;
}
