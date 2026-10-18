import {type BossEncounter,type BossTeamMember,type Skill,type Species,type TypeData,Rng} from '../../battle/core/src/index.ts';
import {attackTypes} from '../../battle/core/src/typechart.ts';
import type {CatalogData} from '../mechanics/catalog.ts';
import type {BattleFacilityView,BattleFacilityGroupView} from '../game-types.ts';
import {NPC_ONLY_SPECIES} from './acquisition.ts';
import {trainerSkillOrigin} from './trainer-skills.ts';
import {normalizeNpcTrainingEncounter,npcTrainingProfileView} from './npc-training.ts';
import eliteRoster from '../../data/elite-roster.json';

export const CLASSIC_TEAM_GROUPS:BattleFacilityGroupView[]=[
  {id:'trained',name:'特训主力',description:'雷伊完成能力与技能特训，盖亚装备一项特训特性；原形态与融合主力按强化、控场和收尾职责配合。'},
  {id:'foundation',name:'初代基础',description:'初代普通精灵独立编队，练习属性配合、控场与续航。'},
  {id:'specialist',name:'主题专精',description:'融合、龙族与闪光精灵分别组队；各有明确主题与属性弱点。'},
  {id:'legendary',name:'传说阵容',description:'传说精灵按普通培养与技能规则对战。'},
];

const stats=['hp','atk','def','spa','spd','spe'] as const;
const baseTotal=(species:Species)=>stats.reduce((total,key)=>total+species.base[key],0);
const eliteBuilds=new Map(eliteRoster.additions.map(entry=>[entry.species,entry.build]));

/** Every collectible form is eligible, including unevolved forms and exactly BST 600. */
export function facilityPool(catalog:CatalogData,minimumBaseTotal=0):Species[] {
  return (catalog.species as unknown as Species[]).filter(species=>!NPC_ONLY_SPECIES.has(species.id)&&baseTotal(species)>=minimumBaseTotal);
}

/** Admission is explicit; authored support roles do not alter the generic BST filter. */
export function eliteFacilityPool(catalog:CatalogData):Species[] {
  return facilityPool(catalog).filter(species=>baseTotal(species)>=eliteRoster.minimumBaseTotal||eliteBuilds.has(species.id));
}

export function buildFacilityViews(catalog:CatalogData):BattleFacilityView[] {
  const species=new Map((catalog.species as unknown as Species[]).map(mon=>[mon.id,mon]));
  const skills=new Map((catalog.skills as unknown as Skill[]).map(skill=>[skill.id,skill]));
  const trainers=[...(catalog.trainers??[])].sort((a,b)=>
    CLASSIC_TEAM_GROUPS.findIndex(group=>group.id===a.roster_group)-CLASSIC_TEAM_GROUPS.findIndex(group=>group.id===b.roster_group)||
    Number(a.roster_order??0)-Number(b.roster_order??0)||String(a.id).localeCompare(String(b.id)));
  return [
    {id:'random',name:'随机竞技场',description:'从全部可收集形态中等概率抽取六只不同精灵，全员 Lv.100。每次挑战重新组队，未进化形态也可能登场。',opponentCount:6,level:100,poolSize:facilityPool(catalog).length},
    {id:'elite',name:'巅峰对决',description:`从种族值总和至少 600 的精灵及 ${eliteRoster.additions.length} 只指定战术精灵中等概率抽取六只，全员 Lv.100。指定精灵采用专门配招，雷伊与盖亚使用明确的特训状态。`,opponentCount:6,level:100,poolSize:eliteFacilityPool(catalog).length},
    {id:'classic',name:'战术研究室',description:'按培养阶段与战术主题选择固定六人队，全员 Lv.100。点击队员查看职责与四个实战技能。',opponentCount:6,level:100,groups:CLASSIC_TEAM_GROUPS.filter(group=>trainers.some(team=>team.roster_group===group.id)),teams:trainers.map(raw=>{
      const encounter=raw as unknown as BossEncounter;
      return {id:encounter.id,name:encounter.name?.zh??encounter.id,description:(encounter.strategy_notes as {zh?:string})?.zh??'',groupId:String(raw.roster_group??'foundation'),opponents:encounter.team.map((mon,index)=>({
        species:mon.species,name:species.get(mon.species)!.name.zh,level:mon.level,baseTotal:baseTotal(species.get(mon.species)!),
        training:npcTrainingProfileView(mon.species,mon.training_profile),
        role:((raw.team as {role?:{zh:string}}[])[index].role)?.zh,
        skills:mon.skills.map(id=>{const origin=trainerSkillOrigin(catalog,mon.species,id);return {id,name:skills.get(id)?.name.zh??String(id),...(origin?.kind==='training'?{training:origin.source}:{} )};}),
      }))};
    })},
  ];
}

