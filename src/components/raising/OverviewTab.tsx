import {useEffect,useState} from 'react';
import type {GameController,MonsterView} from '../../game-types.ts';
import {STAT_KEYS} from '../../../raising/core/types.ts';
import {IV_MAX} from '../../../raising/core/stats.ts';
import {STAT_LABELS} from '../../presentation/labels.ts';
import {appearanceOf,speciesNumber} from '../../presentation/monster-views.ts';
import {dispatchNext,feedbackFor,monsterIn} from './dispatch-feedback.ts';

/** 信息: the skin picker, identity, base stats, EXP bar and equipped skills. */
export default function OverviewTab({m,c}:{m:MonsterView;c:GameController}) {
  return <>
    <SkinPicker m={m} c={c}/>
    <div className="petbag-overview">
      <div className="petbag-information">
        <div><span>精灵编号</span><strong>{speciesNumber(m.species)}</strong></div><div><span>性格</span><strong>{m.nature}</strong></div>
        <div><span>个体值</span><strong>{m.iv} / {IV_MAX}</strong></div><div><span>特性</span><strong>{m.trait||'无'}</strong></div>
      </div>
      <p className="engraving-stat-note">基础能力（不含刻印）</p>
      <div className="petbag-stat-summary">{STAT_KEYS.map(key=><div key={key}><span>{STAT_LABELS[key]}</span><strong>{m.stats[key]}</strong></div>)}</div>
      <div className="petbag-experience"><span>升级经验</span><meter value={m.exp} max={Math.max(1,m.expToNext)}/><small>{m.exp} / {m.expToNext}</small></div>
      <div className="petbag-skill-summary"><strong>当前技能</strong>
        {m.skills.map(sk=><div key={sk.id}><span>{sk.name}</span><small>PP {sk.pp}/{sk.maxPp}</small></div>)}
      </div>
    </div>
  </>;
}

/** Cosmetic skins: the current form or one of its ancestors. */
function SkinPicker({m,c}:{m:MonsterView;c:GameController}) {
  const [feedback,setFeedback]=useState('');
  useEffect(()=>setFeedback(''),[m.species]);
  const options=m.skinOptions??[{species:m.species,name:m.speciesName}];
  const appearance=appearanceOf(m);
  function choose(species:number) {
    const next=dispatchNext(c,{type:'setSkin',uid:m.uid,species:species===m.species?null:species}),result=monsterIn(next,m.uid);
    setFeedback(feedbackFor(next,!!result&&appearanceOf(result)===species,'此精灵的皮肤已保存。','皮肤未更换，请重新选择。'));
  }
  return <section className="raising-skins" aria-label="精灵皮肤">
    <div className="raising-skin-picker"><label htmlFor={`skin-${m.uid}`}>皮肤外观</label>
      <select id={`skin-${m.uid}`} aria-label="选择精灵皮肤" value={appearance} onChange={event=>choose(Number(event.target.value))}>
      {options.map(option=><option key={option.species} value={option.species}>{option.name}{option.species===m.species?'（默认外观）':''}</option>)}
    </select></div>
    <p>当前外观：{options.find(option=>option.species===appearance)?.name??m.speciesName}。仅改变此精灵外观，属性与技能保持当前形态。</p>
    {feedback&&<p className="management-feedback" role="status">{feedback}</p>}
  </section>;
}
