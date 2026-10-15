import type {AiSpec,BossEncounter,EffectOp,Phase,Skill,Species} from '../../battle/core/src/types';
import type {CatalogData} from '../mechanics/catalog';

// Literal all-HP costs, including the miss-only failure of Sand Burial.
// Ordinary recoil and partial-HP costs are deliberately outside this policy.
const selfKoScripts=new Set(['seer_eff_59','seer_eff_71','seer_eff_72','seer_eff_112','seer_eff_144']);
export function isBossSelfKoSkill(skill:Skill):boolean {
  return (skill.effects??[]).some(effect=>
    effect.op==='script'&&selfKoScripts.has(effect.id)||
    effect.op==='recoil'&&Number(effect.pct_max_hp)>=100);
}

/** Adapt original boss encounters without changing catalog moves or trainer battles. */
export function normalizeBossSkillPolicy(catalog:CatalogData,encounter:BossEncounter):BossEncounter {
  const copy=structuredClone(encounter);
  if(copy.category==='trainer')return copy;
  const skills=new Map((catalog.skills as unknown as Skill[]).map(skill=>[skill.id,skill]));
  const species=new Map((catalog.species as unknown as Species[]).map(mon=>[mon.id,mon]));
  const forbidden=(id:number)=>!!skills.get(id)&&isBossSelfKoSkill(skills.get(id)!);
  const replacements=new Map<number,number[]>();
  for(const member of copy.team) {
    const mon=species.get(member.species);
    if(!mon)throw new Error('Boss skill policy received an unknown species.');
    const occupied=new Set(member.skills.filter(id=>!forbidden(id)));
    const legal=[...new Set((mon.learnset??[]).filter(row=>Number.isInteger(row.level)&&row.level>=1&&row.level<=Math.min(100,member.level)).map(row=>row.skill))]
      .filter(id=>skills.has(id)&&!forbidden(id));
    member.skills=member.skills.map(id=>{
      if(!forbidden(id))return id;
      // The only affected recovered encounter is Tower 61's Chaloyan. Keep its
      // support slot: a legal dual-offense debuff replaces its all-HP transfer.
      const preferred=member.species===270&&id===20330?20328:undefined;
      const replacement=preferred!==undefined&&legal.includes(preferred)&&!occupied.has(preferred)?preferred:
        legal.filter(candidate=>!occupied.has(candidate)).sort((a,b)=>
          Number(skills.get(b)!.category===skills.get(id)!.category)-Number(skills.get(a)!.category===skills.get(id)!.category)||
          skills.get(b)!.power-skills.get(a)!.power||a-b)[0];
      if(replacement===undefined)throw new Error('Boss self-KO skill has no unused legal replacement.');
      occupied.add(replacement);
      replacements.set(id,[...new Set([...(replacements.get(id)??[]),replacement])]);
      if(member.pp){delete member.pp[String(id)];member.pp[String(replacement)]=skills.get(replacement)!.pp;}
      return replacement;
    });
  }
  const safeIds=(ids:number[])=>[...new Set(ids.flatMap(id=>forbidden(id)?replacements.get(id)??[]:[id]))];
  const safeAi=(ai:AiSpec|undefined):AiSpec|undefined=>{
    if(!ai)return ai;
    if(ai.skills)ai.skills=safeIds(ai.skills);
    if(ai.weights) {
      const weights:Record<string,number>={};
      for(const [key,weight] of Object.entries(ai.weights)) {
        const ids=safeIds([Number(key)]);
        for(const id of ids)weights[String(id)]=(weights[String(id)]??0)+weight/ids.length;
      }
      ai.weights=weights;
    }
    return ai;
  };
  const safeEffects=(effects:EffectOp[]):EffectOp[]=>effects.flatMap(effect=>{
    // These are explicit move-selection payloads only. HP, on-faint scripts,
    // revival and other phase actions (including Puni's lives) are unchanged.
    if(effect.target!=='foe') {
      if(['set_skills','transform'].includes(effect.op)&&Array.isArray(effect.skills)) {
        const ids=safeIds(effect.skills);
        if(!ids.length&&effect.op==='set_skills')return [];
        if(ids.length)effect.skills=ids;else delete effect.skills;
      }
      if(effect.op==='set_ai')effect.ai=safeAi(effect.ai);
      if(effect.op==='use_skill'&&forbidden(effect.skill))return [];
    }
    return [effect];
  });
  const safePhases=(phases:Phase[]|undefined)=>phases?.forEach(phase=>{phase.do=safeEffects(phase.do);});
  copy.ai=safeAi(copy.ai);
  safePhases(copy.phases);
  for(const member of copy.team) {
    const authored=member as typeof member&{ai?:AiSpec};
    if(authored.ai)authored.ai=safeAi(authored.ai);
    safePhases(member.member_phases);
  }
  return copy;
}
