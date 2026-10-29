import type { MonsterView } from '../../../../shared/views.ts';
import {PARTY_MAX} from '../../../../../raising/core/storage.ts';
import MonsterCard from '../../../../shared/ui/MonsterCard.tsx';

type Props={party:MonsterView[];selected?:string;onPick:(m:MonsterView)=>void;onEmpty:()=>void;emptyLabel?:(slot:number)=>string};

/** The six party slots: picking a monster, or an empty slot (which opens the box unless `emptyLabel` says what it does instead). */
export default function PartyStrip({party,selected,onPick,onEmpty,emptyLabel=slot=>`第 ${slot} 位空位：打开精灵仓库`}:Props) {
  return <div className="petbag-party-strip" aria-label="六个出战精灵位">{Array.from({length:PARTY_MAX},(_,i)=>party[i]
    ?<MonsterCard key={party[i].uid} presentation="petbag-party" slot={i+1} monster={party[i]} selected={selected===party[i].uid}
      onClick={()=>onPick(party[i])}/>
    :<button key={`empty-${i}`} type="button" className="petbag-empty-slot" aria-label={emptyLabel(i+1)} onClick={onEmpty}>
      <span>{i+1}</span><strong>空位</strong></button>)}</div>;
}
