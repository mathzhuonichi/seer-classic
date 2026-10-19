import {MAX_LEVEL} from '../../raising/core/growth.ts';

/** The retained official fight client masks every level above the level cap (100) as "??". */
export function encounterLevel(level:number,masked=false):string {
  return !masked&&Number.isFinite(level)&&level>=1&&level<=MAX_LEVEL?String(level):'??';
}

export function encounterLevelText(level:number,masked=false):string {
  return `Lv.${encounterLevel(level,masked)}`;
}

/** An opponent's level label, masked where the original showed ??. */
export function opponentLevelText(opponent:{level:number;levelMasked?:boolean}):string {
  return encounterLevelText(opponent.level,opponent.levelMasked);
}
