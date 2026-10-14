import {useEffect,useState} from 'react';
import type {BossView,GameController,GameSnapshot} from '../game-types';
import './QuestPanel.css';

const PAGE_SIZE=2;
export default function QuestPanel({s,c,focusQuestId,onTravel}:{s:GameSnapshot;c:GameController;focusQuestId?:string;onTravel:(boss:BossView)=>void}){
 const focused=s.quests.find(quest=>quest.id===focusQuestId);
 const [group,setGroup]=useState<'journey'|'spt-recruitment'>(focused?.group??'journey');
 const [showFocus,setShowFocus]=useState(!!focused),[page,setPage]=useState(0);
 useEffect(()=>{setShowFocus(!!focusQuestId);setPage(0);if(focused)setGroup(focused.group??'journey')},[focusQuestId]);
 const quests=showFocus&&focused?[focused]:s.quests.filter(quest=>(quest.group??'journey')===group);
 const pages=Math.max(1,Math.ceil(quests.length/PAGE_SIZE)),current=Math.min(page,pages-1);
 const rows=quests.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE);
 const selectGroup=(next:typeof group)=>{setGroup(next);setShowFocus(false);setPage(0)};
 return <section className="quest-panel" aria-label="航行任务列表">
  <nav className="quest-tabs" aria-label="任务分类">
   <button aria-pressed={!showFocus&&group==='journey'} onClick={()=>selectGroup('journey')}>航行任务</button>
   <button aria-pressed={!showFocus&&group==='spt-recruitment'} onClick={()=>selectGroup('spt-recruitment')}>SPT 招募 · {s.quests.filter(quest=>quest.group==='spt-recruitment').length}</button>
   {showFocus&&focused&&<button onClick={()=>{setShowFocus(false);setPage(0)}}>返回任务列表</button>}
  </nav>
  <div className="quest-console" key={`${group}-${current}-${showFocus}`} tabIndex={0}>{rows.map(quest=><article key={quest.id} aria-label={quest.name}>
   <span className="quest-status">{quest.claimed?'✓ 已领取':quest.complete?'奖励已就绪':quest.group==='spt-recruitment'?'SPT 招募':'航行任务'}</span>
   <h3>{quest.name}</h3><p>{quest.description}</p>
   {!!quest.requiredBossIds?.length&&<ul className="quest-prerequisites" aria-label="需要完成的挑战">{quest.requiredBossIds.map(id=>{
    const boss=s.bosses.find(entry=>entry.id===id);
    return <li key={id}><span className={boss?.cleared?'cleared':''}>{boss?.cleared?'✓ 已通关':'○ 未通关'}</span><button disabled={!boss} onClick={()=>boss&&onTravel(boss)}>{boss?.name??'挑战暂不可用'}{boss&&` · #${boss.species}`}</button></li>;
   })}</ul>}
   <div><span>{quest.progress}</span><button disabled={!quest.complete||quest.claimed} onClick={()=>c.dispatch({type:'claimQuest',questId:quest.id})}>{quest.claimed?'已领取':'领取精灵'}</button></div>
  </article>)}{!rows.length&&<p className="quest-empty">这一分类暂时没有任务。</p>}</div>
  <nav className="quest-pagination" aria-label="任务翻页">
   <button aria-label="上一页任务" disabled={current===0} onClick={()=>setPage(current-1)}>‹</button>
   <label>第 <select aria-label="任务页码" value={current} onChange={event=>setPage(Number(event.target.value))}>{Array.from({length:pages},(_,index)=><option key={index} value={index}>{index+1}</option>)}</select> / {pages} 页</label>
   <span>{quests.length} 个任务</span>
   <button aria-label="下一页任务" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>›</button>
  </nav>
 </section>;
}
