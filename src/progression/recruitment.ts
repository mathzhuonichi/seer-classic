import policyData from '../../data/acquisition-policy.json';
import {WORLD_PLANETS,type WorldPlanet} from '../world';
import {FUSION_RECIPES} from './fusion';
import {BREEDING_RECIPES} from './breeding';
import {CHALLENGE_CAMPAIGNS} from './challenge-campaigns';
import {buildPaidSPTRecruitments,buildExcludedRecruitmentSpecies,getEligibleRecruitmentSPTs} from './spt-recruitment';

export const MAX_RECRUITMENT_PREREQUISITES=6;
export interface AcquisitionPolicy {
  species:number;
  categories:readonly string[];
  repeatability:'repeatable'|'once'|'unknown';
}
export interface RecruitmentSpecies {
  id:number;name:{zh:string};types?:readonly string[];obtain?:readonly string[];catch_rate?:number;
  evolves_from?:number|null;evolution:readonly {to:number;method?:string;level?:number}[];
}
export interface RecruitmentBoss {
  id:string;name?:{zh:string};category?:string;team:{species:number}[];reward_hatches?:number;
  reward?:{monster?:{species:number};items?:Record<string,number>;learn_skill?:unknown};
}
export interface RecruitmentCatalog {species:readonly RecruitmentSpecies[];bosses:readonly RecruitmentBoss[];items?:readonly {id:string;kind?:string;hatches?:number}[]}
export type RecruitmentPrerequisite={kind:'species';species:number}|{kind:'boss';bossId:string};
export interface RecruitmentReward {
  questId:string;rewardSpecies:number;name:string;itemId:string;
  prerequisites:readonly RecruitmentPrerequisite[];repeatable:boolean;
  repeatability:'repeatable'|'once'|'unknown';categories:readonly string[];
}
export const ACQUISITION_POLICIES=policyData.species as readonly AcquisitionPolicy[];
const policies=new Map(ACQUISITION_POLICIES.map(row=>[row.species,row]));

/** Unknown historical limits use the bounded-repeat remake rule, without historical claims. */
export function isSpeciesRepeatable(species:number):boolean {return policies.get(species)?.repeatability!=='once';}
export function recruitmentItemId(species:number):string {return `essence_collection_${species}`;}

export function initialSpecies(catalog:Pick<RecruitmentCatalog,'species'>):RecruitmentSpecies[] {
  const ids=new Set(catalog.species.map(row=>row.id));
  const children=new Set(catalog.species.flatMap(row=>row.evolution.map(edge=>edge.to)));
  return catalog.species.filter(row=>!(row.evolves_from&&ids.has(row.evolves_from))&&!children.has(row.id)&&![122,123,124,125].includes(row.id)).sort((a,b)=>a.id-b.id);
}

/** Direct habitats/rewards and native fusion/breeding retain their own acquisition flows. */
function nativeInitialRoutes(catalog:RecruitmentCatalog,planets:readonly WorldPlanet[]):Set<number> {
  const species=new Map(catalog.species.map(row=>[row.id,row]));
  const seeds=new Set([1,4,7,10,13]);
  const redirect=new Set(catalog.bosses.filter(boss=>!boss.id.includes('tower')&&!boss.id.includes('dark_door')).flatMap(boss=>boss.team.map(mon=>mon.species)));
  for(const planet of planets)for(const region of planet.regions)for(const id of region.creatures){
    const row=species.get(id);
    if(region.recruitmentSpecies?.includes(id))continue;
    if(row&&!redirect.has(id)&&((row.obtain?.includes('wild')&&(row.catch_rate??0)>0)||region.creatureLevels?.[id]))seeds.add(id);
  }
  const items=new Map((catalog.items??[]).filter(item=>item.kind==='essence').map(item=>[item.id,item.hatches]));
  for(const boss of catalog.bosses){
    const campaign=CHALLENGE_CAMPAIGNS.find(row=>row.stages.some(stage=>stage.bossIds.includes(boss.id)));
    const intermediate=campaign&&!campaign.stages.at(-1)!.bossIds.includes(boss.id);
    const explicit=Object.keys(boss.reward?.items??{}).filter(id=>id.startsWith('essence_'));
    if(!explicit.length&&(intermediate||boss.reward?.learn_skill||boss.id==='boss_tower_brave_mystery'))continue;
    const fallback=boss.reward_hatches??boss.reward?.monster?.species??boss.team.at(-1)?.species;
    for(const id of explicit.length?explicit:[`essence_${boss.id}`]){
      const target=items.get(id)??fallback;if(target!==undefined){seeds.add(target);items.set(id,target);}
    }
  }
  for(const recipe of [...FUSION_RECIPES,...BREEDING_RECIPES])for(const outcome of recipe.outcomes)if(outcome.weight>0)seeds.add(outcome.species);
  return seeds;
}

