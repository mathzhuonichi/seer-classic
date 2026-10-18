import {useState} from 'react';
import type { GameController } from '../../../kernel/contract.ts';
import type { MonsterView } from '../../../shared/views.ts';
import {fusionBeadItemId,type FusionOutcome,type FusionRecipe} from '../../../domain/recipes/fusion.ts';
import type {FusionRecipeRow} from '../view.ts';
import {battleActive} from '../../../shared/view-helpers.ts';
import {appearanceOf,speciesNamer,type SpeciesName} from '../../../shared/monster-views.ts';
import {CreatureArt} from '../../../shared/ui/CreatureArt.tsx';
import {useGame} from '../../../shared/ui/use-game.ts';
import {ConfirmBar,OutcomeCard,ParentCard,ParentPair,RecipeButton,RecipeHeading,useRecipeWorkbench} from './RecipeWorkbench.tsx';
import './fusion.css';

interface FusionResult {feedback?:string;bead?:FusionOutcome}
type Role='primary'|'secondary';

/** Search over the recipe, bead, parent and outcome names. */
const matchesSearch=(recipe:FusionRecipe,search:string,name:SpeciesName)=>!search||[recipe.name,recipe.beadName,...recipe.primary.map(name),
  ...recipe.secondary.map(name),...recipe.outcomes.map(outcome=>name(outcome.species))].some(text=>text.includes(search));

/** An outcome's share of the recipe weight, as a percent with at most two decimals. */
function chance(recipe:FusionRecipe,outcome:FusionOutcome):string {
  const total=recipe.outcomes.reduce((sum,entry)=>sum+entry.weight,0);
  return `${Number((outcome.weight/total*100).toFixed(2))}%`;
}

export default function Fusion({c,initialRecipeId,onOpenBeads}:{c:GameController;initialRecipeId?:string;onOpenBeads:(itemId?:string)=>void}) {
  const rows=useGame(c,s=>s.fusion.recipes),species=useGame(c,s=>s.species),monsters=useGame(c,s=>s.monsters),activeBattle=useGame(c,battleActive);
  const {row,setRecipeId,first:primaryUid,setFirst:setPrimaryUid,second:secondaryUid,setSecond:setSecondaryUid,valid,result,setResult}
    =useRecipeWorkbench<FusionRecipeRow,FusionResult>(rows,initialRecipeId);
  const name=speciesNamer(species),recipe=row?.recipe;
  const choices={primary:monsters.filter(mon=>recipe?.primary.includes(mon.species)),
    secondary:monsters.filter(mon=>recipe?.secondary.includes(mon.species)&&mon.uid!==primaryUid)};
  const primary=choices.primary.find(mon=>mon.uid===primaryUid),secondary=choices.secondary.find(mon=>mon.uid===secondaryUid);

  function fuse() {
    if(!recipe||!valid||activeBattle)return;
    const done=c.dispatch({type:'fuse',recipeId:recipe.id,primaryUid,secondaryUid}),itemId=done.ok?done.created?.itemId:undefined;
    setResult({feedback:done.notice,bead:recipe.outcomes.find(outcome=>fusionBeadItemId(outcome.species)===itemId)});
  }
  function choose(role:Role,uid:string) {
    if(role==='primary'){setPrimaryUid(uid);if(uid===secondaryUid)setSecondaryUid('')}else setSecondaryUid(uid);
    setResult(null);
  }
  const parent=(recipe:FusionRecipe,role:Role,monster:MonsterView|undefined)=><FusionParent role={role} recipe={recipe} monster={monster}
    choices={choices[role]} name={name} disabled={activeBattle} onChoose={uid=>choose(role,uid)}/>;
  const status=activeBattle?'战斗中无法融合':valid?'配方匹配，可以开始融合':'请选择符合配方的主精灵和副精灵';

  return <div className="fusion-panel">
    <FusionIndex rows={rows} activeId={recipe?.id} name={name} onSelect={setRecipeId} onOpenBeads={onOpenBeads}/>
    <div className="fusion-detail-scroll">{recipe?<>
      <RecipeHeading kicker="精灵融合实验室" name={recipe.name} note="无需矿石 · 无需赛尔豆"/>
      <p className="fusion-rules">选择两只不同的已有精灵，立即获得 1 个元神珠。主、副精灵均保留。</p>
      {row&&!row.collectible&&!row.pairs.length&&<p className="fusion-route-note">部分双亲的获取入口待补齐；已拥有符合配方的精灵仍可融合。</p>}
      {activeBattle&&<p className="fusion-battle-note" role="status">战斗结束后可进行精灵融合。</p>}
      <ParentPair first={parent(recipe,'primary',primary)} second={parent(recipe,'secondary',secondary)}/>
      <div className="fusion-outcome-heading"><strong>元神珠孵化结果</strong><span>每次独立抽取 · 本作概率</span></div>
      <div className="fusion-outcomes">{recipe.outcomes.map(outcome=><OutcomeCard key={outcome.species} species={outcome.species}
        name={name(outcome.species)} highlight={!!outcome.rare} detail={outcome.beadName}
        note={outcome.rare?'稀有结果':undefined} chance={chance(recipe,outcome)}/>)}</div>
      <p className="fusion-hatch-note">元神珠放入道具背包，与精元共用分子转化器，可立即孵化。</p>
      <ConfirmBar status={status} action="确认融合" disabled={!valid||activeBattle} onConfirm={fuse} feedback={result?.feedback}/>
      {result?.bead&&<div className="fusion-obtained"><span className="fusion-bead-symbol" aria-hidden="true">◉</span>
        <div><small>融合成功</small><strong>{result.bead.beadName} × 1</strong><span>可孵化为{name(result.bead.species)}</span></div>
        <button className="primary" onClick={()=>onOpenBeads(fusionBeadItemId(result.bead!.species))}>前往孵化</button></div>}
    </>:<div className="management-empty">暂无融合配方。</div>}</div>
  </div>;
}

