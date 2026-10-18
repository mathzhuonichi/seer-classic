// Pure views over owned monsters shared by the monster panels (PetBag, modifier, shops).
import type { GameSnapshot } from '../kernel/contract.ts';
import type { MonsterView } from './views.ts';
import type { StatBlock as Stats } from '../../raising/core/types.ts';
import {STAT_KEYS} from '../../raising/core/types.ts';

type Roster=Pick<GameSnapshot,'party'|'monsters'>;

/** Party monsters in battle order. */
export const partyMonsters=(s:Roster)=>s.party.map(uid=>s.monsters.find(m=>m.uid===uid)).filter((m):m is MonsterView=>!!m);

/** The party in battle order, then the box in owned order. */
export const partyFirst=(s:Roster)=>[...partyMonsters(s),...s.monsters.filter(m=>!m.inParty)];

/** The species drawn for a monster: its chosen skin, else its own form. */
export const appearanceOf=(m:Pick<MonsterView,'species'|'appearanceSpecies'>)=>m.appearanceSpecies??m.species;

/** A species' Chinese name, or `fallback` when the catalog has no such species. */
export const speciesName=(s:Pick<GameSnapshot,'species'>,id:number,fallback:string)=>s.species.find(row=>row.id===id)?.name??fallback;

/** The four-digit 精灵编号 shown on cards and in the dex. */
export const speciesNumber=(id:number)=>String(id).padStart(4,'0');

/** Sum of a six-stat block (种族值合计, 学习力总和). */
export const statTotal=(stats:Stats)=>STAT_KEYS.reduce((sum,key)=>sum+stats[key],0);
