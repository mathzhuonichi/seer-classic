import {useEffect,useMemo,useState} from 'react';
import type {BossView,GameController,GameSnapshot} from '../../../kernel/contract.ts';
import {findChallengeLocation,resolveWorldLocation} from '../../../domain/world/world.ts';
import {PARTY_MAX} from '../../../../raising/core/storage.ts';
import {CreatureArt} from '../../../shared/ui/CreatureArt.tsx';
import BossEvidence from './BossEvidence.tsx';
import {usePager} from '../../../shared/ui/use-pager.ts';
import {opponentLevelText} from '../../../shared/encounter-level.ts';
import {CHALLENGE_PAGE_SIZE,CHALLENGE_TABS,challengeCaption,challengeDetail,challengeEntries,challengeRows} from '../challenge-center.ts';
import {CHALLENGE_CATEGORY} from '../../../domain/challenges/challenge-campaigns.ts';
import '../../../shared/ui/management.css';
import './ChallengeCenter.css';

export interface ChallengeCenterProps {s:GameSnapshot;c:GameController;initialCategory?:string;onExplore?:()=>void;onTravel?:(boss:BossView)=>void;onCampaign?:(id:string)=>void;onTower?:()=>void}
export default function ChallengeCenter({s,c,initialCategory,onExplore,onTravel,onCampaign,onTower}:ChallengeCenterProps) {
  const defaultTab=initialCategory??CHALLENGE_CATEGORY.spt;
  const [category,setCategory]=useState(defaultTab),[search,setSearch]=useState(''),[selected,setSelected]=useState('');
  const entries=useMemo(()=>challengeEntries(s),[s.bosses,s.campaigns,s.braveTower,s.species]);
  const rows=useMemo(()=>challengeRows(entries,category,search),[entries,category,search]);
  const {page,setPage,pages,start,end}=usePager(rows.length,CHALLENGE_PAGE_SIZE);
  useEffect(()=>{setCategory(defaultTab);setSearch('');setPage(0);setSelected('')},[initialCategory]);
  const boss=rows.find(row=>row.id===selected)??rows[start]??rows[0];
  const campaign=boss?.campaign;
  const destination=boss&&!campaign?findChallengeLocation(boss):undefined;
  const landing=destination?resolveWorldLocation(destination.planetId,destination.regionId):undefined;
  const landingName=landing?(landing.planet.name===landing.region.name?landing.region.name:`${landing.planet.name} · ${landing.region.name}`):'';
  const detail=boss&&challengeDetail(boss,s,!!destination?.staging);
  const launch=boss?.tower?onTower:campaign?onCampaign&&(()=>onCampaign(campaign.id)):onTravel&&(()=>onTravel(boss!));
  const turnPage=(step:number)=>{setPage(value=>value+step);setSelected('')};
  return <section className="management-panel challenge-management" aria-label="星际挑战面板">
    <div className="management-panel-heading"><strong>星际挑战档案</strong><span>已完成 {entries.filter(entry=>entry.cleared).length} / {entries.length}</span></div>
    <nav className="management-tabs challenge-category-tabs" aria-label="挑战分类">{CHALLENGE_TABS.map(name=><button key={name} aria-pressed={category===name} className={category===name?'active':''} onClick={()=>{if(name===CHALLENGE_CATEGORY.tower&&onTower){onTower();return}setCategory(name);setPage(0);setSelected('')}}>{name}</button>)}</nav>
    <div className="challenge-inner"><aside className="challenge-index">
      <div className="management-filter"><input aria-label="搜索挑战" placeholder="对手名称 / 挑战提示" value={search} onChange={event=>{setSearch(event.target.value);setPage(0);setSelected('')}}/></div>
      <div className="challenge-index-scroll">{rows.slice(start,end).map(entry=><button key={entry.id} className={entry.id===boss?.id?'active':''} aria-pressed={entry.id===boss?.id} onClick={()=>setSelected(entry.id)}><div className="challenge-mini-art"><CreatureArt species={entry.species} name={entry.name}/></div><span><strong>{entry.name}</strong><small>{challengeCaption(entry,s.braveTower)}</small></span><b>{entry.cleared?'✓':'›'}</b></button>)}{!rows.length&&<div className="management-empty">没有匹配的挑战。</div>}</div>
      <div className="management-pagination"><button aria-label="上一页挑战" disabled={!page} onClick={()=>turnPage(-1)}>‹</button><span>{page+1} / {pages} · {rows.length} 个</span><button aria-label="下一页挑战" disabled={page+1>=pages} onClick={()=>turnPage(1)}>›</button></div>
    </aside><div className="challenge-entry-scroll">{boss&&detail?<>
      <div className="challenge-entry-hero"><div className="challenge-entry-art"><CreatureArt species={boss.species} name={boss.name}/></div>
      <div className="dex-entry-title"><small>{detail.subtitle}</small><h3>{boss.name}</h3><span className="type-tag">{detail.status}</span></div></div>
      {!boss.tower&&<BossEvidence evidence={boss.evidence}/>}
      {boss.category===CHALLENGE_CATEGORY.trainer&&!!boss.opponents?.length&&<section className="trainer-roster" aria-label="训练师队伍"><strong>对方阵容 · {boss.opponents.length} 只精灵</strong><div>{boss.opponents.map((opponent,index)=><article key={`${index}-${opponent.species}`}><div className="trainer-roster-art"><CreatureArt species={opponent.species} name={opponent.name}/></div><strong>{opponent.name}</strong><small>{opponentLevelText(opponent)}</small></article>)}</div></section>}
      <div className="challenge-description"><strong>挑战地点</strong><p>{campaign?.location??landingName}</p><p>{detail.instruction}</p></div>
      <div className="challenge-description"><strong>{campaign?'挑战流程':'挑战提示'}</strong>{campaign?campaign.stages.map((stage,index)=><p key={stage.id}>{stage.cleared?'✓':index+1} · {stage.name}</p>):<p>{boss.description||'带上精灵伙伴，挑战这位星际首领。'}</p>}</div>
      <div className="challenge-reward-note"><strong>通关奖励</strong><span>{detail.reward}</span></div>
      <div className="management-confirm-row"><span className="management-hint">精灵背包 {s.party.length} / {PARTY_MAX}</span><button className="primary" disabled={!launch} onClick={()=>launch?.()}>{detail.action}</button></div>
      <div className="challenge-secondary-actions"><button onClick={()=>c.dispatch({type:'heal'})}>恢复全队</button>{onExplore&&<button onClick={onExplore}>返回星球探索</button>}</div>
    </>:<div className="management-empty">选择对手查看挑战提示。</div>}</div></div>
  </section>;
}
