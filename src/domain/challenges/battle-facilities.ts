import {type BossEncounter,type BossTeamMember,type Skill,type Species,type TypeData,Rng} from '../../../battle/core/src/index.ts';
import {STAB} from '../../../battle/core/src/constants.ts';
import {attackTypes} from '../../../battle/core/src/typechart.ts';
import {MAX_LEVEL} from '../../../raising/core/growth.ts';
import {MAX_EQUIPPED} from '../../../raising/core/monster.ts';
import {EV_STAT_CAP,IV_MAX} from '../../../raising/core/stats.ts';
import {PARTY_MAX} from '../../../raising/core/storage.ts';
import {STAT_KEYS} from '../../../raising/core/types.ts';
import type {CatalogData} from '../catalog/catalog.ts';
import type { BattleFacilityGroupView, BattleFacilityTeamView, BattleFacilityView } from '../../shared/views.ts';
import {NPC_ONLY_SPECIES} from '../acquisition/acquisition-model.ts';
import {isNaturalLevel,trainerSkillOrigin} from './trainer-skills.ts';
import {normalizeNpcTrainingEncounter,npcTrainingProfileView} from './npc-training.ts';
import eliteRoster from '../../../data/elite-roster.json';

const FACILITY_IDS=['random','elite','classic'];
/** Every facility fields a full party of opponents at the level cap. */
const TEAM_SIZE=PARTY_MAX,LEVEL=MAX_LEVEL;

const CLASSIC_TEAM_GROUPS:BattleFacilityGroupView[]=[
  {id:'trained',name:'特训主力',description:'雷伊完成能力与技能特训，盖亚装备一项特训特性；原形态与融合主力按强化、控场和收尾职责配合。'},
  {id:'foundation',name:'初代基础',description:'初代普通精灵独立编队，练习属性配合、控场与续航。'},
  {id:'specialist',name:'主题专精',description:'融合、龙族与闪光精灵分别组队；各有明确主题与属性弱点。'},
  {id:'legendary',name:'传说阵容',description:'传说精灵按普通培养与技能规则对战。'},
];

const baseTotal=(species:Species)=>STAT_KEYS.reduce((total,key)=>total+species.base[key],0);
const catalogSpecies=(catalog:CatalogData)=>catalog.species as unknown as Species[];
const skillMap=(catalog:CatalogData)=>new Map((catalog.skills as unknown as Skill[]).map(skill=>[skill.id,skill]));
const eliteBuilds=new Map(eliteRoster.additions.map(entry=>[entry.species,entry.build]));

/** Every collectible form is eligible, including unevolved forms and exactly BST 600. */
export function facilityPool(catalog:CatalogData,minimumBaseTotal=0):Species[] {
  return catalogSpecies(catalog).filter(species=>!NPC_ONLY_SPECIES.has(species.id)&&baseTotal(species)>=minimumBaseTotal);
}

/** Admission is explicit; authored support roles do not alter the generic BST filter. */
export function eliteFacilityPool(catalog:CatalogData):Species[] {
  return facilityPool(catalog).filter(species=>baseTotal(species)>=eliteRoster.minimumBaseTotal||eliteBuilds.has(species.id));
}

const groupOrder=(id:unknown)=>CLASSIC_TEAM_GROUPS.findIndex(group=>group.id===id);

function classicTeamView(catalog:CatalogData,raw:Record<string,unknown>,species:Map<number,Species>,skills:Map<number,Skill>):BattleFacilityTeamView {
  const encounter=raw as unknown as BossEncounter,roles=raw.team as {role?:{zh:string}}[];
  const skillView=(speciesId:number,id:number)=>{
    const origin=trainerSkillOrigin(catalog,speciesId,id);
    return {id,name:skills.get(id)?.name.zh??String(id),...(origin?.kind==='training'?{training:origin.source}:{})};
  };
  return {
    id:encounter.id,name:encounter.name?.zh??encounter.id,description:(encounter.strategy_notes as {zh?:string})?.zh??'',
    groupId:String(raw.roster_group??'foundation'),
    opponents:encounter.team.map((mon,index)=>({
      species:mon.species,name:species.get(mon.species)!.name.zh,level:mon.level,baseTotal:baseTotal(species.get(mon.species)!),
      training:npcTrainingProfileView(mon.species,mon.training_profile),
      role:roles[index].role?.zh,
      skills:mon.skills.map(id=>skillView(mon.species,id)),
    })),
  };
}

