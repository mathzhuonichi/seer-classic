import {useEffect,useMemo,useState} from 'react';
import type { GameController } from '../../../kernel/contract.ts';
import type { SpeciesView } from '../../../shared/views.ts';
import {STAT_KEYS,type StatBlock} from '../../../../raising/core/types.ts';
import type {AcquisitionRoute} from '../../../domain/acquisition/acquisition.ts';
import type {DexEntryView} from '../view.ts';
import {ALL_ELEMENTS,matchesElement} from '../../../shared/element-types.ts';
import {STAT_LABELS} from '../../../shared/labels.ts';
import {statTotal} from '../../../shared/monster-views.ts';
import {CreatureArt} from '../../../shared/ui/CreatureArt.tsx';
import MonsterCard from '../../../shared/ui/MonsterCard.tsx';
import TypeIcon from '../../../shared/ui/TypeIcon.tsx';
import TypeFilter from '../../../shared/ui/TypeFilter.tsx';
import {usePager} from '../../../shared/ui/use-pager.ts';
import {useGame} from '../../../shared/ui/use-game.ts';
import '../../../shared/ui/management.css';
import './Dex.css';

const PAGE_SIZE=16;
/** A base stat this high fills its distribution bar. */
const BASE_STAT_BAR_MAX=255;
const OWNED_FILTERS=['全部精灵','已收集','未收集'] as const;
interface DexFilter {search:string;type:string;owned:typeof OWNED_FILTERS[number]}
/** The unfiltered index, or one searched for a focused species. */
const dexFilter=(focusSpecies?:number):DexFilter=>({search:focusSpecies===undefined?'':String(focusSpecies),type:ALL_ELEMENTS,owned:'全部精灵'});
const matches=({search,type,owned}:DexFilter)=>(sp:SpeciesView)=>
  `${sp.id} ${sp.name}`.includes(search)&&matchesElement(sp.types,type)&&(owned==='全部精灵'||(owned==='已收集')===sp.owned);

/** Button text for travelling to one route of an initial form. */
function routeActionLabel(route:AcquisitionRoute):string {
  if(route.breedingRecipeId)return '前往初始形态繁殖';
  if(route.fusionRecipeId)return '前往初始形态融合';
  if(route.campaignId)return '前往初始形态阶段挑战';
  if(route.bossId)return '前往初始形态挑战';
  if(route.questId)return '查看初始形态任务';
  return route.kind==='starter'?'查看初始伙伴':'前往初始形态栖息地';
}

export interface DexProps {c:GameController;onLocate:(species:number,route:AcquisitionRoute)=>void;focusSpecies?:number}
type Locate=DexProps['onLocate'];

export default function Dex({c,onLocate,focusSpecies}:DexProps) {
  const species=useGame(c,s=>s.species),dex=useGame(c,s=>s.dex);
  const [filter,setFilter]=useState(()=>dexFilter(focusSpecies)),[selected,setSelected]=useState(focusSpecies??species[0]?.id??1);
  const filtered=useMemo(()=>species.filter(matches(filter)),[species,filter]);
  const {page,setPage,pages,start,end}=usePager(filtered.length,PAGE_SIZE);
  const rows=filtered.slice(start,end);
  const entry=filtered.find(sp=>sp.id===selected)??rows[0]??filtered[0];
  useEffect(()=>{if(focusSpecies!==undefined){setFilter(dexFilter(focusSpecies));setSelected(focusSpecies);setPage(0)}},[focusSpecies]);
  const refine=(change:Partial<DexFilter>)=>{setFilter(current=>({...current,...change}));setPage(0)};
  // Turning the page selects the new page's first row.
  const turn=(step:number)=>{setPage(current=>current+step);setSelected(-1)};
  const heading=`${dex.ownedForms} 个形态已收集 · ${dex.completeFamilies} / ${dex.collectibleFamilies} 个完整家族`;
  return <section className="management-panel dex-management" aria-label="精灵图鉴面板">
    <div className="management-panel-heading"><strong>精灵图鉴</strong><span>{heading}</span></div>
    <div className="dex-inner"><aside className="dex-index">
      <DexFilters species={species} filter={filter} onChange={refine}/>
      <div className="dex-index-grid">
        {rows.map(mon=><MonsterCard key={mon.id} compact monster={mon} selected={mon.id===entry?.id} onClick={()=>setSelected(mon.id)}/>)}
      </div>
      {!rows.length&&<div className="management-empty">没有匹配的精灵。</div>}
      <div className="management-pagination">
        <button aria-label="上一页图鉴" disabled={!page} onClick={()=>turn(-1)}>‹</button>
        <span>{page+1} / {pages} · {filtered.length} 只</span>
        <button aria-label="下一页图鉴" disabled={page+1>=pages} onClick={()=>turn(1)}>›</button>
      </div>
    </aside><div className="dex-entry-scroll">
      {entry?<DexEntry species={entry} view={dex.entries[entry.id]} onLocate={onLocate}/>:<div className="management-empty">选择精灵查看种族值与获取入口。</div>}
    </div></div>
  </section>;
}

