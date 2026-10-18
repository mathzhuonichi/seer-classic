import {useEffect,useRef,useState,type KeyboardEvent} from 'react';
import type {GameSnapshot,GameController,MonsterView} from '../game-types.ts';
import {STAT_KEYS} from '../../raising/core/types.ts';
import {EV_STAT_CAP,EV_TOTAL_CAP,IV_MAX,IV_MIN} from '../../raising/core/stats.ts';
import {MAX_LEVEL} from '../../raising/core/growth.ts';
import {getCreatureArt} from '../presentation/creature-art.ts';
import {STAT_LABELS} from '../presentation/labels.ts';
import {isEvValue} from '../presentation/ev-draft.ts';
import {appearanceOf,speciesName,statTotal} from '../presentation/monster-views.ts';
import './Modifier.css';

const location=(m:MonsterView,s:GameSnapshot)=>m.inParty?`背包第 ${s.party.indexOf(m.uid)+1} 位`:'精灵仓库';
const draftFor=(m:MonsterView)=>({level:m.level,iv:m.iv,nature:m.natureId,trait:m.traitId??'',evs:{...m.evs}});
const whole=(value:number,min:number,max:number)=>Number.isInteger(value)&&value>=min&&value<=max;

/** Sets one monster's level, 个体值, 性格, 特性 and 学习力 directly. */
function MonsterEditor({m,s,c}:{m:MonsterView;s:GameSnapshot;c:GameController}){
 const [draft,setDraft]=useState(()=>draftFor(m)),[feedback,setFeedback]=useState('');
 const set=(patch:Partial<ReturnType<typeof draftFor>>)=>setDraft({...draft,...patch});
 const valid=whole(draft.level,1,MAX_LEVEL)&&whole(draft.iv,IV_MIN,IV_MAX)&&STAT_KEYS.every(key=>isEvValue(draft.evs[key]));
 const total=statTotal(draft.evs);
 function apply(){
  if(!valid)return;
  c.dispatch({type:'cheatMonster',uid:m.uid,level:draft.level,iv:draft.iv,nature:draft.nature,evs:draft.evs,traitId:draft.trait||null});
  const updated=c.snapshot().monsters.find(mon=>mon.uid===m.uid);
  if(updated){setDraft(draftFor(updated));setFeedback(`已修改 ${updated.name} · Lv.${updated.level} · 个体值 ${updated.iv}。`)}
 }
 const hint=!valid?`等级须为 1–${MAX_LEVEL}，个体值为 ${IV_MIN}–${IV_MAX}，单项学习力为 0–${EV_STAT_CAP}。`
  :total>EV_TOTAL_CAP?'保存时按学习力总上限计算。':`修改将应用到 ${m.name}。`;
 return <form className="modifier-editor" onSubmit={event=>{event.preventDefault();apply()}}>
  <div className="modifier-fields">
   <label>等级
    <input aria-label="修改目标等级" type="number" required min="1" max={MAX_LEVEL} step="1" value={draft.level}
     onChange={event=>set({level:Number(event.target.value)})}/>
   </label>
   <label>潜力 / 个体值
    <input aria-label="修改目标个体值" type="number" required min={IV_MIN} max={IV_MAX} step="1" value={draft.iv}
     onChange={event=>set({iv:Number(event.target.value)})}/>
   </label>
   <label>性格<select aria-label="修改目标性格" value={draft.nature} onChange={event=>set({nature:event.target.value})}>
    {s.natures.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}
   </select></label>
   <label>特性<select aria-label="修改目标特性" value={draft.trait} onChange={event=>set({trait:event.target.value})}>
    <option value="">无特性</option>{s.traits.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
   </select></label>
  </div>
  <div className="modifier-ev-heading"><h3>学习力</h3><output>{total} / {EV_TOTAL_CAP}</output></div>
  <div className="modifier-ev-grid">{STAT_KEYS.map(key=><label key={key}>{STAT_LABELS[key]}
   <input aria-label={`修改目标${STAT_LABELS[key]}学习力`} type="number" required min="0" max={EV_STAT_CAP} step="1" value={draft.evs[key]}
    onChange={event=>set({evs:{...draft.evs,[key]:Number(event.target.value)}})}/>
  </label>)}</div>
  <div className="modifier-apply"><span>{hint}</span><button className="primary" type="submit" disabled={!valid}>应用精灵修改</button></div>
  {feedback&&<p className="modifier-feedback" role="status">{feedback}</p>}
 </form>;
}

/** Keeps Tab focus inside the dialog. */
function trapTab(event:KeyboardEvent<HTMLElement>){
 if(event.key!=='Tab')return;
 const focusable='button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]';
 const controls=[...event.currentTarget.querySelectorAll<HTMLElement>(focusable)].filter(element=>element.getClientRects().length);
 const first=controls[0],last=controls.at(-1);
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
}

type Props={s:GameSnapshot;c:GameController;m:MonsterView|undefined;onSelect:(uid:string)=>void;close:()=>void};

/** 航行修改器: a test dialog that edits monsters, adds species and sets resources. */
export default function Modifier({s,c,m,onSelect,close}:Props){
 const [species,setSpecies]=useState(1),[exp,setExp]=useState(100000),[feedback,setFeedback]=useState('');
 const dialog=useRef<HTMLElement>(null),picker=useRef<HTMLSelectElement>(null);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  (picker.current??dialog.current)?.focus();
  return()=>{if(previous?.isConnected)previous.focus()};
 },[]);
 function acquire(){
  c.dispatch({type:'cheatAcquire',species});
  setFeedback(`${speciesName(s,species,'精灵')}已加入持有精灵，可在上方选择后修改。`);
 }
 const setResources=()=>{c.dispatch({type:'cheatResources',expPool:exp,coins:exp});setFeedback(`经验池和赛尔豆已设置为 ${exp}。`)};
 return <div className="modifier-backdrop" onClick={event=>{if(event.target===event.currentTarget)close()}}>
  <section ref={dialog} className="modifier-dialog" role="dialog" aria-modal="true" aria-labelledby="modifier-title" tabIndex={-1} onKeyDown={trapTab}>
   <header className="modifier-titlebar"><h2 id="modifier-title">航行修改器</h2>
    <button aria-label="关闭修改器" onClick={close}><img src="/ui/classic/close.svg" alt="" draggable={false}/></button>
   </header>
   <div className="modifier-target">
    <label className="modifier-picker" htmlFor="modifier-monster">选择要修改的精灵
     <select ref={picker} id="modifier-monster" value={m?.uid??''} disabled={!s.monsters.length} onChange={event=>onSelect(event.target.value)}>
      {!s.monsters.length&&<option value="">尚未持有精灵</option>}
      {s.monsters.map((mon,index)=><option key={mon.uid} value={mon.uid}>{mon.name} · Lv.{mon.level} · {location(mon,s)} · 持有第 {index+1} 只</option>)}
     </select>
    </label>
    {m?<div className="modifier-current" role="status" aria-label="当前修改目标">
     <div className="modifier-portrait"><img src={getCreatureArt(appearanceOf(m)).src} alt={m.speciesName} draggable={false}/></div>
     <div><strong>正在修改：{m.name}</strong><span>#{m.species} {m.speciesName} · Lv.{m.level} · {location(m,s)}</span></div>
    </div>:<p>先添加精灵，再选择修改目标。</p>}
   </div>
   <div className="modifier-scroll">
    {m&&<MonsterEditor key={m.uid} m={m} s={s} c={c}/>}
    <section className="modifier-section"><h3>添加精灵</h3><div className="modifier-resource-row">
     <select aria-label="选择要添加的精灵" value={species} onChange={event=>setSpecies(Number(event.target.value))}>
      {s.species.map(row=><option key={row.id} value={row.id}>#{row.id} {row.name}</option>)}
     </select>
     <button onClick={acquire}>添加精灵</button>
    </div></section>
    <section className="modifier-section"><h3>补充资源</h3><div className="modifier-resource-row">
     <label>经验与赛尔豆
      <input aria-label="设置经验与赛尔豆数量" type="number" min="0" step="1" value={exp} onChange={event=>setExp(Number(event.target.value))}/>
     </label>
     <button disabled={!Number.isSafeInteger(exp)||exp<0} onClick={setResources}>设置经验与赛尔豆</button>
    </div></section>
    {feedback&&<p className="modifier-feedback" role="status">{feedback}</p>}
   </div>
  </section>
 </div>;
}
