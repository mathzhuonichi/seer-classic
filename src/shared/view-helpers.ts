// Small view rules shared by several components.

/** HP bar width in percent, clamped to 0..100. */
export const hpPercent=(hp:number,maxHp:number)=>Math.max(0,Math.min(100,hp/maxHp*100));

/** True while a battle is open and not yet finished. */
export const battleActive=(snapshot:{battle?:{finished:boolean}|null})=>!!snapshot.battle&&!snapshot.battle.finished;
