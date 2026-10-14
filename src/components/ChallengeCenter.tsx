import {useEffect,useState} from 'react';
import type {BossView,CampaignView,GameController,GameSnapshot} from '../game-types';
import {findChallengeLocation,resolveWorldLocation} from '../world';
import {CreatureArt} from './CreatureArt';
import '../management.css';
const categories=['全部挑战','SPT首领','传说挑战','勇者之塔','暗黑武斗场','任务挑战'];
type ChallengeEntry=BossView&{campaign?:CampaignView};
const encounterNumber=(entry:ChallengeEntry)=>Number(entry.id.match(/(?:_f|_door)(\d+)/)?.[1]??Number.MAX_SAFE_INTEGER);
export interface ChallengeCenterProps {s:GameSnapshot;c:GameController;onExplore?:()=>void;onTravel?:(boss:BossView)=>void;onCampaign?:(id:string)=>void}
export default function ChallengeCenter({s,c,onExplore,onTravel,onCampaign}:ChallengeCenterProps) {
  const [category,setCategory]=useState('SPT首领'),[search,setSearch]=useState(''),[page,setPage]=useState(0),[selected,setSelected]=useState('');
  const stageBossIds=new Set(s.campaigns.flatMap(campaign=>campaign.stages.flatMap(stage=>stage.bossIds)));
  const campaigns:ChallengeEntry[]=s.campaigns.map(campaign=>({id:`campaign-${campaign.id}`,name:campaign.name,species:campaign.species,category:campaign.id==='rei-training'?'任务挑战':'传说挑战',description:campaign.stages.map(stage=>`${stage.name} ${stage.description}`).join(' '),location:campaign.location,level:s.bosses.find(boss=>boss.id===campaign.stages.at(-1)!.bossIds[0])?.level??100,portrait:`/portraits/${campaign.species}.png`,cleared:campaign.finished,attempts:0,campaign}));
  const entries:ChallengeEntry[]=[...s.bosses.filter(boss=>!stageBossIds.has(boss.id)),...campaigns];
  const numbered=category==='勇者之塔'||category==='暗黑武斗场';
  const rows=entries.filter(boss=>`${boss.name} ${boss.description}`.includes(search)&&(category==='全部挑战'||category===boss.category)).sort((a,b)=>(numbered?encounterNumber(a)-encounterNumber(b):0)||a.species-b.species||a.name.localeCompare(b.name,'zh'));
  const pages=Math.max(1,Math.ceil(rows.length/10));
  const boss=rows.find(boss=>boss.id===selected)??rows[page*10]??rows[0];
  const campaign=boss?.campaign;
  const destination=boss&&!campaign?findChallengeLocation(boss):undefined;
  const landing=destination?resolveWorldLocation(destination.planetId,destination.regionId):undefined;
  const landingName=landing?(landing.planet.name===landing.region.name?landing.region.name:`${landing.planet.name} · ${landing.region.name}`):'';
  useEffect(()=>{if(page>=pages)setPage(pages-1)},[page,pages]);
  return <section className="management-panel challenge-management" aria-label="星际挑战面板">
    <div className="management-panel-heading"><strong>SPT 挑战档案</strong><span>已完成 {entries.filter(entry=>entry.cleared).length} / {entries.length}</span></div>
    <nav className="management-tabs challenge-category-tabs" aria-label="挑战分类">{categories.map(name=><button key={name} aria-pressed={category===name} className={category===name?'active':''} onClick={()=>{setCategory(name);setPage(0);setSelected('')}}>{name}</button>)}</nav>
    <div className="challenge-inner"><aside className="challenge-index">
      <div className="management-filter"><input aria-label="搜索挑战" placeholder="首领名称 / 挑战提示" value={search} onChange={event=>{setSearch(event.target.value);setPage(0);setSelected('')}}/></div>
      <div className="challenge-index-scroll">{rows.slice(page*10,(page+1)*10).map(entry=><button key={entry.id} className={entry.id===boss?.id?'active':''} aria-pressed={entry.id===boss?.id} onClick={()=>setSelected(entry.id)}><div className="challenge-mini-art"><CreatureArt species={entry.species} name={entry.name}/></div><span><strong>{entry.name}</strong><small>#{String(entry.species).padStart(4,'0')} · {entry.campaign?`${entry.campaign.completed}/${entry.campaign.stages.length} 阶段`:`Lv.${entry.level}`}</small></span><b>{entry.cleared?'✓':'›'}</b></button>)}{!rows.length&&<div className="management-empty">没有匹配的挑战。</div>}</div>
      <div className="management-pagination"><button aria-label="上一页挑战" disabled={!page} onClick={()=>{setPage(value=>value-1);setSelected('')}}>‹</button><span>{page+1} / {pages} · {rows.length} 个</span><button aria-label="下一页挑战" disabled={page+1>=pages} onClick={()=>{setPage(value=>value+1);setSelected('')}}>›</button></div>
    </aside><div className="challenge-entry-scroll">{boss?<>
      <div className="challenge-entry-art"><CreatureArt species={boss.species} name={boss.name}/></div>
      <div className="dex-entry-title"><small>#{String(boss.species).padStart(4,'0')} · {boss.category}{!campaign&&` · Lv.${boss.level}`}</small><h3>{boss.name}</h3><span className="type-tag">{boss.cleared?'✓ 已完成':campaign?`${campaign.completed} / ${campaign.stages.length} 阶段`:'可挑战'}</span></div>
      <div className="challenge-description"><strong>挑战地点</strong><p>{campaign?.location??landingName}</p><p>{campaign?'先进入挑战场景，按顺序推进各阶段。':destination?.staging?'先前往接驳平台，再与对手互动开启战斗。':'先传送到挑战地点，再与场景中的首领互动开启战斗。'}</p></div>
      <div className="challenge-description"><strong>{campaign?'挑战流程':'挑战提示'}</strong>{campaign?campaign.stages.map((stage,index)=><p key={stage.id}>{stage.cleared?'✓':index+1} · {stage.name}</p>):<p>{boss.description||'带上精灵伙伴，挑战这位星际首领。'}</p>}</div>
      <div className="challenge-reward-note"><strong>通关奖励</strong><span>{campaign?.id==='rei-training'?'通过每项特训，领悟对应的雷伊技能':campaign?'完成全部阶段后获得精元，途中阶段不会重复发放精灵':'获得首领精元 → 道具背包 → 确认孵化'}</span></div>
      <div className="management-confirm-row"><span className="management-hint">精灵背包 {s.party.length} / 6</span><button className="primary" disabled={campaign?!onCampaign:!onTravel} onClick={()=>campaign?onCampaign?.(campaign.id):onTravel?.(boss)}>{campaign?'进入挑战场景 →':'开始挑战 →'}</button></div>
      <div className="challenge-secondary-actions"><button onClick={()=>c.dispatch({type:'heal'})}>恢复全队</button>{onExplore&&<button onClick={onExplore}>返回星球探索</button>}</div>
    </>:<div className="management-empty">选择首领查看挑战提示。</div>}</div></div>
  </section>;
}
