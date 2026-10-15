import type {Hook,ScriptEntry,ScriptRegistry} from '../../battle/core/src/types';

function passive(id:string,label:string,points:Hook['on'][],hook:ScriptEntry['hook']):ScriptEntry {
  return {install:c=>{
    // Defense in depth: the registry may also be registered for original bosses.
    if(c.side.index!==1||c.side.kind!=='trainer'||c.mon.species.id!==261)return;
    if(c.mon.conditions.some((condition:{id:string})=>['npc_gaia_blood_seal','npc_gaia_evil_seal'].includes(condition.id)))return;
    c.battle.addCondition(c.mon,{id,name:{zh:label},kind:'other',removed_on_switch:false,hooks:points.map(on=>({on,script:id}))});
  },hook};
}

export const npcTrainingScripts:ScriptRegistry={
  npc_gaia_blood_seal:passive('npc_gaia_blood_seal','嗜血之力',['turn_end'],c=>{
    if(c.holder.fainted||c.holder.hp<=0||c.battle.active(c.holder.side)!==c.holder)return;
    c.battle.heal(c.holder,Math.floor(c.holder.maxHp*5/100));
  }),
  npc_gaia_evil_seal:passive('npc_gaia_evil_seal','邪气凛然',['before_move','on_hit'],c=>{
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
    c.battle.dealDamage(target,30,{kind:'fixed',source:c.holder,skill:c.skill});
  }),
};