function DexFilters({species,filter,onChange}:{species:readonly SpeciesView[];filter:DexFilter;onChange:(change:Partial<DexFilter>)=>void}) {
  const groups=useMemo(()=>species.map(sp=>sp.types),[species]);
  return <div className="management-filter">
    <input aria-label="搜索精灵图鉴" placeholder="精灵名称 / 编号" value={filter.search} onChange={e=>onChange({search:e.target.value})}/>
    <div>
      <TypeFilter withIcons label="图鉴属性分类" value={filter.type} groups={groups} onChange={type=>onChange({type})}/>
      <select aria-label="图鉴收集筛选" value={filter.owned} onChange={e=>onChange({owned:e.target.value as DexFilter['owned']})}>
        {OWNED_FILTERS.map(name=><option key={name}>{name}</option>)}
      </select>
    </div>
  </div>;
}

function DexEntry({species,view,onLocate}:{species:SpeciesView;view:DexEntryView;onLocate:Locate}) {
  return <>
    <div className="dex-entry-hero">
      <div className="dex-entry-art"><CreatureArt species={species.id} name={species.name}/></div>
      <div className="dex-entry-title">
        <small>NO. {String(species.id).padStart(4,'0')}</small><h3>{species.name}</h3>
        <span className="dex-type-icons"><TypeIcon type={species.types}/></span>
        <span className="dex-owned-status">{species.owned?'✓ 已收集':'未收集'}</span>
      </div>
    </div>
    <BaseStats stats={species.baseStats}/>
    <p className="management-hint">种族值是此种精灵的基础能力。个体值、等级、学习力和性格共同决定伙伴的实际属性。</p>
    <DexAcquisition view={view} onLocate={onLocate}/>
  </>;
}

function BaseStats({stats}:{stats:StatBlock}) {
  return <>
    <div className="stat-table-heading"><strong>种族值</strong><span>总和 <b>{statTotal(stats)}</b></span></div>
    <table className="management-stat-table dex-base-table">
      <thead><tr><th scope="col">能力</th><th scope="col">种族值</th><th scope="col">分布</th></tr></thead>
      <tbody>{STAT_KEYS.map(key=><tr key={key}>
        <th scope="row">{STAT_LABELS[key]}</th><td><strong>{stats[key]}</strong></td>
        <td><span className="dex-base-bar"><i style={{width:`${Math.min(100,stats[key]/BASE_STAT_BAR_MAX*100)}%`}}/></span></td>
      </tr>)}</tbody>
    </table>
  </>;
}

function DexAcquisition({view,onLocate}:{view:DexEntryView;onLocate:Locate}) {
  return <div className="dex-acquisition-routes"><strong>家族获取方式</strong>
    {view.family&&<><p className="management-hint">{view.family.summary}</p><p className="management-hint">家族形态：{view.family.members}</p></>}
    <p className="management-hint">{view.description}</p>
    {!view.npc&&!view.initialForms.length&&<p className="management-hint">初始形态的获取入口尚未实现。</p>}
    {view.initialForms.map(form=><div key={form.species}>
      <p className="management-hint">初始形态：#{form.species} {form.name}</p>
      {!form.routes.length&&<p className="management-hint">{form.name}的初始形态获取入口尚未实现。</p>}
      {form.routes.map((route,index)=><div key={`${route.kind}-${index}`}>
        <p className="management-hint">{route.label}</p>
        <button className="primary management-locate-button" onClick={()=>onLocate(form.species,route)}>{routeActionLabel(route)} →</button>
      </div>)}
      {form.evolution&&<p className="management-hint">后续进化：{form.evolution}</p>}
    </div>)}
  </div>;
}
