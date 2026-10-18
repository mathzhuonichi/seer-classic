import {useEffect,useState} from 'react';
import type {MonsterView,StatKey} from '../../game-types.ts';
import {STAT_KEYS} from '../../../raising/core/types.ts';
import {EV_STAT_CAP,EV_TOTAL_CAP} from '../../../raising/core/stats.ts';
import {STAT_LABELS} from '../../presentation/labels.ts';
import {statTotal} from '../../presentation/monster-views.ts';
import {checkEvDraft,clearedDraft,draftEvs,EV_PRESETS,evDraft,presetDraft,sameEvs} from '../../presentation/ev-draft.ts';
import EngravingSlots from '../EngravingSlots.tsx';
import {dispatchNext,monsterIn,type TabProps} from './dispatch-feedback.ts';

type Props=TabProps&{editing:boolean;setEditing:(editing:boolean)=>void};

/** 能力: base stats, 学习力 with its editor, entry stats including engravings, and the engraving slots. */
export default function AbilityTab({m,c,feedback,say,editing,setEditing}:Props) {
  const [evs,setEvs]=useState(()=>evDraft(m.evs)),[preset,setPreset]=useState('');
  const savedKey=STAT_KEYS.map(key=>m.evs[key]).join();
  useEffect(()=>setEvs(evDraft(m.evs)),[m.uid,savedKey]);
  const check=checkEvDraft(evs),dirty=!sameEvs(evs,m.evs);
  const edit=(key:StatKey,value:string)=>{setEvs(old=>({...old,[key]:value}));say('')};
  function toggle() {
    if(editing){setEvs(evDraft(m.evs));setPreset('');say('')}
    setEditing(!editing);
  }
  function save() {
    const target=draftEvs(evs),result=monsterIn(dispatchNext(c,{type:'setEvs',uid:m.uid,evs:target}),m.uid);
    const saved=!!result&&STAT_KEYS.every(key=>result.evs[key]===target[key]);
    say(saved?'学习力已保存。':'学习力未保存，请查看提示。');
    if(saved)setEditing(false);
  }
  const status=!editing?'含刻印加成；体力为上限':!check.valid?`每项 0–${EV_STAT_CAP} 整数`:check.over?'超过总上限':dirty?'尚未保存':'已保存';
  return <section className={`raising-ability-panel${editing?' is-editing':''}`} aria-label="能力与学习力">
    <div className="raising-ability-heading">
      <span>种族值合计 <b>{statTotal(m.baseStats)}</b></span>
      <button aria-expanded={editing} onClick={toggle}>{editing?'取消调整':'调整学习力'}</button>
    </div>
    <table className="management-stat-table raising-ability-table">
      <thead><tr>
        <th scope="col">能力</th><th scope="col">种族</th><th scope="col">学习力</th>
        <th scope="col" title="数值已含生效刻印加成；体力为入场上限">入场能力</th>
      </tr></thead>
      <tbody>{STAT_KEYS.map(key=><StatRow key={key} m={m} stat={key} draft={editing?evs[key]:undefined} onEdit={edit}/>)}</tbody>
    </table>
    <div className={`raising-ability-footnote${editing&&!check.fits?' invalid':''}`}>
      <span>学习力 {editing?(check.valid?check.total:'—'):statTotal(m.evs)} / {EV_TOTAL_CAP}</span><span>{status}</span>
    </div>
    {editing&&<div className="raising-ev-editor">
      <div className="ev-controls">
        <select aria-label="学习力预设" value={preset} onChange={event=>setPreset(event.target.value)}>
          <option value="">{`选择 ${EV_STAT_CAP} + ${EV_STAT_CAP} 预设`}</option>{Object.keys(EV_PRESETS).map(name=><option key={name}>{name}</option>)}
        </select>
        <button disabled={!preset} onClick={()=>{setEvs(presetDraft(preset));say('预设已填入，点击保存学习力应用。')}}>填入预设</button>
        <button onClick={()=>{setEvs(clearedDraft());say('已清空输入，点击保存学习力应用。')}}>清空全部</button>
      </div>
      <div className="management-confirm-row ev-save-row">
        <span className="management-feedback" role="status">{feedback||'保存后应用学习力。'}</span>
        <button className="primary" disabled={!check.fits||!dirty} onClick={save}>保存学习力</button>
      </div>
    </div>}
    {!editing&&feedback&&<p className="management-feedback" role="status">{feedback}</p>}
    <EngravingSlots m={m} c={c}/>
  </section>;
}

/** One stat: base, 学习力 (an input while editing), and the entry value with its engraving bonus. */
function StatRow({m,stat,draft,onEdit}:{m:MonsterView;stat:StatKey;draft?:string;onEdit:(stat:StatKey,value:string)=>void}) {
  const label=STAT_LABELS[stat],bonus=m.engravings?.bonus[stat];
  return <tr><th scope="row">{label}</th><td>{m.baseStats[stat]}</td>
    <td>{draft===undefined?m.evs[stat]:<div className="ev-cell">
      <input aria-label={`${label}学习力`} type="number" min="0" max={EV_STAT_CAP} step="1" value={draft} onChange={event=>onEdit(stat,event.target.value)}/>
      <button aria-label={`清空${label}学习力`} onClick={()=>onEdit(stat,'0')}>清空</button>
    </div>}</td>
    <td title={`基础 ${m.stats[stat]} + 刻印 ${bonus??0}`}>
      <strong>{m.stats[stat]+(bonus??0)}</strong>{!!bonus&&<small className="raising-stat-bonus">（+{bonus}）</small>}
    </td>
  </tr>;
}
