// The modifier's drafts: every number field is kept as typed and converted only when the edit is applied.
import type { MonsterView } from '../../shared/views.ts';
import {IV_MAX,IV_MIN} from '../../../raising/core/stats.ts';
import {MAX_LEVEL} from '../../../raising/core/growth.ts';
import {checkEvDraft,draftEvs,evDraft,wholeNumber,type EvDraft} from './ev-draft.ts';

export interface MonsterDraft {level:string;iv:string;nature:string;trait:string;evs:EvDraft}

export const monsterDraft=(m:MonsterView):MonsterDraft=>({level:String(m.level),iv:String(m.iv),nature:m.nature.id,trait:m.trait?.id??'',evs:evDraft(m.evs)});

/** The typed 学习力 total (undefined while a 学习力 field is blank or invalid), and the monster edit when every field is valid. */
export function monsterEdit(draft:MonsterDraft) {
  const level=wholeNumber(draft.level,1,MAX_LEVEL),iv=wholeNumber(draft.iv,IV_MIN,IV_MAX),evs=checkEvDraft(draft.evs);
  const valid=level!==undefined&&iv!==undefined&&evs.valid;
  return {total:evs.valid?evs.total:undefined,edit:valid?{level,iv,nature:draft.nature,evs:draftEvs(draft.evs),traitId:draft.trait||null}:undefined};
}
