import {useMemo,useState} from 'react';
import type { MonsterView } from '../../../../shared/views.ts';
import {PARTY_MAX} from '../../../../../raising/core/storage.ts';
import {dualElements,elementName,elementParts,singleElements} from '../../../../shared/element-types.ts';
import {usePager} from '../../../../shared/ui/use-pager.ts';
import MonsterCard from '../../../../shared/ui/MonsterCard.tsx';
import TypeIcon from '../../../../shared/ui/TypeIcon.tsx';
import GenderMark from './GenderMark.tsx';
import StoredSummary from './StoredSummary.tsx';

const PAGE_SIZE=12;
type Order=(a:MonsterView,b:MonsterView,obtained:Map<string,number>)=>number;
/** The box's orders; 最近获得 reverses the order monsters were obtained in, which is the order of the save's storage. */
const ORDERS={
  最近获得:(a,b,obtained)=>obtained.get(b.uid)!-obtained.get(a.uid)!,
  精灵编号:(a,b)=>a.species-b.species||b.level-a.level,
  等级:(a,b)=>b.level-a.level||a.species-b.species,
} satisfies Record<string,Order>;
type OrderName=keyof typeof ORDERS;

/**
 * What the box lists: its 收藏 (which it opens on), all of it, or its single- or dual-element monsters, narrowed by an element (a
 * single one, or a dual pair by its art's name). `grid` is the element buttons shown; `withDuals` adds, to a single element, the
 * dual-element monsters that have it.
 */
interface Shelf {view:'favorites'|'all'|'single'|'dual';grid:'single'|'dual';element:string|null;withDuals:boolean}
function listed({types,favorite}:MonsterView,{view,element,withDuals}:Shelf) {
  if(view==='favorites')return favorite;
  if(view==='dual')return types.length===2&&(!element||elementName(types)===element);
  if(view==='single')return (types.length===1||withDuals)&&(!element||types.includes(element));
  return true;
}

/**
 * The box's shelf, search, order, page and shown monster (the one picked, else the page's first); the bag keeps them across openings.
 * A search looks through the whole box, whatever the shelf, and picking a shelf ends it.
 */
export function useStorageBox(monsters:MonsterView[]) {
  const [search,setSearch]=useState(''),[shelf,setShelf]=useState<Shelf>({view:'favorites',grid:'single',element:null,withDuals:false});
  const [order,setOrder]=useState<OrderName>('最近获得'),[viewing,setViewing]=useState<string>();
  const boxed=useMemo(()=>monsters.filter(m=>!m.inParty),[monsters]);
  const query=search.trim();
  const stored=useMemo(()=>{
    const obtained=new Map(monsters.map((m,i)=>[m.uid,i]));
    return boxed.filter(m=>query?`${m.species} ${m.name} ${m.speciesName}`.includes(query):listed(m,shelf)).sort((a,b)=>ORDERS[order](a,b,obtained));
  },[monsters,boxed,query,shelf,order]);
  const pager=usePager(stored.length,PAGE_SIZE);
  /** A new list starts on its first page and shows its first monster. */
  const filter=<T,>(set:(value:T)=>void)=>(value:T)=>{set(value);pager.setPage(0);setViewing(undefined)};
  /** A shelf change ends a search. */
  const pick=filter((next:Partial<Shelf>)=>{setShelf(old=>({...old,...next}));setSearch('')});
  return {search,shelf,searching:!!query,order,stored,pager,boxed,favorites:boxed.filter(m=>m.favorite).length,
    shown:boxed.find(m=>m.uid===viewing)??stored[pager.start],setViewing,setSearch:filter(setSearch),setOrder:filter(setOrder),pick};
}
export type StorageBoxState=ReturnType<typeof useStorageBox>;

type Props={monsters:MonsterView[];dexTypes:string[][];box:StorageBoxState;partySize:number;busy:boolean;feedback:string;
  onPlace:(m:MonsterView)=>void;onFavorite:(m:MonsterView)=>void;onDetails:(m:MonsterView)=>void;onClose:()=>void};