export function buildFacilityViews(catalog:CatalogData):BattleFacilityView[] {
  const species=new Map(catalogSpecies(catalog).map(mon=>[mon.id,mon])),skills=skillMap(catalog);
  const trainers=[...(catalog.trainers??[])].sort((a,b)=>
    groupOrder(a.roster_group)-groupOrder(b.roster_group)||Number(a.roster_order??0)-Number(b.roster_order??0)||String(a.id).localeCompare(String(b.id)));
  const size={opponentCount:TEAM_SIZE,level:LEVEL} as const;
  return [
    {id:'random',name:'随机竞技场',
      description:`从全部可收集形态中等概率抽取六只不同精灵，全员 Lv.${LEVEL}。每次挑战重新组队，未进化形态也可能登场。`,
      ...size,poolSize:facilityPool(catalog).length},
    {id:'elite',name:'巅峰对决',
      description:`从种族值总和至少 ${eliteRoster.minimumBaseTotal} 的精灵及 ${eliteRoster.additions.length} 只指定战术精灵中等概率抽取六只，全员 Lv.${LEVEL}。`
        +'指定精灵采用专门配招，雷伊与盖亚使用明确的特训状态。',
      ...size,poolSize:eliteFacilityPool(catalog).length},
    {id:'classic',name:'战术研究室',
      description:`按培养阶段与战术主题选择固定六人队，全员 Lv.${LEVEL}。点击队员查看职责与四个实战技能。`,
      ...size,groups:CLASSIC_TEAM_GROUPS.filter(group=>trainers.some(team=>team.roster_group===group.id)),
      teams:trainers.map(raw=>classicTeamView(catalog,raw,species,skills))},
  ];
}

// Generated-build heuristics: favour strong same-type attacks of the stronger attacking
// category, then a second attack type, a priority move and the most useful support move.
const PREFERRED_CATEGORY_BONUS=1.3,PRIORITY_SCORE=8;
const SUPPORT_SCORES:Partial<Record<string,number>>={heal:45,status:35,clear_stages:25,cure_status:15,restore_pp:10};
const STAT_BOOST_SCORES={attacking:40,other:20};

/** Select a usable ordinary learnset without an unbounded random search. */
function ordinaryMember(species:Species,skills:Map<number,Skill>,types:TypeData,eligible:(skill:Skill)=>boolean=()=>true):BossTeamMember {
  const learned=new Set((species.learnset??[]).filter(row=>isNaturalLevel(row.level)).map(row=>row.skill));
  const legal=[...learned].map(id=>skills.get(id)).filter((skill):skill is Skill=>!!skill&&eligible(skill));
  if(legal.length<MAX_EQUIPPED)throw new Error(`${species.name.zh}没有足够的常规技能。`);
  const preferred=species.base.atk>=species.base.spa?'physical':'special',attackStat=preferred==='physical'?'atk':'spa';
  const attackScore=(skill:Skill)=>skill.power*(skill.accuracy??100)/100*(skill.category===preferred?PREFERRED_CATEGORY_BONUS:1)
    *(attackTypes(types,skill.type).every(type=>species.types.includes(type))?STAB:1)+(skill.priority??0)*PRIORITY_SCORE;
  const attacks=legal.filter(skill=>skill.category!=='status'&&skill.power>0).sort((a,b)=>attackScore(b)-attackScore(a)||a.id-b.id);
  const chosen:Skill[]=[];
  const add=(skill:Skill|undefined)=>{if(skill&&!chosen.some(row=>row.id===skill.id)&&chosen.length<MAX_EQUIPPED)chosen.push(skill);};
  add(attacks[0]);
  // A second damage type reduces immunity traps; one priority move helps finishing.
  add(attacks.find(skill=>skill.type!==chosen[0]?.type));
  add(attacks.find(skill=>(skill.priority??0)>0));
  const supportScore=(skill:Skill)=>(skill.effects??[]).reduce((score,fx)=>score+(fx.op==='stat_stage'
    ?(fx.stats?.[attackStat]>0?STAT_BOOST_SCORES.attacking:STAT_BOOST_SCORES.other):SUPPORT_SCORES[fx.op]??0),0);
  const supports=legal.filter(skill=>skill.category==='status').sort((a,b)=>supportScore(b)-supportScore(a)||a.id-b.id);
  add(supports.find(skill=>supportScore(skill)>0));
  for(const skill of [...attacks,...supports,...legal])add(skill);
  return {species:species.id,level:LEVEL,iv:IV_MAX,evs:{hp:EV_STAT_CAP,[attackStat]:EV_STAT_CAP},nature:'hardy',skills:chosen.map(skill=>skill.id)};
}

