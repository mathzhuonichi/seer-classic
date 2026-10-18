// Dex panel view builders. Every acquisition query of the panel lives here; they still read the
// import-time acquisition index, so the snapshot can serve these results once that index takes the catalog.
import type { SpeciesView } from '../../shared/views.ts';
import {getAcquisitionFamilies,getAcquisitionFamily,getInitialFormAcquisition,getSpeciesAcquisition,type AcquisitionRoute} from '../../domain/acquisition/acquisition.ts';
import type {InitialEvolutionStep} from '../../domain/acquisition/initial-acquisition.ts';
import type {SpeciesName} from '../../shared/creature-art.ts';
import {ALL_ELEMENTS,matchesElement} from '../../shared/element-types.ts';

export const DEX_PAGE_SIZE=16;
/** A base stat this high fills its distribution bar. */
export const BASE_STAT_BAR_MAX=255;
export const DEX_OWNED_FILTERS=['全部精灵','已收集','未收集'] as const;

export interface DexFilter {search:string;type:string;owned:typeof DEX_OWNED_FILTERS[number]}
export interface DexInitialFormView {species:number;name:string;routes:AcquisitionRoute[];evolution?:string}
export interface DexAcquisitionView {
  /** Family progress and members; absent for a species outside every family. */
  family?:{summary:string;members:string};
  /** NPC partners show only their story description and no initial-form routes. */
  npc:boolean;
  description:string;
  initialForms:DexInitialFormView[];
}

/** The unfiltered index, or one searched for a focused species. */
export const dexFilter=(focusSpecies?:number):DexFilter=>({search:focusSpecies===undefined?'':String(focusSpecies),type:ALL_ELEMENTS,owned:'全部精灵'});

export function filterDex(species:readonly SpeciesView[],{search,type,owned}:DexFilter):SpeciesView[] {
  return species.filter(sp=>`${sp.id} ${sp.name}`.includes(search)&&matchesElement(sp.types,type)&&(owned==='全部精灵'||(owned==='已收集')===sp.owned));
}

/** Owned forms, and families whose every collectible form is owned; NPC families never count. */
export function dexCollectionSummary(species:readonly SpeciesView[]) {
  const owned=new Set(species.filter(sp=>sp.owned).map(sp=>sp.id));
  const families=getAcquisitionFamilies().filter(family=>family.status!=='npc');
  const complete=families.filter(family=>family.memberIds.every(id=>family.excludedSpecies.includes(id)||owned.has(id)));
  return {ownedForms:owned.size,completeFamilies:complete.length,collectibleFamilies:families.length};
}

/** How to collect a species: its family, then each initial form's routes and the evolutions that follow. */
export function dexAcquisitionView(speciesId:number,name:SpeciesName):DexAcquisitionView {
  const family=getAcquisitionFamily(speciesId),acquisition=getSpeciesAcquisition(speciesId),npc=acquisition.status==='npc';
  return {
    family:family&&{
      summary:family.status==='npc'?'剧情展示家族 · 不计入收集目标'
        :`${family.name}家族 · ${family.availableSpecies.length} / ${family.memberIds.length-family.excludedSpecies.length} 个可收集形态已有路线`,
      members:family.memberIds.map(name).join('、'),
    },
    npc,
    description:npc?acquisition.description:'获取入口统一前往初始形态，再按进化条件培养。',
    initialForms:npc?[]:(getInitialFormAcquisition(speciesId)?.initialForms??[]).map(form=>({
      species:form.species,name:form.name,routes:form.routes,
      evolution:form.evolutionPath.length?form.evolutionPath.map(step=>evolutionStepText(step,name)).join('；'):undefined,
    })),
  };
}

/** Button text for travelling to one route of an initial form. */
export function routeActionLabel(route:AcquisitionRoute):string {
  if(route.breedingRecipeId)return '前往初始形态繁殖';
  if(route.fusionRecipeId)return '前往初始形态融合';
  if(route.campaignId)return '前往初始形态阶段挑战';
  if(route.bossId)return '前往初始形态挑战';
  if(route.questId)return '查看初始形态任务';
  return route.kind==='starter'?'查看初始伙伴':'前往初始形态栖息地';
}

function evolutionStepText(step:InitialEvolutionStep,name:SpeciesName):string {
  const how=step.implemented?`（Lv.${step.level}${step.automatic===false?'，在精灵养成中确认':''}）`:'（进化方式尚未实现）';
  return `${name(step.from)} → ${name(step.to)}${how}`;
}
