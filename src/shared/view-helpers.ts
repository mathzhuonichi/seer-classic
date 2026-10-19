// Small view rules shared by several components.

/** HP bar width in percent, clamped to 0..100. */
export const hpPercent=(hp:number,maxHp:number)=>Math.max(0,Math.min(100,hp/maxHp*100));

/** True while a battle is open and not yet finished. */
export const battleActive=(snapshot:{battle?:{finished:boolean}|null})=>!!snapshot.battle&&!snapshot.battle.finished;

/** The toolbar's quest alert: some reward is ready that was never taken before (a repeat claim does not light it). */
export const questAlert=(snapshot:{quests:readonly {newReward:boolean}[]})=>snapshot.quests.some(quest=>quest.newReward);

/**
 * The selected item of a list whose pick a click or a use pins: until one is picked (`picked` is empty) `first` is shown; a
 * picked item the list no longer holds selects nothing, so a confirm button cannot use up a different item.
 */
export const pinnedSelection=<T extends {id:string}>(items:readonly T[],picked:string,first:T|undefined=items[0]):T|undefined=>
  picked?items.find(item=>item.id===picked):first;