interface FusionIndexProps {rows:FusionRecipeRow[];activeId?:string;name:SpeciesName;onSelect:(id:string)=>void;onOpenBeads:()=>void}
function FusionIndex({rows,activeId,name,onSelect,onOpenBeads}:FusionIndexProps) {
  const [search,setSearch]=useState(''),[onlyReady,setOnlyReady]=useState(false);
  const shown=rows.filter(row=>(!onlyReady||row.pairs.length)&&matchesSearch(row.recipe,search,name));
  const pair=(recipe:FusionRecipe)=>`${name(recipe.primary[0])} + ${name(recipe.secondary[0])}`;
  return <aside className="fusion-recipe-index">
    <div className="fusion-index-heading"><strong>融合配方</strong><span>{shown.length} / {rows.length}</span></div>
    <div className="management-filter"><input aria-label="搜索融合配方" placeholder="精灵 / 配方 / 元神珠" value={search} onChange={e=>setSearch(e.target.value)}/></div>
    <button className={`fusion-ready-filter ${onlyReady?'active':''}`} aria-pressed={onlyReady} onClick={()=>setOnlyReady(value=>!value)}>
      {onlyReady?'✓ ':''}只看可融合配方
    </button>
    <div className="fusion-recipe-scroll">
      {shown.map(({recipe,pairs,collectible})=><RecipeButton key={recipe.id} active={recipe.id===activeId} title={pair(recipe)}
        art={{species:recipe.outcomes[0].species,name:name(recipe.outcomes[0].species)}} name={recipe.name}
        detail={recipe.outcomes.length>1?pair(recipe):recipe.beadName} status={pairs.length?'可融合':collectible?'待收集':'路线待补'}
        statusClass={pairs.length?'ready':collectible?'':'blocked'} onClick={()=>onSelect(recipe.id)}/>)}
      {!shown.length&&<div className="management-empty">没有匹配的融合配方。</div>}
    </div>
    <button className="fusion-bag-link" onClick={()=>onOpenBeads()}>查看我的元神珠</button>
  </aside>;
}

interface FusionParentProps {
  role:Role;recipe:FusionRecipe;monster?:MonsterView;choices:MonsterView[];name:SpeciesName;disabled:boolean;onChoose:(uid:string)=>void;
}
function FusionParent({role,recipe,monster,choices,name,disabled,onChoose}:FusionParentProps) {
  const isPrimary=role==='primary',label=isPrimary?'主精灵':'副精灵';
  const allowed=isPrimary?recipe.primary:recipe.secondary,minLevel=isPrimary?recipe.minPrimaryLevel:recipe.minSecondaryLevel;
  const option=(mon:MonsterView)=>({value:mon.uid,label:`${mon.inParty?'背包':'仓库'} · ${mon.name} · Lv.${mon.level}`});
  return <ParentCard id={`fusion-${role}`} label={label} heading={<><strong>{label}</strong><small>背包 / 仓库</small></>}
    art={monster?<CreatureArt species={appearanceOf(monster)} name={monster.name}/>:<span aria-hidden="true">◎</span>}
    value={monster?.uid??''} disabled={disabled} onChange={onChoose} placeholder={choices.length?'选择已有精灵':'暂无符合配方的精灵'}
    options={choices.map(option)} requirement={`${allowed.map(name).join(' / ')}${minLevel>1?` · Lv.${minLevel} 以上`:''}`}>
    {monster&&<small className="fusion-parent-location">{monster.inParty?'来自出战背包':'来自精灵仓库'} · Lv.{monster.level}</small>}
  </ParentCard>;
}
