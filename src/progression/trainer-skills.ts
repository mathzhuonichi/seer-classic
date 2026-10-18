import type {CatalogData} from '../mechanics/catalog.ts';

export interface TrainerSkillOrigin {kind:'level'|'training';source?:string}

/** NPC training uses the same explicit species/skill rewards available to players. */
export function trainerSkillOrigin(catalog:CatalogData,speciesId:number,skillId:number):TrainerSkillOrigin|undefined {
  if(!catalog.skills.some(row=>row.id===skillId))return undefined;
  const species=catalog.species.find(row=>row.id===speciesId);
  const learnset=species?.learnset as {level:number|null;skill:number}[]|undefined;
  if(learnset?.some(row=>row.skill===skillId&&typeof row.level==='number'&&Number.isInteger(row.level)&&row.level>=1&&row.level<=100))return {kind:'level'};
  const training=catalog.bosses.find(encounter=>{
    const reward=encounter.reward as {learn_skill?:{species:number;skill:number}}|undefined;
    return reward?.learn_skill?.species===speciesId&&reward.learn_skill.skill===skillId;
  });
  return training?{kind:'training',source:(training.name as {zh?:string})?.zh??String(training.id)}:undefined;
}
