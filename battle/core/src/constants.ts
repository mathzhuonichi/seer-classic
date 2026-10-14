// Every tunable rule number lives here. See battle/RULES.md for sources.

export const STAB = 1.5;                 // Classic same-type bonus; see damage-formula-research.md.
export const CRIT_MULTIPLIER = 2;        // 致命一击
export const CRIT_DENOMINATOR = 16;      // crit rate = crit_rate / 16
export const DEFAULT_CRIT_RATE = 1;
export const RANDOM_MIN = 217;           // damage roll 217..255 / 255
export const RANDOM_MAX = 255;
export const BURN_DAMAGE_MULTIPLIER = 0.5;
export const STAGE_MIN = -6;
export const STAGE_MAX = 6;
export const NEGATIVE_ACC_TABLE = [1, 0.85, 0.70, 0.55, 0.45, 0.35, 0.25];
export const STATUS_DEFAULT_TURNS: [number, number] = [2, 3];
export const STATUS_DOT_FRACTION = 1 / 8;
export const STRUGGLE = { id: 0, power: 50, recoilFraction: 1 / 4 };
export const MAX_TURNS = 200;
export const CAPTURE_CONTROL_BONUS = 2;
export const CAPTURE_DOT_BONUS = 1.5;
export const MAX_PARTY = 6;
export const MAX_SKILLS = 4;

export function stageMultiplier(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

export function accuracyStageMultiplier(stage: number): number {
  const s = Math.max(STAGE_MIN, Math.min(STAGE_MAX, stage));
  return s >= 0 ? (3 + s) / 3 : NEGATIVE_ACC_TABLE[-s];
}
