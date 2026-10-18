import {MAX_LEVEL} from '../../raising/core/growth.ts';

/** The retained official fight client masks every level above the level cap (100) as "??". */
export function encounterLevel(level:number,masked=false):string {
  return !masked&&Number.isFinite(level)&&level>=1&&level<=MAX_LEVEL?String(level):'??';
}

export function encounterLevelText(level:number,estimated=false,masked=false):string {
  return `Lv.${encounterLevel(level,masked)}${estimated?' · 推定':''}`;
}