/** 精灵仓库: shelves on the left, the shelf's monsters, and the picked one beside them with the move into the bag. */
export default function StorageBox({monsters,dexTypes,box,partySize,busy,feedback,onPlace,onFavorite,onDetails,onClose}:Props) {
  const {search,order,stored,shown,pager:{page,setPage,pages,start,end}}=box;
  return <><StorageTitle/><section className="petbag-storage" aria-label="精灵仓库">
    <header><strong>精灵仓库</strong><span>仓库 {monsters.length-partySize} 只 · 背包 {partySize} / {PARTY_MAX}</span>
      <button aria-label="关闭精灵仓库" onClick={onClose}>返回背包</button></header>
    <Shelves box={box} dexTypes={dexTypes}/>
    <div className="storage-browser">
      <div className="management-filter">
        <input aria-label="搜索仓库精灵" placeholder="搜索全部：名称 / 昵称 / 编号" value={search} onChange={event=>box.setSearch(event.target.value)}/>
        <select aria-label="仓库排序" value={order} onChange={event=>box.setOrder(event.target.value as OrderName)}>
          {Object.keys(ORDERS).map(name=><option key={name} value={name}>{name}</option>)}
        </select>
      </div>
      {stored.length?<div className="storage-slot-grid">{stored.slice(start,end).map(mon=>
        <MonsterCard key={mon.uid} presentation="petbag-party" monster={mon} selected={shown?.uid===mon.uid} onClick={()=>box.setViewing(mon.uid)}/>)}</div>
        :<Empty box={box}/>}
      <div className="management-pagination">
        <button disabled={page===0} onClick={()=>setPage(p=>p-1)} aria-label="上一页仓库">‹</button><span>第 {page+1} / {pages} 页</span>
        <button disabled={page+1>=pages} onClick={()=>setPage(p=>p+1)} aria-label="下一页仓库">›</button>
      </div>
    </div>
    {shown?<StoredMonster m={shown} busy={busy} full={partySize>=PARTY_MAX}
      onPlace={()=>onPlace(shown)} onFavorite={()=>onFavorite(shown)} onDetails={()=>onDetails(shown)}/>
      :<div className="storage-info management-empty">仓库里的精灵会显示在这里。</div>}
    <p className="storage-status" role="status">{feedback}</p>
  </section></>;
}

/** The frame's header stripes behind its title, as [frame pixel row, colour] stops from the patch's top (47) to its bottom (132). */
const TITLE_STRIPES:[number,string][]=[[47,'#2fabf3'],[63,'#2fabf3'],[63,'#1990e7'],[75,'#1990e7'],[75,'#30aaf1'],[83,'#30aaf1'],
  [83,'#1993e8'],[96,'#1993e8'],[96,'#2fabf2'],[132,'#2fabf2']];

/**
 * 精灵仓库 over the frame's 精灵背包 title (ART.md: drawn here, not a new image). The viewBox is the frame art's pixels 560–910 ×
 * 40–135: the patch repeats the header's stripes over the old lettering and its outline, and the text follows its white-on-navy style.
 */
function StorageTitle() {
  return <svg className="petbag-storage-title" viewBox="560 40 350 95" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="petbag-storage-stripes" x1="0" y1="47" x2="0" y2="132" gradientUnits="userSpaceOnUse">
      {TITLE_STRIPES.map(([y,color],i)=><stop key={i} offset={(y-47)/85} stopColor={color}/>)}
    </linearGradient></defs>
    <rect x="584" y="47" width="302" height="85" fill="url(#petbag-storage-stripes)"/>
    <text x="735" y="90" textAnchor="middle" dominantBaseline="central" textLength="272" lengthAdjust="spacingAndGlyphs">精灵仓库</text>
  </svg>;
}

/**
 * The shelves: 收藏, 全部, then 单属性 or 双属性 with their buttons: the dex's single elements or dual pairs (those of 2013), the
 * ones some stored monster has first and the others dimmed after them, each part in source order. 包含双属性 adds, to a single
 * element, the dual-element monsters that have it. Picking the picked element again lists the whole grid's kind.
 */
