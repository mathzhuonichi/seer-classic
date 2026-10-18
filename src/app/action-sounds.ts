import type { DispatchResult, GameAction, GameSnapshot } from '../kernel/contract.ts';
import type {GameSound} from '../shared/audio/game-audio.ts';
type OutcomeSnapshot=Pick<GameSnapshot,'monsters'|'items'>;
/** The dispatch result says whether the action succeeded and what it created; only a level gain is read from the snapshots. */
export function actionSound(action:GameAction,result:DispatchResult,before:OutcomeSnapshot,after:OutcomeSnapshot):GameSound|null{
 if(!result.ok)return null;
 // Every successful claim grants its reward, including a repeatable recruitment whose quest never shows as claimed.
 if(action.type==='claimQuest'||action.type==='evolve')return 'reward';
 // A fusion or breeding result over the six-copy allowance succeeds without creating anything.
 if(action.type==='fuse'||action.type==='breed')return result.created?'reward':null;
 if(action.type!=='useItem'&&action.type!=='allocateExp')return null;
 if(action.type==='useItem'&&before.items.find(item=>item.id===action.itemId)?.kind==='essence')return 'reward';
 const old=before.monsters.find(mon=>mon.uid===action.uid),next=after.monsters.find(mon=>mon.uid===action.uid);
 return old&&next&&next.level>old.level?'level-up':null;
}
export function battleLevelGained(initial:ReadonlyMap<string,number>,monsters:OutcomeSnapshot['monsters']):boolean{
 return monsters.some(mon=>initial.has(mon.uid)&&mon.level>initial.get(mon.uid)!);
}
