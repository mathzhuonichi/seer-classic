import {useState} from 'react';
import type {EngravingView,GameController,MonsterView} from '../game-types';
const slotNames={ability:'能力刻印',skill:'技能刻印'} as const;
const label=(e:EngravingView)=>`${e.name}（${e.moveName?`${e.moveName} · `:''}${e.effect}）`;
/** 2013 client rule: one ability engraving and one skill engraving per monster, taken from the shop-bought stock. */
export default function EngravingSlots({m,c}:{m:MonsterView;c:GameController}) {
  const [feedback,setFeedback]=useState('');
  if(!c.engravingOptions)return null;
  // Only engravings this monster can equip now and that are in stock (or already on it).
  const options=c.engravingOptions(m.uid).filter(option=>option.ready&&(option.stock>0||option.equippedHere));
  function equip(slot:'ability'|'skill',id:string) {
    c.dispatch({type:'setEngraving',uid:m.uid,slot,engravingId:id||null});
    const snapshot=c.snapshot(),after=snapshot.monsters.find(mon=>mon.uid===m.uid)?.engravings?.[slot];
    setFeedback(!id?(after?snapshot.notices[0]??'刻印未卸下。':'已卸下刻印，放回刻印库存。'):after?.id===id?`已装备${after.name}。`:snapshot.notices[0]??'刻印未装备，请重新选择。');
  }
  return <section className="raising-engravings" aria-label="刻印">
    <div className="stat-table-heading"><strong>刻印</strong><span>能力刻印与技能刻印各装备一个 · 在商城「刻印」分类购买</span></div>
    {(['ability','skill'] as const).map(slot=>{
      const current=m.engravings?.[slot]??null,list=options.filter(option=>option.slot===slot&&option.id!==current?.id).sort((a,b)=>Number(b.bound)-Number(a.bound));
      return <div key={slot} className="engraving-slot">
        <label>{slotNames[slot]}<select aria-label={`选择${slotNames[slot]}`} value={current?.id??''} onChange={event=>equip(slot,event.target.value)}>
          <option value="">{current?'卸下（放回库存）':'未装备'}</option>
          {current&&<option value={current.id}>{label(current)}</option>}
          {list.map(option=><option key={option.id} value={option.id}>{label(option)}{option.bound?' · 专属':''} · 库存 {option.stock}</option>)}
        </select></label>
        <small className={current&&!current.ready?'engraving-inactive':undefined}>{current?(current.ready?`生效中：${current.moveName?`${current.moveName} `:''}${current.effect}`:`未生效：${current.reason}`):list.length?`库存中可装备 ${list.length} 种`:'库存中没有这只精灵能装备的刻印。'}</small>
      </div>;
    })}
    {feedback&&<p className="management-feedback" role="status">{feedback}</p>}
  </section>;
}
