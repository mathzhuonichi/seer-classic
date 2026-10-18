import type {ScriptRegistry} from '../../../battle/core/src/index.ts';
import {ruleScripts,type RuleSpec} from '../../../battle/core/src/scripts/builders.ts';
import {ruleCondition,scriptHooks} from '../../../battle/core/src/scripts/util.ts';

/** The NPC trainer's Gaia (盖亚) carries one of these seal passives (data/npc-training-profiles.json). */
const GAIA_SPECIES=261;
const BLOOD_SEAL_HEAL_PCT=5; // of max HP, each turn end
const EVIL_SEAL_DAMAGE=30;   // fixed damage after each damaging hit

const PASSIVES:Record<string,RuleSpec&{name:string}>={
  npc_gaia_blood_seal:{name:'嗜血之力',on:['turn_end'],hook:c=>{
    if(c.holder.fainted||c.holder.hp<=0||c.battle.active(c.holder.side)!==c.holder)return;
    c.battle.heal(c.holder,Math.floor(c.holder.maxHp*BLOOD_SEAL_HEAL_PCT/100));
  }},
  npc_gaia_evil_seal:{name:'邪气凛然',on:['before_move','on_hit'],hook:c=>{
    if(c.point==='before_move') {
      // The engine's damageDealt accumulator covers powered hits. A small
      // per-move HP snapshot also observes pure fixed-damage attack skills.
      c.cond.data={turn:c.battle.turn,skill:c.skill.id,side:c.foe.side,slot:c.foe.slot,hp:c.foe.hp};
      return;
    }
    const target=c.ctx?.target;
    const before=c.cond.data;
    c.cond.data={};
    const lostHp=target&&before?.turn===c.battle.turn&&before.skill===c.skill?.id&&
      before.side===target.side&&before.slot===target.slot&&target.hp<before.hp;
    if(c.holder.fainted||c.holder.hp<=0||!target||target.fainted||target.hp<=0||
       c.ctx.user!==c.holder||!c.ctx.hit||!(c.ctx.damageDealt>0||lostHp)||
       !['physical','special'].includes(c.skill?.category))return;
    c.battle.dealDamage(target,EVIL_SEAL_DAMAGE,{kind:'fixed',source:c.holder,skill:c.skill});
  }},
};

const SEALS=Object.keys(PASSIVES);

export const npcTrainingScripts:ScriptRegistry=ruleScripts(PASSIVES,(c,_p,id,rule)=>{
  // Defense in depth: the registry may also be registered for original bosses.
  if(c.side.index!==1||c.side.kind!=='trainer'||c.mon.species.id!==GAIA_SPECIES)return;
  if(c.mon.conditions.some((condition:{id:string})=>SEALS.includes(condition.id)))return;
  ruleCondition(c.battle,c.mon,id,rule.name,scriptHooks(rule.on,id));
});
