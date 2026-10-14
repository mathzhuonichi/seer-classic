import {useEffect,useState} from 'react';
import type {GameController,GameSnapshot,MonsterView} from '../game-types';
import MonsterCard from './MonsterCard';
import Raising from './Raising';
import TypeFilter from './TypeFilter';
import {CreatureArt} from './CreatureArt';
import TypeIcon from './TypeIcon';
import {matchesElement} from '../presentation/element-types';
import '../management.css';
export default function MonsterManager({s,c,selected,onSelect}:{s:GameSnapshot;c:GameController;selected:string;onSelect:(uid:string)=>void}) {
  const [search,setSearch]=useState(''),[type,setType]=useState('全部属性'),[page,setPage]=useState(0);
  const [swapTarget,setSwapTarget]=useState('');
  const [storageOpen,setStorageOpen]=useState(false),[swapOpen,setSwapOpen]=useState(false);
  const [tabRequest,setTabRequest]=useState<{tab:string;id:number}>();
  const openTab=(tab:string)=>{setStorageOpen(false);setTabRequest({tab,id:Date.now()})};
  const [feedback,setFeedback]=useState('');
  const party=s.party.map(uid=>s.monsters.find(m=>m.uid===uid)).filter((m):m is MonsterView=>!!m);
  const stored=s.monsters.filter(m=>!m.inParty&&(`${m.species} ${m.name} ${m.speciesName}`.includes(search))&&matchesElement(m.types,type)).sort((a,b)=>a.species-b.species||b.level-a.level);
  const activeBattle=!!s.battle&&!s.battle.finished;
  const leadUid=activeBattle?s.battle!.player.uid:s.party[0];
  const pages=Math.max(1,Math.ceil(stored.length/8));
  const m=s.monsters.find(m=>m.uid===selected)??party[0]??s.monsters[0];
  useEffect(()=>{if(m&&m.uid!==selected)onSelect(m.uid)},[m?.uid,selected,onSelect]);
  useEffect(()=>{if(page>=pages)setPage(pages-1)},[page,pages]);
  useEffect(()=>{setSwapTarget('');setFeedback('')},[m?.uid]);
  const select=(uid:string)=>{onSelect(uid);setFeedback('')};
  function lead() {if(!m)return;if(activeBattle){c.dispatch({type:'switch',uid:m.uid});setFeedback(`${m.name}已选择出战。`);return}const uids=[m.uid,...s.party.filter(uid=>uid!==m.uid)];c.dispatch({type:'reorderParty',uids});setFeedback(c.snapshot().party[0]===m.uid?`${m.name}已设为首发精灵。`:c.snapshot().notices[0]??'出战顺序未调整。')}
  function swap() {
    if(!m||!swapTarget)return;
    const uids=[...s.party],a=uids.indexOf(m.uid),b=uids.indexOf(swapTarget);
    if(a<0||b<0)return;[uids[a],uids[b]]=[uids[b],uids[a]];c.dispatch({type:'reorderParty',uids});setSwapTarget('');setFeedback('出战位置已交换。');
  }
  return <section className="management-panel monster-management official-petbag" aria-label="精灵管理面板">
    <nav className="petbag-navigation" aria-label="精灵背包操作">
      <button className="petbag-nav petbag-nav-lead" aria-label="设为首发精灵" title="设为首发精灵" disabled={!m?.inParty||leadUid===m.uid||activeBattle&&(s.battle!.party.find(mon=>mon.uid===m?.uid)?.hp??0)<=0} onClick={lead}><span>首发</span></button>
      <button className="petbag-nav petbag-nav-heal" aria-label="全队恢复" title="全队恢复" disabled={activeBattle} onClick={()=>{c.dispatch({type:'heal'});setFeedback('全队体力与技能已恢复。')}}><span>恢复</span></button>
      <button className="petbag-nav petbag-nav-storage" aria-label="打开精灵仓库" title="精灵仓库" aria-pressed={storageOpen} onClick={()=>setStorageOpen(v=>!v)}><span>仓库</span></button>
      <button className="petbag-nav petbag-nav-party" aria-label={m?.inParty?'存入仓库':'加入出战'} title={m?.inParty?'存入仓库':'加入出战'} disabled={!m||activeBattle||m.inParty&&party.length<=1||!m.inParty&&party.length>=6} onClick={()=>{if(m){c.dispatch({type:'party',uid:m.uid,add:!m.inParty});setFeedback(m.inParty?'精灵已移入仓库。':'精灵已加入出战背包。')}}}><span>{m?.inParty?'存入':'入队'}</span></button>
      <button className="petbag-nav petbag-nav-swap" aria-label="交换出战位置" title="交换出战位置" aria-pressed={swapOpen} disabled={!m?.inParty||activeBattle} onClick={()=>setSwapOpen(v=>!v)}><span>交换</span></button>
      <button className="petbag-nav petbag-nav-skills" aria-label="调整精灵技能" title="调整精灵技能" onClick={()=>openTab('技能')}><span>技能</span></button>
      <button className="petbag-nav petbag-nav-evs" aria-label="编辑学习力" title="编辑学习力" onClick={()=>openTab('详情')}><span>学习力</span></button>
      <button className="petbag-nav petbag-nav-experience" aria-label="经验分配器" title="经验分配器" onClick={()=>openTab('养成')}><span>经验</span></button>
    </nav>
    {m?<>
      <section className="petbag-portrait" aria-label={`${m.name}立绘`}><div className="petbag-portrait-name"><TypeIcon type={m.types}/><strong>{m.name}</strong><div className="petbag-level"><small>Lv.{m.level}</small>{!!m.gender&&<span className={`petbag-gender ${m.gender===1?'male':'female'}`} role="img" aria-label={m.gender===1?'雄性':'雌性'} title={m.gender===1?'雄性':'雌性'}>{m.gender===1?'♂':'♀'}</span>}</div></div><div className="petbag-portrait-art"><CreatureArt species={m.species} name={m.name} fill={.97} scaleByStage={false} verticalAlign="center"/></div><div className="petbag-portrait-meta"><div className="hp-bar"><i style={{width:`${Math.max(0,Math.min(100,m.hp/m.stats.hp*100))}%`}}/></div><strong>体力 {m.hp} / {m.stats.hp}</strong></div></section>
      <div className="petbag-details"><Raising key={m.uid} m={m} s={s} c={c} presentation="petbag" requestedTab={tabRequest}/></div>
    </>:<div className="petbag-details management-empty">还没有精灵，前往地图开启旅程。</div>}
    <div className="petbag-status" role="status">{feedback}</div>
    <div className="petbag-party-strip" aria-label="六个出战精灵位">{Array.from({length:6},(_,i)=>party[i]?<MonsterCard key={party[i].uid} presentation="petbag-party" slot={i+1} monster={party[i]} selected={m?.uid===party[i].uid} onClick={()=>select(party[i].uid)}/>:<div key={`empty-${i}`} className="petbag-empty-slot"><span>{i+1}</span><strong>空位</strong></div>)}</div>
    {swapOpen&&m?.inParty&&<section className="petbag-swap-dialog" aria-label="交换出战位置"><strong>交换位置</strong><select aria-label="交换出战位置" value={swapTarget} onChange={e=>setSwapTarget(e.target.value)}><option value="">选择出战位</option>{party.filter(mon=>mon.uid!==m.uid).map(mon=><option key={mon.uid} value={mon.uid}>{s.party.indexOf(mon.uid)+1} · {mon.name}</option>)}</select><button disabled={!swapTarget} onClick={()=>{swap();setSwapOpen(false)}}>确认交换</button><button aria-label="关闭位置交换" onClick={()=>setSwapOpen(false)}>返回</button></section>}
    {storageOpen&&<section className="petbag-storage" aria-label="精灵仓库"><header><strong>精灵仓库</strong><span>{s.monsters.length-party.length} 只</span><button aria-label="关闭精灵仓库" onClick={()=>setStorageOpen(false)}>返回背包</button></header><div className="management-filter"><input aria-label="搜索仓库精灵" placeholder="名称 / 昵称 / 编号" value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}}/><TypeFilter label="仓库属性分类" value={type} groups={s.monsters.map(mon=>mon.types)} onChange={value=>{setType(value);setPage(0)}}/></div><div className="storage-slot-grid">{stored.slice(page*8,(page+1)*8).map(mon=><MonsterCard key={mon.uid} compact monster={mon} selected={m?.uid===mon.uid} onClick={()=>{select(mon.uid);setStorageOpen(false)}}/>)}</div>{!stored.length&&<div className="management-empty">{search||type!=='全部属性'?'没有匹配的仓库精灵。':'仓库暂无精灵，去星球上结识伙伴吧。'}</div>}<div className="management-pagination"><button disabled={page===0} onClick={()=>setPage(p=>p-1)} aria-label="上一页仓库">‹</button><span>仓库 {page+1} / {pages}</span><button disabled={page+1>=pages} onClick={()=>setPage(p=>p+1)} aria-label="下一页仓库">›</button></div></section>}
  </section>;
}
