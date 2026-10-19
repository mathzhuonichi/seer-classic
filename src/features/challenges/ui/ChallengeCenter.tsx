import {useEffect,useMemo,useState} from 'react';
import type { GameController } from '../../../kernel/contract.ts';
import type { BossView, ChallengeCategoryId } from '../../../shared/views.ts';
import {findChallengeLocation,resolveWorldLocation} from '../../../domain/world/world.ts';
import {PARTY_MAX} from '../../../../raising/core/storage.ts';
import {CreatureArt} from '../../../shared/ui/CreatureArt.tsx';
import BossEvidence from '../../../shared/ui/BossEvidence.tsx';
import {usePager} from '../../../shared/ui/use-pager.ts';
import {useGame} from '../../../shared/ui/use-game.ts';
import {opponentLevelText} from '../../../shared/encounter-level.ts';
import {
  CHALLENGE_PAGE_SIZE,CHALLENGE_TABS,challengeCaption,challengeDetail,challengeEntries,challengeHonors,challengeRows,type ChallengeTab,type HonorRow,
} from '../challenge-center.ts';
import '../../../shared/ui/management.css';
import './ChallengeCenter.css';

export interface ChallengeCenterProps {c:GameController;initialCategory?:ChallengeCategoryId;onExplore?:()=>void;onTravel?:(boss:BossView)=>void;onCampaign?:(id:string)=>void;onTower?:()=>void}
export default function ChallengeCenter({c,initialCategory,onExplore,onTravel,onCampaign,onTower}:ChallengeCenterProps) {
  const bosses=useGame(c,s=>s.bosses),campaigns=useGame(c,s=>s.campaigns),braveTower=useGame(c,s=>s.braveTower),partySize=useGame(c,s=>s.party.length);
  const archive=useMemo(()=>({bosses,campaigns,braveTower}),[bosses,campaigns,braveTower]);
  const defaultTab=initialCategory??'spt';
  const [category,setCategory]=useState<ChallengeTab>(defaultTab),[search,setSearch]=useState(''),[selected,setSelected]=useState('');
  const [honorsOpen,setHonorsOpen]=useState(false),honors=useMemo(()=>challengeHonors(archive),[archive]);
  const entries=useMemo(()=>challengeEntries(archive),[archive]);
  const rows=useMemo(()=>challengeRows(entries,category,search),[entries,category,search]);
  const {page,setPage,pages,start,end}=usePager(rows.length,CHALLENGE_PAGE_SIZE);
  useEffect(()=>{setCategory(defaultTab);setSearch('');setPage(0);setSelected('');setHonorsOpen(false)},[initialCategory]);
  const boss=rows.find(row=>row.id===selected)??rows[start]??rows[0];
  const campaign=boss?.campaign;
  const destination=boss&&!campaign?findChallengeLocation(boss):undefined;
  const landing=destination?resolveWorldLocation(destination.planetId,destination.regionId):undefined;
  const landingName=landing?(landing.planet.name===landing.region.name?landing.region.name:`${landing.planet.name} · ${landing.region.name}`):'';
  const detail=boss&&challengeDetail(boss,archive,!!destination?.staging);
  const launch=boss?.tower?onTower:campaign?onCampaign&&(()=>onCampaign(campaign.id)):onTravel&&(()=>onTravel(boss!));
  const turnPage=(step:number)=>{setPage(value=>value+step);setSelected('')};
  const pick=(id:string)=>{setSelected(id);setHonorsOpen(false)};
  return <section className="management-panel challenge-management" aria-label="星际挑战面板">
    <div className="management-panel-heading"><strong>星际挑战档案</strong><span>已完成 {entries.filter(entry=>entry.cleared).length} / {entries.length}</span></div>
    <nav className="management-tabs challenge-category-tabs" aria-label="挑战分类">{CHALLENGE_TABS.map(([tab,label])=><button key={tab} aria-pressed={category===tab} className={category===tab?'active':''} onClick={()=>{if(tab==='tower'&&onTower){onTower();return}setCategory(tab);setPage(0);pick('')}}>{label}</button>)}</nav>
    <div className="challenge-inner"><aside className="challenge-index">
      <div className="management-filter"><input aria-label="搜索挑战" placeholder="对手名称 / 挑战提示" value={search} onChange={event=>{setSearch(event.target.value);setPage(0);setSelected('')}}/></div>
      <div className="challenge-index-scroll">{rows.slice(start,end).map(entry=><button key={entry.id} className={entry.id===boss?.id?'active':''} aria-pressed={entry.id===boss?.id} onClick={()=>pick(entry.id)}><div className="challenge-mini-art"><CreatureArt species={entry.species} name={entry.name}/></div><span><strong>{entry.name}</strong><small>{challengeCaption(entry,braveTower)}</small></span><b>{entry.cleared?'✓':'›'}</b></button>)}{!rows.length&&<div className="management-empty">没有匹配的挑战。</div>}</div>
      <div className="management-pagination"><button aria-label="上一页挑战" disabled={!page} onClick={()=>turnPage(-1)}>‹</button><span>{page+1} / {pages} · {rows.length} 个</span><button aria-label="下一页挑战" disabled={page+1>=pages} onClick={()=>turnPage(1)}>›</button></div>
    </aside><div className="challenge-entry-scroll">{honorsOpen?<HonorRoll honors={honors} onClose={()=>setHonorsOpen(false)}/>:boss&&detail?<>
      <div className="challenge-entry-hero"><div className="challenge-entry-art"><CreatureArt species={boss.species} name={boss.name}/></div>
      <div className="dex-entry-title"><small>{detail.subtitle}</small><h3>{boss.name}</h3><span className="type-tag">{detail.status}</span></div></div>
      {!boss.tower&&<BossEvidence evidence={boss.evidence}/>}
      {boss.category==='trainer'&&!!boss.opponents?.length&&<section className="trainer-roster" aria-label="训练师队伍"><strong>对方阵容 · {boss.opponents.length} 只精灵</strong><div>{boss.opponents.map((opponent,index)=><article key={`${index}-${opponent.species}`}><div className="trainer-roster-art"><CreatureArt species={opponent.species} name={opponent.name}/></div><strong>{opponent.name}</strong><small>{opponentLevelText(opponent)}</small></article>)}</div></section>}
      <div className="challenge-description"><strong>挑战地点</strong><p>{campaign?.location??landingName}</p><p>{detail.instruction}</p></div>
      {!!detail.rules.length&&<div className="challenge-description"><strong>挑战条件</strong>{detail.rules.map(rule=><p key={rule}>{rule}</p>)}</div>}
      <div className="challenge-description"><strong>{campaign?'挑战流程':'挑战提示'}</strong>{campaign?campaign.stages.map((stage,index)=><p key={stage.id}>{stage.cleared?'✓':index+1} · {stage.name}</p>):<p>{boss.description||'带上精灵伙伴，挑战这位星际首领。'}</p>}</div>
      <div className="challenge-reward-note"><strong>通关奖励</strong><span>{detail.reward}</span></div>
      {detail.honors&&<div className="challenge-description"><strong>挑战荣誉</strong><p>{detail.honors}</p></div>}
      <div className="management-confirm-row"><span className="management-hint">精灵背包 {partySize} / {PARTY_MAX}</span><button className="primary" disabled={!launch} onClick={()=>launch?.()}>{detail.action}</button></div>
      <div className="challenge-secondary-actions"><button onClick={()=>setHonorsOpen(true)}>荣誉档案 · {honors.length}</button>
        <button onClick={()=>c.dispatch({type:'heal'})}>恢复全队</button>{onExplore&&<button onClick={onExplore}>返回星球探索</button>}</div>
    </>:<div className="management-empty">选择对手查看挑战提示。</div>}</div></div>
  </section>;
}

/** 荣誉档案: every title and achievement earned so far, each with the challenge that gave it. */
function HonorRoll({honors,onClose}:{honors:HonorRow[];onClose:()=>void}) {
  return <section aria-label="荣誉档案">
    <div className="dex-entry-title"><small>称号与成就</small><h3>荣誉档案</h3><span className="type-tag">已获得 {honors.length} 项</span></div>
    <div className="challenge-description"><strong>已获得荣誉</strong>{honors.length?honors.map(honor=><p key={honor.label}>✓ {honor.label}（{honor.source}）</p>)
      :<p>击败带有称号或成就的首领后，荣誉会记录在这里。</p>}</div>
    <div className="challenge-secondary-actions"><button autoFocus onClick={onClose}>返回挑战详情</button></div>
  </section>;
}
