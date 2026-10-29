import {useEffect,useRef} from 'react';
import type { MonsterView } from '../../../../shared/views.ts';
import {PARTY_MAX} from '../../../../../raising/core/storage.ts';
import PartyStrip from './PartyStrip.tsx';

type Props={m:MonsterView;party:MonsterView[];onAdd:()=>void;onSwap:(out:MonsterView)=>void;onClose:()=>void};

/** 换入背包, for a full bag: its six monsters over the bag; the one picked goes to the box and the stored monster takes its slot. */
export default function PlaceDialog({m,party,onAdd,onSwap,onClose}:Props) {
  const dialog=useRef<HTMLElement>(null);
  useEffect(()=>dialog.current?.focus(),[]);
  // Escape closes the dialog, not the bag, wherever the focus is: the document hears it before the shell's window listener.
  useEffect(()=>{
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();onClose()}};
    document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);
  },[onClose]);
  const full=party.length>=PARTY_MAX;
  return <div className="petbag-dialog-backdrop" onClick={onClose}>
    <section ref={dialog} className="petbag-place-dialog" role="dialog" aria-modal="true" aria-label={`把${m.name}放入背包`} tabIndex={-1}
      onClick={event=>event.stopPropagation()}>
      <header><strong>把{m.name}放入背包</strong><button type="button" aria-label="关闭" onClick={onClose}>×</button></header>
      <p>{full?'背包已满：点一只背包精灵，与它交换位置，它会回到仓库。':'点空位放入背包；点一只背包精灵，则与它交换位置，它会回到仓库。'}</p>
      <PartyStrip party={party} onPick={onSwap} onEmpty={onAdd} emptyLabel={slot=>`第 ${slot} 位空位：放入${m.name}`}/>
    </section>
  </div>;
}
