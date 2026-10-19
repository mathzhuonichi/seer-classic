import policyData from '../../../data/acquisition-policy.json';
import {WORLD_PLANETS,type WorldPlanet} from '../world/world.ts';
import {
  JOURNEY_QUEST_SPECIES,NPC_ONLY_SPECIES,type AcquisitionCatalog,type AcquisitionSpecies,type RecruitmentPrerequisite,
} from './acquisition-model.ts';
import {STARTER_SPECIES} from '../economy.ts';
import {FUSION_RECIPES} from '../recipes/fusion.ts';
import {BREEDING_RECIPES} from '../recipes/breeding.ts';
import {bossEssenceRewards,habitatEntries} from './native-acquisition.ts';
import {BRAVE_TOWER_FLOORS,braveTowerBossId} from '../challenges/brave-tower.ts';
import {buildPredecessors} from './species-graph.ts';
import {buildPaidSPTRecruitments,buildExcludedRecruitmentSpecies,getEligibleRecruitmentSPTs} from './spt-recruitment.ts';

export const MAX_RECRUITMENT_PREREQUISITES=6;
/** Policy categories whose paid, VIP or lottery offers become "collect prerequisites, then receive the essence". */
export const CONVERTED_POLICY_CATEGORIES:readonly string[]=['paid','vip','lottery'];
export interface AcquisitionPolicy {
  species:number;
  categories:readonly string[];
  repeatability:'repeatable'|'once'|'unknown';
}
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

/** Forms without a predecessor in the catalog, excluding the NPC partners, by ID. */
export function initialSpecies(catalog:Pick<AcquisitionCatalog,'species'>):AcquisitionSpecies[] {
  const predecessors=buildPredecessors(catalog.species);
  return catalog.species.filter(row=>!predecessors.get(row.id)!.size&&!NPC_ONLY_SPECIES.has(row.id)).sort((a,b)=>a.id-b.id);
}

/**
 * The top Brave Tower floor's essence ends an in-order climb through floors 61-70, whose source-level opponents stay
 * untuned, so it is not a simple normal route: its species (呆呆蛹) also receives a collection recruitment reward.
 */
const CLIMB_ONLY_ESSENCE_BOSS=braveTowerBossId(BRAVE_TOWER_FLOORS);

/** Direct habitats/rewards and native fusion/breeding retain their own acquisition flows. */
function nativeInitialRoutes(catalog:AcquisitionCatalog,planets:readonly WorldPlanet[]):Set<number> {
  const seeds=new Set<number>([...STARTER_SPECIES,...Object.values(JOURNEY_QUEST_SPECIES)]);
  for(const entry of habitatEntries(catalog,planets))seeds.add(entry.species.id);
  for(const reward of bossEssenceRewards(catalog))if(reward.boss.id!==CLIMB_ONLY_ESSENCE_BOSS)seeds.add(reward.species);
  for(const recipe of [...FUSION_RECIPES,...BREEDING_RECIPES])for(const outcome of recipe.outcomes)if(outcome.weight>0)seeds.add(outcome.species);
  return seeds;
}

/** Earlier initial forms avoid direct quest cycles; the full native dependency closure is verified separately. */
export function buildRecruitmentRewards(catalog:AcquisitionCatalog,planets:readonly WorldPlanet[]=WORLD_PLANETS,
  sourcePolicies:readonly AcquisitionPolicy[]=ACQUISITION_POLICIES):RecruitmentReward[] {
  const roots=initialSpecies(catalog),native=nativeInitialRoutes(catalog,planets);
  const excluded=buildExcludedRecruitmentSpecies(catalog),byPolicy=new Map(sourcePolicies.map(row=>[row.species,row]));
  const legacy=new Map(buildPaidSPTRecruitments(catalog).map(row=>[row.rewardSpecies,row.questId]));
  const bosses=getEligibleRecruitmentSPTs(catalog);
  return roots.filter(row=>!excluded.has(row.id)).flatMap(row=>{
    const policy=byPolicy.get(row.id);
    const converted=legacy.has(row.id)||policy?.categories.some(category=>CONVERTED_POLICY_CATEGORIES.includes(category));
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

/** Which prerequisites the owned species and cleared Bosses meet; a pass over many rewards builds the two sets once. */
export function recruitmentProgress(reward:Pick<RecruitmentReward,'prerequisites'>,owned:ReadonlySet<number>,cleared:ReadonlySet<string>){
  const complete=reward.prerequisites.map(condition=>condition.kind==='species'?owned.has(condition.species):cleared.has(condition.bossId));
  return {complete:complete.length>0&&complete.every(Boolean),completed:complete.filter(Boolean).length,total:complete.length,conditions:complete};
}
