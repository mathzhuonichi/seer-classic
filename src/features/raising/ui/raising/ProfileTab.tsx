import {useEffect,useState} from 'react';
import type { EvolutionChoiceView } from '../../../../shared/views.ts';
import {MAX_LEVEL} from '../../../../../raising/core/growth.ts';
import {NICKNAME_MAX} from '../../../../../raising/core/storage.ts';
import {CreatureArt} from '../../../../shared/ui/CreatureArt.tsx';
import {useGame} from '../../../../shared/ui/use-game.ts';
import {feedbackFor,type TabProps} from './dispatch-feedback.ts';

/** 资料: nickname, the 经验分配器, evolution and 放生. */
export default function ProfileTab({m,c,feedback,say}:TabProps) {
  const expPool=useGame(c,s=>s.expPool),[nickname,setNickname]=useState(m.name),[amount,setAmount]=useState('1000');
  useEffect(()=>setNickname(m.name),[m.uid,m.name]);
  const exp=Number(amount),canAllocate=Number.isInteger(exp)&&exp>=1&&exp<=expPool&&m.level<MAX_LEVEL;
  const rename=()=>say(feedbackFor(c.dispatch({type:'rename',uid:m.uid,name:nickname.trim()}),'精灵昵称已更新。'));
  const allocate=()=>say(feedbackFor(c.dispatch({type:'allocateExp',uid:m.uid,amount:exp}),'经验已分配，等级和属性已更新。'));
  return <div className="raising-forms">
    <section><h4>精灵昵称</h4><div className="management-inline-form">
      <input aria-label="精灵昵称" maxLength={NICKNAME_MAX} value={nickname} onChange={event=>setNickname(event.target.value)}/>
      <button disabled={!nickname.trim()||nickname===m.name} onClick={rename}>保存昵称</button>
    </div></section>
    <section><h4>经验分配器</h4><p>当前经验 {m.exp} / {m.expToNext} · 可分配 {expPool.toLocaleString()}</p><div className="management-inline-form">
      <input aria-label="分配经验数量" type="number" min="1" max={expPool} value={amount} onChange={event=>setAmount(event.target.value)}/>
      <button className="primary" disabled={!canAllocate} onClick={allocate}>分配经验</button>
    </div></section>
    <EvolutionSection key={m.species} {...{m,c,feedback,say}}/>
    <ReleaseSection {...{m,c,feedback,say}}/>
    <p className="management-feedback" role="status">{feedback}</p>
  </div>;
}

/** 放生 after a confirmation; the last party monster stays. The bag then selects another monster, so the result is a notice. */
function ReleaseSection({m,c,say}:TabProps) {
  const partySize=useGame(c,s=>s.party.length),[confirming,setConfirming]=useState(false),last=m.inParty&&partySize<=1;
  const release=()=>{setConfirming(false);say(feedbackFor(c.dispatch({type:'release',uid:m.uid}),`已放生${m.name}。`))};
  const intro=last?'出战背包至少保留一只精灵，最后一只出战精灵不能放生。':confirming?`确定放生${m.name}吗？放生后无法找回。`
    :'放生后这只精灵会永久离开，刻印退回库存；图鉴收集记录保留。';
  return <section className="raising-release"><h4>放生精灵</h4>
    <p>{intro}</p>
    {confirming?<div className="management-inline-form" role="group" aria-label={`确认放生${m.name}`}>
      <button className="primary" onClick={release}>确认放生</button><button autoFocus onClick={()=>setConfirming(false)}>取消</button>
    </div>:<button disabled={last} onClick={()=>setConfirming(true)}>放生{m.name}</button>}
  </section>;
}

const selectable=(choice:EvolutionChoiceView)=>!choice.blockedReason;

/** Level evolutions. A branching form needs an explicit target; a single ready target is preselected. */
function EvolutionSection({m,c,say}:TabProps) {
  const [selected,setSelected]=useState<number>(),choices=m.evolutionChoices;
  const chosen=choices.find(choice=>choice.species===selected&&selectable(choice));
  useEffect(()=>{if(selected!==undefined&&!chosen)setSelected(undefined)},[selected,chosen]);
  const target=chosen??(choices.length===1&&selectable(choices[0])?choices[0]:undefined);
  function evolve() {
    if(target)say(feedbackFor(c.dispatch({type:'evolve',uid:m.uid,toSpecies:target.species}),`已进化为${target.name}。`));
  }
  const intro=choices.length>1?'请选择目标形态。每只精灵只会进化为所选分支；收集其他分支需要再获取并培养一只初始精灵。'
    :choices.length?'达到所需等级后，即可确认进化。':'当前形态没有普通进化路线。';
  return <section className="raising-evolution"><h4>精灵进化</h4>
    <p>{intro}</p>
    {!!choices.length&&<><div className="raising-evolution-options" role="group" aria-label="选择进化目标">{choices.map(choice=>{
      // The snapshot explains every unready choice (level gap or ownership limit).
      const reason=choice.blockedReason,picked=target?.species===choice.species;
      const pick=()=>{setSelected(choice.species);say('')};
      return <button key={choice.species} type="button" aria-label={`选择进化为${choice.name}`} aria-pressed={picked} disabled={!!reason} onClick={pick}>
        <span className="raising-evolution-art" aria-hidden="true"><CreatureArt species={choice.species} name={choice.name}/></span>
        <span className="raising-evolution-copy"><strong>{choice.name}</strong><small>Lv.{choice.level} 进化</small>
          <span className={reason?'raising-evolution-blocked':'raising-evolution-state'}>{reason??(picked?'已选择':'可选择')}</span></span>
      </button>;
    })}</div>
    <button className="primary raising-evolution-confirm" disabled={!target} onClick={evolve}>
      {target?`进化为${target.name}`:choices.some(selectable)?'请先选择进化目标':'尚未满足进化条件'}
    </button></>}
  </section>;
}
