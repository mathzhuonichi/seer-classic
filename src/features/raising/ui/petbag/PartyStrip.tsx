import type { MonsterView } from '../../../../shared/views.ts';
import {PARTY_MAX} from '../../../../../raising/core/storage.ts';
import MonsterCard from '../../../../shared/ui/MonsterCard.tsx';

type Props={party:MonsterView[];selected?:string;swapping:boolean;onPick:(m:MonsterView)=>void;onEmpty:()=>void};

/** The six party slots. While a box monster waits to be swapped in, picking a slot swaps; an empty slot opens the box. */
export default function PartyStrip({party,selected,swapping,onPick,onEmpty}:Props) {
  return <div className={`petbag-party-strip${swapping?' swapping':''}`} aria-label="六个出战精灵位">{Array.from({length:PARTY_MAX},(_,i)=>party[i]
    ?<MonsterCard key={party[i].uid} presentation="petbag-party" slot={i+1} monster={party[i]} selected={!swapping&&selected===party[i].uid}
      onClick={()=>onPick(party[i])}/>
    :<button key={`empty-${i}`} type="button" className="petbag-empty-slot" aria-label={`第 ${i+1} 位空位：打开精灵仓库`} onClick={onEmpty}>
      <span>{i+1}</span><strong>空位</strong></button>)}</div>;
}
