import definitions from '../../../data/npc-training-profiles.json';
import {computeStats} from '../../../battle/core/src/stats.ts';
import type {BossEncounter,Nature,Species,Stats} from '../../../battle/core/src/types.ts';
import {MAX_LEVEL} from '../../../raising/core/growth.ts';
import {STAT_KEYS} from '../../../raising/core/types.ts';
import type {CatalogData} from '../catalog/catalog.ts';

interface NpcTrainingProfile {
  id:string;species:number;label:string;description:string;kind:string;expectedBase:Stats;
  statBonus?:Partial<Stats>;equivalentBaseTotal?:number;script?:string;
}
export interface NpcTrainingProfileView {id:string;label:string;description:string;equivalentBaseTotal?:number;statBonus?:Partial<Stats>}
type Member=BossEncounter['team'][number];

const profiles=new Map((definitions.profiles as NpcTrainingProfile[]).map(profile=>[profile.id,profile]));
const scriptIds=new Set(definitions.profiles.flatMap(profile=>'script' in profile?[profile.script]:[]));
const sameStats=(a:Stats,b:Stats)=>STAT_KEYS.every(key=>a[key]===b[key]);
/** Member fields that would stack another strengthening on top of the training. */
const EXCLUSIVE_FIELDS=['hp_override','stat_multipliers','beads','member_phases','types'] as const;

function profileOf(species:number,id:string):NpcTrainingProfile {
  const profile=profiles.get(id);
  if(!profile||profile.species!==species)throw new Error('NPC training profile does not match this species.');
  return profile;
}

/** The ID is persisted in the authored encounter, never inferred from learned moves. */
export function npcTrainingProfileView(species:number,id?:string):NpcTrainingProfileView|undefined {
  if(id===undefined)return undefined;
  const profile=profileOf(species,id);
  return {id:profile.id,label:profile.label,description:profile.description,
    ...(profile.equivalentBaseTotal!==undefined?{equivalentBaseTotal:profile.equivalentBaseTotal}:{}),
    ...(profile.statBonus?{statBonus:{...profile.statBonus}}:{})};
}

/** Only elite facility members and the trained classic group may carry training. */
const trainingAllowed=(encounter:BossEncounter)=>encounter.category==='trainer'&&(encounter.facility==='elite'||
  ((encounter.facility===undefined||encounter.facility==='classic')&&encounter.roster_group==='trained'));

/** Applies the member's profile in place: its final stats and its one member rule. */
function applyTraining(catalog:CatalogData,member:Member,allowed:boolean):void {
  if(member.training_profile===undefined) {
    if((member.member_rules??[]).some(rule=>rule.rule==='script'&&scriptIds.has(rule.id)))
      throw new Error('NPC training rules require an explicit training profile.');
    return;
  }
  if(!allowed)throw new Error('NPC training is not available in this encounter context.');
  const profile=profileOf(member.species,member.training_profile);
  const species=catalog.species.find(row=>row.id===member.species) as unknown as Species|undefined;
  const nature=catalog.natures.find(row=>row.id===member.nature) as unknown as Nature|undefined;
  if(!species||!sameStats(species.base,profile.expectedBase))throw new Error('NPC training source base-stat pin no longer matches the catalog.');
  if(member.level!==MAX_LEVEL||!nature||nature.plus!==nature.minus)throw new Error('NPC training requires level 100 and a neutral nature.');
  for(const field of EXCLUSIVE_FIELDS)if(member[field]!==undefined)throw new Error(`NPC training cannot combine with ${field}.`);
  const expected=computeStats(species.base,member.level,member.iv??0,member.evs??{},nature);
  if(profile.statBonus)for(const key of STAT_KEYS)expected[key]+=profile.statBonus[key]??0;
  if(member.stats&&!sameStats(member.stats,expected))throw new Error('NPC training cannot combine with unrelated precomputed stats.');
  if(profile.statBonus)member.stats=expected;
  const expectedRule=profile.script?{rule:'script',id:profile.script}:undefined;
  if((member.member_rules??[]).some(rule=>!expectedRule||JSON.stringify(rule)!==JSON.stringify(expectedRule)))
    throw new Error('NPC training cannot stack another member rule or seal.');
  if(expectedRule)member.member_rules=[expectedRule];
}

/** Normalize only explicitly marked high-difficulty NPCs; the catalog stays immutable. */
export function normalizeNpcTrainingEncounter(catalog:CatalogData,encounter:BossEncounter):BossEncounter {
  const copy=structuredClone(encounter),allowed=trainingAllowed(copy);
  for(const member of copy.team)applyTraining(catalog,member,allowed);
  if((copy.rules??[]).some(rule=>rule.rule==='script'&&scriptIds.has(rule.id)))
    throw new Error('NPC training must belong to one member, never the whole team.');
  return copy;
}
