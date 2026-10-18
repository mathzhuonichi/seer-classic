import originalTraits from '../../data/traits.json';
import type { Hook, ScriptEntry, ScriptRegistry } from '../../battle/core/src/types.ts';
import { STAT_BY_INDEX, STATUS_BY_INDEX } from '../../battle/core/src/scripts/util.ts';

export interface TraitDefinition {
  id: string;
  name: string;
  description: string;
  hooks: Hook[];
  raw: { Eid: number; Args: string };
  implemented: boolean;
  limitation?: string;
  calibration?: string;
}
const aliases: Record<string,string> = {steel:'mechanical',dark:'shadow',mystery:'mystic'};
export const traitScripts: ScriptRegistry = {};
const scriptId = (id: string) => `classic_trait_${id}`;
const chance = (c: any, percent: number) => c.battle.rng.chance(percent);
const incomingAttack = (c: any) => c.info?.kind === 'attack' && c.source && c.source.side !== c.holder.side;
const outgoingAttack = (c: any) => c.info?.kind === 'attack' && c.foe && c.foe.side !== c.holder.side;

/** Zero-star client parameters stay attached to every definition. No later-star rates are substituted. */
export const traits: TraitDefinition[] = originalTraits.map(original => {
  const p = original.raw.Args.trim().split(/\s+/).map(Number);
  const result: TraitDefinition = {
    id: original.id, name: original.name.zh, description: original.description.zh,
    raw: { Eid: original.raw.Eid, Args: original.raw.Args }, implemented: true,
    hooks: original.hooks.map(h => {
      const hook = {...h} as Hook;
      const when = hook.when as Record<string,unknown> | undefined;
      if (when?.skill_type) hook.when = {...when, skill_type:aliases[String(when.skill_type)] ?? when.skill_type};
      return hook;
    }),
  };
  let points: string[] = [];
  let entry: ScriptEntry | undefined;
  switch (original.raw.Eid) {
    case 3:
      // "Any damage": final hook also covers fixed, percentage and residual damage.
      points = ['modify_damage_final'];
      entry = {hook:c=>Math.floor(c.amount * (1-p[0]/100))};
      break;
    case 7:
      result.hooks = [{on:'modify_accuracy_taken',add_percent:p[0]}];
      break;
    case 6:
      points=['on_hurt'];
      entry={hook:c=>{if(incomingAttack(c)&&c.skill?.category==='physical'&&chance(c,p[1])) c.battle.applyStatus(c.source,STATUS_BY_INDEX[p[0]],{source:c.holder});}};
      break;
    case 31:
      points=['modify_damage_final'];
      entry={hook:c=>{if(c.info?.kind==='attack'&&c.amount>=c.holder.hp&&chance(c,p[0]))return Math.max(0,c.holder.hp-p[1]);}};
      break;
    case 32:
      points=['modify_damage_outgoing'];
      entry={hook:c=>{
        if(!outgoingAttack(c)||!chance(c,p[0]))return;
        // Respect the encounter's immunity; do not turn a blocked instant KO into a blocked ordinary hit.
        if(c.battle.sides[c.foe.side].rules.some((r:any)=>r.rule==='immune_ohko'))return;
        c.info.ohko=true;
        return c.foe.hp;
      }};
      break;
    case 33:
      points=['on_hurt'];
      entry={hook:c=>{if(c.holder.hp>0&&c.holder.hp<=c.holder.maxHp/p[0]&&chance(c,p[1]))c.battle.heal(c.holder,c.holder.maxHp);}};
      break;
    case 34:
      points=['on_hurt'];
      entry={hook:c=>{if(incomingAttack(c)&&c.skill?.category==='special'&&chance(c,p[1]))c.battle.changeStage(c.source,STAT_BY_INDEX[p[0]],-1,true);}};
      break;
    case 35:
      points=['on_hurt'];
      entry={hook:c=>{if(incomingAttack(c)&&c.holder.hp>0&&chance(c,p[1]))c.battle.changeStage(c.holder,STAT_BY_INDEX[p[0]],1,false);}};
      break;
    case 60:
      points=['modify_damage_final'];
      entry={hook:c=>{if(incomingAttack(c)&&chance(c,p[0]))return Math.max(0,c.amount-p[1]);}};
      break;
    case 61:
      // Args "1 0" is the client tier code; the original zero-star description specifies 3%.
      points=['modify_damage_final'];
      entry={hook:c=>{if(c.amount>0&&chance(c,3))return 0;}};
      break;
    case 62: case 63:
      points=['modify_damage_outgoing'];
      entry={hook:c=>{if(outgoingAttack(c)&&c.skill?.category===(original.raw.Eid===62?'physical':'special')&&chance(c,p[0]))return c.amount+p[1];}};
      break;
    case 66: case 67:
      points=['on_hit'];
      entry={hook:c=>{if(c.skill?.category===(original.raw.Eid===66?'physical':'special')&&c.ctx?.damageDealt>0&&!c.foe.fainted&&chance(c,p[0]))c.battle.applyStatus(c.foe,STATUS_BY_INDEX[p[1]],{source:c.holder});}};
      break;
    case 30:
      // Explicit remake calibration: the client tier code does not establish a probability.
      result.hooks=[{on:'modify_crit_rate',add:1}];
      result.description+='（重制规则：致命一击率增加 1/16）';
      result.calibration='Remake calibration: add one step on the engine 16-point critical-rate scale; the historical trait tier mapping is unverified.';
      break;
    case 64:
      points=['modify_crit_rate_taken'];
      entry={hook:()=>({add:-1})};
      result.description+='（重制规则：受到致命一击的概率降低 1/16，最低为 0）';
      result.calibration='Remake calibration: subtract one step on the engine 16-point critical-rate scale; forced critical attacks remain forced. The historical trait tier mapping is unverified.';
      break;
    case 503:
      result.implemented=false;
      result.limitation='The original effect requires a group attack and another target; classic PvE uses one active opponent.';
      break;
  }
  if(entry){traitScripts[scriptId(result.id)]=entry;result.hooks=points.map(on=>({on:on as Hook['on'],script:scriptId(result.id),params:p}));}
  return result;
});
