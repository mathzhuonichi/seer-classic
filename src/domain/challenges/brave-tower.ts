export interface BraveTowerProgress {
  highestCleared:number;
  /** The next floor in this climb; null means this climb reached the top. */
  resumeFloor:number|null;
}

export const BRAVE_TOWER_FLOORS=70;
/** Floors per segment: clearing a segment's last floor unlocks the next segment's first floor. */
export const BRAVE_TOWER_SEGMENT=10;
/** The first floor of every segment: 1, 11, ..., 61. */
export const BRAVE_TOWER_CHECKPOINTS:readonly number[]=Object.freeze(
  Array.from({length:BRAVE_TOWER_FLOORS/BRAVE_TOWER_SEGMENT},(_,index)=>index*BRAVE_TOWER_SEGMENT+1));

const BOSS_ID_PREFIX='boss_tower_brave_f';
const BOSS_ID=new RegExp(`^${BOSS_ID_PREFIX}(\\d{3})$`);

export interface BraveTowerRewardSource {items?:Record<string,number>;first_clear?:boolean}
/** Explicit floor rewards only; unique milestones are not granted on repeat clears. */
export function braveTowerRewards(reward:BraveTowerRewardSource|undefined):{id:string;count:number;firstClear:boolean}[] {
  return Object.entries(reward?.items??{}).filter(([,count])=>Number.isSafeInteger(count)&&count>0).map(([id,count])=>({
    id,count,firstClear:reward?.first_clear===true||id.startsWith('essence_')||id==='item_suit_flash',
  }));
}

const inRange=(value:unknown,min:number):value is number=>Number.isInteger(value)&&(value as number)>=min&&(value as number)<=BRAVE_TOWER_FLOORS;
const isFloor=(value:unknown):value is number=>inRange(value,1);
const floorError=()=>new RangeError(`Brave Tower floor must be an integer from 1 to ${BRAVE_TOWER_FLOORS}.`);
const nextFloor=(cleared:number)=>cleared===BRAVE_TOWER_FLOORS?null:cleared+1;

export function braveTowerFloor(id:string):number|undefined {
  const floor=Number(BOSS_ID.exec(id)?.[1]);
  return isFloor(floor)?floor:undefined;
}

export function braveTowerBossId(floor:number):string {
  if(!isFloor(floor))throw floorError();
  return `${BOSS_ID_PREFIX}${String(floor).padStart(3,'0')}`;
}

/** Preserve legacy independent clears without inventing clears of earlier floors. */
export function normalizeBraveTowerProgress(value:unknown,clearedIds:readonly string[]):BraveTowerProgress {
  const stored:Partial<Record<keyof BraveTowerProgress,unknown>>=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const highestCleared=Math.max(inRange(stored.highestCleared,0)?stored.highestCleared:0,...clearedIds.map(id=>braveTowerFloor(id)??0));
  const resume=stored.resumeFloor;
  return {highestCleared,resumeFloor:isFloor(resume)&&resume<=highestCleared+1?resume:nextFloor(highestCleared)};
}

export function braveTowerCheckpoints(progress:BraveTowerProgress):{floor:number;unlocked:boolean}[] {
  return BRAVE_TOWER_CHECKPOINTS.map(floor=>({floor,unlocked:floor<=progress.highestCleared+1}));
}

/** New climbs begin at unlocked checkpoints; an existing climb resumes exactly. */
export function canStartBraveTowerFloor(progress:BraveTowerProgress,floor:number):boolean {
  return isFloor(floor)&&floor<=progress.highestCleared+1&&(floor===progress.resumeFloor||BRAVE_TOWER_CHECKPOINTS.includes(floor));
}

/** Called after a successful battle; losses and exits leave the progress unchanged. */
export function clearBraveTowerFloor(progress:BraveTowerProgress,floor:number):BraveTowerProgress {
  if(!isFloor(floor))throw floorError();
  return {highestCleared:Math.max(progress.highestCleared,floor),resumeFloor:nextFloor(floor)};
}

export interface BraveTowerPosition {
  /** The floor the tower scene stands on: the climb's next floor, or the top floor after a completed climb. */
  floor:number;
  /** The guardian encounter of that floor. */
  bossId:string;
  /** This climb reached the top; a new climb starts from a checkpoint. */
  climbComplete:boolean;
  /** Every floor has been cleared at least once. */
  conquered:boolean;
  /** The checkpoint offered first: the segment of the saved floor, or floor 1 after a completed climb. */
  entrance:number;
}

/** Where the player stands in the tower: one rule for the tower scene, the entrance picker and the archive. */
export function braveTowerPosition(progress:BraveTowerProgress):BraveTowerPosition {
  const floor=progress.resumeFloor??BRAVE_TOWER_FLOORS,entranceFloor=progress.resumeFloor??1;
  return {
    floor,bossId:braveTowerBossId(floor),climbComplete:progress.resumeFloor===null,conquered:progress.highestCleared===BRAVE_TOWER_FLOORS,
    entrance:Math.floor((entranceFloor-1)/BRAVE_TOWER_SEGMENT)*BRAVE_TOWER_SEGMENT+1,
  };
}
