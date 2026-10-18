import {useEffect,useRef,useState} from 'react';
import type {GameController,MonsterView,StatKey} from '../game-types.ts';
import {ENGRAVING_EFFECT_GROUPS} from '../mechanics/engravings.ts';
import ItemIcon from './ItemIcon.tsx';
import ItemTile from './ItemTile.tsx';
import ItemCategoryTabs from './ItemCategoryTabs.tsx';
const slotNames={ability:'能力刻印',skill:'技能刻印'} as const;
type Slot=keyof typeof slotNames;
const abilityFilters:readonly (readonly [string,string])[]=[['all','全部'],['bound','专属'],['generic','通用'],['hp','体力'],['atk','攻击'],['def','防御'],['spa','特攻'],['spd','特防'],['spe','速度']];
const shortGroups:Record<string,string>={power:'威力',fixed:'固伤',priority:'先制',accuracy:'命中',hits:'连击',duration:'回合',status:'异常',stages:'能力',drawback:'副作用',other:'其他'};
const skillFilters:readonly (readonly [string,string])[]=[['all','全部'],...ENGRAVING_EFFECT_GROUPS.map(([id])=>[id,shortGroups[id]] as const)];

/** Two original slots, with an explicit selection and confirmation step. */
export default function EngravingSlots({m,c}:{m:MonsterView;c:GameController}) {
  const [feedback,setFeedback]=useState(''),[openSlot,setOpenSlot]=useState<Slot|null>(null),[selected,setSelected]=useState(''),[sourceUid,setSourceUid]=useState(''),[filter,setFilter]=useState('all');
  const pickerRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{setFeedback('');setOpenSlot(null);setSelected('');setSourceUid('');setFilter('all')},[m.uid]);
  useEffect(()=>{if(openSlot)pickerRef.current?.scrollIntoView({block:'nearest',inline:'nearest'})},[openSlot,selected,filter]);
  if(!c.engravingOptions)return null;
  const options=c.engravingOptions(m.uid).filter(option=>option.ready&&(option.unlimited||option.stock>0||option.equipped>0));
  const candidates=options.filter(option=>option.slot===openSlot).sort((a,b)=>Number(b.bound)-Number(a.bound));
  const matches=(option:typeof options[number],value:string)=>value==='all'||value==='bound'&&option.bound||value==='generic'&&!option.bound||(openSlot==='ability'?option.statKeys.includes(value as StatKey):option.group===value);
  const categories=(openSlot==='ability'?abilityFilters:skillFilters).filter(([id])=>id==='all'||candidates.some(option=>matches(option,id)));
  const list=candidates.filter(option=>matches(option,filter));
  const chosen=list.find(option=>option.id===selected);
  const holders=(chosen?.equippedHolders??[]).filter(holder=>holder.uid!==m.uid);
  const moving=!!chosen&&!chosen.unlimited&&(!chosen.stock||chosen.equipped>=chosen.maxOwned)&&!chosen.equippedHere&&holders.length>0;
  const source=holders.find(holder=>holder.uid===sourceUid)??holders[0];
  function equip(slot:Slot,id:string,fromUid?:string) {
    c.dispatch({type:'setEngraving',uid:m.uid,slot,engravingId:id||null,...(fromUid?{fromUid}:{})});
    const snapshot=c.snapshot(),after=snapshot.monsters.find(mon=>mon.uid===m.uid)?.engravings?.[slot];
    setFeedback(!id?(after?snapshot.notices[0]??'刻印未卸下。':'已卸下刻印。'):after?.id===id?`已装备${after.name}。`:snapshot.notices[0]??'刻印未装备，请重新选择。');
  }
  return <section className="raising-engravings" aria-label="刻印" onKeyDown={event=>{if(event.key==='Escape')setOpenSlot(null)}}>
    <div className="engraving-equipped-grid">{(['ability','skill'] as const).map(slot=>{
      const current=m.engravings?.[slot]??null;
      return <div key={slot} className="engraving-equipped-slot"><ItemTile size="small" icon={current?<ItemIcon id={current.id} engraving label={current.name} size={28}/>:<span className="engraving-empty-slot"/>} name={current?.name??`${slotNames[slot]}空孔`} description={current?`${current.effect}${current.ready?'':` · 未生效：${current.reason}`}`:'点击选择可装备的刻印。'} selected={openSlot===slot} onSelect={()=>{setOpenSlot(openSlot===slot?null:slot);setSelected(current?.id??'');setSourceUid('');setFeedback('');setFilter('all')}}/>
        <div className="engraving-slot-caption"><strong>{slotNames[slot]}</strong>{current?<button className="engraving-unload" aria-label={`卸下${slotNames[slot]}`} onClick={()=>equip(slot,'')}>卸下</button>:<small>空孔</small>}</div>
      </div>;
    })}</div>
    {openSlot&&<div ref={pickerRef} className="engraving-picker" aria-label={`选择${slotNames[openSlot]}`}><div className="engraving-picker-heading"><strong>{slotNames[openSlot]}</strong><button aria-label="关闭刻印选择" onClick={()=>setOpenSlot(null)}>关闭</button></div>
      <ItemCategoryTabs label="刻印候选分类" value={filter} options={categories} onChange={value=>{setFilter(value);setSelected('');setSourceUid('');setFeedback('')}}/>
      <div className="engraving-picker-grid item-icon-grid">{list.map(option=><ItemTile key={option.id} size="small" icon={<ItemIcon id={option.id} engraving label={option.name} size={28}/>} name={option.name} description={option.effect} quantity={option.unlimited?'∞':option.stock} selected={chosen?.id===option.id} onSelect={()=>{setSelected(option.id);setSourceUid('');setFeedback('')}}>{option.unlimited?'无限装备':`每种上限 ${option.maxOwned}`}{option.equippedHolders?.length?` · 装备于 ${option.equippedHolders.map(holder=>holder.name).join('、')}`:''}</ItemTile>)}{!list.length&&<p className="management-empty">没有可用刻印，可前往商城补充。</p>}</div>
      {chosen&&<div className="engraving-selection-detail"><strong>{chosen.name}</strong><span>{chosen.effect}</span>{moving&&<label>移装来源<select aria-label="刻印移装来源" value={source?.uid??''} onChange={event=>setSourceUid(event.target.value)}>{holders.map(holder=><option key={holder.uid} value={holder.uid}>{holder.name}</option>)}</select></label>}<div className="engraving-picker-confirm"><small>{chosen.equippedHere?'当前已装备':moving?`从${source?.name}移装到${m.name}`:`装备到${m.name}`}</small><button className="primary" disabled={chosen.equippedHere} onClick={()=>equip(openSlot,chosen.id,moving?source?.uid:undefined)}>{chosen.equippedHere?'已装备':moving?'确认移装':'确认装备'}</button></div></div>}
    </div>}
    {feedback&&<p className="management-feedback" role="status">{feedback}</p>}
  </section>;
}
