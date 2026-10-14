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
}

const effects: Record<string, OriginalSkillEffect> = manifest.effects;

export function getSkillEffect(skillId?: number): OriginalSkillEffect | undefined {
  return skillId === undefined ? undefined : effects[String(skillId)];
}

export function hasSkillEffect(skillId?: number): boolean {
  return getSkillEffect(skillId) !== undefined;
}

export function getSkillEffectDurationMs(skillId?: number): number | undefined {
  const effect = getSkillEffect(skillId);
  return effect ? effect.frames / effect.fps * 1000 : undefined;
}
