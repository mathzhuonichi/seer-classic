import {useEffect,useState} from 'react';
import type {GameController,GameSnapshot,MonsterView} from '../game-types.ts';
import {BREEDING_RECIPES,canBreedParents,type BreedingRecipe} from '../progression/breeding.ts';
import {getSpeciesAcquisition} from '../progression/acquisition.ts';
import {CreatureArt} from './CreatureArt.tsx';
import '../fusion.css';
import './Breeding.css';

export default function Breeding({s,c,initialRecipeId,onOpenDex,onOpenMonsters}:{s:GameSnapshot;c:GameController;initialRecipeId?:string;onOpenDex:(species:number)=>void;onOpenMonsters:(uid:string)=>void}){
 const [recipeId,setRecipeId]=useState(initialRecipeId??BREEDING_RECIPES[0]?.id??'');
 const [maleUid,setMaleUid]=useState(''),[femaleUid,setFemaleUid]=useState('');
 const [feedback,setFeedback]=useState(''),[offspringUid,setOffspringUid]=useState('');
 const recipe=BREEDING_RECIPES.find(entry=>entry.id===recipeId)??BREEDING_RECIPES[0];
 const activeBattle=!!s.battle&&!s.battle.finished;
 const name=(id:number)=>s.species.find(species=>species.id===id)?.name??`精灵 ${id}`;
 const ready=(entry:BreedingRecipe)=>s.monsters.some(male=>entry.maleSpecies.includes(male.species)&&s.monsters.some(female=>canBreedParents(entry,male,female)));
 const maleChoices=s.monsters.filter(mon=>recipe?.maleSpecies.includes(mon.species));
 const femaleChoices=s.monsters.filter(mon=>recipe?.femaleSpecies.includes(mon.species));
 const male=maleChoices.find(mon=>mon.uid===maleUid),female=femaleChoices.find(mon=>mon.uid===femaleUid);
 const valid=!!recipe&&!!male&&!!female&&canBreedParents(recipe,male,female);
 const offspring=s.monsters.find(mon=>mon.uid===offspringUid);
 useEffect(()=>{if(initialRecipeId) setRecipeId(initialRecipeId)},[initialRecipeId]);
 useEffect(()=>{setMaleUid('');setFemaleUid('');setFeedback('');setOffspringUid('')},[recipe?.id]);

 function breed(){
  if(!recipe||!male||!female||!valid||activeBattle)return;
  const before=new Set(c.snapshot().monsters.map(mon=>mon.uid));
  c.dispatch({type:'breed',recipeId:recipe.id,firstUid:male.uid,secondUid:female.uid});
  const next=c.snapshot(),infant=next.monsters.find(mon=>!before.has(mon.uid));
  setOffspringUid(infant?.uid??'');setFeedback(next.notices[0]??'请检查双亲和仓库空间。');
 }

 function parentPicker(role:'male'|'female',choices:MonsterView[],selected:MonsterView|undefined){
  const isMale=role==='male',label=isMale?'雄性亲本':'雌性亲本',allowed=isMale?recipe.maleSpecies:recipe.femaleSpecies;
  const value=isMale?maleUid:femaleUid,setValue=isMale?setMaleUid:setFemaleUid;
  return <div className="fusion-parent-card">
   <label htmlFor={`breeding-${role}`}>{label}<small> · Lv.{recipe.minLevel} 以上</small></label>
   <div className="fusion-parent-art"><CreatureArt species={selected?.appearanceSpecies??selected?.species??allowed[0]} name={selected?.name??name(allowed[0])}/></div>
   <select id={`breeding-${role}`} aria-label={`选择${label}`} value={value} onChange={event=>setValue(event.target.value)} disabled={activeBattle}>
    <option value="">{choices.length?'请选择精灵':'尚未持有指定精灵'}</option>
    {choices.map(mon=><option key={mon.uid} value={mon.uid}>{mon.name} · Lv.{mon.level} · {mon.inParty?'背包':'仓库'}{isMale&&(mon.generation??0)>0?' · 繁殖后代，不能作为雄性亲本':''}</option>)}
   </select>
   <p className="fusion-parent-requirement">指定形态：{allowed.map(name).join(' / ')}{isMale?'，需直接获得的第一代雄性。':'。'}</p>
   {selected&&selected.level<recipe.minLevel&&<p className="breeding-parent-warning">还需培养到 {recipe.minLevel} 级。</p>}
   {allowed.map(id=><button key={id} className="breeding-dex-link" onClick={()=>onOpenDex(id)}>查看{name(id)}图鉴 →</button>)}
  </div>;
 }

 return <section className="management-panel breeding-management" aria-label="精灵繁殖面板">
  <div className="management-panel-heading"><strong>精灵繁殖</strong><span>{BREEDING_RECIPES.length} 组指定配对 · 双亲保留</span></div>
  <div className="fusion-panel breeding-panel">
   <aside className="fusion-recipe-index"><div className="fusion-index-heading"><strong>选择配对</strong><span>{BREEDING_RECIPES.filter(ready).length} 组已准备</span></div>
    <div className="fusion-recipe-scroll">{BREEDING_RECIPES.map(entry=><button key={entry.id} className={recipeId===entry.id?'active':''} aria-pressed={recipeId===entry.id} onClick={()=>setRecipeId(entry.id)}>
     <div className="fusion-recipe-art"><CreatureArt species={entry.offspringSpecies} name={entry.name}/></div><span><strong>{entry.name}</strong><small>{entry.maleSpecies.map(name).join(' / ')} + {entry.femaleSpecies.map(name).join(' / ')}</small></span><b className={ready(entry)?'ready':''}>{ready(entry)?'可繁殖':'准备双亲'}</b>
    </button>)}</div>
   </aside>
   <div className="fusion-detail-scroll">{recipe&&<>
    <div className="fusion-heading"><div><small>指定配对</small><h3>{recipe.name}</h3></div><span>免费繁殖 · 随机后代 · 立即孵化</span></div>
    <p className="fusion-rules">双亲均达到 50 级，雄性须为直接获得的第一代。繁殖后保留双亲，幼体随机加入背包或仓库，免费且无需等待。</p>
    {[...recipe.maleSpecies,...recipe.femaleSpecies].some(id=>getSpeciesAcquisition(id).status!=='available')&&<p className="fusion-route-note">这组双亲的正常获取路线尚未补齐。可查看图鉴了解初始形态与进化条件。</p>}
    <div className="fusion-parent-grid">{parentPicker('male',maleChoices,male)}<span className="fusion-plus" aria-hidden="true">＋</span>{parentPicker('female',femaleChoices,female)}</div>
    <div className="fusion-outcome-heading"><strong>后代与概率</strong><span>每次随机获得一只 Lv.1 幼体</span></div>
    <div className="fusion-outcomes">{recipe.outcomes.map(outcome=><article key={outcome.species} className={outcome.species===recipe.offspringSpecies?'rare':''}>
     <div className="fusion-outcome-art"><CreatureArt species={outcome.species} name={name(outcome.species)}/></div><div><strong>{name(outcome.species)}</strong><small>{outcome.species===recipe.offspringSpecies?'新的繁殖精灵':outcome.species===recipe.maleInitialSpecies?'父方幼体':'母方幼体'} · #{outcome.species}</small></div><b>{outcome.weight}%</b>
    </article>)}</div>
    <p className="fusion-hatch-note">幼体使用随机性格与个体值，不保证继承双亲的数值。繁殖所得雄性不能再次作为雄性亲本。</p>
    <div className="fusion-confirm"><span>{activeBattle?'战斗中无法繁殖':valid?'双亲符合配对条件':'请选择符合条件的两只精灵'}</span><button className="primary" disabled={!valid||activeBattle} onClick={breed}>繁殖并孵化</button></div>
    {feedback&&<p className="fusion-feedback" role="status">{feedback}</p>}
    {offspring&&<div className="fusion-obtained"><div className="fusion-outcome-art"><CreatureArt species={offspring.appearanceSpecies??offspring.species} name={offspring.name}/></div><div><small>孵化成功</small><strong>{offspring.name} · Lv.{offspring.level}</strong><span>已加入{offspring.inParty?'背包':'仓库'} · 双亲保留</span></div><button onClick={()=>onOpenMonsters(offspring.uid)}>查看幼体 →</button></div>}
   </>}</div>
  </div>
 </section>;
}
