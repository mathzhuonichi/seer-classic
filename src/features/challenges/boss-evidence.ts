import evidenceIndex from '../../../data/boss-evidence-runtime-v56.json';
import ruleIndex from '../../../data/boss-rule-support-v56.json';
import type {BossEncounter} from '../../../battle/core/src/types.ts';
import {MAX_LEVEL} from '../../../raising/core/growth.ts';
import type {StatKey} from '../../../raising/core/types.ts';
import type { BossEvidenceStatus, BossEvidenceView } from '../../shared/views.ts';
import {encounterLevel} from '../../shared/encounter-level.ts';
import {STAT_LABELS} from '../../shared/labels.ts';

type FieldKey='level'|'iv'|'evs'|'nature'|'hp'|'skills'|'ai'|'rules';
type Field={status:BossEvidenceStatus;basis?:string};
interface Entry {displayLevelUnknown?:boolean;sourceUrls?:string[];userPolicies?:{id:string;disposition:'waived'|'replaced'}[];fields:Partial<Record<FieldKey,Field>>;members?:{slot:number;species:number;displayLevelUnknown?:boolean;fields:Partial<Record<FieldKey,Field>>}[]}
const entries=(evidenceIndex as unknown as {encounters:Record<string,Entry>}).encounters;
const rules=new Map((ruleIndex as unknown as {bosses:{id:string;unsupported:unknown[]}[]}).bosses.map(row=>[row.id,row]));
const FIELD_LABELS:Record<FieldKey,string>={level:'等级',iv:'个体值',evs:'学习力',nature:'性格',hp:'体力',skills:'技能配置',ai:'选招策略',rules:'特殊机制'};
/** The fields that describe the member's own parameters, as opposed to its AI and special rules. */
const STAT_FIELDS=new Set<string>(['level','iv','evs','nature','hp','skills']);
/** Higher is less certain; a merged field keeps its least certain status. */
const UNCERTAINTY:Record<BossEvidenceStatus,number>={official:0,observed:1,authored:2,inferred:3};
const POLICY_NOTES:Record<string,string>={
  'v57-moshidilu-quarter-execution':'当前规则：体力低于 25% 时，攻击必先并直接击倒；恢复至 25% 及以上后解除。此规则按约定采用，历史资料存在不同记载。',
  'v57-puni-seal7-accuracy':'当前规则不额外加入圣洁封印的低命中效果。',
  'v57-puni-body-low-hp-accuracy':'当前规则不额外加入谱尼低体力时降低我方命中的效果。',
  'v57-eersaila-critical-curve':'当前规则不加入随体力变化的额外致命一击率。',
  'v57-kenpeide-reflection-window':'当前规则保留现有反伤，不额外加入临时开关与持续时间。',
};
const unsupportedRules=(id:string)=>rules.get(id)?.unsupported.length??0;
const encounterRuleNote=(count:number)=>`本场尚有 ${count} 项特殊效果未完整还原。`;
const mergedRuleNote=(count:number)=>`所含挑战合计有 ${count} 项特殊效果未完整还原。`;
const isRuleNote=(text:string)=>text.startsWith('本场尚有 ')||text.startsWith('所含挑战合计有 ');

