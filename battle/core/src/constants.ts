// Every tunable rule number lives here. See battle/RULES.md for sources.

import type { EffectOp, Skill } from './types.ts';

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
/** The integer damage roll nearest the mean, at which the AI estimates damage. */
export const MEAN_ROLL = Math.round((RANDOM_MIN + RANDOM_MAX) / 2);
/** Hits of a `multi_hit` op without `min`. */
export const MULTI_HIT_DEFAULT = 2;
/** The hit counts a `multi_hit` op rolls between: `min`..`max`, where `max` defaults to `min`. */
export function multiHitRange(op: EffectOp): { min: number; max: number } {
  const min = op.min ?? MULTI_HIT_DEFAULT;
  return { min, max: op.max ?? min };
}
export const BURN_DAMAGE_MULTIPLIER = 0.5;
export const STAGE_MIN = -6;
export const STAGE_MAX = 6;
export const NEGATIVE_ACC_TABLE = [1, 0.85, 0.70, 0.55, 0.45, 0.35, 0.25];
export const STATUS_DEFAULT_TURNS: [number, number] = [2, 3];
export const STATUS_DOT_FRACTION = 1 / 8;
export const STRUGGLE = { id: 0, power: 50, recoilFraction: 1 / 4 };
export const MAX_TURNS = 200;
/** The chance that a Boss with an attack that hurts uses a status move that changes something instead (RULES.md 10.4). */
export const BOSS_STATUS_CHANCE = 0.2;
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

// Skill script numbers that the template text does not state: formulas, AI estimates
// and remake interpretations. Numbers quoted in a template's text stay next to that
// quote (battle/core/SCRIPTS.md).
/** seer_eff_35 惩罚: power per positive foe stage, and the cap. */
export const PUNISH_POWER_PER_STAGE = 20;
export const PUNISH_MAX_POWER = 200;

/** seer_eff_100: the classic reversal table, keyed by REVERSAL_SCALE × HP / max HP ≤ bound. */
export const REVERSAL_SCALE = 48;
export const REVERSAL_POWER: readonly (readonly [bound: number, power: number])[] = [[1, 200], [4, 150], [9, 100], [16, 80], [32, 40]];
export const REVERSAL_MIN_POWER = 20;

/** seer_eff_113 (formula guessed): power = IV_POWER_BASE + IV_POWER_PER_POINT × IV. */
export const IV_POWER_BASE = 50;
export const IV_POWER_PER_POINT = 2;

/** seer_eff_139: [cumulative roll % (1-100), min, max] power tiers; the AI estimate is their mean. */
export const GAMBLE_POWER: readonly (readonly [upTo: number, min: number, max: number])[] = [[50, 301, 350], [80, 101, 300], [100, 5, 100]];
export const GAMBLE_POWER_ESTIMATE = 233; // 0.5*325.5 + 0.3*200.5 + 0.2*52.5

/** seer_eff_174 (no template text): the stage change is clamped to ±limit; 0 or missing means -1. */
export const STRANGE_STAGE_LIMIT = 2;
export const STRANGE_STAGE_DEFAULT = -1;

/** Boss rule random_priority: a successful roll acts at no less than this priority. */
export const RANDOM_PRIORITY_FLOOR = 5;
/** Priority of the always-move-first rules (boss and campaign). */
export const ALWAYS_FIRST_PRIORITY = Number.MAX_SAFE_INTEGER;

export function stageMultiplier(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

/** The accuracy table from the September 2010 update (4399 2010-09-01, 7k7k 2010-10-15): raises like other stats, drops by the table. */
export function accuracyStageMultiplier(stage: number): number {
  const s = Math.max(STAGE_MIN, Math.min(STAGE_MAX, stage));
  return s >= 0 ? stageMultiplier(s) : NEGATIVE_ACC_TABLE[-s];
}
