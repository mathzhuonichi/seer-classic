import {useEffect,useState} from 'react';
import type {GameController,GameSnapshot} from '../game-types';
import {CreatureArt} from './CreatureArt';
import '../management.css';

export interface BattleFacilitiesProps {
  s:GameSnapshot;c:GameController;facilityId?:string;onManage?:()=>void;
}

export default function BattleFacilities({s,c,facilityId,onManage}:BattleFacilitiesProps) {
  const facilities=s.facilities??[];
  const [selected,setSelected]=useState(facilityId??'random'),[teamId,setTeamId]=useState('');
  useEffect(()=>{if(facilityId){setSelected(facilityId);setTeamId('')}},[facilityId]);
  const facility=facilities.find(row=>row.id===selected)??facilities[0];
  const classic=facility?.id==='classic';
  const team=facility?.teams?.find(row=>row.id===teamId)??facility?.teams?.[0];
  const ready=s.party.filter(uid=>s.monsters.some(mon=>mon.uid===uid&&mon.hp>0)).length;
  const unavailable=!facility||!!s.battle&&!s.battle.finished||!ready||(classic?!team:(facility.poolSize??0)<6);
  return <section className="management-panel battle-facilities" aria-label="太空站对战设施">
    <div className="management-panel-heading"><strong>太空站对战中心</strong><span>六精灵对战 · 对方 Lv.100</span></div>
    <nav className="management-tabs facility-mode-tabs" aria-label="对战模式">{facilities.map(row=><button key={row.id} className={row.id===facility?.id?'active':''} aria-pressed={row.id===facility?.id} onClick={()=>{setSelected(row.id);setTeamId('')}}>{row.name}</button>)}</nav>
    {facility?<div className="facility-content">
      <header className="facility-introduction"><small>{classic?'经典固定阵容':facility.id==='elite'?'种族值总和 ≥ 600':'随机六精灵'}</small><h3>{facility.name}</h3><p>{facility.description}</p></header>
      <div className="facility-rules" aria-label="对战规格"><span><b>6</b> 只对手</span><span><b>100</b> 级</span>{!classic&&<span><b>{facility.poolSize??0}</b> 只候选精灵</span>}</div>
      {classic?<>
        <nav className="facility-team-options" aria-label="选择经典队伍">{facility.teams?.map(row=><button key={row.id} className={row.id===team?.id?'active':''} aria-pressed={row.id===team?.id} onClick={()=>setTeamId(row.id)}><strong>{row.name}</strong><span>{row.opponents.length} 只 · Lv.100</span></button>)}</nav>
        {team?<section className="facility-team-preview" aria-label={`${team.name}完整阵容`}><h4>{team.name}</h4><p>{team.description}</p><div className="facility-six-roster">{team.opponents.map((mon,index)=><article key={`${index}-${mon.species}`}><div className="facility-roster-art"><CreatureArt species={mon.species} name={mon.name}/></div><strong>{mon.name}</strong><span>Lv.{mon.level}</span><small>种族值总和 {mon.baseTotal}</small></article>)}</div></section>:<p className="management-empty">暂无可挑战的经典队伍。</p>}
      </>:<section className="facility-random-preview" aria-label="随机对手说明"><div className="facility-random-slots" aria-hidden="true">{Array.from({length:6},(_,index)=><span key={index}><b>?</b><small>Lv.100</small></span>)}</div><p>每次开始对战都会重新抽取六只不同的精灵。{facility.id==='elite'?'每只对手的种族值总和均不低于 600。':'对方阵容会在进入战斗后揭晓。'}</p></section>}
      <div className="facility-start-row"><div><strong>你的出战队伍 {s.party.length} / 6</strong><span>{ready?`${ready} 只精灵可以出战`:'请先恢复精灵，或将精灵加入出战队伍。'}</span></div><button className="primary" disabled={unavailable} onClick={()=>c.dispatch({type:'startFacility',facilityId:facility.id,...(classic&&team?{teamId:team.id}:{})})}>{classic?'挑战这支队伍 →':'随机匹配并开战 →'}</button></div>
      <div className="facility-preparation"><button disabled={!!s.battle&&!s.battle.finished} onClick={()=>c.dispatch({type:'heal'})}>恢复全队</button>{onManage&&<button onClick={onManage}>调整出战队伍</button>}</div>
    </div>:<div className="management-empty">对战设施暂不可用。</div>}
  </section>;
}
