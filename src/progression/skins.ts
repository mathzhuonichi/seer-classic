export interface SkinSpecies {id:number;evolution:readonly {to:number}[]}
export interface SkinMonster {species:number;skinSpecies?:number}

/** Appearance permission follows executable directed ancestry, never family-wide membership. */
export function buildSkinOptions(species:readonly SkinSpecies[]):ReadonlyMap<number,readonly number[]> {
  const parents=new Map(species.map(row=>[row.id,new Set<number>()]));
  for(const row of species)for(const edge of row.evolution)parents.get(edge.to)?.add(row.id);
  return new Map(species.map(row=>{
    const choices=new Set([row.id]),queue=[...parents.get(row.id)!];
    for(let index=0;index<queue.length;index++){
      const id=queue[index];if(choices.has(id))continue;
      choices.add(id);queue.push(...parents.get(id)!);
    }
    return [row.id,[...choices]];
  }));
}

export function appearanceSpecies(mon:SkinMonster,options:ReadonlyMap<number,readonly number[]>):number {
  return Number.isInteger(mon.skinSpecies)&&options.get(mon.species)?.includes(mon.skinSpecies!)?mon.skinSpecies!:mon.species;
}

/** Optional cosmetic corruption must not invalidate otherwise valid legacy saves. */
export function sanitizeSkin(mon:SkinMonster,options:ReadonlyMap<number,readonly number[]>):void {
  if(mon.skinSpecies===mon.species||appearanceSpecies(mon,options)!==mon.skinSpecies)delete mon.skinSpecies;
}