/** Evidence describes the configuration; it never changes combat parameters. */
export function buildBossEvidence(boss:BossEncounter,slot=0):BossEvidenceView|undefined {
  if(boss.category==='trainer')return undefined;
  const entry=entries[boss.id],member=boss.team[slot]??boss.team[0];
  const memberEntry=entry?.members?.find(row=>row.slot===slot);
  const status=(key:FieldKey):BossEvidenceStatus=>(memberEntry?.fields[key]??entry?.fields[key])?.status??'inferred';
  const displayLevelUnknown=memberEntry?.displayLevelUnknown??entry?.displayLevelUnknown??false;
  const evs=Object.entries(member.evs??{}).filter(([,value])=>Number(value)>0);
  const incompleteRules=unsupportedRules(boss.id);
  const values:Record<FieldKey,string>={
    level:encounterLevel(member.level,displayLevelUnknown),iv:String(member.iv??0),
    evs:evs.length?evs.map(([key,value])=>`${STAT_LABELS[key as StatKey]??key} ${value}`).join('、'):'各项均为 0',
    nature:!member.nature||member.nature==='hardy'?'无属性修正':String(member.nature),
    hp:member.hp_override?String(member.hp_override):'按重建公式计算',skills:`${member.skills.length} 个技能`,
    ai:boss.ai?.kind==='sequence'?'固定顺序':boss.ai?.kind==='weighted'?'加权选招':'旧版选招策略',
    rules:incompleteRules?'部分效果尚未还原':entry?.userPolicies?.length?'按当前重制规则':'按资料重建',
  };
  const fields=(Object.keys(FIELD_LABELS) as FieldKey[]).map(key=>({key,label:FIELD_LABELS[key],value:values[key],status:status(key)}));
  const limitations:string[]=[];
  if(!entry)limitations.push('此挑战的资料尚未完成核对，参数按推定标示。');
  if(member.level>MAX_LEVEL)limitations.push(`超过 ${MAX_LEVEL} 级按原版显示为“??”；内部等级未获官方精确确认。`);
  if(displayLevelUnknown&&member.level<=MAX_LEVEL)limitations.push('同期资料显示等级为“??”；内部等级仅为重制估计。');
  if(boss.rules?.some(rule=>rule.rule==='script'&&rule.id==='level_drops_per_attempt'))limitations.push('每次挑战降低等级有资料记载；最低 50 级与体力等参数仍为推定。');
  for(const policy of entry?.userPolicies??[])if(POLICY_NOTES[policy.id])limitations.push(POLICY_NOTES[policy.id]);
  if(incompleteRules)limitations.push(encounterRuleNote(incompleteRules));
  return {
    displayLevelUnknown,sourceUrls:entry?.sourceUrls,hasInferredStats:fields.some(field=>STAT_FIELDS.has(field.key)&&field.status==='inferred'),
    hasInferredLevel:status('level')==='inferred',incompleteRules,fields,limitations,
  };
}

/** A multi-battle campaign must retain the least certain member's label. */
export function mergeBossEvidence(values:(BossEvidenceView|undefined)[]):BossEvidenceView|undefined {
  const views=values.filter((value):value is BossEvidenceView=>!!value);
  if(!views.length)return undefined;
  const fields=views[0].fields.map(field=>{
    const rows=views.map(value=>value.fields.find(row=>row.key===field.key)).filter((row):row is typeof field=>!!row);
    const status=rows.reduce((status,row)=>UNCERTAINTY[row.status]>UNCERTAINTY[status]?row.status:status,field.status);
    const texts=[...new Set(rows.map(row=>row.value))];
    return {...field,status,value:texts.length===1?texts[0]:'各对手配置不同'};
  });
  const incompleteRules=views.reduce((sum,value)=>sum+(value.incompleteRules??0),0);
  const limitations=[...new Set(views.flatMap(value=>value.limitations))].filter(text=>!isRuleNote(text));
  if(incompleteRules)limitations.push(mergedRuleNote(incompleteRules));
  return {
    displayLevelUnknown:views.some(value=>value.displayLevelUnknown),sourceUrls:[...new Set(views.flatMap(value=>value.sourceUrls??[]))],
    hasInferredStats:views.some(value=>value.hasInferredStats),hasInferredLevel:views.some(value=>value.hasInferredLevel),incompleteRules,fields,limitations,
  };
}

/** Aggregate all members without counting encounter-wide unsupported effects twice. */
export function buildBossEncounterEvidence(boss:BossEncounter):BossEvidenceView|undefined {
  const evidence=mergeBossEvidence(boss.team.map((_,slot)=>buildBossEvidence(boss,slot)));
  if(evidence){
    evidence.incompleteRules=unsupportedRules(boss.id);
    evidence.limitations=evidence.limitations.filter(text=>!isRuleNote(text));
    if(evidence.incompleteRules)evidence.limitations.push(encounterRuleNote(evidence.incompleteRules));
  }
  return evidence;
}