/** Select a usable ordinary learnset without an unbounded random search. */
function ordinaryMember(species:Species,skills:Map<number,Skill>,types:TypeData,eligible:(skill:Skill)=>boolean=()=>true):BossTeamMember {
  const legal=[...new Set((species.learnset??[]).filter(row=>Number.isInteger(row.level)&&row.level>=1&&row.level<=100).map(row=>row.skill))].map(id=>skills.get(id)).filter((skill):skill is Skill=>!!skill&&eligible(skill));
  if(legal.length<4)throw new Error(`${species.name.zh}没有足够的常规技能。`);
  const preferred=species.base.atk>=species.base.spa?'physical':'special';
  const attackScore=(skill:Skill)=>skill.power*(skill.accuracy??100)/100*(skill.category===preferred?1.3:1)*(attackTypes(types,skill.type).every(type=>species.types.includes(type))?1.5:1)+(skill.priority??0)*8;
  const attacks=legal.filter(skill=>skill.category!=='status'&&skill.power>0).sort((a,b)=>attackScore(b)-attackScore(a)||a.id-b.id);
  const chosen:Skill[]=[];
  const add=(skill:Skill|undefined)=>{if(skill&&!chosen.some(row=>row.id===skill.id)&&chosen.length<4)chosen.push(skill);};
  add(attacks[0]);
  // A second damage type reduces immunity traps; one priority move helps finishing.
  add(attacks.find(skill=>skill.type!==chosen[0]?.type));
  add(attacks.find(skill=>(skill.priority??0)>0));
  const supportScore=(skill:Skill)=>(skill.effects??[]).reduce((score,fx)=>score+(
    fx.op==='heal'?45:fx.op==='status'?35:fx.op==='stat_stage'?((fx.stats?.[preferred==='physical'?'atk':'spa']>0)?40:20):fx.op==='clear_stages'?25:fx.op==='cure_status'?15:fx.op==='restore_pp'?10:0),0);
  const supports=legal.filter(skill=>skill.category==='status').sort((a,b)=>supportScore(b)-supportScore(a)||a.id-b.id);
  add(supports.find(skill=>supportScore(skill)>0));
  for(const skill of [...attacks,...supports,...legal])add(skill);
  return {species:species.id,level:100,iv:31,evs:{hp:255,[preferred==='physical'?'atk':'spa']:255},nature:'hardy',skills:chosen.map(skill=>skill.id)};
}

function sourceMultiHitMatches(skill:Skill,min:number,max:number):boolean {
  return (skill.seer_effects as {eff:number;args:number[]}[]|undefined)?.some(effect=>
    effect.eff===31&&effect.args[0]===min&&effect.args[1]===max)===true;
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

function eliteSkillEligible(skill:Skill):boolean {
  const fixedMultiHit=skill.effects?.some(effect=>effect.op==='multi_hit'&&
    (effect.min??2)===(effect.max??effect.min??2)&&
    !sourceMultiHitMatches(skill,effect.min??2,effect.max??effect.min??2));
  return !fixedMultiHit&&!pureRecovery(skill);
}

export function eliteMember(catalog:CatalogData,species:Species,skills:Map<number,Skill>,types:TypeData):BossTeamMember {
  const build=eliteBuilds.get(species.id);
  if(!build)return ordinaryMember(species,skills,types,eliteSkillEligible);
  if(build.skills.length!==4||new Set(build.skills).size!==4||build.skills.some(id=>
    !trainerSkillOrigin(catalog,species.id,id)||!skills.has(id)||pureRecovery(skills.get(id)!)||skills.get(id)?.effects?.some(effect=>effect.op==='multi_hit'&&
      !sourceMultiHitMatches(skills.get(id)!,effect.min??2,effect.max??effect.min??2))))
    throw new Error(`${species.name.zh}的巅峰配招与当前技能资料不一致。`);
  return {species:species.id,...structuredClone(build)};
}

export function createFacilityEncounter(catalog:CatalogData,facilityId:string,rng:Rng,teamId?:string):BossEncounter {
  if(!['random','elite','classic'].includes(facilityId))throw new Error('对战设施不存在。');
  if(facilityId==='classic') {
    const team=catalog.trainers?.find(row=>row.id===teamId);
    if(!team)throw new Error('请选择固定战术队伍。');
    return normalizeNpcTrainingEncounter(catalog,{...structuredClone(team) as unknown as BossEncounter,facility:facilityId});
  }
  if(teamId!==undefined)throw new Error('随机对战无需指定固定队伍。');
  const pool=facilityId==='elite'?eliteFacilityPool(catalog):facilityPool(catalog);
  if(pool.length<6)throw new Error('对战精灵池不足六只。');
  const skillMap=new Map((catalog.skills as unknown as Skill[]).map(skill=>[skill.id,skill]));
  const selected:Species[]=[];
  // Partial Fisher-Yates: exactly six draws, uniform sampling without replacement.
  for(let index=0;index<6;index++) {
    const swap=rng.int(index,pool.length-1);[pool[index],pool[swap]]=[pool[swap],pool[index]];selected.push(pool[index]);
  }
  const encounter:BossEncounter={id:`facility_${facilityId}`,name:{zh:facilityId==='elite'?'巅峰对决 · 随机六人队':'随机竞技场 · 随机六人队'},category:'trainer',facility:facilityId,
    team:selected.map(species=>facilityId==='elite'?eliteMember(catalog,species,skillMap,catalog.types as unknown as TypeData):ordinaryMember(species,skillMap,catalog.types as unknown as TypeData)),rules:[{rule:'no_capture'}],win:[{kind:'ko_all'}],lose:[],phases:[],
    ai:{kind:'smart',allow_switch:true,style:'balanced'},reward:{items:{}}};
  return facilityId==='elite'?normalizeNpcTrainingEncounter(catalog,encounter):encounter;
}
