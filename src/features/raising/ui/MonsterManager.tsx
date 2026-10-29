import {useEffect,useMemo,useState} from 'react';
import type { GameController } from '../../../kernel/contract.ts';
import type { MonsterView } from '../../../shared/views.ts';
import {PARTY_MAX} from '../../../../raising/core/storage.ts';
import {useGame} from '../../../shared/ui/use-game.ts';
import {battleActive,hpPercent} from '../../../shared/view-helpers.ts';
import {appearanceOf} from '../../../shared/monster-views.ts';
import {partyMonsters} from '../../../shared/party-order.ts';
import Raising,{type RaisingTab,type TabRequest} from './Raising.tsx';
import {CreatureArt} from '../../../shared/ui/CreatureArt.tsx';
import TypeIcon from '../../../shared/ui/TypeIcon.tsx';
import GenderMark from './petbag/GenderMark.tsx';
import PartyStrip from './petbag/PartyStrip.tsx';
import StorageBox,{FavoriteButton,useStorageBox} from './petbag/StorageBox.tsx';
import PlaceDialog from './petbag/PlaceDialog.tsx';
import PortraitEngravings from './petbag/PortraitEngravings.tsx';
import SkinButtons from './petbag/SkinButtons.tsx';
import SwapDialog from './petbag/SwapDialog.tsx';
import {feedbackFor} from './raising/dispatch-feedback.ts';
import '../../../shared/ui/management.css';

interface NavButton {id:string;label:string;title?:string;text:string;pressed?:boolean;disabled?:boolean;onClick:()=>void}

/** The PetBag: side buttons, the selected monster (the lead unless one was asked for), its portrait and detail panel, the party strip and the box. */
export default function MonsterManager({c,selected,onSelect}:{c:GameController;selected:string;onSelect:(uid:string)=>void}) {
  const monsters=useGame(c,s=>s.monsters),order=useGame(c,s=>s.party),busy=useGame(c,battleActive);
  const leadUid=useGame(c,s=>battleActive(s)?s.battle!.player.uid:s.party[0]),species=useGame(c,s=>s.species);
  const dexTypes=useMemo(()=>species.map(sp=>sp.types),[species]);
  const [storageOpen,setStorageOpen]=useState(false),[swapOpen,setSwapOpen]=useState(false),[placing,setPlacing]=useState<string>();
  const [tabRequest,setTabRequest]=useState<TabRequest>(),[feedback,setFeedback]=useState('');
  const box=useStorageBox(monsters),party=useMemo(()=>partyMonsters({party:order,monsters}),[order,monsters]);
  const m=monsters.find(mon=>mon.uid===selected)??monsters.find(mon=>mon.uid===leadUid)??party[0]??monsters[0];
  const placed=monsters.find(mon=>mon.uid===placing&&!mon.inParty);
  const fainted=useGame(c,s=>battleActive(s)&&(s.battle!.party.find(mon=>mon.uid===m?.uid)?.hp??0)<=0);
  useEffect(()=>{if(m&&m.uid!==selected)onSelect(m.uid)},[m?.uid,selected,onSelect]);
  useEffect(()=>setFeedback(''),[m?.uid]);
  const select=(uid:string)=>{onSelect(uid);setFeedback('')};
  const openStorage=(open:boolean)=>{setStorageOpen(open);setFeedback('')};
  const openTab=(tab:RaisingTab,request:Partial<TabRequest>={})=>{openStorage(false);setTabRequest({tab,id:Date.now(),...request})};
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
  /** The place dialog's moves: the stored monster into the next free slot, or into a party monster's slot, which goes to the box. */
  function add(mon:MonsterView) {
    setPlacing(undefined);
    setFeedback(feedbackFor(c.dispatch({type:'party',uid:mon.uid,add:true}),`${mon.name}已放入背包第 ${party.length+1} 位。`));
  }
  function swapIn(mon:MonsterView,out:MonsterView) {
    setPlacing(undefined);
    setFeedback(feedbackFor(c.dispatch({type:'swapWithBox',partyUid:out.uid,boxUid:mon.uid}),
      `${mon.name}已换入背包第 ${order.indexOf(out.uid)+1} 位，${out.name}已放回仓库。`));
  }
  /** A stored monster joins a bag with room at once; a full bag asks which party monster it replaces. */
  const place=(mon:MonsterView)=>party.length<PARTY_MAX?add(mon):setPlacing(mon.uid);
  function moveParty() {
    if(!m)return;
    if(m.inParty)return setFeedback(feedbackFor(c.dispatch({type:'party',uid:m.uid,add:false}),`${m.name}已放回仓库。`));
    place(m);
  }
  const skin=(mon:MonsterView,species:number)=>setFeedback(feedbackFor(c.dispatch({type:'setSkin',uid:mon.uid,species:species===mon.species?null:species}),
    '此精灵的皮肤已保存。'));
  const favorite=(mon:MonsterView)=>setFeedback(feedbackFor(c.dispatch({type:'favorite',uid:mon.uid,favorite:!mon.favorite}),
    mon.favorite?`${mon.name}已取消收藏。`:`${mon.name}已加入收藏，打开仓库时会先显示。`));
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
      <Portrait m={m} onFavorite={()=>favorite(m)} onSkin={species=>skin(m,species)}
        onEngravings={()=>openTab('详情',{editing:false,section:'engravings'})}/>
      <div className="petbag-details"><Raising key={m.uid} m={m} c={c} requestedTab={tabRequest}/></div>
    </>:<div className="petbag-details management-empty">还没有精灵，前往地图开启旅程。</div>}
    <div className="petbag-status" role="status">{feedback}</div>
    {!storageOpen&&<PartyStrip party={party} selected={m?.uid} onPick={mon=>select(mon.uid)} onEmpty={()=>openStorage(true)}/>}
    {swapOpen&&m?.inParty&&<SwapDialog key={m.uid} m={m} party={party} order={order} onSwap={swap} onClose={()=>setSwapOpen(false)}/>}
    {storageOpen&&<StorageBox monsters={monsters} dexTypes={dexTypes} box={box} partySize={party.length} busy={busy} feedback={feedback}
      onPlace={place} onFavorite={favorite} onDetails={details} onClose={()=>openStorage(false)}/>}
    {placed&&!busy&&<PlaceDialog m={placed} party={party} onAdd={()=>add(placed)} onSwap={out=>swapIn(placed,out)} onClose={()=>setPlacing(undefined)}/>}
  </section>;
}

