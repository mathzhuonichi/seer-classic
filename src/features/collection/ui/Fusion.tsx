import {useMemo,useState} from 'react';
import type { GameController, GameSnapshot } from '../../../kernel/contract.ts';
import type { MonsterView } from '../../../shared/views.ts';
import {FUSION_RECIPES,type FusionRecipe} from '../../../domain/recipes/fusion.ts';
import {speciesNamer,type SpeciesName} from '../../../shared/creature-art.ts';
import {
  FUSION_PARENT_POLICY_TEXT,fusedBead,fusionChance,itemCounts,fusionParentChoices,fusionPairValid,fusionRecipeRows,matchesFusionSearch,type FusionRecipeRow,
} from '../fusion-view.ts';
import {battleActive} from '../../../shared/view-helpers.ts';
import {CreatureArt} from '../../../shared/ui/CreatureArt.tsx';
import {ConfirmBar,OutcomeCard,ParentCard,ParentPair,RecipeButton,RecipeHeading,useRecipeWorkbench} from './RecipeWorkbench.tsx';
import './fusion.css';

interface FusionResult {feedback:string;obtained:{species:number;name:string}|null}
type Role='primary'|'secondary';

export default function Fusion({s,c,initialRecipeId,onOpenBeads}:{s:GameSnapshot;c:GameController;initialRecipeId?:string;onOpenBeads:()=>void}) {
  const {recipe,setRecipeId,first:primaryUid,setFirst:setPrimaryUid,second:secondaryUid,setSecond:setSecondaryUid,result,setResult}
    =useRecipeWorkbench<FusionRecipe,FusionResult>(FUSION_RECIPES,initialRecipeId);
  const name=speciesNamer(s.species),activeBattle=battleActive(s);
  const rows=useMemo(()=>fusionRecipeRows(s.monsters),[s.monsters]);
  const current=rows.find(row=>row.recipe===recipe);
  const choices=recipe?fusionParentChoices(recipe,s.monsters,primaryUid):{primary:[],secondary:[]};
  const primary=choices.primary.find(mon=>mon.uid===primaryUid),secondary=choices.secondary.find(mon=>mon.uid===secondaryUid);
  const valid=!!recipe&&fusionPairValid(recipe,primary,secondary);

  function fuse() {
    if(!recipe||!primary||!secondary||!valid||activeBattle)return;
    const before=itemCounts(c.snapshot().items);
    c.dispatch({type:'fuse',recipeId:recipe.id,primaryUid:primary.uid,secondaryUid:secondary.uid});
    const next=c.snapshot(),bead=fusedBead(recipe,before,next.items);
    const feedback=next.notices[0]??(bead?`融合成功，获得${bead.beadName}。`:'融合未完成，请检查精灵选择。');
    setResult({obtained:bead?{species:bead.species,name:bead.name}:null,feedback});
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
      <p className="fusion-rules">选择两只不同的已有精灵，立即获得 1 个元神珠。{FUSION_PARENT_POLICY_TEXT}</p>
      {current&&!current.collectible&&!current.ready&&<p className="fusion-route-note">部分双亲的获取入口待补齐；已拥有符合配方的精灵仍可融合。</p>}
      {activeBattle&&<p className="fusion-battle-note" role="status">战斗结束后可进行精灵融合。</p>}
      <ParentPair first={parent(recipe,'primary',primary)} second={parent(recipe,'secondary',secondary)}/>
      <div className="fusion-outcome-heading"><strong>元神珠孵化结果</strong><span>每次独立抽取 · 本作概率</span></div>
      <div className="fusion-outcomes">{recipe.outcomes.map(outcome=><OutcomeCard key={outcome.species} species={outcome.species}
        name={name(outcome.species)} highlight={!!outcome.rare} detail={outcome.beadName??recipe.beadName}
        note={outcome.rare?'稀有结果':undefined} chance={fusionChance(recipe,outcome)}/>)}</div>
      <p className="fusion-hatch-note">元神珠放入道具背包，与精元共用分子转化器，可立即孵化。</p>
      <ConfirmBar status={status} action="确认融合" disabled={!valid||activeBattle} onConfirm={fuse} feedback={result?.feedback}/>
      {result?.obtained&&<div className="fusion-obtained"><span className="fusion-bead-symbol" aria-hidden="true">◉</span>
        <div><small>融合成功</small><strong>{result.obtained.name} × 1</strong><span>可孵化为{name(result.obtained.species)}</span></div>
        <button className="primary" onClick={onOpenBeads}>前往孵化</button></div>}
    </>:<div className="management-empty">暂无融合配方。</div>}</div>
  </div>;
}

