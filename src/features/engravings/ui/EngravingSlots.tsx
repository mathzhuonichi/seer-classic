import {useEffect,useRef,useState} from 'react';
import type {GameController,MonsterView} from '../../../kernel/contract.ts';
import {ENGRAVING_EFFECT_GROUPS,ENGRAVING_SLOTS} from '../../../domain/engravings/engravings.ts';
import ItemIcon from '../../../shared/ui/ItemIcon.tsx';
import ItemTile from '../../../shared/ui/ItemTile.tsx';
import ItemCategoryTabs from '../../../shared/ui/ItemCategoryTabs.tsx';
import EngravingTransferSource from './EngravingTransferSource.tsx';
import {ENGRAVING_SLOT_LABELS} from '../../../shared/labels.ts';
import {
  ENGRAVING_GROUP_SHORT_LABELS,ENGRAVING_STAT_TABS,engravingAccessView,engravingCapNote,engravingSlotCandidates,equipButtonLabel,matchesEngravingTab,
  setEngravingAction,type EngravingSlot,
} from '../view.ts';

const TABS:Record<EngravingSlot,readonly (readonly [string,string])[]>={
  ability:[['all','全部'],['bound','专属'],['generic','通用'],...ENGRAVING_STAT_TABS],
  skill:[['all','全部'],...ENGRAVING_EFFECT_GROUPS.map(([id])=>[id,ENGRAVING_GROUP_SHORT_LABELS[id]] as const)],
};

/** Two original slots, with an explicit selection and confirmation step. */
export default function EngravingSlots({m,c}:{m:MonsterView;c:GameController}) {
  const [feedback,setFeedback]=useState(''),[openSlot,setOpenSlot]=useState<EngravingSlot|null>(null),[selected,setSelected]=useState('');
  const [sourceUid,setSourceUid]=useState(''),[filter,setFilter]=useState('all');
  const pickerRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{setFeedback('');setOpenSlot(null);setSelected('');setSourceUid('');setFilter('all')},[m.uid]);
  useEffect(()=>{if(openSlot)pickerRef.current?.scrollIntoView({block:'nearest',inline:'nearest'})},[openSlot,selected,filter]);
  if(!c.engravingOptions)return null;
  const candidates=openSlot?engravingSlotCandidates(c.engravingOptions(m.uid),openSlot):[];
  const categories=openSlot?TABS[openSlot].filter(([id])=>id==='all'||candidates.some(option=>matchesEngravingTab(option,openSlot,id))):[];
  const list=openSlot?candidates.filter(option=>matchesEngravingTab(option,openSlot,filter)):[];
  const chosen=list.find(option=>option.id===selected),access=chosen&&engravingAccessView(chosen,m.uid,sourceUid);
  function equip(slot:EngravingSlot,id:string,fromUid?:string) {
    c.dispatch(setEngravingAction(m.uid,slot,id||null,fromUid));
    const snapshot=c.snapshot(),after=snapshot.monsters.find(mon=>mon.uid===m.uid)?.engravings?.[slot];
    setFeedback(!id?(after?snapshot.notices[0]??'刻印未卸下。':'已卸下刻印。')
      :after?.id===id?`已装备${after.name}。`:snapshot.notices[0]??'刻印未装备，请重新选择。');
  }
  return <section className="raising-engravings" aria-label="刻印" onKeyDown={event=>{if(event.key==='Escape')setOpenSlot(null)}}>
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
      {chosen&&access&&<div className="engraving-selection-detail"><strong>{chosen.name}</strong><span>{chosen.effect}</span>
        {access.moving&&<EngravingTransferSource holders={access.holders} value={access.source?.uid??''} onChange={setSourceUid}/>}
        <div className="engraving-picker-confirm">
          <small>{chosen.equippedHere?'当前已装备':access.moving?`从${access.source?.name}移装到${m.name}`:`装备到${m.name}`}</small>
          <button className="primary" disabled={chosen.equippedHere} onClick={()=>equip(openSlot,chosen.id,access.moving?access.source?.uid:undefined)}>
            {equipButtonLabel(chosen,access.moving)}</button></div></div>}
    </div>}
    {feedback&&<p className="management-feedback" role="status">{feedback}</p>}
  </section>;
}
