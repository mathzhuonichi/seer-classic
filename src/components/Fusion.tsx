import {useEffect,useState} from 'react';
import type {GameController,GameSnapshot,MonsterView} from '../game-types';
import {FUSION_PARENT_POLICY,FUSION_RECIPES,canFuseParents,fusionBeadItemId} from '../progression/fusion';
import {getSpeciesAcquisition} from '../progression/acquisition';
import {CreatureArt} from './CreatureArt';
import '../fusion.css';

const parentPolicyText={retain:'主、副精灵均保留。','consume-secondary':'保留主精灵，消耗副精灵。','consume-both':'消耗主精灵和副精灵。'};
const percent=(weight:number,total:number)=>`${Number((weight/total*100).toFixed(2))}%`;

export default function Fusion({s,c,initialRecipeId,onOpenBeads}:{s:GameSnapshot;c:GameController;initialRecipeId?:string;onOpenBeads:()=>void}) {
  const [recipeId,setRecipeId]=useState(initialRecipeId??FUSION_RECIPES[0]?.id??'');
  const [search,setSearch]=useState(''),[onlyReady,setOnlyReady]=useState(false);
  const [primaryUid,setPrimaryUid]=useState(''),[secondaryUid,setSecondaryUid]=useState('');
  const [feedback,setFeedback]=useState('');
  const [obtained,setObtained]=useState<{species:number;name:string}|null>(null);
  const recipe=FUSION_RECIPES.find(r=>r.id===recipeId)??FUSION_RECIPES[0];
  const activeBattle=!!s.battle&&!s.battle.finished;
  const speciesName=(id:number)=>s.species.find(sp=>sp.id===id)?.name??`精灵 ${id}`;
  const ready=(r:typeof FUSION_RECIPES[number])=>s.monsters.some(a=>r.primary.includes(a.species)&&s.monsters.some(b=>a.uid!==b.uid&&canFuseParents(r,a,b)));
  const routesAvailable=(r:typeof FUSION_RECIPES[number])=>r.primary.some(id=>getSpeciesAcquisition(id).status==='available')&&r.secondary.some(id=>getSpeciesAcquisition(id).status==='available');
  const parentPair=(r:typeof FUSION_RECIPES[number])=>`${speciesName(r.primary[0])} + ${speciesName(r.secondary[0])}`;
  const recipes=FUSION_RECIPES.filter(r=>(!onlyReady||ready(r))&&(!search||[r.name,r.beadName,...r.primary.map(speciesName),...r.secondary.map(speciesName),...r.outcomes.map(o=>speciesName(o.species))].some(name=>name.includes(search))));
  const primaryChoices=recipe?s.monsters.filter(m=>recipe.primary.includes(m.species)):[];
  const secondaryChoices=recipe?s.monsters.filter(m=>recipe.secondary.includes(m.species)&&m.uid!==primaryUid):[];
  const primary=primaryChoices.find(m=>m.uid===primaryUid);
  const secondary=secondaryChoices.find(m=>m.uid===secondaryUid);
  const valid=!!recipe&&!!primary&&!!secondary&&primary.uid!==secondary.uid&&canFuseParents(recipe,primary,secondary);
  const total=recipe?.outcomes.reduce((sum,o)=>sum+o.weight,0)??100;
  useEffect(()=>{if(initialRecipeId&&FUSION_RECIPES.some(r=>r.id===initialRecipeId))setRecipeId(initialRecipeId)},[initialRecipeId]);
  useEffect(()=>{setPrimaryUid('');setSecondaryUid('');setFeedback('');setObtained(null)},[recipe?.id]);

  function fuse() {
    if(!recipe||!primary||!secondary||!valid||activeBattle)return;
    const before=new Map(c.snapshot().items.map(item=>[item.id,item.count]));
    c.dispatch({type:'fuse',recipeId:recipe.id,primaryUid:primary.uid,secondaryUid:secondary.uid});
    const next=c.snapshot();
    const outcome=recipe.outcomes.find(o=>(next.items.find(item=>item.id===fusionBeadItemId(o.species))?.count??0)>(before.get(fusionBeadItemId(o.species))??0));
    if(outcome){
      const bead=next.items.find(item=>item.id===fusionBeadItemId(outcome.species));
      setObtained({species:outcome.species,name:bead?.name??outcome.beadName});
      setFeedback(next.notices[0]??`融合成功，获得${outcome.beadName}。`);
    }else {setObtained(null);setFeedback(next.notices[0]??'融合未完成，请检查精灵选择。')}
  }

  function parentPicker(role:'primary'|'secondary',monster:MonsterView|undefined,choices:MonsterView[]) {
    if(!recipe)return null;
    const isPrimary=role==='primary',label=isPrimary?'主精灵':'副精灵';
    const allowed=isPrimary?recipe.primary:recipe.secondary,minLevel=isPrimary?recipe.minPrimaryLevel:recipe.minSecondaryLevel;
    return <div className="fusion-parent-card">
      <label htmlFor={`fusion-${role}`}><strong>{label}</strong><small>背包 / 仓库</small></label>
      <div className="fusion-parent-art">{monster?<CreatureArt species={monster.species} name={monster.name}/>:<span aria-hidden="true">◎</span>}</div>
      <select id={`fusion-${role}`} aria-label={`选择${label}`} disabled={activeBattle} value={monster?.uid??''} onChange={e=>{if(isPrimary){setPrimaryUid(e.target.value);if(e.target.value===secondaryUid)setSecondaryUid('')}else setSecondaryUid(e.target.value);setFeedback('');setObtained(null)}}>
        <option value="">{choices.length?'选择已有精灵':'暂无符合配方的精灵'}</option>
        {choices.map(m=><option key={m.uid} value={m.uid} disabled={m.level<minLevel}>{m.inParty?'背包':'仓库'} · {m.name} · Lv.{m.level}{m.level<minLevel?'（等级不足）':''}</option>)}
      </select>
      <p className="fusion-parent-requirement">{allowed.map(speciesName).join(' / ')}{minLevel>1?` · Lv.${minLevel} 以上`:''}</p>
      {monster&&<small className="fusion-parent-location">{monster.inParty?'来自出战背包':'来自精灵仓库'} · Lv.{monster.level}</small>}
    </div>;
  }

  return <div className="fusion-panel">
    <aside className="fusion-recipe-index">
      <div className="fusion-index-heading"><strong>融合配方</strong><span>{recipes.length} / {FUSION_RECIPES.length}</span></div>
      <div className="management-filter"><input aria-label="搜索融合配方" placeholder="精灵 / 配方 / 元神珠" value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <button className={`fusion-ready-filter ${onlyReady?'active':''}`} aria-pressed={onlyReady} onClick={()=>setOnlyReady(value=>!value)}>{onlyReady?'✓ ':''}只看可融合配方</button>
      <div className="fusion-recipe-scroll">{recipes.map(r=>{
        const owned=ready(r),collectible=routesAvailable(r);
        return <button key={r.id} className={r.id===recipe?.id?'active':''} aria-pressed={r.id===recipe?.id} title={parentPair(r)} onClick={()=>setRecipeId(r.id)}><div className="fusion-recipe-art"><CreatureArt species={r.outcomes[0].species} name={speciesName(r.outcomes[0].species)}/></div><span><strong>{r.name}</strong><small>{r.outcomes.length>1?parentPair(r):r.beadName}</small></span><b className={owned?'ready':collectible?'':'blocked'}>{owned?'可融合':collectible?'待收集':'路线待补'}</b></button>;
      })}{!recipes.length&&<div className="management-empty">没有匹配的融合配方。</div>}</div>
      <button className="fusion-bag-link" onClick={onOpenBeads}>查看我的元神珠</button>
    </aside>
    <div className="fusion-detail-scroll">{recipe?<>
      <div className="fusion-heading"><div><small>精灵融合实验室</small><h3>{recipe.name}</h3></div><span>无需矿石 · 无需赛尔豆</span></div>
      <p className="fusion-rules">选择两只不同的已有精灵，立即获得 1 个元神珠。{parentPolicyText[FUSION_PARENT_POLICY]}</p>
      {!routesAvailable(recipe)&&!ready(recipe)&&<p className="fusion-route-note">部分双亲的获取入口待补齐；已拥有符合配方的精灵仍可融合。</p>}
      {activeBattle&&<p className="fusion-battle-note" role="status">战斗结束后可进行精灵融合。</p>}
      <div className="fusion-parent-grid">{parentPicker('primary',primary,primaryChoices)}<span className="fusion-plus" aria-hidden="true">＋</span>{parentPicker('secondary',secondary,secondaryChoices)}</div>
      <div className="fusion-outcome-heading"><strong>元神珠孵化结果</strong><span>每次独立抽取 · 本作概率</span></div>
      <div className="fusion-outcomes">{recipe.outcomes.map(outcome=><article key={outcome.species} className={outcome.rare?'rare':''}><div className="fusion-outcome-art"><CreatureArt species={outcome.species} name={speciesName(outcome.species)}/></div><div><strong>{speciesName(outcome.species)}</strong><small>{outcome.beadName??recipe.beadName}</small>{outcome.rare&&<em>稀有结果</em>}</div><b>{percent(outcome.weight,total)}</b></article>)}</div>
      <p className="fusion-hatch-note">元神珠放入道具背包，与精元共用分子转化器，可立即孵化。</p>
      <div className="fusion-confirm"><span>{activeBattle?'战斗中无法融合':valid?'配方匹配，可以开始融合':'请选择符合配方的主精灵和副精灵'}</span><button className="primary" disabled={!valid||activeBattle} onClick={fuse}>确认融合</button></div>
      {feedback&&<p className="fusion-feedback" role="status">{feedback}</p>}
      {obtained&&<div className="fusion-obtained"><span className="fusion-bead-symbol" aria-hidden="true">◉</span><div><small>融合成功</small><strong>{obtained.name} × 1</strong><span>可孵化为{speciesName(obtained.species)}</span></div><button className="primary" onClick={onOpenBeads}>前往孵化</button></div>}
    </>:<div className="management-empty">暂无融合配方。</div>}</div>
  </div>;
}
