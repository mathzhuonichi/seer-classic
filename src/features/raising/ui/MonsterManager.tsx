import {useEffect,useMemo,useState} from 'react';
import type { GameController } from '../../../kernel/contract.ts';
import type { MonsterView } from '../../../shared/views.ts';
import {PARTY_MAX} from '../../../../raising/core/storage.ts';
import {useGame} from '../../../shared/ui/use-game.ts';
import {battleActive,hpPercent} from '../../../shared/view-helpers.ts';
import {appearanceOf} from '../../../shared/monster-views.ts';
import {partyMonsters} from '../../../shared/party-order.ts';
import Raising,{type RaisingTab} from './Raising.tsx';
import {CreatureArt} from '../../../shared/ui/CreatureArt.tsx';
import TypeIcon from '../../../shared/ui/TypeIcon.tsx';
import GenderMark from './petbag/GenderMark.tsx';
import PartyStrip from './petbag/PartyStrip.tsx';
import StorageBox,{useStorageBox} from './petbag/StorageBox.tsx';
import SwapDialog from './petbag/SwapDialog.tsx';
import {feedbackFor} from './raising/dispatch-feedback.ts';
import '../../../shared/ui/management.css';

interface NavButton {id:string;label:string;title?:string;text:string;pressed?:boolean;disabled?:boolean;onClick:()=>void}

/** The PetBag: side buttons, the selected monster's portrait and detail panel, the party strip and the box. */
export default function MonsterManager({c,selected,onSelect}:{c:GameController;selected:string;onSelect:(uid:string)=>void}) {
  const monsters=useGame(c,s=>s.monsters),order=useGame(c,s=>s.party),busy=useGame(c,battleActive);
  const leadUid=useGame(c,s=>battleActive(s)?s.battle!.player.uid:s.party[0]);
  const [storageOpen,setStorageOpen]=useState(false),[swapOpen,setSwapOpen]=useState(false);
  const [tabRequest,setTabRequest]=useState<{tab:RaisingTab;id:number}>(),[feedback,setFeedback]=useState('');
  const box=useStorageBox(monsters),party=useMemo(()=>partyMonsters({party:order,monsters}),[order,monsters]);
  const m=monsters.find(mon=>mon.uid===selected)??party[0]??monsters[0];
  const fainted=useGame(c,s=>battleActive(s)&&(s.battle!.party.find(mon=>mon.uid===m?.uid)?.hp??0)<=0);
  const full=party.length>=PARTY_MAX,swapping=storageOpen?box.swapping:undefined;
  useEffect(()=>{if(m&&m.uid!==selected)onSelect(m.uid)},[m?.uid,selected,onSelect]);
  useEffect(()=>setFeedback(''),[m?.uid]);
  const select=(uid:string)=>{onSelect(uid);setFeedback('')};
  const openStorage=(open:boolean)=>{setStorageOpen(open);box.setSwapIn(undefined);setFeedback('')};
  const openTab=(tab:RaisingTab)=>{openStorage(false);setTabRequest({tab,id:Date.now()})};
  function lead() {
    if(!m)return;
    if(busy){setFeedback(feedbackFor(c.dispatch({type:'switch',uid:m.uid}),`${m.name}已选择出战。`));return}
    setFeedback(feedbackFor(c.dispatch({type:'reorderParty',uids:[m.uid,...order.filter(uid=>uid!==m.uid)]}),`${m.name}已设为首发精灵。`));
  }
  function swap(target:string) {
    const uids=[...order],a=uids.indexOf(m!.uid),b=uids.indexOf(target);
    setSwapOpen(false);
    if(a<0||b<0)return;
    [uids[a],uids[b]]=[uids[b],uids[a]];
    setFeedback(feedbackFor(c.dispatch({type:'reorderParty',uids}),'出战位置已交换。'));
  }
  const withdraw=(mon:MonsterView)=>
    setFeedback(feedbackFor(c.dispatch({type:'party',uid:mon.uid,add:true}),`${mon.name}已放入背包第 ${party.length+1} 位。`));
  function moveParty() {
    if(!m)return;
    if(m.inParty)return setFeedback(feedbackFor(c.dispatch({type:'party',uid:m.uid,add:false}),`${m.name}已放回仓库。`));
    if(!full)return withdraw(m);
    box.setViewing(m.uid);
    box.setSwapIn(m.uid);
    setStorageOpen(true);
    setFeedback('');
  }
  function pickParty(mon:MonsterView) {
    if(!swapping)return select(mon.uid);
    const slot=order.indexOf(mon.uid)+1;
    box.setSwapIn(undefined);
    setFeedback(feedbackFor(c.dispatch({type:'swapWithBox',partyUid:mon.uid,boxUid:swapping.uid}),
      `${swapping.name}已换入背包第 ${slot} 位，${mon.name}已放回仓库。`));
  }
  const details=(mon:MonsterView)=>{openStorage(false);onSelect(mon.uid)};
  const heal=()=>setFeedback(feedbackFor(c.dispatch({type:'heal'}),'全队体力与技能已恢复。'));
  const nav:NavButton[]=[
    {id:'lead',label:'设为首发精灵',text:'首发',disabled:!m?.inParty||leadUid===m.uid||fainted,onClick:lead},
    {id:'heal',label:'全队恢复',text:'恢复',disabled:busy,onClick:heal},
    {id:'storage',label:'打开精灵仓库',title:'精灵仓库',text:'仓库',pressed:storageOpen,onClick:()=>openStorage(!storageOpen)},
    {id:'party',...partyButton(m,party.length,busy),onClick:moveParty},
    {id:'swap',label:'交换出战位置',text:'交换',pressed:swapOpen,disabled:!m?.inParty||busy,onClick:()=>setSwapOpen(open=>!open)},
    {id:'skills',label:'调整精灵技能',text:'技能',onClick:()=>openTab('技能')},
    {id:'evs',label:'编辑学习力',text:'学习力',onClick:()=>openTab('详情')},
    {id:'experience',label:'经验分配器',text:'经验',onClick:()=>openTab('养成')},
  ];
  return <section className="management-panel monster-management official-petbag" aria-label="精灵管理面板">
    <nav className="petbag-navigation" aria-label="精灵背包操作">{nav.map(button=>
      <button key={button.id} className={`petbag-nav petbag-nav-${button.id}`} aria-label={button.label} title={button.title??button.label}
        aria-pressed={button.pressed} disabled={button.disabled} onClick={button.onClick}><span>{button.text}</span></button>)}</nav>
    {m?<>
      <Portrait m={m}/>
      <div className="petbag-details"><Raising key={m.uid} m={m} c={c} requestedTab={tabRequest}/></div>
    </>:<div className="petbag-details management-empty">还没有精灵，前往地图开启旅程。</div>}
    <div className="petbag-status" role="status">{feedback}</div>
    <PartyStrip party={party} selected={m?.uid} swapping={!!swapping} onPick={pickParty} onEmpty={()=>openStorage(true)}/>
    {swapOpen&&m?.inParty&&<SwapDialog key={m.uid} m={m} party={party} order={order} onSwap={swap} onClose={()=>setSwapOpen(false)}/>}
    {storageOpen&&<StorageBox monsters={monsters} box={box} partySize={party.length} busy={busy} feedback={feedback}
      onWithdraw={withdraw} onDetails={details} onClose={()=>openStorage(false)}/>}
  </section>;
}

