// The free item shop: which products exist, the order cap, and memoised product rows.

/** Largest quantity of one shop order. */
export const SHOP_ORDER_MAX=999;

/** Essences become products only once the player has unlocked them. */
export function isShopItemAvailable(item:{id:string;kind:string},unlocked:ReadonlySet<string>):boolean{return item.kind!=='essence'||unlocked.has(item.id)}

/** Unchanged stock reuses immutable rows; hidden unearned essences never become shop products.
 * `unlocked` is the save's list, which grows in place, so its length is compared too. */
export function createItemShopViews<P extends {id:string;kind:string}>(definitions:readonly P[]){
 let unlockedIds:readonly string[]|undefined,unlockedCount=-1,products:readonly P[]=[],rows:(P&{count:number})[]=[];
 return (inventory:Readonly<Record<string,number>>,unlocked:readonly string[])=>{
  if(unlockedIds!==unlocked||unlockedCount!==unlocked.length){
   unlockedIds=unlocked;unlockedCount=unlocked.length;
   const known=new Set(unlocked);products=definitions.filter(item=>isShopItemAvailable(item,known));
  }
  if(rows.length===products.length&&rows.every((row,index)=>row.id===products[index].id&&row.count===(inventory[row.id]??0)))return rows;
  const previous=new Map(rows.map(row=>[row.id,row]));
  rows=products.map(item=>{const count=inventory[item.id]??0,old=previous.get(item.id);return old?.count===count?old:{...item,count}});
  return rows;
 };
}
