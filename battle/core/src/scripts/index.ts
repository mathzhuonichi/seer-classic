// Registry of scripted skill effects and boss rules. Ids `seer_eff_<n>` are the
// original Seer side-effect templates, quoted above each entry.
// How to write one: SCRIPTS.md.
import type { ScriptRegistry } from '../types.ts';
import { MAIN_SCRIPTS } from './seer-main.ts';
import { TAIL_SCRIPTS } from './seer-tail.ts';
import { BOSS_SCRIPTS } from './boss.ts';

export const SEER_SCRIPTS: ScriptRegistry = { ...TAIL_SCRIPTS, ...MAIN_SCRIPTS, ...BOSS_SCRIPTS };