/** The bag button for the selected monster: 存入 (the original's 放回仓库) for a party monster, 入队 for a stored one (a full bag asks whom it replaces). */
function partyButton(m:MonsterView|undefined,size:number,busy:boolean):Omit<NavButton,'id'|'onClick'> {
  if(m?.inParty)return {label:'放回仓库',text:'存入',disabled:busy||size<=1,title:size<=1?'背包至少要留一只精灵':undefined};
  return {label:'放入背包',text:'入队',disabled:!m||busy,title:size<PARTY_MAX?undefined:'背包已满：选择要换下的精灵'};
}

type PortraitProps={m:MonsterView;onFavorite:()=>void;onSkin:(species:number)=>void;onEngravings:()=>void};
function Portrait({m,onFavorite,onSkin,onEngravings}:PortraitProps) {
  return <section className="petbag-portrait" aria-label={`${m.name}立绘`}>
    <div className="petbag-portrait-name"><TypeIcon type={m.types}/><strong>{m.name}</strong><div className="petbag-level"><small>Lv.{m.level}</small>
      <GenderMark m={m}/></div><FavoriteButton m={m} onClick={onFavorite}/></div>
    <div className="petbag-portrait-art"><CreatureArt species={appearanceOf(m)} name={m.name} fill={.97} verticalAlign="center"/>
      <SkinButtons m={m} onPick={onSkin}/></div>
    <PortraitEngravings m={m} onOpen={onEngravings}/>
    <div className="petbag-portrait-meta">
      <div className="hp-bar"><i style={{width:`${hpPercent(m.hp,m.stats.hp)}%`}}/></div><strong>基础体力 {m.hp} / {m.stats.hp}</strong>
    </div>
  </section>;
}
