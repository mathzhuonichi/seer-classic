import {useEffect,useState} from 'react';
import type {BossView,GameController,GameSnapshot,QuestView} from '../../../kernel/contract.ts';
import {battleActive} from '../../../shared/view-helpers.ts';
import {CreatureArt} from '../../../shared/ui/CreatureArt.tsx';
import {usePager} from '../../../shared/ui/use-pager.ts';
import './QuestPanel.css';

const PAGE_SIZE=2;
type QuestFilter='all'|'ready'|'pending';
const isClaimed=(quest:QuestView)=>quest.claimed&&!quest.repeatable;
const canClaim=(quest:QuestView)=>quest.claimable??(quest.complete&&!isClaimed(quest));

export default function QuestPanel({s,c,focusQuestId,onTravel,onLocateSpecies,onOpenBag}:{s:GameSnapshot;c:GameController;focusQuestId?:string;onTravel:(boss:BossView)=>void;onLocateSpecies?:(species:number)=>void;onOpenBag?:()=>void}){
 const focused=s.quests.find(quest=>quest.id===focusQuestId);
 const [group,setGroup]=useState<'journey'|'spt-recruitment'>(focused?.group??'journey');
 const [showFocus,setShowFocus]=useState(!!focused);
 const [search,setSearch]=useState(''),[filter,setFilter]=useState<QuestFilter>('all');
 const [feedback,setFeedback]=useState<{questId:string;message:string}>();
 const activeBattle=battleActive(s);
 const query=search.trim().replace(/^#/,'').toLowerCase();
 const matching=s.quests.filter(quest=>(quest.group??'journey')===group
  &&(!query||quest.name.toLowerCase().includes(query)||String(quest.rewardSpecies)===query)
  &&(filter==='all'||filter==='ready'&&canClaim(quest)||filter==='pending'&&!isClaimed(quest)&&!quest.complete));
 const quests=showFocus&&focused?[focused]:matching;
 const {page,setPage,pages,start,end}=usePager(quests.length,PAGE_SIZE);
 useEffect(()=>{setShowFocus(!!focusQuestId);setPage(0);setFeedback(undefined);if(focused)setGroup(focused.group??'journey')},[focusQuestId,focused?.group]);
 const rows=quests.slice(start,end);
 const selectGroup=(next:typeof group)=>{setGroup(next);setShowFocus(false);setPage(0);setSearch('');setFilter('all');setFeedback(undefined)};
 function claim(quest:QuestView){
  if(!canClaim(quest)||activeBattle)return;
  c.dispatch({type:'claimQuest',questId:quest.id});
  setFeedback({questId:quest.id,message:c.snapshot().notices[0]??'领取指令已提交。'});
 }
 return <section className="quest-panel" aria-label="航行任务列表">
  <nav className="quest-tabs" aria-label="任务分类">
   <button aria-pressed={!showFocus&&group==='journey'} onClick={()=>selectGroup('journey')}>航行任务</button>
   <button aria-pressed={!showFocus&&group==='spt-recruitment'} onClick={()=>selectGroup('spt-recruitment')}>精灵招募 · {s.quests.filter(quest=>quest.group==='spt-recruitment').length}</button>
   {showFocus&&focused&&<button className="quest-back" onClick={()=>{setShowFocus(false);setPage(0)}}>返回列表</button>}
  </nav>
  {!showFocus&&<div className="quest-filter">
   <input aria-label="搜索任务或奖励精灵编号" placeholder="任务名称 / 精灵编号" value={search} onChange={event=>{setSearch(event.target.value);setPage(0)}}/>
   <select aria-label="任务状态" value={filter} onChange={event=>{setFilter(event.target.value as QuestFilter);setPage(0)}}><option value="all">全部任务</option><option value="ready">可领取</option><option value="pending">未完成</option></select>
  </div>}
  <div className="quest-console" key={`${group}-${page}-${showFocus}-${search}-${filter}`} tabIndex={0}>{rows.map(quest=>{
   const reward=s.species.find(species=>species.id===quest.rewardSpecies),claimed=isClaimed(quest),claimable=canClaim(quest);
   const conditions=quest.prerequisites??quest.requiredBossIds?.map(bossId=>{const boss=s.bosses.find(entry=>entry.id===bossId);return {kind:'boss' as const,bossId,species:undefined,name:boss?.name??'挑战暂不可用',complete:!!boss?.cleared}})??[];
   const allowance=quest.allowance,hasEssence=!!quest.rewardItemId&&s.items.some(item=>item.id===quest.rewardItemId&&item.count>0);
   const status=claimed?'✓ 已领取':claimable?'奖励已就绪':quest.complete?'条件已完成':'进行中';
   return <article key={quest.id} aria-label={quest.name}>
    <header className="quest-card-heading"><CreatureArt species={quest.rewardSpecies} name={reward?.name??quest.name} size={42}/><div><h3>{quest.name}</h3><span className={`quest-status ${claimable?'ready':''}`}>{status}</span>{quest.rewardItemId&&<span className="quest-repeat">{quest.repeatable?`可重复 · 已领取 ${quest.claimCount??0} 次`:'限领一次'}</span>}</div></header>
    <p className="quest-description">{quest.rewardItemId?`完成下列条件，领取${reward?.name??'初始形态'}精元。`:quest.description}</p>
    {!!conditions.length&&<ul className="quest-prerequisites" aria-label="招募前置条件">{conditions.map(condition=>{
     const boss=condition.bossId?s.bosses.find(entry=>entry.id===condition.bossId):undefined;
     const available=condition.kind==='species'?condition.species!==undefined&&!!onLocateSpecies:!!boss;
     return <li key={`${condition.kind}-${condition.species??condition.bossId}`} className={condition.complete?'complete':''}><span className="quest-condition-status" aria-label={condition.complete?'已完成':'未完成'}>{condition.complete?'✓':'○'}</span><button disabled={!available} onClick={()=>{if(condition.kind==='species'&&condition.species!==undefined)onLocateSpecies?.(condition.species);else if(boss)onTravel(boss)}}><span><small>{condition.kind==='species'?'收集精灵':'击败首领'} · {condition.complete?'已完成':'未完成'}</small><strong>{condition.name}</strong></span><span aria-hidden="true">›</span></button></li>;
    })}</ul>}
    {allowance&&<p className="quest-allowance">已持有 {allowance.owned} · 未孵化 {allowance.reserved} · 同种上限 {allowance.limit}</p>}
    {!claimed&&quest.blockedReason&&<p className="quest-blocked">{quest.blockedReason}</p>}
    <footer className="quest-card-footer"><span>{conditions.length?'条件':'任务进度'} {quest.progress}</span><button className="primary" disabled={!claimable||activeBattle} onClick={()=>claim(quest)}>{claimed?'已领取':quest.rewardItemId?'领取精元':'领取精灵'}</button></footer>
    {feedback?.questId===quest.id&&<p className="quest-feedback" role="status">{feedback.message}</p>}
    {hasEssence&&onOpenBag&&<button className="quest-hatch-link" onClick={onOpenBag}>前往道具背包孵化 →</button>}
   </article>;
  })}{!rows.length&&<p className="quest-empty">{query||filter!=='all'?'没有符合筛选条件的任务。':'这一分类暂时没有任务。'}</p>}</div>
  {activeBattle&&<p className="quest-battle-hint">请先结束当前战斗，再领取奖励。</p>}
  <nav className="quest-pagination" aria-label="任务翻页">
   <button aria-label="上一页任务" disabled={page===0} onClick={()=>setPage(page-1)}>‹</button>
   <label>第 <select aria-label="任务页码" value={page} onChange={event=>setPage(Number(event.target.value))}>{Array.from({length:pages},(_,index)=><option key={index} value={index}>{index+1}</option>)}</select> / {pages} 页</label>
   <span>{quests.length} 个任务</span>
   <button aria-label="下一页任务" disabled={page+1>=pages} onClick={()=>setPage(page+1)}>›</button>
  </nav>
 </section>;
}
