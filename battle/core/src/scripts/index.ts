// Registry of scripted skill effects. Ids `seer_eff_<n>` are the original
// Seer side-effect templates (data/scripts_needed.md has each one's text).
// How to write one: SCRIPTS.md.
import type { ScriptRegistry } from '../types.ts';
import { MAIN_SCRIPTS } from './seer-main.ts';
import { TAIL_SCRIPTS } from './seer-tail.ts';
import { BOSS_SCRIPTS } from './boss.ts';
import { RECOVERED_BOSS_SCRIPTS } from './boss-recovered.ts';

export const SEER_SCRIPTS: ScriptRegistry = { ...TAIL_SCRIPTS, ...MAIN_SCRIPTS, ...BOSS_SCRIPTS, ...RECOVERED_BOSS_SCRIPTS };
