import {MAX_LEVEL} from '../../raising/core/growth.ts';

/** The retained official fight client masks every level above the level cap (100) as "??". */
export function encounterLevel(level:number,masked=false):string {
  return !masked&&Number.isFinite(level)&&level>=1&&level<=MAX_LEVEL?String(level):'??';
}

export function encounterLevelText(level:number,estimated=false,masked=false):string {
  return `Lv.${encounterLevel(level,masked)}${estimated?' · 推定':''}`;
}

/** An opponent's level label, marked as estimated or masked by its boss evidence. */
export function opponentLevelText(opponent:{level:number;evidence?:{hasInferredLevel:boolean;displayLevelUnknown?:boolean}}):string {
  return encounterLevelText(opponent.level,opponent.evidence?.hasInferredLevel,opponent.evidence?.displayLevelUnknown);
}
