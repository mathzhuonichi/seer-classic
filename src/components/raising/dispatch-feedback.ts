import type {GameAction,GameController,GameSnapshot,MonsterView} from '../../game-types.ts';

/** What every Raising tab gets: the monster, the controller, and the panel's one status line. */
export interface TabProps {m:MonsterView;c:GameController;feedback:string;say:(text:string)=>void}

/** Dispatches `action` and returns the snapshot it produced. */
export function dispatchNext(c:GameController,action:GameAction):GameSnapshot {
  c.dispatch(action);
  return c.snapshot();
}

/** Panel feedback: `success` when the action took effect, else the controller's first notice or `fallback`. */
export const feedbackFor=(next:GameSnapshot,ok:boolean,success:string,fallback:string)=>ok?success:next.notices[0]??fallback;

export const monsterIn=(s:GameSnapshot,uid:string)=>s.monsters.find(m=>m.uid===uid);
