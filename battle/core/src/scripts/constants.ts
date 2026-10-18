// Script numbers that the template text does not state: formulas, AI
// estimates and remake interpretations. Numbers quoted in a template's text
// stay next to that quote. Battle-wide numbers live in ../constants.ts.

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
