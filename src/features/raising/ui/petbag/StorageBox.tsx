import {useMemo,useState} from 'react';
import type {GameSnapshot,MonsterView} from '../../../../kernel/contract.ts';
import {matchesElement} from '../../../../shared/element-types.ts';
import {usePager} from '../../../../shared/ui/use-pager.ts';
import MonsterCard from '../../../../shared/ui/MonsterCard.tsx';
import TypeFilter from '../../../../shared/ui/TypeFilter.tsx';

const PAGE_SIZE=8;
const ALL_TYPES='全部属性';

/** The box's search, type filter and page; kept by the bag so they survive closing the box. */
export function useStorageBox(monsters:MonsterView[]) {
  const [search,setSearch]=useState(''),[type,setType]=useState(ALL_TYPES);
  const stored=useMemo(()=>monsters.filter(m=>!m.inParty&&`${m.species} ${m.name} ${m.speciesName}`.includes(search)&&matchesElement(m.types,type))
    .sort((a,b)=>a.species-b.species||b.level-a.level),[monsters,search,type]);
  const pager=usePager(stored.length,PAGE_SIZE);
  const filter=(set:(value:string)=>void)=>(value:string)=>{set(value);pager.setPage(0)};
  return {search,type,stored,pager,setSearch:filter(setSearch),setType:filter(setType)};
}

type Props={s:GameSnapshot;box:ReturnType<typeof useStorageBox>;count:number;selected?:string;onPick:(m:MonsterView)=>void;onClose:()=>void};

/** 精灵仓库: every owned monster outside the party. Picking one selects it and closes the box. */
export default function StorageBox({s,box,count,selected,onPick,onClose}:Props) {
  const {search,type,stored,pager:{page,setPage,pages,start,end}}=box;
  return <section className="petbag-storage" aria-label="精灵仓库">
    <header><strong>精灵仓库</strong><span>{count} 只</span><button aria-label="关闭精灵仓库" onClick={onClose}>返回背包</button></header>
    <div className="management-filter">
      <input aria-label="搜索仓库精灵" placeholder="名称 / 昵称 / 编号" value={search} onChange={event=>box.setSearch(event.target.value)}/>
      <TypeFilter label="仓库属性分类" value={type} groups={s.monsters.map(mon=>mon.types)} onChange={box.setType}/>
    </div>
    <div className="storage-slot-grid">{stored.slice(start,end).map(mon=>
      <MonsterCard key={mon.uid} compact monster={mon} selected={selected===mon.uid} onClick={()=>onPick(mon)}/>)}</div>
    {!stored.length&&<div className="management-empty">
      {search||type!==ALL_TYPES?'没有匹配的仓库精灵。':'仓库暂无精灵，去星球上结识伙伴吧。'}
    </div>}
    <div className="management-pagination">
      <button disabled={page===0} onClick={()=>setPage(p=>p-1)} aria-label="上一页仓库">‹</button><span>仓库 {page+1} / {pages}</span>
      <button disabled={page+1>=pages} onClick={()=>setPage(p=>p+1)} aria-label="下一页仓库">›</button>
    </div>
  </section>;
}
