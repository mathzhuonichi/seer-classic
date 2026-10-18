import type {BossEncounter} from '../../battle/core/src/types.ts';

/** Keep the source encounter immutable while applying its attempt-based level rule. */
export function bossEncounterForAttempt(boss:BossEncounter,attempts:number):BossEncounter {
  const rule=boss.rules?.find(rule=>rule.rule==='script'&&rule.id==='level_drops_per_attempt');
  if(!rule)return boss;
  const params=rule.params as {start?:number;step?:number;floor?:number}|undefined;
  const start=params?.start,step=params?.step;
  if(!Number.isFinite(start)||!Number.isFinite(step))return boss;
  const count=Number.isSafeInteger(attempts)&&attempts>0?attempts:0;
  // The retained source note explicitly assumes a floor of 50; it is not
  // established by the official server and remains marked as inferred.
  const floor=Number.isFinite(params?.floor)?Math.max(1,params!.floor!):50;
  const level=Math.max(floor,Math.floor(start!+step!*count));
  return {...boss,team:boss.team.map(member=>({...member,level}))};
}
