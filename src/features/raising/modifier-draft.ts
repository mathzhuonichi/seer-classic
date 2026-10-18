// The modifier's drafts: every number field is kept as typed and converted only when the edit is applied.
import type { MonsterView } from '../../shared/views.ts';
import {IV_MAX,IV_MIN} from '../../../raising/core/stats.ts';
import {MAX_LEVEL} from '../../../raising/core/growth.ts';
import {checkEvDraft,draftEvs,evDraft,type EvDraft} from './ev-draft.ts';

export interface MonsterDraft {level:string;iv:string;nature:string;trait:string;evs:EvDraft}

export const monsterDraft=(m:MonsterView):MonsterDraft=>({level:String(m.level),iv:String(m.iv),nature:m.natureId,trait:m.traitId??'',evs:evDraft(m.evs)});

/** A typed whole number from `min` to `max`, or undefined for a blank or invalid field. */
export function wholeNumber(text:string,min:number,max:number):number|undefined {
  const value=Number(text);
  return text.trim()!==''&&Number.isInteger(value)&&value>=min&&value<=max?value:undefined;
}

/** The typed 学习力 total, and the monster edit when every field is valid. */
export function monsterEdit(draft:MonsterDraft) {
  const level=wholeNumber(draft.level,1,MAX_LEVEL),iv=wholeNumber(draft.iv,IV_MIN,IV_MAX),evs=checkEvDraft(draft.evs);
  const valid=level!==undefined&&iv!==undefined&&evs.valid;
  return {total:evs.total,edit:valid?{level,iv,nature:draft.nature,evs:draftEvs(draft.evs),traitId:draft.trait||null}:undefined};
}
