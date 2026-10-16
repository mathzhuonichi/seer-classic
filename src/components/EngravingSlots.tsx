import {useEffect,useState} from 'react';
import type {EngravingView,GameController,MonsterView} from '../game-types';
const slotNames={ability:'能力刻印',skill:'技能刻印'} as const;
const label=(e:EngravingView)=>`${e.name}（${e.moveName?`${e.moveName} · `:''}${e.effect}）`;
/** 2013 client rule: one ability engraving and one skill engraving per monster, taken from the shop-bought stock. */
export default function EngravingSlots({m,c}:{m:MonsterView;c:GameController}) {
  const [feedback,setFeedback]=useState('');
  useEffect(()=>setFeedback(''),[m.uid]);
  if(!c.engravingOptions)return null;
  // Only engravings this monster can equip now and that are in stock (or already on it).
  const options=c.engravingOptions(m.uid).filter(option=>option.ready&&(option.stock>0||option.equippedHere));
  function equip(slot:'ability'|'skill',id:string) {
    c.dispatch({type:'setEngraving',uid:m.uid,slot,engravingId:id||null});
    const snapshot=c.snapshot(),after=snapshot.monsters.find(mon=>mon.uid===m.uid)?.engravings?.[slot];
    setFeedback(!id?(after?snapshot.notices[0]??'刻印未卸下。':'已卸下刻印，放回刻印库存。'):after?.id===id?`已装备${after.name}。`:snapshot.notices[0]??'刻印未装备，请重新选择。');
  }
  return <section className="raising-engravings" aria-label="刻印">
    <div className="stat-table-heading"><strong>刻印</strong><span>能力、技能各一孔</span></div>
    <div className="engraving-slot-grid">{(['ability','skill'] as const).map(slot=>{
      const current=m.engravings?.[slot]??null,list=options.filter(option=>option.slot===slot&&option.id!==current?.id).sort((a,b)=>Number(b.bound)-Number(a.bound));
      const effect=current?(current.ready?`${current.moveName?`${current.moveName} · `:''}${current.effect}`:`未生效：${current.reason}`):list.length?`库存可装备 ${list.length} 种`:'前往商城购买';
      return <div key={slot} className="engraving-slot">
        <div className="engraving-slot-heading"><span className="engraving-slot-emblem" aria-hidden="true">{current&&<img src="/ui/classic/hd/petbag-nav-mark.svg" alt=""/>}</span><strong>{slot==='ability'?'能力':'技能'}</strong></div>
        <select aria-label={`选择${slotNames[slot]}`} value={current?.id??''} onChange={event=>equip(slot,event.target.value)}>
          <option value="">{current?'卸下并放回库存':list.length?'选择库存刻印':'暂无可用刻印'}</option>
          {current&&<option value={current.id}>{label(current)}</option>}
          {list.map(option=><option key={option.id} value={option.id}>{label(option)}{option.bound?' · 专属':''} · 库存 {option.stock}</option>)}
        </select>
        <div className="engraving-slot-effect"><small title={effect} className={current&&!current.ready?'engraving-inactive':undefined}>{effect}</small>{current&&<button className="engraving-unload" aria-label={`卸下${slotNames[slot]}`} onClick={()=>equip(slot,'')}>卸下</button>}</div>
      </div>;
    })}</div>
    {feedback&&<p className="management-feedback" role="status">{feedback}</p>}
  </section>;
}
