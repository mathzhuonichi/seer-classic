import {useEffect,useState} from 'react';
import type { GameController } from '../../../kernel/contract.ts';
import type { BossView, QuestView } from '../../../shared/views.ts';
import {battleActive} from '../../../shared/view-helpers.ts';
import {CreatureArt} from '../../../shared/ui/CreatureArt.tsx';
import {usePager} from '../../../shared/ui/use-pager.ts';
import {useGame} from '../../../shared/ui/use-game.ts';
import './QuestPanel.css';

const PAGE_SIZE=2;
type QuestFilter='all'|'ready'|'pending';

interface QuestPanelProps {
 c:GameController;focusQuestId?:string;onTravel:(boss:BossView)=>void;onLocateSpecies?:(species:number)=>void;
 /** Opens the bag on a recruitment reward to hatch it. */
 onOpenBag?:(itemId:string)=>void;
}

export default function QuestPanel({c,focusQuestId,onTravel,onLocateSpecies,onOpenBag}:QuestPanelProps){
 const quests=useGame(c,s=>s.quests),bosses=useGame(c,s=>s.bosses),activeBattle=useGame(c,battleActive);
 const focused=quests.find(quest=>quest.id===focusQuestId);
 const [group,setGroup]=useState<QuestView['group']>(focused?.group??'journey');
 const [showFocus,setShowFocus]=useState(!!focused);
 const [search,setSearch]=useState(''),[filter,setFilter]=useState<QuestFilter>('all');
 const [feedback,setFeedback]=useState<{questId:string;message:string}>();
 const query=search.trim().replace(/^#/,'').toLowerCase();
 const matching=quests.filter(quest=>quest.group===group
  &&(!query||quest.name.toLowerCase().includes(query)||String(quest.rewardSpecies)===query)
  &&(filter==='all'||filter==='ready'&&quest.claimable||filter==='pending'&&!quest.claimed&&!quest.complete));
 const shown=showFocus&&focused?[focused]:matching;
 const {page,setPage,pages,start,end}=usePager(shown.length,PAGE_SIZE);
 useEffect(()=>{setShowFocus(!!focusQuestId);setPage(0);setFeedback(undefined);if(focused)setGroup(focused.group)},[focusQuestId,focused?.group]);
 const rows=shown.slice(start,end);
 const selectGroup=(next:typeof group)=>{setGroup(next);setShowFocus(false);setPage(0);setSearch('');setFilter('all');setFeedback(undefined)};
 function claim(quest:QuestView){
  if(!quest.claimable||activeBattle)return;
  const result=c.dispatch({type:'claimQuest',questId:quest.id});
  setFeedback({questId:quest.id,message:result.notice??'领取指令已提交。'});
 }
 return <section className="quest-panel" aria-label="航行任务列表">
  <nav className="quest-tabs" aria-label="任务分类">
   <button aria-pressed={!showFocus&&group==='journey'} onClick={()=>selectGroup('journey')}>航行任务</button>
   <button aria-pressed={!showFocus&&group==='spt-recruitment'} onClick={()=>selectGroup('spt-recruitment')}>精灵招募 · {quests.filter(quest=>quest.group==='spt-recruitment').length}</button>
   {showFocus&&focused&&<button className="quest-back" onClick={()=>{setShowFocus(false);setPage(0)}}>返回列表</button>}
  </nav>
  {!showFocus&&<div className="quest-filter">
   <input aria-label="搜索任务或奖励精灵编号" placeholder="任务名称 / 精灵编号" value={search} onChange={event=>{setSearch(event.target.value);setPage(0)}}/>
   <select aria-label="任务状态" value={filter} onChange={event=>{setFilter(event.target.value as QuestFilter);setPage(0)}}><option value="all">全部任务</option><option value="ready">可领取</option><option value="pending">未完成</option></select>
  </div>}
  <div className="quest-console" key={`${group}-${page}-${showFocus}-${search}-${filter}`} tabIndex={0}>{rows.map(quest=>{
   const {claimed,claimable,allowance}=quest,conditions=quest.prerequisites??[];
   const status=claimed?'✓ 已领取':claimable?(quest.newReward?'奖励已就绪':'可再次领取'):quest.complete?'条件已完成':'进行中';
   return <article key={quest.id} aria-label={quest.name}>
    <header className="quest-card-heading"><CreatureArt species={quest.rewardSpecies} name={quest.rewardName} size={42}/><div><h3>{quest.name}</h3><span className={`quest-status ${claimable?'ready':''}`}>{status}</span>{quest.rewardItemId&&<span className="quest-repeat">{quest.repeatable?`可重复 · 已领取 ${quest.claimCount??0} 次`:'限领一次'}</span>}</div></header>
    <p className="quest-description">{quest.rewardItemId?`完成下列条件，领取${quest.rewardName}精元。`:quest.description}</p>
    {!!conditions.length&&<ul className="quest-prerequisites" aria-label="招募前置条件">{conditions.map(condition=>{
     const boss=condition.bossId?bosses.find(entry=>entry.id===condition.bossId):undefined;
     const available=condition.kind==='species'?condition.species!==undefined&&!!onLocateSpecies:!!boss;
     return <li key={`${condition.kind}-${condition.species??condition.bossId}`} className={condition.complete?'complete':''}><span className="quest-condition-status" aria-label={condition.complete?'已完成':'未完成'}>{condition.complete?'✓':'○'}</span><button disabled={!available} onClick={()=>{if(condition.kind==='species'&&condition.species!==undefined)onLocateSpecies?.(condition.species);else if(boss)onTravel(boss)}}><span><small>{condition.kind==='species'?'收集精灵':'击败首领'} · {condition.complete?'已完成':'未完成'}</small><strong>{condition.name}</strong></span><span aria-hidden="true">›</span></button></li>;
    })}</ul>}
    {allowance&&<p className="quest-allowance">已持有 {allowance.owned} · 未孵化 {allowance.reserved} · 同种上限 {allowance.limit}</p>}
    {!claimed&&quest.blockedReason&&<p className="quest-blocked">{quest.blockedReason}</p>}
    <footer className="quest-card-footer"><span>{conditions.length?'条件':'任务进度'} {quest.progress}</span><button className="primary" disabled={!claimable||activeBattle} onClick={()=>claim(quest)}>{claimed?'已领取':quest.rewardItemId?'领取精元':'领取精灵'}</button></footer>
    {feedback?.questId===quest.id&&<p className="quest-feedback" role="status">{feedback.message}</p>}
    {quest.rewardHeld&&quest.rewardItemId&&onOpenBag&&<button className="quest-hatch-link" onClick={()=>onOpenBag(quest.rewardItemId!)}>前往道具背包孵化 →</button>}
   </article>;
  })}{!rows.length&&<p className="quest-empty">{query||filter!=='all'?'没有符合筛选条件的任务。':'这一分类暂时没有任务。'}</p>}</div>
  {activeBattle&&<p className="quest-battle-hint">请先结束当前战斗，再领取奖励。</p>}
  <nav className="quest-pagination" aria-label="任务翻页">
   <button aria-label="上一页任务" disabled={page===0} onClick={()=>setPage(page-1)}>‹</button>
   <label>第 <select aria-label="任务页码" value={page} onChange={event=>setPage(Number(event.target.value))}>{Array.from({length:pages},(_,index)=><option key={index} value={index}>{index+1}</option>)}</select> / {pages} 页</label>
   <span>{shown.length} 个任务</span>
   <button aria-label="下一页任务" disabled={page+1>=pages} onClick={()=>setPage(page+1)}>›</button>
  </nav>
 </section>;
}
