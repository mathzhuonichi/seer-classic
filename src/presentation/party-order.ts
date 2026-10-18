// Monster lists in the order the management panels show them.
type Roster<M>={party:readonly string[];monsters:readonly M[]};

/** Party members, in party order. */
export function partyMonsters<M extends {uid:string}>(s:Roster<M>):M[] {
  return s.party.map(uid=>s.monsters.find(m=>m.uid===uid)).filter((m):m is M=>!!m);
}

/** Party members in party order, then the storage box in storage order. */
export function partyFirstMonsters<M extends {uid:string;inParty:boolean}>(s:Roster<M>):M[] {
  return [...partyMonsters(s),...s.monsters.filter(m=>!m.inParty)];
}
