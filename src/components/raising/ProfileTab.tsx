import {useEffect,useState} from 'react';
import type {EvolutionChoiceView,GameController,MonsterView} from '../../game-types.ts';
import {MAX_LEVEL} from '../../../raising/core/growth.ts';
import {NICKNAME_MAX} from '../../../raising/core/storage.ts';
import {CreatureArt} from '../CreatureArt.tsx';
import {dispatchNext,feedbackFor,monsterIn} from './dispatch-feedback.ts';

/** 资料: nickname, the 经验分配器 and evolution, sharing one feedback line. */
export default function ProfileTab({m,c,expPool}:{m:MonsterView;c:GameController;expPool:number}) {
  const [nickname,setNickname]=useState(m.name),[amount,setAmount]=useState('1000'),[feedback,setFeedback]=useState('');
  useEffect(()=>setNickname(m.name),[m.uid,m.name]);
  const exp=Number(amount);
  return <div className="raising-forms">
    <section><h4>精灵昵称</h4><div className="management-inline-form">
      <input aria-label="精灵昵称" maxLength={NICKNAME_MAX} value={nickname} onChange={event=>setNickname(event.target.value)}/>
      <button disabled={!nickname.trim()||nickname===m.name} onClick={()=>{c.dispatch({type:'rename',uid:m.uid,name:nickname.trim()});setFeedback('精灵昵称已更新。')}}>保存昵称</button>
    </div></section>
    <section><h4>经验分配器</h4><p>当前经验 {m.exp} / {m.expToNext} · 可分配 {expPool.toLocaleString()}</p><div className="management-inline-form">
      <input aria-label="分配经验数量" type="number" min="1" max={expPool} value={amount} onChange={event=>setAmount(event.target.value)}/>
      <button className="primary" disabled={!Number.isInteger(exp)||exp<1||exp>expPool||m.level>=MAX_LEVEL} onClick={()=>{c.dispatch({type:'allocateExp',uid:m.uid,amount:exp});setFeedback('经验已分配，等级和属性已更新。')}}>分配经验</button>
    </div></section>
    <EvolutionSection key={m.species} m={m} c={c} onFeedback={setFeedback}/>
    <p className="management-feedback" role="status">{feedback}</p>
  </div>;
}

const selectable=(choice:EvolutionChoiceView)=>choice.ready&&!choice.blockedReason;

/** Level evolutions. A branching form needs an explicit target; a single ready target is preselected. */
function EvolutionSection({m,c,onFeedback}:{m:MonsterView;c:GameController;onFeedback:(text:string)=>void}) {
  const [selected,setSelected]=useState<number>();
  const choices=m.evolutionChoices??[];
  const chosen=choices.find(choice=>choice.species===selected&&selectable(choice));
  useEffect(()=>{if(selected!==undefined&&!chosen)setSelected(undefined)},[selected,chosen]);
  const target=chosen??(choices.length===1&&selectable(choices[0])?choices[0]:undefined);
  function evolve() {
    if(!target)return;
    const next=dispatchNext(c,{type:'evolve',uid:m.uid,toSpecies:target.species}),ok=monsterIn(next,m.uid)?.species===target.species;
    onFeedback(feedbackFor(next,ok,`已进化为${target.name}。`,'进化未完成，请查看目标条件。'));
  }
  return <section className="raising-evolution"><h4>精灵进化</h4>
    <p>{choices.length>1?'请选择目标形态。每只精灵只会进化为所选分支；收集其他分支需要再获取并培养一只初始精灵。':choices.length?'达到所需等级后，即可确认进化。':'当前形态没有普通进化路线。'}</p>
    {!!choices.length&&<><div className="raising-evolution-options" role="group" aria-label="选择进化目标">{choices.map(choice=>{
      const reason=choice.blockedReason??(choice.ready?undefined:'暂不满足进化条件。'),picked=target?.species===choice.species;
      return <button key={choice.species} type="button" aria-label={`选择进化为${choice.name}`} aria-pressed={picked} disabled={!!reason} onClick={()=>{setSelected(choice.species);onFeedback('')}}>
        <span className="raising-evolution-art" aria-hidden="true"><CreatureArt species={choice.species} name={choice.name}/></span>
        <span className="raising-evolution-copy"><strong>{choice.name}</strong><small>Lv.{choice.level} 进化</small><span className={reason?'raising-evolution-blocked':'raising-evolution-state'}>{reason??(picked?'已选择':'可选择')}</span></span>
      </button>;
    })}</div>
    <button className="primary raising-evolution-confirm" disabled={!target} onClick={evolve}>{target?`进化为${target.name}`:choices.some(selectable)?'请先选择进化目标':'尚未满足进化条件'}</button></>}
  </section>;
}