/** The bag button for the selected monster: 存入 (the original's 放回仓库) for a party monster, 入队 for a stored one, 替换 when the bag is full. */
function partyButton(m:MonsterView|undefined,size:number,busy:boolean):Omit<NavButton,'id'|'onClick'> {
  if(m?.inParty)return {label:'放回仓库',text:'存入',disabled:busy||size<=1,title:size<=1?'背包至少要留一只精灵':undefined};
  if(size<PARTY_MAX)return {label:'加入出战',text:'入队',disabled:!m||busy};
  return {label:'替换背包精灵',title:'背包已满：在仓库中选择要换下的精灵',text:'替换',disabled:!m||busy};
}

function Portrait({m}:{m:MonsterView}) {
  return <section className="petbag-portrait" aria-label={`${m.name}立绘`}>
    <div className="petbag-portrait-name"><TypeIcon type={m.types}/><strong>{m.name}</strong><div className="petbag-level"><small>Lv.{m.level}</small>
      <GenderMark m={m}/></div></div>
    <div className="petbag-portrait-art"><CreatureArt species={appearanceOf(m)} name={m.name} fill={.97} verticalAlign="center"/></div>
    <div className="petbag-portrait-meta">
      <div className="hp-bar"><i style={{width:`${hpPercent(m.hp,m.stats.hp)}%`}}/></div><strong>基础体力 {m.hp} / {m.stats.hp}</strong>
    </div>
  </section>;
}
