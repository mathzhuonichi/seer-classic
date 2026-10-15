import {useEffect,useRef,useState,type KeyboardEvent} from 'react';
import type {GameSnapshot,GameController,MonsterView,StatKey} from '../game-types';
import {getCreatureArt} from '../presentation/creature-art';
import './Modifier.css';

const statNames:Record<StatKey,string>={hp:'体力',atk:'攻击',def:'防御',spa:'特攻',spd:'特防',spe:'速度'};
const statKeys=Object.keys(statNames) as StatKey[];
const location=(m:MonsterView,s:GameSnapshot)=>m.inParty?`背包第 ${s.party.indexOf(m.uid)+1} 位`:'精灵仓库';
function draftFor(m:MonsterView){return{level:m.level,iv:m.iv,nature:m.natureId,trait:m.traitId??'',evs:{...m.evs}}}

function MonsterEditor({m,s,c}:{m:MonsterView;s:GameSnapshot;c:GameController}){
 const [draft,setDraft]=useState(()=>draftFor(m)),[feedback,setFeedback]=useState('');
 const valid=Number.isInteger(draft.level)&&draft.level>=1&&draft.level<=100&&Number.isInteger(draft.iv)&&draft.iv>=0&&draft.iv<=31&&statKeys.every(key=>Number.isInteger(draft.evs[key])&&draft.evs[key]>=0&&draft.evs[key]<=255);
 const total=statKeys.reduce((sum,key)=>sum+draft.evs[key],0);
 function apply(){
  if(!valid)return;
  c.dispatch({type:'cheatMonster',uid:m.uid,level:draft.level,iv:draft.iv,nature:draft.nature,evs:draft.evs,traitId:draft.trait||null});
  const updated=c.snapshot().monsters.find(mon=>mon.uid===m.uid);
  if(updated){setDraft(draftFor(updated));setFeedback(`已修改 ${updated.name} · Lv.${updated.level} · 个体值 ${updated.iv}。`)}
 }
 return <form className="modifier-editor" onSubmit={event=>{event.preventDefault();apply()}}>
  <div className="modifier-fields">
   <label>等级<input aria-label="修改目标等级" type="number" required min="1" max="100" step="1" value={draft.level} onChange={event=>setDraft({...draft,level:Number(event.target.value)})}/></label>
   <label>潜力 / 个体值<input aria-label="修改目标个体值" type="number" required min="0" max="31" step="1" value={draft.iv} onChange={event=>setDraft({...draft,iv:Number(event.target.value)})}/></label>
   <label>性格<select aria-label="修改目标性格" value={draft.nature} onChange={event=>setDraft({...draft,nature:event.target.value})}>{s.natures.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
   <label>特性<select aria-label="修改目标特性" value={draft.trait} onChange={event=>setDraft({...draft,trait:event.target.value})}><option value="">无特性</option>{s.traits.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
  </div>
  <div className="modifier-ev-heading"><h3>学习力</h3><output>{total} / 510</output></div>
  <div className="modifier-ev-grid">{statKeys.map(key=><label key={key}>{statNames[key]}<input aria-label={`修改目标${statNames[key]}学习力`} type="number" required min="0" max="255" step="1" value={draft.evs[key]} onChange={event=>setDraft({...draft,evs:{...draft.evs,[key]:Number(event.target.value)}})}/></label>)}</div>
  <div className="modifier-apply"><span>{!valid?'等级须为 1–100，个体值为 0–31，单项学习力为 0–255。':total>510?'保存时按学习力总上限计算。':`修改将应用到 ${m.name}。`}</span><button className="primary" type="submit" disabled={!valid}>应用精灵修改</button></div>
  {feedback&&<p className="modifier-feedback" role="status">{feedback}</p>}
 </form>;
}

export default function Modifier({s,c,m,onSelect,close}:{s:GameSnapshot;c:GameController;m:MonsterView|undefined;onSelect:(uid:string)=>void;close:()=>void}){
 const [species,setSpecies]=useState(1),[exp,setExp]=useState(100000),[feedback,setFeedback]=useState('');
 const dialog=useRef<HTMLElement>(null),picker=useRef<HTMLSelectElement>(null);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  (picker.current??dialog.current)?.focus();
  return()=>{if(previous?.isConnected)previous.focus()};
 },[]);
 function trapTab(event:KeyboardEvent<HTMLElement>){
  if(event.key!=='Tab')return;
  const controls=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(element=>element.getClientRects().length);
  const first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
 }
 function acquire(){
  c.dispatch({type:'cheatAcquire',species,level:5});
  const name=s.species.find(row=>row.id===species)?.name??'精灵';
  setFeedback(`${name}已加入持有精灵，可在上方选择后修改。`);
 }
 return <div className="modifier-backdrop" onClick={event=>{if(event.target===event.currentTarget)close()}}>
  <section ref={dialog} className="modifier-dialog" role="dialog" aria-modal="true" aria-labelledby="modifier-title" tabIndex={-1} onKeyDown={trapTab}>
   <header className="modifier-titlebar"><h2 id="modifier-title">航行修改器</h2><button aria-label="关闭修改器" onClick={close}><img src="/ui/classic/close.svg" alt="" draggable={false}/></button></header>
   <div className="modifier-target">
    <label className="modifier-picker" htmlFor="modifier-monster">选择要修改的精灵<select ref={picker} id="modifier-monster" value={m?.uid??''} disabled={!s.monsters.length} onChange={event=>onSelect(event.target.value)}>{!s.monsters.length&&<option value="">尚未持有精灵</option>}{s.monsters.map((mon,index)=><option key={mon.uid} value={mon.uid}>{mon.name} · Lv.{mon.level} · {location(mon,s)} · 持有第 {index+1} 只</option>)}</select></label>
    {m?<div className="modifier-current" role="status" aria-label="当前修改目标"><div className="modifier-portrait"><img src={getCreatureArt(m.appearanceSpecies??m.species).src} alt={m.speciesName} draggable={false}/></div><div><strong>正在修改：{m.name}</strong><span>#{m.species} {m.speciesName} · Lv.{m.level} · {location(m,s)}</span></div></div>:<p>先添加精灵，再选择修改目标。</p>}
   </div>
   <div className="modifier-scroll">
    {m&&<MonsterEditor key={m.uid} m={m} s={s} c={c}/>}
    <section className="modifier-section"><h3>添加精灵</h3><div className="modifier-resource-row"><select aria-label="选择要添加的精灵" value={species} onChange={event=>setSpecies(Number(event.target.value))}>{s.species.map(row=><option key={row.id} value={row.id}>#{row.id} {row.name}</option>)}</select><button onClick={acquire}>添加精灵</button></div></section>
    <section className="modifier-section"><h3>补充资源</h3><div className="modifier-resource-row"><label>经验与赛尔豆<input aria-label="设置经验与赛尔豆数量" type="number" min="0" step="1" value={exp} onChange={event=>setExp(Number(event.target.value))}/></label><button disabled={!Number.isSafeInteger(exp)||exp<0} onClick={()=>{c.dispatch({type:'cheatResources',expPool:exp,coins:exp});setFeedback(`经验池和赛尔豆已设置为 ${exp}。`)}}>设置经验与赛尔豆</button></div></section>
    {feedback&&<p className="modifier-feedback" role="status">{feedback}</p>}
   </div>
  </section>
 </div>;
}
