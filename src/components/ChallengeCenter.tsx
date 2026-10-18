import {useEffect,useState} from 'react';
import type {BossView,CampaignView,GameController,GameSnapshot} from '../game-types.ts';
import {findChallengeLocation,resolveWorldLocation} from '../world.ts';
import {CreatureArt} from './CreatureArt.tsx';
import BossEvidence from './BossEvidence.tsx';
import {encounterLevelText} from '../presentation/encounter-level.ts';
import {mergeBossEvidence} from '../presentation/boss-evidence.ts';
import {braveTowerFloor} from '../progression/brave-tower.ts';
import '../management.css';
import './ChallengeCenter.css';
const categories=['全部挑战','SPT首领','传说挑战','勇者之塔','暗黑武斗场','任务挑战','训练师对战'];
type ChallengeEntry=BossView&{campaign?:CampaignView;tower?:boolean};
const encounterNumber=(entry:ChallengeEntry)=>Number(entry.id.match(/(?:_f|_door)(\d+)/)?.[1]??Number.MAX_SAFE_INTEGER);
export interface ChallengeCenterProps {s:GameSnapshot;c:GameController;initialCategory?:string;onExplore?:()=>void;onTravel?:(boss:BossView)=>void;onCampaign?:(id:string)=>void;onTower?:()=>void}
export default function ChallengeCenter({s,c,initialCategory,onExplore,onTravel,onCampaign,onTower}:ChallengeCenterProps) {
  const [category,setCategory]=useState(initialCategory??'SPT首领'),[search,setSearch]=useState(''),[page,setPage]=useState(0),[selected,setSelected]=useState('');
  useEffect(()=>{setCategory(initialCategory??'SPT首领');setSearch('');setPage(0);setSelected('')},[initialCategory]);
  const stageBossIds=new Set(s.campaigns.flatMap(campaign=>campaign.stages.flatMap(stage=>stage.bossIds)));
  const campaigns:ChallengeEntry[]=s.campaigns.map(campaign=>({id:`campaign-${campaign.id}`,name:campaign.name,species:campaign.species,category:campaign.id==='rei-training'?'任务挑战':'传说挑战',description:campaign.stages.map(stage=>`${stage.name} ${stage.description}`).join(' '),location:campaign.location,level:s.bosses.find(boss=>boss.id===campaign.stages.at(-1)!.bossIds[0])?.level??100,portrait:`/portraits/${campaign.species}.png`,cleared:campaign.finished,attempts:0,evidence:mergeBossEvidence(campaign.stages.map(stage=>stage.evidence)),campaign}));
  const towerFloors=s.bosses.filter(boss=>braveTowerFloor(boss.id)!==undefined);
  const towerProgress=s.braveTower;
  const tower:ChallengeEntry|undefined=towerFloors[0]?{...towerFloors[0],id:'brave-tower',name:'勇者之塔',description:'每通过十层解锁新的起点；保存当前挑战楼层，可继续上次进度。',cleared:towerProgress.highestCleared===70,attempts:towerFloors.reduce((sum,boss)=>sum+boss.attempts,0),tower:true}:undefined;
  const entries:ChallengeEntry[]=[...s.bosses.filter(boss=>!stageBossIds.has(boss.id)&&braveTowerFloor(boss.id)===undefined),...campaigns,...(tower?[tower]:[])];
  const numbered=category==='勇者之塔'||category==='暗黑武斗场';
  const rows=entries.filter(boss=>`${boss.name} ${boss.description}`.includes(search)&&(category==='全部挑战'||category===boss.category)).sort((a,b)=>(numbered?encounterNumber(a)-encounterNumber(b):0)||a.species-b.species||a.name.localeCompare(b.name,'zh'));
  const pages=Math.max(1,Math.ceil(rows.length/10));
  const boss=rows.find(boss=>boss.id===selected)??rows[page*10]??rows[0];
  const campaign=boss?.campaign;
  const trainer=boss?.category==='训练师对战';
  const destination=boss&&!campaign?findChallengeLocation(boss):undefined;
  const landing=destination?resolveWorldLocation(destination.planetId,destination.regionId):undefined;
  const landingName=landing?(landing.planet.name===landing.region.name?landing.region.name:`${landing.planet.name} · ${landing.region.name}`):'';
  useEffect(()=>{if(page>=pages)setPage(pages-1)},[page,pages]);
  return <section className="management-panel challenge-management" aria-label="星际挑战面板">
    <div className="management-panel-heading"><strong>星际挑战档案</strong><span>已完成 {entries.filter(entry=>entry.cleared).length} / {entries.length}</span></div>
    <nav className="management-tabs challenge-category-tabs" aria-label="挑战分类">{categories.map(name=><button key={name} aria-pressed={category===name} className={category===name?'active':''} onClick={()=>{if(name==='勇者之塔'&&onTower){onTower();return}setCategory(name);setPage(0);setSelected('')}}>{name}</button>)}</nav>
    <div className="challenge-inner"><aside className="challenge-index">
      <div className="management-filter"><input aria-label="搜索挑战" placeholder="对手名称 / 挑战提示" value={search} onChange={event=>{setSearch(event.target.value);setPage(0);setSelected('')}}/></div>
      <div className="challenge-index-scroll">{rows.slice(page*10,(page+1)*10).map(entry=><button key={entry.id} className={entry.id===boss?.id?'active':''} aria-pressed={entry.id===boss?.id} onClick={()=>setSelected(entry.id)}><div className="challenge-mini-art"><CreatureArt species={entry.species} name={entry.name}/></div><span><strong>{entry.name}</strong><small>{entry.tower?`最高通过 ${towerProgress.highestCleared} / 70 层`:`#${String(entry.species).padStart(4,'0')} · ${entry.campaign?`${entry.campaign.completed}/${entry.campaign.stages.length} 阶段`:encounterLevelText(entry.level,entry.evidence?.hasInferredLevel,entry.evidence?.displayLevelUnknown)}`}</small></span><b>{entry.cleared?'✓':'›'}</b></button>)}{!rows.length&&<div className="management-empty">没有匹配的挑战。</div>}</div>
      <div className="management-pagination"><button aria-label="上一页挑战" disabled={!page} onClick={()=>{setPage(value=>value-1);setSelected('')}}>‹</button><span>{page+1} / {pages} · {rows.length} 个</span><button aria-label="下一页挑战" disabled={page+1>=pages} onClick={()=>{setPage(value=>value+1);setSelected('')}}>›</button></div>
    </aside><div className="challenge-entry-scroll">{boss?<>
      <div className="challenge-entry-hero"><div className="challenge-entry-art"><CreatureArt species={boss.species} name={boss.name}/></div>
      <div className="dex-entry-title"><small>{boss.tower?'十层起点 · 进度保存':`#${String(boss.species).padStart(4,'0')} · ${boss.category}${!campaign?` · ${encounterLevelText(boss.level,boss.evidence?.hasInferredLevel,boss.evidence?.displayLevelUnknown)}`:''}`}</small><h3>{boss.name}</h3><span className="type-tag">{boss.tower?`最高通过 ${towerProgress.highestCleared} / 70 层`:boss.cleared?'✓ 已完成':campaign?`${campaign.completed} / ${campaign.stages.length} 阶段`:'可挑战'}</span></div></div>
      {!boss.tower&&<BossEvidence evidence={boss.evidence}/>}
      {trainer&&!!boss.opponents?.length&&<section className="trainer-roster" aria-label="训练师队伍"><strong>对方阵容 · {boss.opponents.length} 只精灵</strong><div>{boss.opponents.map((opponent,index)=><article key={`${index}-${opponent.species}`}><div className="trainer-roster-art"><CreatureArt species={opponent.species} name={opponent.name}/></div><strong>{opponent.name}</strong><small>{encounterLevelText(opponent.level,opponent.evidence?.hasInferredLevel,opponent.evidence?.displayLevelUnknown)}</small></article>)}</div></section>}
      <div className="challenge-description"><strong>挑战地点</strong><p>{campaign?.location??landingName}</p><p>{boss.tower?'进入勇者之塔，选择已解锁的十层起点，或继续上次挑战。':campaign?'先进入挑战场景，按顺序推进各阶段。':trainer?'前往太空站，与训练师互动开启对战。':destination?.staging?'先前往飞船传送舱，再与对手互动开启战斗。':'先传送到挑战地点，再与场景中的首领互动开启战斗。'}</p></div>
      <div className="challenge-description"><strong>{campaign?'挑战流程':'挑战提示'}</strong>{campaign?campaign.stages.map((stage,index)=><p key={stage.id}>{stage.cleared?'✓':index+1} · {stage.name}</p>):<p>{boss.description||'带上精灵伙伴，挑战这位星际首领。'}</p>}</div>
      <div className="challenge-reward-note"><strong>通关奖励</strong><span>{boss.tower?'逐层领取挑战奖励，通过第 70 层后可重选起点。':trainer?'赛尔豆与经验。':campaign?.id==='rei-training'?'通过每项特训，领悟对应的雷伊技能':campaign?'完成全部阶段后获得精元，途中阶段不会重复发放精灵':'获得首领精元 → 道具背包 → 确认孵化'}</span></div>
      <div className="management-confirm-row"><span className="management-hint">精灵背包 {s.party.length} / 6</span><button className="primary" disabled={boss.tower?!onTower:campaign?!onCampaign:!onTravel} onClick={()=>boss.tower?onTower?.():campaign?onCampaign?.(campaign.id):onTravel?.(boss)}>{boss.tower?'进入勇者之塔 →':campaign?'进入挑战场景 →':'开始挑战 →'}</button></div>
      <div className="challenge-secondary-actions"><button onClick={()=>c.dispatch({type:'heal'})}>恢复全队</button>{onExplore&&<button onClick={onExplore}>返回星球探索</button>}</div>
    </>:<div className="management-empty">选择对手查看挑战提示。</div>}</div></div>
  </section>;
}
