import type {BossEncounter} from '../../../battle/core/src/index.ts';

// The retained source note explicitly assumes a floor of 50; it is not
// established by the official server and remains marked as inferred.
const INFERRED_LEVEL_FLOOR = 50;

/** A count the save recorded; anything but a positive safe integer counts as none. */
const recorded=(count:number)=>Number.isSafeInteger(count)&&count>0?count:0;

/**
 * Keep the source encounter immutable while applying its attempt-based level rule: from `start`, the level moves by `step` per
 * recorded fight, or by `step_win` per win and `step_loss` per other fight where they are given (洛拉斯克), never below `floor`.
 */
export function bossEncounterForAttempt(boss:BossEncounter,attempts:number,wins:number):BossEncounter {
  const rule=boss.rules?.find(rule=>rule.rule==='script'&&rule.id==='level_drops_per_attempt');
  if(!rule)return boss;
  const params=rule.params as {start?:number;step?:number;step_win?:number;step_loss?:number;floor?:number}|undefined;
  const start=params?.start,stepWin=params?.step_win??params?.step,stepLoss=params?.step_loss??params?.step;
  if(!Number.isFinite(start)||!Number.isFinite(stepWin)||!Number.isFinite(stepLoss))return boss;
  const fights=recorded(attempts),won=Math.min(fights,recorded(wins));
  const floor=Number.isFinite(params?.floor)?Math.max(1,params!.floor!):INFERRED_LEVEL_FLOOR;
  const level=Math.max(floor,Math.floor(start!+stepWin!*won+stepLoss!*(fights-won)));
  return {...boss,team:boss.team.map(member=>({...member,level}))};
}

/** Tower and dark-door encounters are not where a species is met or recruited. */
export const isRegularEncounter = (boss: { id: string }) => !boss.id.includes('tower') && !boss.id.includes('dark_door');
