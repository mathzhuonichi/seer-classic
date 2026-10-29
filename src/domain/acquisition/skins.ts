import {FUSION_RECIPES} from '../recipes/fusion.ts';
import {ancestorsOf,buildPredecessors,type LineageSpecies} from './species-graph.ts';

export interface SkinMonster {species:number;skinSpecies?:number}
type SkinSpecies=Pick<LineageSpecies,'id'|'evolution'>;

/** A form's own form, its directed ancestors (nearest first), then, for a fusion line, its parents' highest forms. Never family-wide membership. */
export function buildSkinOptions(species:readonly SkinSpecies[]):ReadonlyMap<number,readonly number[]> {
  const predecessors=buildPredecessors(species,'evolution'),parents=fusionParentForms(species);
  return new Map(species.map(row=>[row.id,[...new Set([row.id,...ancestorsOf(row.id,predecessors),...parents.get(row.id)??[]])]]));
}

/**
 * A fusion infant that one recipe alone hatches, and every form it evolves into, may look like either parent's highest form that recipe
 * accepts (a listed form that does not evolve into another listed one). An infant several recipes share (the ordinary pairings' 卡门兔,
 * 辛克 and 伊达, and the rare 希格) has no single pair of parents and keeps its own line's skins.
 */
function fusionParentForms(species:readonly SkinSpecies[]):Map<number,Set<number>> {
  const byId=new Map(species.map(row=>[row.id,row])),forms=new Map<number,Set<number>>();
  const successors=(id:number)=>byId.get(id)!.evolution.map(edge=>edge.to).filter(to=>byId.has(to));
  /** `ids` and every catalog form they evolve into. */
  const descendants=(ids:readonly number[])=>{
    const seen=new Set(ids.filter(id=>byId.has(id))),queue=[...seen];
    for(let index=0;index<queue.length;index++)for(const to of successors(queue[index]))if(!seen.has(to)){seen.add(to);queue.push(to)}
    return [...seen];
  };
  const hatchedBy=new Map<number,number>();
  for(const recipe of FUSION_RECIPES)for(const outcome of recipe.outcomes)hatchedBy.set(outcome.species,(hatchedBy.get(outcome.species)??0)+1);
  for(const recipe of FUSION_RECIPES){
    const infants=recipe.outcomes.map(outcome=>outcome.species).filter(species=>hatchedBy.get(species)===1);
    const listed=new Set([...recipe.primary,...recipe.secondary].filter(id=>byId.has(id)));
    const finals=[...listed].filter(id=>!successors(id).some(to=>listed.has(to)));
    for(const id of descendants(infants)){
      const set=forms.get(id)??new Set<number>();
      for(const final of finals)set.add(final);
      forms.set(id,set);
    }
  }
  return forms;
}

export function appearanceSpecies(mon:SkinMonster,options:ReadonlyMap<number,readonly number[]>):number {
  return Number.isInteger(mon.skinSpecies)&&options.get(mon.species)?.includes(mon.skinSpecies!)?mon.skinSpecies!:mon.species;
}

/** Optional cosmetic corruption must not invalidate otherwise valid legacy saves. */
export function sanitizeSkin(mon:SkinMonster,options:ReadonlyMap<number,readonly number[]>):void {
  if(mon.skinSpecies===mon.species||appearanceSpecies(mon,options)!==mon.skinSpecies)delete mon.skinSpecies;
}
