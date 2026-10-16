// Explicitly encoded encounter rules that were missing their execution path.
// Parameter fidelity is separate from historical source confidence; see the
// generated data/boss-rule-support-v56.json and the V56 audit note.
import type {ScriptRegistry} from '../types.ts';
import type {Battle, Mon} from '../battle.ts';
import {scriptCondition} from './util.ts';

const attach = (battle:Battle,mon:Mon,id:string,points:string[],data:Record<string,unknown>={}) =>
  scriptCondition(battle,mon,`boss_${id}`,id,points.map(on=>({on})),undefined,{kind:'other',removed_on_switch:false,script:id,data});

function fieldMembers(battle:Battle,owner:Mon,sides:string):Mon[] {
  return (sides==='both'?battle.sides:[battle.sides[owner.side]]).flatMap(side=>side.team);
}

export const RECOVERED_BOSS_SCRIPTS:ScriptRegistry = {
  // This script changes the encounter before construction, where the saved
  // attempt counter is available. The battle core must not apply it twice.
  level_drops_per_attempt:{install:()=>{}},
  always_move_first:{
    install:c=>{attach(c.battle,c.mon,'always_move_first',['modify_priority']);},
    hook:()=>Number.MAX_SAFE_INTEGER,
  },
  always_crit_after_turn:{
    install:(c,p)=>{attach(c.battle,c.mon,'always_crit_after_turn',['modify_crit_rate'],p);},
    hook:c=>c.battle.turn>c.cond.data.turn?{force:true}:undefined,
  },
  crit_rate_bonus:{install:(c,p)=>{
    c.battle.addCondition(c.mon,{id:'boss_crit_rate_bonus',name:{zh:'致命一击率提升'},kind:'other',removed_on_switch:false,hooks:[{on:'modify_crit_rate',add:p.stages}]});
  }},
  hp_multiplier:{install:(c,p)=>{
    const ratio=c.mon.hp/c.mon.maxHp;
    c.mon.maxHp=Math.max(1,Math.floor(c.mon.maxHp*p.multiplier));
    c.mon.stats.hp=c.mon.maxHp;c.mon.hp=Math.max(1,Math.floor(c.mon.maxHp*ratio));
  }},
  evasion_bonus:{install:(c,p)=>{c.battle.changeStage(c.mon,'eva',p.stages,false);}},
  unlimited_pp_skill:{
    install:(c,p)=>{attach(c.battle,c.mon,'unlimited_pp_skill',['pp_cost'],p);},
    hook:c=>c.skill.id===c.cond.data.skill?0:undefined,
  },
  damage_only_from_own_type_normal_or_status:{install:c=>{
    c.mon.rules.push({rule:'damage_only_from',types:[...c.mon.types,'normal'],allow_categories:['status']});
  }},
  type_rotation:{install:(c,p)=>{c.mon.rules.push({rule:'type_rotation',order:[...p.order]});}},
  field_heal_each_turn:{
    install:(c,p)=>{for(const mon of fieldMembers(c.battle,c.mon,p.sides))attach(c.battle,mon,'field_heal_each_turn',['turn_end'],p);},
    hook:c=>{c.battle.heal(c.holder,c.holder.maxHp*c.cond.data.pct_max_hp/100);},
  },
  field_damage_each_turn:{
    install:(c,p)=>{for(const mon of fieldMembers(c.battle,c.mon,p.sides))attach(c.battle,mon,'field_damage_each_turn',['turn_end'],p);},
    hook:c=>{c.battle.dealDamage(c.holder,c.cond.data.amount,{kind:'fixed'});},
  },
  field_damage_multiplier:{install:(c,p)=>{
    for(const mon of fieldMembers(c.battle,c.mon,p.sides))c.battle.addCondition(mon,{id:'boss_field_damage_multiplier',name:{zh:'能量领域'},kind:'other',removed_on_switch:false,hooks:[{on:'modify_damage_dealt',multiplier:p.multiplier,kinds:['attack']}]});
  }},
  revive_unless_status_ko:{install:(c,p)=>{
    c.mon.persist.reviveUnlessStatusKo={maxRevives:p.max_revives,...(p.through_turn===undefined?{}:{throughTurn:p.through_turn})};
  }},
  ohko_attacks:{apply:(c:any,p:any)=>{
    c.user.persist.ohko_below_pct=true;
    if(p?.ignore_speed)attach(c.battle,c.user,'always_move_first',['modify_priority']);
    c.battle.emit({type:'boss_trait',side:c.user.side,trait:'ohko_attacks'});
  }},
  block_new_status:{apply:c=>{
    c.user.rules.push({rule:'immune_status'});
    c.battle.emit({type:'boss_trait',side:c.user.side,trait:'block_new_status'});
  }},
  // The normal flee_after_skill path resolves this outcome immediately. This
  // predicate also makes the catalog's explicit loss objective well-defined.
  boss_fled:{apply:c=>c.battle.result?.reason==='boss_fled'},
};
