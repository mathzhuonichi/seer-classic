import {useEffect,useMemo,useState} from 'react';
import type { GameController } from '../../../kernel/contract.ts';
import type { MonsterView } from '../../../shared/views.ts';
import {PARTY_MAX} from '../../../../raising/core/storage.ts';
import {useGame} from '../../../shared/ui/use-game.ts';
import {battleActive,hpPercent} from '../../../shared/view-helpers.ts';
import {appearanceOf} from '../../../shared/monster-views.ts';
import {partyMonsters} from '../../../shared/party-order.ts';
import MonsterCard from '../../../shared/ui/MonsterCard.tsx';
import Raising,{type RaisingTab} from './Raising.tsx';
import {CreatureArt} from '../../../shared/ui/CreatureArt.tsx';
import TypeIcon from '../../../shared/ui/TypeIcon.tsx';
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
  useEffect(()=>{if(m&&m.uid!==selected)onSelect(m.uid)},[m?.uid,selected,onSelect]);
  useEffect(()=>setFeedback(''),[m?.uid]);
  const select=(uid:string)=>{onSelect(uid);setFeedback('')};
  const openTab=(tab:RaisingTab)=>{setStorageOpen(false);setTabRequest({tab,id:Date.now()})};
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
  function moveParty() {
    if(!m)return;
    setFeedback(feedbackFor(c.dispatch({type:'party',uid:m.uid,add:!m.inParty}),m.inParty?'精灵已移入仓库。':'精灵已加入出战背包。'));
  }
  const heal=()=>setFeedback(feedbackFor(c.dispatch({type:'heal'}),'全队体力与技能已恢复。'));
  const partyBlocked=!m||busy||(m.inParty?party.length<=1:party.length>=PARTY_MAX);
  const nav:NavButton[]=[
    {id:'lead',label:'设为首发精灵',text:'首发',disabled:!m?.inParty||leadUid===m.uid||fainted,onClick:lead},
    {id:'heal',label:'全队恢复',text:'恢复',disabled:busy,onClick:heal},
    {id:'storage',label:'打开精灵仓库',title:'精灵仓库',text:'仓库',pressed:storageOpen,onClick:()=>setStorageOpen(open=>!open)},
    {id:'party',label:m?.inParty?'存入仓库':'加入出战',text:m?.inParty?'存入':'入队',disabled:partyBlocked,onClick:moveParty},
    {id:'swap',label:'交换出战位置',text:'交换',pressed:swapOpen,disabled:!m?.inParty||busy,onClick:()=>setSwapOpen(open=>!open)},
    {id:'skills',label:'调整精灵技能',text:'技能',onClick:()=>openTab('技能')},
    {id:'evs',label:'编辑学习力',text:'学习力',onClick:()=>openTab('详情')},
    {id:'experience',label:'经验分配器',text:'经验',onClick:()=>openTab('养成')},
  ];
  const pick=(mon:MonsterView)=>{select(mon.uid);setStorageOpen(false)};
  return <section className="management-panel monster-management official-petbag" aria-label="精灵管理面板">
    <nav className="petbag-navigation" aria-label="精灵背包操作">{nav.map(button=>
      <button key={button.id} className={`petbag-nav petbag-nav-${button.id}`} aria-label={button.label} title={button.title??button.label}
        aria-pressed={button.pressed} disabled={button.disabled} onClick={button.onClick}><span>{button.text}</span></button>)}</nav>
    {m?<>
      <Portrait m={m}/>
      <div className="petbag-details"><Raising key={m.uid} m={m} c={c} requestedTab={tabRequest}/></div>
    </>:<div className="petbag-details management-empty">还没有精灵，前往地图开启旅程。</div>}
    <div className="petbag-status" role="status">{feedback}</div>
    <div className="petbag-party-strip" aria-label="六个出战精灵位">{Array.from({length:PARTY_MAX},(_,i)=>party[i]
      ?<MonsterCard key={party[i].uid} presentation="petbag-party" slot={i+1} monster={party[i]} selected={m?.uid===party[i].uid}
        onClick={()=>select(party[i].uid)}/>
      :<div key={`empty-${i}`} className="petbag-empty-slot"><span>{i+1}</span><strong>空位</strong></div>)}</div>
    {swapOpen&&m?.inParty&&<SwapDialog key={m.uid} m={m} party={party} order={order} onSwap={swap} onClose={()=>setSwapOpen(false)}/>}
    {storageOpen&&<StorageBox monsters={monsters} box={box} count={monsters.length-party.length} selected={m?.uid} onPick={pick}
      onClose={()=>setStorageOpen(false)}/>}
  </section>;
}

function Portrait({m}:{m:MonsterView}) {
  const [gender,genderLabel,symbol]=m.gender===1?['male','雄性','♂']:['female','雌性','♀'];
  return <section className="petbag-portrait" aria-label={`${m.name}立绘`}>
    <div className="petbag-portrait-name"><TypeIcon type={m.types}/><strong>{m.name}</strong><div className="petbag-level"><small>Lv.{m.level}</small>
      {!!m.gender&&<span className={`petbag-gender ${gender}`} role="img" aria-label={genderLabel} title={genderLabel}>{symbol}</span>}</div></div>
    <div className="petbag-portrait-art"><CreatureArt species={appearanceOf(m)} name={m.name} fill={.97} verticalAlign="center"/></div>
    <div className="petbag-portrait-meta">
      <div className="hp-bar"><i style={{width:`${hpPercent(m.hp,m.stats.hp)}%`}}/></div><strong>基础体力 {m.hp} / {m.stats.hp}</strong>
    </div>
  </section>;
}
