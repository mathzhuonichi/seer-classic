import type {BossView, SpeciesView} from '../game-types';

/** Reuse catalog rows until their collection or challenge progress actually changes. */
export function createCatalogViews(species: Omit<SpeciesView,'owned'>[], bosses: Omit<BossView,'cleared'|'attempts'>[],decorateBoss?:(view:BossView,attempts:number)=>BossView) {
  const unowned=species.map(row=>({...row,owned:false}));
  const owned=species.map(row=>({...row,owned:true}));
  let collection:SpeciesView[]=unowned;
  let previousIds:readonly number[]|undefined,previousLength=-1;
  let previousOwned=new Set<number>();
  let challenges:BossView[]=[];
  return {
    species(ids:readonly number[]):SpeciesView[] {
      // The saved collection ledger appends in place; imports/resets replace its array.
      if(ids===previousIds&&ids.length===previousLength)return collection;
      previousIds=ids;previousLength=ids.length;
      const next=new Set(ids);
      if(next.size===previousOwned.size&&[...next].every(id=>previousOwned.has(id)))return collection;
      previousOwned=next;
      collection=species.map((row,index)=>next.has(row.id)?owned[index]:unowned[index]);
      return collection;
    },
    bosses(cleared:readonly string[],attempts:Record<string,number>):BossView[] {
      const complete=new Set(cleared);
      if(challenges.length===bosses.length&&challenges.every(row=>row.cleared===complete.has(row.id)&&row.attempts===(attempts[row.id]??0)))return challenges;
      challenges=bosses.map((row,index)=>{
        const existing=challenges[index],done=complete.has(row.id),count=attempts[row.id]??0;
        if(existing&&existing.cleared===done&&existing.attempts===count)return existing;
        const view={...row,cleared:done,attempts:count};
        return decorateBoss?decorateBoss(view,count):view;
      });
      return challenges;
    },
  };
}
