import type {Skill,Species,TypeData} from '../../../battle/core/src/index.ts';
import type {CatalogData} from '../catalog/catalog.ts';
import {eliteMember} from '../challenges/battle-facilities.ts';

/** The elite build models every opposing species in all trainer facilities.
 * It is knowledge of the mode's convention, never of the player's real loadout.
 */
export function conventionalMovesResolver(catalog:CatalogData):(speciesId:number)=>number[] {
  const species=new Map((catalog.species as unknown as Species[]).map(mon=>[mon.id,mon]));
  const skills=new Map((catalog.skills as unknown as Skill[]).map(skill=>[skill.id,skill]));
  const cache=new Map<number,number[]>();
  return speciesId=>{
    let moves=cache.get(speciesId);
    if(!moves) {
      const mon=species.get(speciesId);
      try {moves=mon?eliteMember(catalog,mon,skills,catalog.types as unknown as TypeData).skills:[];}
      // Fewer than four eligible moves: model the strongest legal ones that exist.
      catch {moves=[...new Set((mon?.learnset??[]).map(row=>row.skill))].map(id=>skills.get(id)).filter((skill):skill is Skill=>!!skill)
        .sort((a,b)=>b.power-a.power||a.id-b.id).slice(0,4).map(skill=>skill.id);}
      cache.set(speciesId,moves);
    }
    return [...moves];
  };
}
