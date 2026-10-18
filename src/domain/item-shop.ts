// The free item shop: which products exist.

/** Essences become products only once the player has unlocked them. */
export function isShopItemAvailable(item:{id:string;kind:string},unlocked:ReadonlySet<string>):boolean{return item.kind!=='essence'||unlocked.has(item.id)}