function Shelves({box,dexTypes}:{box:StorageBoxState;dexTypes:string[][]}) {
  const {shelf,searching,pick}=box,on=(test:boolean)=>!searching&&test,dual=shelf.grid==='dual';
  const all=useMemo(()=>({single:singleElements(dexTypes),dual:dualElements(dexTypes)}),[dexTypes]);
  const owned=new Set(dual?box.boxed.filter(m=>m.types.length===2).map(m=>elementName(m.types))
    :box.boxed.filter(m=>m.types.length===1||shelf.withDuals).flatMap(m=>m.types));
  const elements=[...all[shelf.grid].filter(name=>owned.has(name)),...all[shelf.grid].filter(name=>!owned.has(name))];
  const label=(element:string)=>`${elementParts(element).join('·')}${dual?'（双属性）':'属性'}`;
  const kind=(grid:Shelf['grid'])=>pick({view:grid,grid,element:null});
  return <nav className="storage-shelves" aria-label="仓库分类">
    <button type="button" className="storage-shelf" aria-pressed={on(shelf.view==='favorites')} aria-label={`收藏（${box.favorites}）`}
      onClick={()=>pick({view:'favorites',element:null})}><i aria-hidden="true">★</i>收藏</button>
    <button type="button" className="storage-shelf" aria-pressed={on(shelf.view==='all')} aria-label="全部"
      onClick={()=>pick({view:'all',element:null})}><i aria-hidden="true">◆</i>全部</button>
    <div className="storage-kinds" role="group" aria-label="单双属性">
      <button type="button" aria-pressed={on(shelf.view==='single')} className={dual?undefined:'is-shown'} onClick={()=>kind('single')}>单属性</button>
      <button type="button" aria-pressed={on(shelf.view==='dual')} className={dual?'is-shown':undefined} onClick={()=>kind('dual')}>双属性</button>
    </div>
    {!dual&&<label className="storage-with-duals"><input type="checkbox" checked={shelf.withDuals}
      onChange={event=>pick({view:'single',withDuals:event.target.checked})}/>包含双属性</label>}
    <div className={`storage-elements${dual?' is-dual':''}`} role="group" aria-label={dual?'双属性组合':'属性'}>{elements.map(element=>
      <button key={element} type="button" aria-pressed={on(shelf.view===shelf.grid&&shelf.element===element)} aria-label={label(element)}
        title={owned.has(element)?label(element):`${label(element)}：仓库里没有`} className={owned.has(element)?undefined:'is-empty'}
        onClick={()=>pick({view:shelf.grid,element:shelf.view===shelf.grid&&shelf.element===element?null:element})}>
        <TypeIcon type={element} focusable={false} showTooltip={false}/></button>)}
</div>
  </nav>;
}

function Empty({box}:{box:StorageBoxState}) {
  const all=()=>box.pick({view:'all',element:null});
  if(!box.searching&&box.shelf.view==='favorites')return <div className="management-empty">还没有收藏的精灵。<br/>选中一只精灵，点名字旁的 ☆ 收藏，下次打开仓库会先看到它。
    <button type="button" onClick={all}>查看全部精灵</button></div>;
  if(box.searching||!box.boxed.length)return <div className="management-empty">{box.searching?'没有匹配的仓库精灵。':'仓库暂无精灵，去星球上结识伙伴吧。'}</div>;
  return <div className="management-empty">这个分类下没有仓库精灵。<button type="button" onClick={all}>查看全部精灵</button></div>;
}

type StoredProps={m:MonsterView;busy:boolean;full:boolean;onPlace:()=>void;onFavorite:()=>void;onDetails:()=>void};

/** A stored monster's summary, its 收藏 mark, and its moves: into the bag (its next slot, or in place of a party monster when full), or to the bag's tabs. */
function StoredMonster({m,busy,full,onPlace,onFavorite,onDetails}:StoredProps) {
  return <section className="storage-info" aria-label={`${m.name}的信息`}>
    <header><TypeIcon type={m.types}/><strong>{m.name}</strong><small>Lv.{m.level}</small><GenderMark m={m}/>
      <FavoriteButton m={m} onClick={onFavorite}/></header>
    <StoredSummary m={m}/>
    <div className="storage-actions">
      <button className="primary" disabled={busy} title={busy?'战斗结束后才能调整背包':full?'背包已满：选择要换下的精灵':undefined} onClick={onPlace}>
        {full?'换入背包':'放入背包'}</button>
      <button onClick={onDetails}>查看详情</button>
    </div>
  </section>;
}

/** The ☆ that marks a monster as one of the box's 收藏, in the box and in the bag. */
export function FavoriteButton({m,onClick}:{m:MonsterView;onClick:()=>void}) {
  return <button type="button" className="petbag-favorite" aria-pressed={m.favorite} aria-label={m.favorite?'取消收藏':'收藏'}
    title={m.favorite?'取消收藏':'收藏：打开仓库时先显示'} onClick={onClick}>{m.favorite?'★':'☆'}</button>;
}
