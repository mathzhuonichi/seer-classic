import type {GameAction,GameController,GameSnapshot} from '../../game-types.ts';

/** Dispatches `action` and returns the snapshot it produced. */
export function dispatchNext(c:GameController,action:GameAction):GameSnapshot {
  c.dispatch(action);
  return c.snapshot();
}

/** Panel feedback: `success` when the action took effect, else the controller's first notice or `fallback`. */
export const feedbackFor=(next:GameSnapshot,ok:boolean,success:string,fallback:string)=>ok?success:next.notices[0]??fallback;

export const monsterIn=(s:GameSnapshot,uid:string)=>s.monsters.find(m=>m.uid===uid);
