/** The retained official fight client masks every level above 100 as "??". */
export function encounterLevel(level:number,masked=false):string {
  return !masked&&Number.isFinite(level)&&level>=1&&level<=100?String(level):'??';
}

export function encounterLevelText(level:number,estimated=false,masked=false):string {
  return `Lv.${encounterLevel(level,masked)}${estimated?' · 推定':''}`;
}
