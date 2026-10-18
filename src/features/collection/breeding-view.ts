// Breeding panel view builders. Every breeding rule query of the panel lives here, so the snapshot can
// serve these results instead once the controller exposes them.
import type { MonsterView } from '../../shared/views.ts';
import {getSpeciesAcquisition} from '../../domain/acquisition/acquisition.ts';
import {BREEDING_RECIPES,canBreedParents,type BreedingRecipe} from '../../domain/recipes/breeding.ts';

export interface BreedingRecipeRow {
  recipe:BreedingRecipe;
  /** An owned male and female can breed this pairing now. */
  ready:boolean;
}

export function breedingRecipeRows(monsters:readonly MonsterView[]):BreedingRecipeRow[] {
  return BREEDING_RECIPES.map(recipe=>({recipe,
    ready:monsters.some(male=>recipe.maleSpecies.includes(male.species)&&monsters.some(female=>canBreedParents(recipe,male,female)))}));
}

/** Owned monsters of the pairing's male and female species. */
export function breedingParentChoices(recipe:BreedingRecipe,monsters:readonly MonsterView[]) {
  return {male:monsters.filter(mon=>recipe.maleSpecies.includes(mon.species)),female:monsters.filter(mon=>recipe.femaleSpecies.includes(mon.species))};
}

export const breedingPairValid=(recipe:BreedingRecipe,male?:MonsterView,female?:MonsterView)=>!!male&&!!female&&canBreedParents(recipe,male,female);

/** Bred offspring can never be a male parent. */
export const isBredOffspring=(mon:MonsterView)=>(mon.generation??0)>0;

/** Some parent species still lacks a normal acquisition route. */
export const breedingRoutesMissing=(recipe:BreedingRecipe)=>
  [...recipe.maleSpecies,...recipe.femaleSpecies].some(id=>getSpeciesAcquisition(id).status!=='available');

/** Whether an offspring is the pairing's own breeding form or the father's or mother's infant. */
export function breedingOutcomeLabel(recipe:BreedingRecipe,species:number):string {
  return species===recipe.offspringSpecies?'新的繁殖精灵':species===recipe.maleInitialSpecies?'父方幼体':'母方幼体';
}
