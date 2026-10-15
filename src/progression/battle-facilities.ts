import {type BossEncounter,type BossTeamMember,type Skill,type Species,type TypeData,Rng} from '../../battle/core/src/index';
import {attackTypes} from '../../battle/core/src/typechart';
import type {CatalogData} from '../mechanics/catalog';
import type {BattleFacilityView} from '../game-types';
import {NPC_ONLY_SPECIES} from './acquisition';

const stats=['hp','atk','def','spa','spd','spe'] as const;
const baseTotal=(species:Species)=>stats.reduce((total,key)=>total+species.base[key],0);

/** Every collectible form is eligible, including unevolved forms and exactly BST 600. */
export function facilityPool(catalog:CatalogData,minimumBaseTotal=0):Species[] {
  return (catalog.species as unknown as Species[]).filter(species=>!NPC_ONLY_SPECIES.has(species.id)&&baseTotal(species)>=minimumBaseTotal);
}

export function buildFacilityViews(catalog:CatalogData):BattleFacilityView[] {
  const species=new Map((catalog.species as unknown as Species[]).map(mon=>[mon.id,mon]));
  return [
    {id:'random',name:'随机竞技场',description:'从全部可收集形态中等概率抽取六只不同精灵，全员 Lv.100。每次挑战重新组队，未进化形态也可能登场。',opponentCount:6,level:100,poolSize:facilityPool(catalog).length},
    {id:'elite',name:'巅峰竞技场',description:'从种族值总和至少 600 的可收集精灵中等概率抽取六只，全员 Lv.100。每次挑战重新组队。',opponentCount:6,level:100,poolSize:facilityPool(catalog,600).length},
    {id:'classic',name:'战术研究室',description:'以经典精灵组成的固定六人队，分别练习强攻、控制和持久战，全员 Lv.100。阵容为本作设计，可反复挑战。',opponentCount:6,level:100,teams:(catalog.trainers??[]).map(raw=>{
      const encounter=raw as unknown as BossEncounter;
      return {id:encounter.id,name:encounter.name?.zh??encounter.id,description:(encounter.strategy_notes as {zh?:string})?.zh??'',opponents:encounter.team.map(mon=>({species:mon.species,name:species.get(mon.species)!.name.zh,level:mon.level,baseTotal:baseTotal(species.get(mon.species)!)}))};
    })},
  ];
}

/** Select a usable ordinary learnset without an unbounded random search. */
function ordinaryMember(species:Species,skills:Map<number,Skill>,types:TypeData):BossTeamMember {
  const legal=[...new Set((species.learnset??[]).filter(row=>Number.isInteger(row.level)&&row.level>=1&&row.level<=100).map(row=>row.skill))].map(id=>skills.get(id)).filter((skill):skill is Skill=>!!skill);
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

export function createFacilityEncounter(catalog:CatalogData,facilityId:string,rng:Rng,teamId?:string):BossEncounter {
  if(!['random','elite','classic'].includes(facilityId))throw new Error('对战设施不存在。');
  if(facilityId==='classic') {
    const team=catalog.trainers?.find(row=>row.id===teamId);
    if(!team)throw new Error('请选择固定战术队伍。');
    return {...structuredClone(team) as unknown as BossEncounter,facility:facilityId};
  }
  if(teamId!==undefined)throw new Error('随机对战无需指定固定队伍。');
  const pool=facilityPool(catalog,facilityId==='elite'?600:0);
  if(pool.length<6)throw new Error('对战精灵池不足六只。');
  const skillMap=new Map((catalog.skills as unknown as Skill[]).map(skill=>[skill.id,skill]));
  const selected:Species[]=[];
  // Partial Fisher-Yates: exactly six draws, uniform sampling without replacement.
  for(let index=0;index<6;index++) {
    const swap=rng.int(index,pool.length-1);[pool[index],pool[swap]]=[pool[swap],pool[index]];selected.push(pool[index]);
  }
  return {id:`facility_${facilityId}`,name:{zh:facilityId==='elite'?'巅峰竞技场 · 随机六人队':'随机竞技场 · 随机六人队'},category:'trainer',facility:facilityId,
    team:selected.map(species=>ordinaryMember(species,skillMap,catalog.types as unknown as TypeData)),rules:[{rule:'no_capture'}],win:[{kind:'ko_all'}],lose:[],phases:[],
    ai:{kind:'smart',allow_switch:true,style:'balanced'},reward:{items:{}}};
}
