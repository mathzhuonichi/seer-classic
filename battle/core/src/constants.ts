// Every tunable rule number lives here. See battle/RULES.md for sources.

import type { Skill } from './types.ts';

// Damage formula (RULES.md section 5):
// base = floor((DAMAGE_LEVEL_FACTOR * level + DAMAGE_LEVEL_OFFSET) * power * A / D / DAMAGE_DIVISOR) + DAMAGE_BASE_OFFSET
export const DAMAGE_LEVEL_FACTOR = 0.4;
export const DAMAGE_LEVEL_OFFSET = 2;
export const DAMAGE_DIVISOR = 50;
export const DAMAGE_BASE_OFFSET = 2;
export const STAB = 1.5;                 // Classic same-type bonus; see damage-formula-research.md.
export const CRIT_MULTIPLIER = 2;        // 致命一击
export const CRIT_DENOMINATOR = 16;      // crit rate = crit_rate / 16
export const DEFAULT_CRIT_RATE = 1;
export const RANDOM_MIN = 217;           // damage roll 217..255 / 255
export const RANDOM_MAX = 255;
/** The mean damage roll, at which the AI estimates damage. */
export const MEAN_ROLL = (RANDOM_MIN + RANDOM_MAX) / 2;
/** Hits of a `multi_hit` op without `min`. */
export const MULTI_HIT_DEFAULT = 2;
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
/** Catch rate of a species without one in the catalog. */
export const DEFAULT_CATCH_RATE = 45;
/** The capture value at or above which a capsule always catches; the roll is uniform below it. */
export const CAPTURE_CERTAIN = 255;
export const MAX_PARTY = 6;
export const MAX_SKILLS = 4;
/** Skill scripts whose user knocks itself out: inheritance, shared critical, self-destruct. */
export const SELF_KO_SCRIPTS: ReadonlySet<string> = new Set(['seer_eff_59', 'seer_eff_71', 'seer_eff_112']);

/** 挣扎: used when no skill has PP left. */
export const STRUGGLE_SKILL: Skill = {
  id: STRUGGLE.id, name: { zh: '挣扎', en: 'Struggle' }, type: '__none', category: 'physical',
  power: STRUGGLE.power, accuracy: null, pp: 0, priority: 0,
  effects: [{ op: 'recoil', pct_max_hp: STRUGGLE.recoilFraction * 100 }],
};

export function stageMultiplier(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

export function accuracyStageMultiplier(stage: number): number {
  const s = Math.max(STAGE_MIN, Math.min(STAGE_MAX, stage));
  return s >= 0 ? (3 + s) / 3 : NEGATIVE_ACC_TABLE[-s];
}
