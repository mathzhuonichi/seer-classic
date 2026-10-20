import {useState} from 'react';
import {MAX_EQUIPPED} from '../../../../../raising/core/monster.ts';
import {elementName,skillIconType} from '../../../../shared/element-types.ts';
import {powerText} from '../../../../shared/skill-text.ts';
import TypeIcon from '../../../../shared/ui/TypeIcon.tsx';
import {SkillButton} from '../../../../shared/ui/SkillDetail.tsx';
import {feedbackFor,type TabProps} from './dispatch-feedback.ts';

/** 技能: pick an equipped slot, then a learned skill to put in it. */
export default function SkillsTab({m,c,feedback,say}:TabProps) {
  const [slot,setSlot]=useState(0),[search,setSearch]=useState(''),[skillId,setSkillId]=useState<number>();
  const skill=m.learned.find(sk=>sk.id===skillId);
  const equipped=(id:number)=>m.skills.some(current=>current.id===id);
  function replace() {
    if(!skill)return;
    const ids=m.skills.map(sk=>sk.id);
    if(slot<ids.length)ids[slot]=skill.id;else ids.push(skill.id);
    say(feedbackFor(c.dispatch({type:'equip',uid:m.uid,skills:ids}),`已将${skill.name}放入第 ${slot+1} 技能位。`));
    setSkillId(undefined);
  }
  const hint=skill?`第 ${slot+1} 位：${m.skills[slot]?.name??'空位'} → ${skill.name}`:'选择一个技能查看替换目标。';
  return <>
    <div className="stat-table-heading"><strong>四个技能位</strong><span>选择技能位，再选择已学会的技能</span></div>
    <div className="equipped-skill-grid">{Array.from({length:MAX_EQUIPPED},(_,i)=>{
      const current=m.skills[i],pick=()=>{setSlot(i);setSkillId(undefined);say('')};
      const face=<><span>技能 {i+1}</span><strong>{current?.name||'空位'}</strong>
        <small>{current?`${elementName(skillIconType(current))} · PP ${current.pp}/${current.maxPp}`:'尚未装备'}</small></>;
      return current
        ? <SkillButton key={i} skill={current} className={slot===i?'active':''} pressed={slot===i} onClick={pick}>{face}</SkillButton>
        : <button key={i} className={slot===i?'active':''} aria-pressed={slot===i} disabled={i>m.skills.length} onClick={pick}>{face}</button>;
    })}</div>
    <input className="management-wide-input" aria-label="搜索已学会技能" placeholder="搜索已学会的技能…" value={search}
      onChange={event=>setSearch(event.target.value)}/>
    <div className="learned-skill-list">{m.learned.filter(sk=>`${sk.name} ${sk.type}`.includes(search)).map(sk=>
      <SkillButton key={sk.id} skill={sk} className={skillId===sk.id?'active':''} disabled={equipped(sk.id)} onClick={()=>setSkillId(sk.id)}>
        <span><strong>{sk.name}</strong>
          <small className="raising-skill-meta"><TypeIcon type={skillIconType(sk)} focusable={false} showTooltip={false}/>
            {sk.category} · 威力 {powerText(sk)} · PP {sk.maxPp}</small>
          <em>{sk.description}</em></span>
        <b>{equipped(sk.id)?'已装备':skillId===sk.id?'已选择':'选择'}</b>
      </SkillButton>)}</div>
    <div className="management-confirm-row">
      <span className="management-feedback" role="status">{feedback||hint}</span><button className="primary" disabled={!skill} onClick={replace}>确认替换</button>
    </div>
  </>;
}
