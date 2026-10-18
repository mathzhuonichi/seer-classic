import {useEffect,useMemo,useRef,useState} from 'react';
import type { GameController } from '../../../kernel/contract.ts';
import type { MonsterView } from '../../../shared/views.ts';
import {ENGRAVING_EFFECT_GROUPS,ENGRAVING_SLOTS} from '../../../domain/engravings/engravings.ts';
import ItemIcon from '../../../shared/ui/ItemIcon.tsx';
import ItemTile from '../../../shared/ui/ItemTile.tsx';
import ItemCategoryTabs from '../../../shared/ui/ItemCategoryTabs.tsx';
import {useGame} from '../../../shared/ui/use-game.ts';
import EngravingTransferSource from './EngravingTransferSource.tsx';
import {ENGRAVING_SLOT_LABELS} from '../../../shared/labels.ts';
import {
  ENGRAVING_GROUP_SHORT_LABELS,ENGRAVING_STAT_TABS,engravingCapNote,engravingSlotCandidates,equipButtonLabel,matchesEngravingTab,transferHolder,
  type EngravingSlot,
} from '../view.ts';

const TABS:Record<EngravingSlot,readonly (readonly [string,string])[]>={
  ability:[['all','全部'],['bound','专属'],['generic','通用'],...ENGRAVING_STAT_TABS],
  skill:[['all','全部'],...ENGRAVING_EFFECT_GROUPS.map(([id])=>[id,ENGRAVING_GROUP_SHORT_LABELS[id]] as const)],
};

/** Two original slots, with an explicit selection and confirmation step. */
export default function EngravingSlots({m,c}:{m:MonsterView;c:GameController}) {
  const [feedback,setFeedback]=useState(''),[openSlot,setOpenSlot]=useState<EngravingSlot|null>(null),[selected,setSelected]=useState('');
  const [sourceUid,setSourceUid]=useState(''),[filter,setFilter]=useState('all');
  const pickerRef=useRef<HTMLDivElement>(null),monsters=useGame(c,s=>s.monsters),stock=useGame(c,s=>s.engravingStock);
  // The options follow the monster rows and the stock, so they are read again when either changes.
  const options=useMemo(()=>openSlot?c.engravingOptions(m.uid):[],[c,m.uid,openSlot,monsters,stock]);
  useEffect(()=>{setFeedback('');setOpenSlot(null);setSelected('');setSourceUid('');setFilter('all')},[m.uid]);
  useEffect(()=>{if(openSlot)pickerRef.current?.scrollIntoView({block:'nearest',inline:'nearest'})},[openSlot,selected,filter]);
  // Escape closes an open picker, not its window, wherever the focus is (a click leaves none in WebKit): the document hears
  // it after the controls inside, such as a tile's tooltip, and before the shell's window listener.
  useEffect(()=>{
    if(!openSlot)return;
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();setOpenSlot(null)}};
    document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);
  },[openSlot]);
  const candidates=openSlot?engravingSlotCandidates(options,openSlot):[];
  const categories=openSlot?TABS[openSlot].filter(([id])=>id==='all'||candidates.some(option=>matchesEngravingTab(option,openSlot,id))):[];
  const list=openSlot?candidates.filter(option=>matchesEngravingTab(option,openSlot,filter)):[];
  const chosen=list.find(option=>option.id===selected),source=chosen&&transferHolder(chosen,sourceUid);
  const equip=(slot:EngravingSlot,id:string,fromUid?:string)=>
    setFeedback(c.dispatch({type:'setEngraving',uid:m.uid,slot,engravingId:id||null,fromUid}).notice??'');
  return <section className="raising-engravings" aria-label="刻印">
    <div className="engraving-equipped-grid">{ENGRAVING_SLOTS.map(slot=>{
      const current=m.engravings?.[slot]??null,label=ENGRAVING_SLOT_LABELS[slot];
      return <div key={slot} className="engraving-equipped-slot">
        <ItemTile size="small" icon={current?<ItemIcon id={current.id} engraving label={current.name} size={28}/>:<span className="engraving-empty-slot"/>}
          name={current?.name??`${label}空孔`} description={current?`${current.effect}${current.ready?'':` · 未生效：${current.reason}`}`:'点击选择可装备的刻印。'}
          selected={openSlot===slot}
          onSelect={()=>{setOpenSlot(openSlot===slot?null:slot);setSelected(current?.id??'');setSourceUid('');setFeedback('');setFilter('all')}}/>
        <div className="engraving-slot-caption"><strong>{label}</strong>
          {current?<button className="engraving-unload" aria-label={`卸下${label}`} onClick={()=>equip(slot,'')}>卸下</button>:<small>空孔</small>}</div>
      </div>;
    })}</div>
    {openSlot&&<div ref={pickerRef} className="engraving-picker" aria-label={`选择${ENGRAVING_SLOT_LABELS[openSlot]}`}>
      <div className="engraving-picker-heading"><strong>{ENGRAVING_SLOT_LABELS[openSlot]}</strong>
        <button aria-label="关闭刻印选择" onClick={()=>setOpenSlot(null)}>关闭</button></div>
      <ItemCategoryTabs label="刻印候选分类" value={filter} options={categories}
        onChange={value=>{setFilter(value);setSelected('');setSourceUid('');setFeedback('')}}/>
      <div className="engraving-picker-grid item-icon-grid">
        {list.map(option=><ItemTile key={option.id} size="small" icon={<ItemIcon id={option.id} engraving label={option.name} size={28}/>}
          name={option.name} description={option.effect} quantity={option.unlimited?'∞':option.stock} selected={chosen?.id===option.id}
          onSelect={()=>{setSelected(option.id);setSourceUid('');setFeedback('')}}>{engravingCapNote(option)}</ItemTile>)}
        {!list.length&&<p className="management-empty">没有可用刻印，可前往商城补充。</p>}
      </div>
      {chosen&&<div className="engraving-selection-detail"><strong>{chosen.name}</strong><span>{chosen.effect}</span>
        {source&&<EngravingTransferSource holders={chosen.transferFrom!} value={source.uid} onChange={setSourceUid}/>}
        <div className="engraving-picker-confirm">
          <small>{chosen.equippedHere?'当前已装备':source?`从${source.name}移装到${m.name}`:`装备到${m.name}`}</small>
          <button className="primary" disabled={chosen.equipMode==='blocked'} onClick={()=>equip(openSlot,chosen.id,source?.uid)}>
            {equipButtonLabel(chosen)}</button></div></div>}
    </div>}
    {feedback&&<p className="management-feedback" role="status">{feedback}</p>}
  </section>;
}
