export interface BraveTowerProgress {
  highestCleared:number;
  /** The next floor in this climb; null means this climb reached the top. */
  resumeFloor:number|null;
}

export const BRAVE_TOWER_FLOORS=70;
export const BRAVE_TOWER_CHECKPOINTS=Object.freeze([1,11,21,31,41,51,61] as const);

function isFloor(value:unknown):value is number {
  return typeof value==='number'&&Number.isInteger(value)&&value>=1&&value<=BRAVE_TOWER_FLOORS;
}

export function braveTowerFloor(id:string):number|undefined {
  const match=typeof id==='string'?/^boss_tower_brave_f(\d{3})$/.exec(id):null;
  const floor=match?Number(match[1]):undefined;
  return isFloor(floor)?floor:undefined;
}

export function braveTowerBossId(floor:number):string {
  if(!isFloor(floor))throw new RangeError('Brave Tower floor must be an integer from 1 to 70.');
  return `boss_tower_brave_f${String(floor).padStart(3,'0')}`;
}

/** Preserve legacy independent clears without inventing clears of earlier floors. */
export function normalizeBraveTowerProgress(value:unknown,clearedIds:readonly string[]):BraveTowerProgress {
  const stored=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  const storedHighest=stored.highestCleared;
  let highestCleared=typeof storedHighest==='number'&&Number.isInteger(storedHighest)&&storedHighest>=0&&storedHighest<=BRAVE_TOWER_FLOORS?storedHighest:0;
  for(const id of clearedIds)highestCleared=Math.max(highestCleared,braveTowerFloor(id)??0);
  const nextFloor=highestCleared===BRAVE_TOWER_FLOORS?null:highestCleared+1;
  const resume=stored.resumeFloor;
  const resumeFloor=isFloor(resume)&&resume<=Math.min(highestCleared+1,BRAVE_TOWER_FLOORS)
    ?resume:nextFloor;
  return {highestCleared,resumeFloor};
}

export function braveTowerCheckpoints(progress:BraveTowerProgress):{floor:number;unlocked:boolean}[] {
  return BRAVE_TOWER_CHECKPOINTS.map(floor=>({floor,unlocked:floor<=progress.highestCleared+1}));
}

/** New climbs begin at unlocked checkpoints; an existing climb resumes exactly. */
export function canStartBraveTowerFloor(progress:BraveTowerProgress,floor:number):boolean {
  return isFloor(floor)&&floor<=progress.highestCleared+1&&(
    floor===progress.resumeFloor||BRAVE_TOWER_CHECKPOINTS.some(checkpoint=>checkpoint===floor)
  );
}

/** Called after a successful battle; losses and exits leave the progress unchanged. */
export function clearBraveTowerFloor(progress:BraveTowerProgress,floor:number):BraveTowerProgress {
  if(!isFloor(floor))throw new RangeError('Brave Tower floor must be an integer from 1 to 70.');
  return {
    highestCleared:Math.max(progress.highestCleared,floor),
    resumeFloor:floor===BRAVE_TOWER_FLOORS?null:floor+1,
  };
}
