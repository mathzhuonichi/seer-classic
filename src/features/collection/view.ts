// Snapshot views of the collection: how to collect each species, and the fusion and breeding recipes.
import type { Monster } from '../../../raising/core/index.ts';
import type { AcquisitionRoute } from '../../domain/acquisition/acquisition-model.ts';
import type { InitialEvolutionStep } from '../../domain/acquisition/initial-acquisition.ts';
import { BREEDING_RECIPES, canBreedParents, type BreedingRecipe } from '../../domain/recipes/breeding.ts';
import { FUSION_RECIPES, canFuseParents, type FusionRecipe } from '../../domain/recipes/fusion.ts';
import type { SpeciesView } from '../../shared/views.ts';
import type { GameContext } from '../../kernel/api.ts';

interface DexInitialFormView { species: number; name: string; routes: AcquisitionRoute[]; evolution?: string }
/** How to collect one species: its family, then each initial form's routes and the evolutions that follow. */
export interface DexEntryView {
  /** Family progress and members; absent for a species outside every family. */
  family?: { summary: string; members: string };
  /** NPC partners show only their story description and no initial-form routes. */
  npc: boolean;
  description: string;
  initialForms: DexInitialFormView[];
}
/** Every species' entry, the owned forms, and the families whose every collectible form is owned; NPC families never count. */
export interface DexView { entries: Readonly<Record<number, DexEntryView>>; ownedForms: number; completeFamilies: number; collectibleFamilies: number }
/** The owned `[first, second]` parent uids a recipe accepts now. */
export type ParentPairs = readonly (readonly [string, string])[];
/** `collectible`: both parent lines have an implemented acquisition route. */
export interface FusionRecipeRow { recipe: FusionRecipe; pairs: ParentPairs; collectible: boolean }
/** `routesMissing`: some parent species still lacks a normal acquisition route. */
export interface BreedingRecipeRow { recipe: BreedingRecipe; pairs: ParentPairs; routesMissing: boolean }

function evolutionStepText(step: InitialEvolutionStep, name: (id: number) => string): string {
  const how = step.implemented ? `（Lv.${step.level}${step.automatic === false ? '，在精灵养成中确认' : ''}）` : '（进化方式尚未实现）';
  return `${name(step.from)} → ${name(step.to)}${how}`;
}

function dexEntry(ctx: GameContext, id: number): DexEntryView {
  const { index, familyBySpecies, initialForms } = ctx.acquisition, name = ctx.speciesName;
  const family = familyBySpecies.get(id), acquisition = index.get(id)!, npc = acquisition.status === 'npc';
  return {
    family: family && {
      summary: family.status === 'npc' ? '剧情展示家族 · 不计入收集目标'
        : `${family.name}家族 · ${family.availableSpecies.length} / ${family.memberIds.length - family.excludedSpecies.length} 个可收集形态已有路线`,
      members: family.memberIds.map(name).join('、'),
    },
    npc,
    description: npc ? acquisition.description : '获取入口统一前往初始形态，再按进化条件培养。',
    initialForms: npc ? [] : initialForms.get(id)!.initialForms.map(form => ({
      species: form.species, name: form.name, routes: form.routes,
      evolution: form.evolutionPath.length ? form.evolutionPath.map(step => evolutionStepText(step, name)).join('；') : undefined,
    })),
  };
}

/** The dex: entries built once per game, progress recounted when the owned forms change. */
export function dexViews(ctx: GameContext): (species: readonly SpeciesView[]) => DexView {
  const entries = Object.fromEntries(ctx.catalog.species.map(row => [Number(row.id), dexEntry(ctx, Number(row.id))]));
  const families = ctx.acquisition.families.filter(family => family.status !== 'npc');
  let counted: readonly SpeciesView[] | undefined, view: DexView;
  return species => {
    if (species === counted) return view;
    counted = species;
    const owned = new Set(species.filter(row => row.owned).map(row => row.id));
    const completeFamilies = families.filter(family => family.memberIds.every(id => family.excludedSpecies.includes(id) || owned.has(id))).length;
    return view = { entries, ownedForms: owned.size, completeFamilies, collectibleFamilies: families.length };
  };
}

function parentPairs(storage: readonly Monster[], first: readonly number[], second: readonly number[], accepts: (a: Monster, b: Monster) => boolean) {
  const seconds = storage.filter(mon => second.includes(mon.species));
  return storage.filter(mon => first.includes(mon.species)).flatMap(a => seconds.filter(b => accepts(a, b)).map(b => [a.uid, b.uid] as const));
}

/**
 * Fusion and breeding recipes with the owned parent pairs each accepts, rebuilt only when a parent field the rules read changes:
 * the storage order and each monster's uid, species, level and generation.
 */
export function recipeViews(ctx: GameContext) {
  const available = (id: number) => ctx.acquisition.index.get(id)?.status === 'available';
  const fusion = FUSION_RECIPES.map(recipe => ({ recipe, collectible: recipe.primary.some(available) && recipe.secondary.some(available) }));
  const breeding = BREEDING_RECIPES.map(recipe => ({ recipe, routesMissing: ![...recipe.maleSpecies, ...recipe.femaleSpecies].every(available) }));
  let parents = '', views: { fusion: { recipes: FusionRecipeRow[] }; breeding: { recipes: BreedingRecipeRow[] } };
  return (storage: readonly Monster[]) => {
    const next = JSON.stringify(storage.map(mon => [mon.uid, mon.species, mon.level, mon.generation ?? 0]));
    if (next === parents) return views;
    parents = next;
    return views = {
      fusion: { recipes: fusion.map((row): FusionRecipeRow => ({ ...row,
        pairs: parentPairs(storage, row.recipe.primary, row.recipe.secondary, (a, b) => a.uid !== b.uid && canFuseParents(row.recipe, a, b)) })) },
      breeding: { recipes: breeding.map((row): BreedingRecipeRow => ({ ...row,
        pairs: parentPairs(storage, row.recipe.maleSpecies, row.recipe.femaleSpecies, (a, b) => canBreedParents(row.recipe, a, b)) })) },
    };
  };
}
