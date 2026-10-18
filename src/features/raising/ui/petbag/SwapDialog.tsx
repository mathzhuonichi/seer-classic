import {useState} from 'react';
import type { MonsterView } from '../../../../shared/views.ts';

type Props={m:MonsterView;party:MonsterView[];order:string[];onSwap:(uid:string)=>void;onClose:()=>void};

/** Swaps the selected party monster with another party slot. */
export default function SwapDialog({m,party,order,onSwap,onClose}:Props) {
  const [target,setTarget]=useState('');
  return <section className="petbag-swap-dialog" aria-label="交换出战位置"><strong>交换位置</strong>
    <select aria-label="交换出战位置" value={target} onChange={event=>setTarget(event.target.value)}><option value="">选择出战位</option>
      {party.filter(mon=>mon.uid!==m.uid).map(mon=><option key={mon.uid} value={mon.uid}>{order.indexOf(mon.uid)+1} · {mon.name}</option>)}
    </select>
    <button disabled={!target} onClick={()=>onSwap(target)}>确认交换</button><button aria-label="关闭位置交换" onClick={onClose}>返回</button>
  </section>;
}