interface FusionIndexProps {rows:FusionRecipeRow[];activeId?:string;name:SpeciesName;onSelect:(id:string)=>void;onOpenBeads:()=>void}
function FusionIndex({rows,activeId,name,onSelect,onOpenBeads}:FusionIndexProps) {
  const [search,setSearch]=useState(''),[onlyReady,setOnlyReady]=useState(false);
  const shown=rows.filter(row=>(!onlyReady||row.ready)&&matchesFusionSearch(row.recipe,search,name));
  const pair=(recipe:FusionRecipe)=>`${name(recipe.primary[0])} + ${name(recipe.secondary[0])}`;
  return <aside className="fusion-recipe-index">
    <div className="fusion-index-heading"><strong>融合配方</strong><span>{shown.length} / {rows.length}</span></div>
    <div className="management-filter"><input aria-label="搜索融合配方" placeholder="精灵 / 配方 / 元神珠" value={search} onChange={e=>setSearch(e.target.value)}/></div>
    <button className={`fusion-ready-filter ${onlyReady?'active':''}`} aria-pressed={onlyReady} onClick={()=>setOnlyReady(value=>!value)}>
      {onlyReady?'✓ ':''}只看可融合配方
    </button>
    <div className="fusion-recipe-scroll">
      {shown.map(({recipe,ready,collectible})=><RecipeButton key={recipe.id} active={recipe.id===activeId} title={pair(recipe)}
        art={{species:recipe.outcomes[0].species,name:name(recipe.outcomes[0].species)}} name={recipe.name}
        detail={recipe.outcomes.length>1?pair(recipe):recipe.beadName} status={ready?'可融合':collectible?'待收集':'路线待补'}
        statusClass={ready?'ready':collectible?'':'blocked'} onClick={()=>onSelect(recipe.id)}/>)}
      {!shown.length&&<div className="management-empty">没有匹配的融合配方。</div>}
    </div>
    <button className="fusion-bag-link" onClick={onOpenBeads}>查看我的元神珠</button>
  </aside>;
}

interface FusionParentProps {role:Role;recipe:FusionRecipe;monster?:MonsterView;choices:MonsterView[];name:SpeciesName;disabled:boolean;onChoose:(uid:string)=>void}
function FusionParent({role,recipe,monster,choices,name,disabled,onChoose}:FusionParentProps) {
  const isPrimary=role==='primary',label=isPrimary?'主精灵':'副精灵';
  const allowed=isPrimary?recipe.primary:recipe.secondary,minLevel=isPrimary?recipe.minPrimaryLevel:recipe.minSecondaryLevel;
  const option=(mon:MonsterView)=>({value:mon.uid,disabled:mon.level<minLevel,
    label:`${mon.inParty?'背包':'仓库'} · ${mon.name} · Lv.${mon.level}${mon.level<minLevel?'（等级不足）':''}`});
  return <ParentCard id={`fusion-${role}`} label={label} heading={<><strong>{label}</strong><small>背包 / 仓库</small></>}
    art={monster?<CreatureArt species={monster.appearanceSpecies??monster.species} name={monster.name}/>:<span aria-hidden="true">◎</span>}
    value={monster?.uid??''} disabled={disabled} onChange={onChoose} placeholder={choices.length?'选择已有精灵':'暂无符合配方的精灵'}
    options={choices.map(option)} requirement={`${allowed.map(name).join(' / ')}${minLevel>1?` · Lv.${minLevel} 以上`:''}`}>
    {monster&&<small className="fusion-parent-location">{monster.inParty?'来自出战背包':'来自精灵仓库'} · Lv.{monster.level}</small>}
  </ParentCard>;
}
