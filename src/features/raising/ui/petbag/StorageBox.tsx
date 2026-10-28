import {useMemo,useState} from 'react';
import type { MonsterView } from '../../../../shared/views.ts';
import {PARTY_MAX} from '../../../../../raising/core/storage.ts';
import {matchesElement} from '../../../../shared/element-types.ts';
import {appearanceOf} from '../../../../shared/monster-views.ts';
import {usePager} from '../../../../shared/ui/use-pager.ts';
import {CreatureArt} from '../../../../shared/ui/CreatureArt.tsx';
import MonsterCard from '../../../../shared/ui/MonsterCard.tsx';
import TypeFilter from '../../../../shared/ui/TypeFilter.tsx';
import TypeIcon from '../../../../shared/ui/TypeIcon.tsx';
import {MonsterSummary} from '../raising/OverviewTab.tsx';
import GenderMark from './GenderMark.tsx';

const PAGE_SIZE=12;
const ALL_TYPES='全部属性';
type Order=(a:MonsterView,b:MonsterView,obtained:Map<string,number>)=>number;
/** The box's orders; 最近获得 reverses the order monsters were obtained in, which is the order of the save's storage. */
const ORDERS={
  最近获得:(a,b,obtained)=>obtained.get(b.uid)!-obtained.get(a.uid)!,
  精灵编号:(a,b)=>a.species-b.species||b.level-a.level,
  等级:(a,b)=>b.level-a.level||a.species-b.species,
} satisfies Record<string,Order>;
type OrderName=keyof typeof ORDERS;

/** The box's search, filter, order, page, shown monster and the monster waiting to be swapped in; the bag keeps them across openings. */
export function useStorageBox(monsters:MonsterView[]) {
  const [search,setSearch]=useState(''),[type,setType]=useState(ALL_TYPES),[order,setOrder]=useState<OrderName>('最近获得');
  const [viewing,setViewing]=useState<string>(),[swapIn,setSwapIn]=useState<string>();
  const stored=useMemo(()=>{
    const obtained=new Map(monsters.map((m,i)=>[m.uid,i]));
    return monsters.filter(m=>!m.inParty&&`${m.species} ${m.name} ${m.speciesName}`.includes(search)&&matchesElement(m.types,type))
      .sort((a,b)=>ORDERS[order](a,b,obtained));
  },[monsters,search,type,order]);
  const pager=usePager(stored.length,PAGE_SIZE);
  const filter=<T,>(set:(value:T)=>void)=>(value:T)=>{set(value);pager.setPage(0)};
  const boxed=(uid?:string)=>monsters.find(m=>m.uid===uid&&!m.inParty);
  return {search,type,order,stored,pager,shown:boxed(viewing)??stored[pager.start],swapping:boxed(swapIn),setViewing,setSwapIn,
    setSearch:filter(setSearch),setType:filter(setType),setOrder:filter(setOrder)};
}
export type StorageBoxState=ReturnType<typeof useStorageBox>;

type Props={monsters:MonsterView[];box:StorageBoxState;partySize:number;busy:boolean;feedback:string;
  onWithdraw:(m:MonsterView)=>void;onDetails:(m:MonsterView)=>void;onClose:()=>void};

/** 精灵仓库: every owned monster outside the party. Picking one shows it beside the list, with the moves into the bag. */
export default function StorageBox({monsters,box,partySize,busy,feedback,onWithdraw,onDetails,onClose}:Props) {
  const {search,type,order,stored,shown,pager:{page,setPage,pages,start,end}}=box;
  return <section className="petbag-storage" aria-label="精灵仓库">
    <header><strong>精灵仓库</strong><span>仓库 {monsters.length-partySize} 只 · 背包 {partySize} / {PARTY_MAX}</span>
      <button aria-label="关闭精灵仓库" onClick={onClose}>返回背包</button></header>
    <div className="storage-browser">
      <div className="management-filter">
        <input aria-label="搜索仓库精灵" placeholder="名称 / 昵称 / 编号" value={search} onChange={event=>box.setSearch(event.target.value)}/>
        <TypeFilter label="仓库属性分类" value={type} groups={monsters.map(mon=>mon.types)} onChange={box.setType}/>
        <select aria-label="仓库排序" value={order} onChange={event=>box.setOrder(event.target.value as OrderName)}>
          {Object.keys(ORDERS).map(name=><option key={name} value={name}>{name}</option>)}
        </select>
      </div>
      <div className="storage-slot-grid">{stored.slice(start,end).map(mon=>
        <MonsterCard key={mon.uid} presentation="petbag-party" monster={mon} selected={shown?.uid===mon.uid} onClick={()=>box.setViewing(mon.uid)}/>)}</div>
      {!stored.length&&<div className="management-empty">
        {search||type!==ALL_TYPES?'没有匹配的仓库精灵。':'仓库暂无精灵，去星球上结识伙伴吧。'}
      </div>}
      <div className="management-pagination">
        <button disabled={page===0} onClick={()=>setPage(p=>p-1)} aria-label="上一页仓库">‹</button><span>仓库 {page+1} / {pages}</span>
        <button disabled={page+1>=pages} onClick={()=>setPage(p=>p+1)} aria-label="下一页仓库">›</button>
      </div>
    </div>
    {shown?<StoredMonster m={shown} full={partySize>=PARTY_MAX} busy={busy} swapping={box.swapping?.uid===shown.uid}
      onWithdraw={()=>onWithdraw(shown)} onSwap={()=>box.setSwapIn(uid=>uid===shown.uid?undefined:shown.uid)} onDetails={()=>onDetails(shown)}/>
      :<div className="storage-info management-empty">仓库里的精灵会显示在这里。</div>}
    <p className="storage-status" role="status">{feedback}</p>
  </section>;
}

type StoredProps={m:MonsterView;full:boolean;busy:boolean;swapping:boolean;onWithdraw:()=>void;onSwap:()=>void;onDetails:()=>void};

/** A stored monster's summary and its moves: into a free party slot, in place of a party monster when the bag is full, or to the bag's tabs. */
function StoredMonster({m,full,busy,swapping,onWithdraw,onSwap,onDetails}:StoredProps) {
  const blocked=busy?'战斗结束后才能调整背包':undefined;
  return <section className="storage-info" aria-label={`${m.name}的信息`}>
    <header><TypeIcon type={m.types}/><strong>{m.name}</strong><small>Lv.{m.level}</small><GenderMark m={m}/></header>
    <div className="storage-info-art"><CreatureArt species={appearanceOf(m)} name={m.name} fill={.95} verticalAlign="center"/></div>
    <div className="storage-info-scroll"><MonsterSummary m={m}/></div>
    {swapping&&<p className="storage-swap-hint">点击下方背包中要换下的精灵，它会回到仓库。</p>}
    <div className="storage-actions">
      {full
        ?<button className="primary" aria-pressed={swapping} disabled={busy} title={blocked??'背包已满：换下一只背包精灵'} onClick={onSwap}>
          {swapping?'取消替换':'替换背包精灵'}</button>
        :<button className="primary" disabled={busy} title={blocked} onClick={onWithdraw}>放入背包</button>}
      <button onClick={onDetails}>查看详情</button>
    </div>
  </section>;
}
