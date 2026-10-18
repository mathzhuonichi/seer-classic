// Fusion panel view builders. Every fusion rule query of the panel lives here, so the snapshot can
// serve these results instead once the controller exposes them.
import type { ItemView, MonsterView } from '../../shared/views.ts';
import {getSpeciesAcquisition} from '../../domain/acquisition/acquisition.ts';
import {FUSION_PARENT_POLICY,FUSION_RECIPES,canFuseParents,fusionBeadItemId,type FusionOutcome,type FusionRecipe} from '../../domain/recipes/fusion.ts';
import type {SpeciesName} from '../../shared/monster-views.ts';

export interface FusionRecipeRow {
  recipe:FusionRecipe;
  /** Two different owned monsters can fuse this recipe now. */
  ready:boolean;
  /** Both parent lines have at least one implemented acquisition route. */
  collectible:boolean;
}

const POLICY_TEXT={retain:'主、副精灵均保留。','consume-secondary':'保留主精灵，消耗副精灵。','consume-both':'消耗主精灵和副精灵。'} as const;
/** What fusion does with the two parents. */
export const FUSION_PARENT_POLICY_TEXT=POLICY_TEXT[FUSION_PARENT_POLICY];

const hasRoute=(species:number)=>getSpeciesAcquisition(species).status==='available';
const canFuse=(recipe:FusionRecipe,primary:MonsterView,secondary:MonsterView)=>primary.uid!==secondary.uid&&canFuseParents(recipe,primary,secondary);

export function fusionRecipeRows(monsters:readonly MonsterView[]):FusionRecipeRow[] {
  return FUSION_RECIPES.map(recipe=>({recipe,
    ready:monsters.some(primary=>recipe.primary.includes(primary.species)&&monsters.some(secondary=>canFuse(recipe,primary,secondary))),
    collectible:recipe.primary.some(hasRoute)&&recipe.secondary.some(hasRoute)}));
}

/** Search over the recipe, bead, parent and outcome names. */
export function matchesFusionSearch(recipe:FusionRecipe,search:string,name:SpeciesName):boolean {
  return !search||[recipe.name,recipe.beadName,...recipe.primary.map(name),...recipe.secondary.map(name),...recipe.outcomes.map(outcome=>name(outcome.species))]
    .some(text=>text.includes(search));
}

/** Owned monsters that fit each parent slot; the secondary list never offers the chosen primary. */
export function fusionParentChoices(recipe:FusionRecipe,monsters:readonly MonsterView[],primaryUid:string) {
  return {primary:monsters.filter(mon=>recipe.primary.includes(mon.species)),
    secondary:monsters.filter(mon=>recipe.secondary.includes(mon.species)&&mon.uid!==primaryUid)};
}

export const fusionPairValid=(recipe:FusionRecipe,primary?:MonsterView,secondary?:MonsterView)=>!!primary&&!!secondary&&canFuse(recipe,primary,secondary);

/** An outcome's share of the recipe weight, as a percent with at most two decimals. */
export function fusionChance(recipe:FusionRecipe,outcome:FusionOutcome):string {
  const total=recipe.outcomes.reduce((sum,entry)=>sum+entry.weight,0);
  return `${Number((outcome.weight/total*100).toFixed(2))}%`;
}

/** Item counts by id, taken before a fusion so that its product can be found afterwards. */
export const itemCounts=(items:readonly ItemView[]):ReadonlyMap<string,number>=>new Map(items.map(item=>[item.id,item.count]));

/** The bead one fusion produced: the outcome whose bead count rose above the counts taken before it. */
export function fusedBead(recipe:FusionRecipe,before:ReadonlyMap<string,number>,after:readonly ItemView[]) {
  const bead=(species:number)=>after.find(item=>item.id===fusionBeadItemId(species));
  const outcome=recipe.outcomes.find(entry=>(bead(entry.species)?.count??0)>(before.get(fusionBeadItemId(entry.species))??0));
  return outcome&&{species:outcome.species,name:bead(outcome.species)?.name??outcome.beadName,beadName:outcome.beadName};
}