/** Earlier initial forms avoid direct quest cycles; the full native dependency closure is verified separately. */
export function buildRecruitmentRewards(catalog:RecruitmentCatalog,planets:readonly WorldPlanet[]=WORLD_PLANETS,sourcePolicies:readonly AcquisitionPolicy[]=ACQUISITION_POLICIES):RecruitmentReward[] {
  const roots=initialSpecies(catalog),native=nativeInitialRoutes(catalog,planets);
  const excluded=buildExcludedRecruitmentSpecies(catalog),byPolicy=new Map(sourcePolicies.map(row=>[row.species,row]));
  const legacy=new Map(buildPaidSPTRecruitments(catalog).map(row=>[row.rewardSpecies,row.questId]));
  const bosses=getEligibleRecruitmentSPTs(catalog);
  return roots.filter(row=>!excluded.has(row.id)).flatMap(row=>{
    const policy=byPolicy.get(row.id);
    const converted=legacy.has(row.id)||policy?.categories.some(category=>['paid','vip','lottery'].includes(category));
    if(native.has(row.id)&&!converted)return [];
    const earlier=roots.filter(candidate=>candidate.id<row.id&&!excluded.has(candidate.id));
    const sameType=earlier.filter(candidate=>candidate.types?.some(type=>row.types?.includes(type)));
    const selected=[...new Map([...sameType.slice(-2),...earlier.slice(-3)].map(candidate=>[candidate.id,candidate])).values()].slice(0,3);
    if(!selected.length)return [];
    const requiredBosses=bosses.filter(boss=>boss.team[0].species<row.id).slice(converted?-2:-1);
    const prerequisites:RecruitmentPrerequisite[]=[...selected.map(candidate=>({kind:'species' as const,species:candidate.id})),...requiredBosses.map(boss=>({kind:'boss' as const,bossId:boss.id}))];
    if(prerequisites.length>MAX_RECRUITMENT_PREREQUISITES)throw new Error(`Too many recruitment prerequisites for ${row.id}`);
    const repeatability=policy?.repeatability??'unknown';
    return [{questId:legacy.get(row.id)??`collection-recruitment-${row.id}`,rewardSpecies:row.id,name:row.name.zh,itemId:recruitmentItemId(row.id),prerequisites,repeatable:repeatability!=='once',repeatability,categories:policy?.categories??[]}];
  });
}

export function recruitmentProgress(reward:Pick<RecruitmentReward,'prerequisites'>,ownedSpecies:readonly number[]|ReadonlySet<number>,clearedBosses:readonly string[]|ReadonlySet<string>){
  const owned=new Set(ownedSpecies),cleared=new Set(clearedBosses);
  const complete=reward.prerequisites.map(condition=>condition.kind==='species'?owned.has(condition.species):cleared.has(condition.bossId));
  return {complete:complete.length>0&&complete.every(Boolean),completed:complete.filter(Boolean).length,total:complete.length,conditions:complete};
}
