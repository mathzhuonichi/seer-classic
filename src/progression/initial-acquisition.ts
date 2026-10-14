import type {AcquisitionCatalog, AcquisitionRoute, SpeciesAcquisition} from './acquisition';

export interface InitialEvolutionStep {
  from:number;
  to:number;
  /** A source ancestry relationship alone never supplies an executable transformation. */
  implemented:boolean;
  level?:number;
  automatic?:boolean;
}
export interface InitialFormEntry {
  species:number;
  name:string;
  routes:AcquisitionRoute[];
  evolutionPath:InitialEvolutionStep[];
}
export interface InitialFormAcquisition {
  initialForms:InitialFormEntry[];
  excluded:boolean;
}

/** Only directed ancestors can supply an initial entry; siblings and adult rewards cannot. */
export function buildInitialFormAcquisitionIndex(catalog:AcquisitionCatalog, acquisition:Map<number,SpeciesAcquisition>):Map<number,InitialFormAcquisition> {
  const definitions=new Map(catalog.species.map(species=>[species.id,species]));
  const predecessors=new Map(catalog.species.map(species=>[species.id,new Set<number>()]));
  for(const species of catalog.species){
    if(species.evolves_from&&definitions.has(species.evolves_from))predecessors.get(species.id)!.add(species.evolves_from);
    for(const edge of species.evolution)if(definitions.has(edge.to))predecessors.get(edge.to)!.add(species.id);
  }
  return new Map(catalog.species.map(species=>{
    const excluded=acquisition.get(species.id)?.status==='npc';
    const initialForms:InitialFormEntry[]=[];
    const queue=[{id:species.id,path:[] as InitialEvolutionStep[]}],visited=new Set<number>();
    // Breadth-first traversal retains the shortest directed path to each ancestor root.
    for(let cursor=0;cursor<queue.length;cursor++){
      const current=queue[cursor];if(visited.has(current.id))continue;visited.add(current.id);
      const previous=predecessors.get(current.id)!;
      if(!previous.size){
        const root=definitions.get(current.id)!;
        initialForms.push({species:root.id,name:root.name.zh,
          routes:excluded?[]:(acquisition.get(root.id)?.routes??[]).filter(route=>route.kind!=='evolution'&&route.entrySpecies===root.id),
          evolutionPath:current.path});
      }
      for(const from of previous){
        const edge=definitions.get(from)!.evolution.find(edge=>edge.to===current.id&&edge.method==='level'&&edge.level!==undefined&&edge.level<=100);
        const step:InitialEvolutionStep={from,to:current.id,implemented:!!edge,...(edge?{level:edge.level,automatic:edge.automatic}:{})};
        queue.push({id:from,path:[step,...current.path]});
      }
    }
    return [species.id,{initialForms,excluded}] as const;
  }));
}
