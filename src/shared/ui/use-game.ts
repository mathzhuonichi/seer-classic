import {useRef,useSyncExternalStore} from 'react';

/** What a screen reads from the game: the current snapshot and its change notifications. `GameController` is one. */
export interface GameStore<S> {snapshot():S;subscribe(listener:()=>void):()=>void}

/**
 * Subscribes a component to `select(snapshot)`: it re-renders only when the selection changes identity. The kernel keeps every
 * unchanged slice and row identical between snapshots, so select slices, rows or primitives; derive new arrays or objects from
 * selected slices with `useMemo`, because a selector that builds one returns a new identity on every snapshot.
 */
export function useGame<S,T>(store:GameStore<S>,select:(snapshot:S)=>T):T {
  const last=useRef<{snapshot:S;select:(snapshot:S)=>T;value:T}>(undefined);
  const read=()=>{
    const snapshot=store.snapshot(),memo=last.current;
    if(memo&&memo.snapshot===snapshot&&memo.select===select)return memo.value;
    const value=select(snapshot);
    last.current={snapshot,select,value};
    return value;
  };
  // The server renderer (static markup in verification suites) reads the same snapshot.
  return useSyncExternalStore(store.subscribe,read,read);
}
