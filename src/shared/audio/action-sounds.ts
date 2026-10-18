import type { GameAction, GameSnapshot } from '../../kernel/contract.ts';
import type {GameSound} from './game-audio.ts';
type OutcomeSnapshot=Pick<GameSnapshot,'monsters'|'items'|'quests'|'expPool'>;
/** Positive state transitions are authoritative; notices also describe rejected actions. */
export function actionSound(action:GameAction,before:OutcomeSnapshot,after:OutcomeSnapshot):GameSound|null{
 if(action.type==='claimQuest')return !before.quests.find(q=>q.id===action.questId)?.claimed&&after.quests.find(q=>q.id===action.questId)?.claimed?'reward':null;
 if(action.type==='fuse')return after.items.some(item=>item.id.startsWith('fusion_bead_')&&item.count>(before.items.find(old=>old.id===item.id)?.count??0))?'reward':null;
 if(action.type==='breed')return after.monsters.some(mon=>!before.monsters.some(old=>old.uid===mon.uid))?'reward':null;
 if(action.type!=='useItem'&&action.type!=='allocateExp'&&action.type!=='evolve')return null;
 const old=before.monsters.find(mon=>mon.uid===action.uid),next=after.monsters.find(mon=>mon.uid===action.uid);
 if(action.type==='evolve')return old&&next&&old.species!==next.species?'reward':null;
 if(action.type==='useItem'){
  const item=before.items.find(item=>item.id===action.itemId);
  if(!item||item.count<1||(after.items.find(item=>item.id===action.itemId)?.count??0)>=item.count)return null;
  if(item.kind==='essence'&&after.monsters.some(mon=>!before.monsters.some(old=>old.uid===mon.uid)))return 'reward';
 }
 if(action.type==='allocateExp'&&after.expPool>=before.expPool)return null;
 return old&&next&&next.level>old.level?'level-up':null;
}
export function battleLevelGained(initial:ReadonlyMap<string,number>,monsters:OutcomeSnapshot['monsters']):boolean{
 return monsters.some(mon=>initial.has(mon.uid)&&mon.level>initial.get(mon.uid)!);
}