/** The engine's hit count when a multi-hit effect omits it. */
const DEFAULT_HITS=2;

/** Engine multi-hit ranges that the source effect 31 does not confirm. */
function unsourcedMultiHits(skill:Skill):{min:number;max:number}[] {
  const source=skill.seer_effects as {eff:number;args:number[]}[]|undefined;
  return (skill.effects??[]).flatMap(effect=>{
    if(effect.op!=='multi_hit')return [];
    const min=effect.min??DEFAULT_HITS,max=effect.max??min;
    return source?.some(row=>row.eff===31&&row.args[0]===min&&row.args[1]===max)?[]:[{min,max}];
  });
}

/** Chosen elite roster policy, not a claim that every heal loses to a 250-HP item.
 * Keep drain attacks, regeneration and healing with an additional positive effect.
 */
function pureRecovery(skill:Skill):boolean {
  if(skill.category!=='status'||skill.power>0||!skill.effects?.length)return false;
  let heals=false;
  return skill.effects.every(effect=>{
    if(effect.op==='heal'&&(effect.target??'self')==='self'&&!effect.pct_damage_dealt&&(effect.amount>0||effect.pct_max_hp>0)){heals=true;return true;}
    if(effect.op==='script'&&effect.id==='seer_eff_201'&&effect.params?.[0]===0&&effect.params[1]>0){heals=true;return true;}
    return effect.op==='status'&&effect.target==='self'&&effect.status==='fatigue';
  })&&heals;
}

/** Generated elite builds skip unsourced fixed multi-hit moves and recovery-only moves. */
export function eliteSkillEligible(skill:Skill):boolean {
  return !unsourcedMultiHits(skill).some(hits=>hits.min===hits.max)&&!pureRecovery(skill);
}

export function eliteMember(catalog:CatalogData,species:Species,skills:Map<number,Skill>,types:TypeData):BossTeamMember {
  const build=eliteBuilds.get(species.id);
  if(!build)return ordinaryMember(species,skills,types,eliteSkillEligible);
  const invalid=(id:number)=>{
    const skill=skills.get(id);
    return !trainerSkillOrigin(catalog,species.id,id)||!skill||pureRecovery(skill)||unsourcedMultiHits(skill).length>0;
  };
  if(build.skills.length!==MAX_EQUIPPED||new Set(build.skills).size!==MAX_EQUIPPED||build.skills.some(invalid))
    throw new Error(`${species.name.zh}的巅峰配招与当前技能资料不一致。`);
  return {species:species.id,...structuredClone(build)};
}

export function createFacilityEncounter(catalog:CatalogData,facilityId:string,rng:Rng,teamId?:string):BossEncounter {
  if(!FACILITY_IDS.includes(facilityId))throw new Error('对战设施不存在。');
  if(facilityId==='classic') {
    const team=catalog.trainers?.find(row=>row.id===teamId);
    if(!team)throw new Error('请选择固定战术队伍。');
    return normalizeNpcTrainingEncounter(catalog,{...structuredClone(team) as unknown as BossEncounter,facility:facilityId});
  }
  if(teamId!==undefined)throw new Error('随机对战无需指定固定队伍。');
  const elite=facilityId==='elite',pool=elite?eliteFacilityPool(catalog):facilityPool(catalog);
  if(pool.length<TEAM_SIZE)throw new Error('对战精灵池不足六只。');
  const skills=skillMap(catalog),types=catalog.types as unknown as TypeData;
  // Partial Fisher-Yates: exactly six draws, uniform sampling without replacement.
  for(let index=0;index<TEAM_SIZE;index++) {
    const swap=rng.int(index,pool.length-1);[pool[index],pool[swap]]=[pool[swap],pool[index]];
  }
  const encounter:BossEncounter={
    id:`facility_${facilityId}`,name:{zh:elite?'巅峰对决 · 随机六人队':'随机竞技场 · 随机六人队'},category:'trainer',facility:facilityId,
    team:pool.slice(0,TEAM_SIZE).map(species=>elite?eliteMember(catalog,species,skills,types):ordinaryMember(species,skills,types)),
    rules:[{rule:'no_capture'}],win:[{kind:'ko_all'}],lose:[],phases:[],ai:{kind:'smart',allow_switch:true,style:'balanced'},reward:{items:{}},
  };
  return elite?normalizeNpcTrainingEncounter(catalog,encounter):encounter;
}
