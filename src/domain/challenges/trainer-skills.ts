import {MAX_LEVEL} from '../../../raising/core/growth.ts';
import type {CatalogData} from '../catalog/catalog.ts';

export interface TrainerSkillOrigin {kind:'level'|'training';source?:string}

/** A learnset level an ordinary monster reaches by levelling up to the cap. */
export const isNaturalLevel=(level:unknown):boolean=>Number.isInteger(level)&&(level as number)>=1&&(level as number)<=MAX_LEVEL;

/** NPC training uses the same explicit species/skill rewards available to players. */
export function trainerSkillOrigin(catalog:CatalogData,speciesId:number,skillId:number):TrainerSkillOrigin|undefined {
  if(!catalog.skills.some(row=>row.id===skillId))return undefined;
  const learnset=catalog.species.find(row=>row.id===speciesId)?.learnset as {level:unknown;skill:number}[]|undefined;
  if(learnset?.some(row=>row.skill===skillId&&isNaturalLevel(row.level)))return {kind:'level'};
  const training=catalog.bosses.find(encounter=>{
    const learn=(encounter.reward as {learn_skill?:{species:number;skill:number}}|undefined)?.learn_skill;
    return learn?.species===speciesId&&learn.skill===skillId;
  });
  return training?{kind:'training',source:(training.name as {zh?:string})?.zh??String(training.id)}:undefined;
}
