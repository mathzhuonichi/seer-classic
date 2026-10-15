import {useEffect,useState} from 'react';
import type {GameController,GameSnapshot,StatKey} from '../game-types';
import {CreatureArt} from './CreatureArt';
import MonsterCard from './MonsterCard';
import TypeIcon from './TypeIcon';
import TypeFilter from './TypeFilter';
import {matchesElement} from '../presentation/element-types';
import {getAcquisitionFamilies,getAcquisitionFamily,getSpeciesAcquisition,getInitialFormAcquisition,type AcquisitionRoute} from '../progression/acquisition';
import '../management.css';
import './Dex.css';
const stats:[StatKey,string][]=[['hp','体力'],['atk','攻击'],['def','防御'],['spa','特攻'],['spd','特防'],['spe','速度']];
export interface DexProps {s:GameSnapshot;c?:GameController;onLocate:(species:number,route:AcquisitionRoute)=>void;focusSpecies?:number}
export default function Dex({s,onLocate,focusSpecies}:DexProps) {
  const [search,setSearch]=useState(focusSpecies?String(focusSpecies):''),[type,setType]=useState('全部属性'),[owned,setOwned]=useState('全部精灵'),[page,setPage]=useState(0),[selected,setSelected]=useState<number>(focusSpecies??s.species[0]?.id??1);
  useEffect(()=>{if(focusSpecies!==undefined){setSearch(String(focusSpecies));setSelected(focusSpecies);setType('全部属性');setOwned('全部精灵');setPage(0)}},[focusSpecies]);
  const filtered=s.species.filter(sp=>`${sp.id} ${sp.name}`.includes(search)&&matchesElement(sp.types,type)&&(owned==='全部精灵'||(owned==='已收集'?sp.owned:!sp.owned)));
  const pages=Math.max(1,Math.ceil(filtered.length/16));
  const rows=filtered.slice(page*16,(page+1)*16);
  const sp=filtered.find(sp=>sp.id===selected)??rows[0]??filtered[0];
  const acquisition=sp?getSpeciesAcquisition(sp.id):undefined;
  const family=sp?getAcquisitionFamily(sp.id):undefined;
  const initial=sp?getInitialFormAcquisition(sp.id):undefined;
  const ownedForms=new Set(s.species.filter(mon=>mon.owned).map(mon=>mon.id));
  const collectibleFamilies=getAcquisitionFamilies().filter(group=>group.status!=='npc');
  const ownedFamilies=collectibleFamilies.filter(group=>group.memberIds.filter(id=>!group.excludedSpecies.includes(id)).every(id=>ownedForms.has(id))).length;
  useEffect(()=>{if(page>=pages)setPage(pages-1)},[page,pages]);
  return <section className="management-panel dex-management" aria-label="精灵图鉴面板"><div className="management-panel-heading"><strong>精灵图鉴</strong><span>{ownedForms.size} 个形态已收集 · {ownedFamilies} / {collectibleFamilies.length} 个完整家族</span></div>
    <div className="dex-inner"><aside className="dex-index"><div className="management-filter"><input aria-label="搜索精灵图鉴" placeholder="精灵名称 / 编号" value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}}/><div><TypeFilter withIcons label="图鉴属性分类" value={type} groups={s.species.map(sp=>sp.types)} onChange={value=>{setType(value);setPage(0)}}/><select aria-label="图鉴收集筛选" value={owned} onChange={e=>{setOwned(e.target.value);setPage(0)}}>{['全部精灵','已收集','未收集'].map(name=><option key={name}>{name}</option>)}</select></div></div>
      <div className="dex-index-grid">{rows.map(mon=><MonsterCard key={mon.id} compact monster={mon} selected={mon.id===sp?.id} onClick={()=>setSelected(mon.id)}/>)}</div>{!rows.length&&<div className="management-empty">没有匹配的精灵。</div>}<div className="management-pagination"><button aria-label="上一页图鉴" disabled={!page} onClick={()=>{setPage(p=>p-1);setSelected(-1)}}>‹</button><span>{page+1} / {pages} · {filtered.length} 只</span><button aria-label="下一页图鉴" disabled={page+1>=pages} onClick={()=>{setPage(p=>p+1);setSelected(-1)}}>›</button></div>
    </aside><div className="dex-entry-scroll">{sp?<><div className="dex-entry-hero"><div className="dex-entry-art"><CreatureArt species={sp.id} name={sp.name}/></div><div className="dex-entry-title"><small>NO. {String(sp.id).padStart(4,'0')}</small><h3>{sp.name}</h3><span className="dex-type-icons"><TypeIcon type={sp.types}/></span><span className="dex-owned-status">{sp.owned?'✓ 已收集':'未收集'}</span></div></div><div className="stat-table-heading"><strong>种族值</strong><span>总和 <b>{stats.reduce((sum,[key])=>sum+sp.baseStats[key],0)}</b></span></div><table className="management-stat-table dex-base-table"><thead><tr><th scope="col">能力</th><th scope="col">种族值</th><th scope="col">分布</th></tr></thead><tbody>{stats.map(([key,label])=><tr key={key}><th scope="row">{label}</th><td><strong>{sp.baseStats[key]}</strong></td><td><span className="dex-base-bar"><i style={{width:`${Math.min(100,sp.baseStats[key]/255*100)}%`}}/></span></td></tr>)}</tbody></table><p className="management-hint">种族值是此种精灵的基础能力。个体值、等级、学习力和性格共同决定伙伴的实际属性。</p><div className="dex-acquisition-routes"><strong>家族获取方式</strong>{family&&<><p className="management-hint">{family.status==='npc'?'剧情展示家族 · 不计入收集目标':`${family.name}家族 · ${family.availableSpecies.length} / ${family.memberIds.length-family.excludedSpecies.length} 个可收集形态已有路线`}</p><p className="management-hint">家族形态：{family.memberIds.map(id=>s.species.find(mon=>mon.id===id)?.name).filter(Boolean).join('、')}</p></>}<p className="management-hint">{acquisition?.status==='npc'?acquisition.description:'获取入口统一前往初始形态，再按进化条件培养。'}</p>{acquisition?.status!=='npc'&&!initial?.initialForms.length&&<p className="management-hint">初始形态的获取入口尚未实现。</p>}{acquisition?.status!=='npc'&&initial?.initialForms.map(base=><div key={base.species}><p className="management-hint">初始形态：#{base.species} {base.name}</p>{!base.routes.length&&<p className="management-hint">{base.name}的初始形态获取入口尚未实现。</p>}{base.routes.map((route,index)=><div key={`${route.kind}-${index}`}><p className="management-hint">{route.label}</p><button className="primary management-locate-button" onClick={()=>onLocate(base.species,route)}>{route.breedingRecipeId?'前往初始形态繁殖':route.fusionRecipeId?'前往初始形态融合':route.campaignId?'前往初始形态阶段挑战':route.bossId?'前往初始形态挑战':route.questId?'查看初始形态任务':route.kind==='starter'?'查看初始伙伴':'前往初始形态栖息地'} →</button></div>)}{!!base.evolutionPath.length&&<p className="management-hint">后续进化：{base.evolutionPath.map(step=>`${s.species.find(mon=>mon.id===step.from)?.name??step.from} → ${s.species.find(mon=>mon.id===step.to)?.name??step.to}${step.implemented?`（Lv.${step.level}${step.automatic===false?'，在精灵养成中确认':''}）`:'（进化方式尚未实现）'}`).join('；')}</p>}</div>)}</div></>:<div className="management-empty">选择精灵查看种族值与获取入口。</div>}</div></div>
  </section>;
}
