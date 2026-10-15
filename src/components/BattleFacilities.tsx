import {useEffect,useState} from 'react';
import type {GameController,GameSnapshot} from '../game-types';
import {CreatureArt} from './CreatureArt';
import '../management.css';
import './BattleFacilities.css';

export interface BattleFacilitiesProps {
  s:GameSnapshot;c:GameController;facilityId?:string;onManage?:()=>void;
}

export default function BattleFacilities({s,c,facilityId,onManage}:BattleFacilitiesProps) {
  const facilities=s.facilities??[];
  const [selected,setSelected]=useState(facilityId??'random'),[teamId,setTeamId]=useState(''),[groupId,setGroupId]=useState('trained'),[memberIndex,setMemberIndex]=useState(0);
  useEffect(()=>{if(facilityId){setSelected(facilityId);setTeamId('');setGroupId('trained')}},[facilityId]);
  const facility=facilities.find(row=>row.id===selected)??facilities[0];
  const classic=facility?.id==='classic';
  const groups=facility?.groups??[];
  const group=groups.find(row=>row.id===groupId)??groups[0];
  const teams=(facility?.teams??[]).filter(row=>!group||row.groupId===group.id);
  const team=teams.find(row=>row.id===teamId)??teams[0];
  const member=team?.opponents[memberIndex]??team?.opponents[0];
  useEffect(()=>setMemberIndex(0),[team?.id]);
  const ready=s.party.filter(uid=>s.monsters.some(mon=>mon.uid===uid&&mon.hp>0)).length;
  const unavailable=!facility||!!s.battle&&!s.battle.finished||!ready||(classic?!team:(facility.poolSize??0)<6);
  return <section className="management-panel battle-facilities" aria-label="太空站对战设施">
    <div className="management-panel-heading"><strong>太空站对战中心</strong><span>六精灵对战 · 对方 Lv.100</span></div>
    <nav className="management-tabs facility-mode-tabs" aria-label="对战模式">{facilities.map(row=><button key={row.id} className={row.id===facility?.id?'active':''} aria-pressed={row.id===facility?.id} onClick={()=>{setSelected(row.id);setTeamId('')}}>{row.name}</button>)}</nav>
    {facility?<div className={`facility-content ${classic?'facility-content-classic':''}`}>
      <header className="facility-introduction"><small>{classic?'经典固定阵容':facility.id==='elite'?'精选主力与战术搭档':'随机六精灵'}</small><h3>{facility.name}</h3><p>{facility.description}</p></header>
      {!classic&&<div className="facility-rules" aria-label="对战规格"><span><b>6</b> 只对手</span><span><b>100</b> 级</span><span><b>{facility.poolSize??0}</b> 只候选精灵</span></div>}
      {classic?<>
        {!!groups.length&&<nav className="facility-group-tabs" aria-label="阵容分组">{groups.map(row=><button key={row.id} className={row.id===group?.id?'active':''} aria-pressed={row.id===group?.id} onClick={()=>{setGroupId(row.id);setTeamId('');setMemberIndex(0)}}>{row.name}<small>{facility.teams?.filter(team=>team.groupId===row.id).length} 队</small></button>)}</nav>}
        {group&&<p className="facility-group-description">{group.description}</p>}
        <div className="facility-team-layout">
          <nav className="facility-team-options" aria-label="选择经典队伍">{teams.map(row=><button key={row.id} className={row.id===team?.id?'active':''} aria-pressed={row.id===team?.id} onClick={()=>{setTeamId(row.id);setMemberIndex(0)}}><strong>{row.name}</strong><span>{row.opponents.length} 只 · Lv.100</span></button>)}</nav>
          {team?<section className="facility-team-preview" aria-label={`${team.name}完整阵容`}>
            <h4>{team.name}<small>6 只 · Lv.100</small></h4><p>{team.description}</p>
            <div className="facility-six-roster" aria-label="查看队员配招">{team.opponents.map((mon,index)=><button key={`${index}-${mon.species}`} aria-label={`${mon.name}，Lv.${mon.level}，查看配招`} aria-pressed={mon===member} className={mon===member?'active':''} onClick={()=>setMemberIndex(index)}><div className="facility-roster-art"><CreatureArt species={mon.species} name={mon.name}/></div><strong>{mon.name}</strong><span>Lv.{mon.level}</span></button>)}</div>
            {member&&<section className="facility-member-detail" aria-label={`${member.name}配招详情`}>
              <header><strong>{member.name}</strong><span>种族值总和 {member.baseTotal}</span></header>
              {member.training&&<div className="facility-training" aria-label={`${member.name}特训状态`}><strong>{member.training.label}</strong>{member.training.equivalentBaseTotal!==undefined&&<span>Lv.100 中性能力折算：等效种族值 {member.training.equivalentBaseTotal}</span>}<p>{member.training.description}</p></div>}
              {member.role&&<p>{member.role}</p>}
              {!!member.skills?.length&&<ul>{member.skills.map(skill=><li key={skill.id}><span>{skill.name}</span>{skill.training&&<small title={skill.training}>特训技能</small>}</li>)}</ul>}
            </section>}
          </section>:<p className="management-empty">暂无可挑战的经典队伍。</p>}
        </div>
      </>:<section className="facility-random-preview" aria-label="随机对手说明"><div className="facility-random-slots" aria-hidden="true">{Array.from({length:6},(_,index)=><span key={index}><b>?</b><small>Lv.100</small></span>)}</div><p>每次开始对战都会重新抽取六只不同的精灵。{facility.id==='elite'?'高种族值主力与精选战术精灵同池登场，特训精灵使用对应的强化状态。':'对方阵容会在进入战斗后揭晓。'}</p></section>}
      <div className="facility-start-row"><div><strong>你的出战队伍 {s.party.length} / 6</strong><span>{ready?`${ready} 只精灵可以出战`:'请先恢复精灵，或将精灵加入出战队伍。'}</span></div><button className="primary" disabled={unavailable} onClick={()=>c.dispatch({type:'startFacility',facilityId:facility.id,...(classic&&team?{teamId:team.id}:{})})}>{classic?'挑战这支队伍 →':'随机匹配并开战 →'}</button></div>
      <div className="facility-preparation"><button disabled={!!s.battle&&!s.battle.finished} onClick={()=>c.dispatch({type:'heal'})}>恢复全队</button>{onManage&&<button onClick={onManage}>调整出战队伍</button>}</div>
    </div>:<div className="management-empty">对战设施暂不可用。</div>}
  </section>;
}
