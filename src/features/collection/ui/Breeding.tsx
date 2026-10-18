import type { GameController } from '../../../kernel/contract.ts';
import type { MonsterView } from '../../../shared/views.ts';
import type {BreedingRecipe} from '../../../domain/recipes/breeding.ts';
import type {BreedingRecipeRow} from '../view.ts';
import {battleActive} from '../../../shared/view-helpers.ts';
import {appearanceOf,speciesNamer,type SpeciesName} from '../../../shared/monster-views.ts';
import {CreatureArt} from '../../../shared/ui/CreatureArt.tsx';
import {useGame} from '../../../shared/ui/use-game.ts';
import {ConfirmBar,OutcomeCard,ParentCard,ParentPair,RecipeButton,RecipeHeading,useRecipeWorkbench} from './RecipeWorkbench.tsx';
import './fusion.css';
import './Breeding.css';

interface BreedingResult {feedback?:string;offspringUid?:string}
interface BreedingProps {c:GameController;initialRecipeId?:string;onOpenDex:(species:number)=>void;onOpenMonsters:(uid:string)=>void}

/** Whether an offspring is the pairing's own breeding form or the father's or mother's infant. */
const outcomeLabel=(recipe:BreedingRecipe,species:number)=>
 species===recipe.offspringSpecies?'新的繁殖精灵':species===recipe.maleInitialSpecies?'父方幼体':'母方幼体';

export default function Breeding({c,initialRecipeId,onOpenDex,onOpenMonsters}:BreedingProps){
 const rows=useGame(c,s=>s.breeding.recipes),species=useGame(c,s=>s.species),monsters=useGame(c,s=>s.monsters),activeBattle=useGame(c,battleActive);
 const {row,setRecipeId,first:maleUid,setFirst:setMaleUid,second:femaleUid,setSecond:setFemaleUid,valid,result,setResult}
  =useRecipeWorkbench<BreedingRecipeRow,BreedingResult>(rows,initialRecipeId);
 const name=speciesNamer(species),recipe=row?.recipe;
 const choices={male:monsters.filter(mon=>recipe?.maleSpecies.includes(mon.species)),female:monsters.filter(mon=>recipe?.femaleSpecies.includes(mon.species))};
 const male=choices.male.find(mon=>mon.uid===maleUid),female=choices.female.find(mon=>mon.uid===femaleUid);
 const offspring=monsters.find(mon=>mon.uid===result?.offspringUid);

 function breed(){
  if(!recipe||!valid||activeBattle)return;
  const done=c.dispatch({type:'breed',recipeId:recipe.id,firstUid:maleUid,secondUid:femaleUid});
  setResult({feedback:done.notice,offspringUid:done.ok?done.created?.uid:undefined});
 }
 const parent=(recipe:BreedingRecipe,role:'male'|'female',selected:MonsterView|undefined,value:string,onChoose:(uid:string)=>void)=><BreedingParent
  role={role} recipe={recipe} selected={selected} value={value} choices={choices[role]} name={name} disabled={activeBattle} onChoose={onChoose}
  onOpenDex={onOpenDex}/>;
 const status=activeBattle?'战斗中无法繁殖':valid?'双亲符合配对条件':'请选择符合条件的两只精灵';

 return <section className="management-panel breeding-management" aria-label="精灵繁殖面板">
  <div className="management-panel-heading"><strong>精灵繁殖</strong><span>{rows.length} 组指定配对 · 双亲保留</span></div>
  <div className="fusion-panel breeding-panel">
   <BreedingIndex rows={rows} activeId={recipe?.id} name={name} onSelect={setRecipeId}/>
   <div className="fusion-detail-scroll">{recipe&&<>
    <RecipeHeading kicker="指定配对" name={recipe.name} note="免费繁殖 · 随机后代 · 立即孵化"/>
    <p className="fusion-rules">双亲均达到 {recipe.minLevel} 级，雄性须为直接获得的第一代。繁殖后保留双亲，幼体随机加入背包或仓库，免费且无需等待。</p>
    {row?.routesMissing&&<p className="fusion-route-note">这组双亲的正常获取路线尚未补齐。可查看图鉴了解初始形态与进化条件。</p>}
    <ParentPair first={parent(recipe,'male',male,maleUid,setMaleUid)} second={parent(recipe,'female',female,femaleUid,setFemaleUid)}/>
    <div className="fusion-outcome-heading"><strong>后代与概率</strong><span>每次随机获得一只 Lv.1 幼体</span></div>
    <div className="fusion-outcomes">{recipe.outcomes.map(outcome=><OutcomeCard key={outcome.species} species={outcome.species}
     name={name(outcome.species)} highlight={outcome.species===recipe.offspringSpecies}
     detail={`${outcomeLabel(recipe,outcome.species)} · #${outcome.species}`} chance={`${outcome.weight}%`}/>)}</div>
    <p className="fusion-hatch-note">幼体使用随机性格与个体值，不保证继承双亲的数值。繁殖所得雄性不能再次作为雄性亲本。</p>
    <ConfirmBar status={status} action="繁殖并孵化" disabled={!valid||activeBattle} onConfirm={breed} feedback={result?.feedback}/>
    {offspring&&<div className="fusion-obtained">
     <div className="fusion-outcome-art"><CreatureArt species={appearanceOf(offspring)} name={offspring.name}/></div>
     <div><small>孵化成功</small><strong>{offspring.name} · Lv.{offspring.level}</strong><span>已加入{offspring.inParty?'背包':'仓库'} · 双亲保留</span></div>
     <button onClick={()=>onOpenMonsters(offspring.uid)}>查看幼体 →</button>
    </div>}
   </>}</div>
  </div>
 </section>;
}

function BreedingIndex({rows,activeId,name,onSelect}:{rows:BreedingRecipeRow[];activeId?:string;name:SpeciesName;onSelect:(id:string)=>void}){
 return <aside className="fusion-recipe-index">
  <div className="fusion-index-heading"><strong>选择配对</strong><span>{rows.filter(row=>row.pairs.length).length} 组已准备</span></div>
  <div className="fusion-recipe-scroll">{rows.map(({recipe,pairs})=><RecipeButton key={recipe.id} active={recipe.id===activeId}
   art={{species:recipe.offspringSpecies,name:recipe.name}} name={recipe.name}
   detail={`${recipe.maleSpecies.map(name).join(' / ')} + ${recipe.femaleSpecies.map(name).join(' / ')}`}
   status={pairs.length?'可繁殖':'准备双亲'} statusClass={pairs.length?'ready':''} onClick={()=>onSelect(recipe.id)}/>)}</div>
 </aside>;
}

interface BreedingParentProps {
 role:'male'|'female';recipe:BreedingRecipe;selected?:MonsterView;value:string;choices:MonsterView[];name:SpeciesName;
 disabled:boolean;onChoose:(uid:string)=>void;onOpenDex:(species:number)=>void;
}
function BreedingParent({role,recipe,selected,value,choices,name,disabled,onChoose,onOpenDex}:BreedingParentProps){
 const isMale=role==='male',label=isMale?'雄性亲本':'雌性亲本',allowed=isMale?recipe.maleSpecies:recipe.femaleSpecies;
 const option=(mon:MonsterView)=>({value:mon.uid,
  label:`${mon.name} · Lv.${mon.level} · ${mon.inParty?'背包':'仓库'}${isMale&&mon.generation?' · 繁殖后代，不能作为雄性亲本':''}`});
 return <ParentCard id={`breeding-${role}`} label={label} heading={<>{label}<small> · Lv.{recipe.minLevel} 以上</small></>}
  art={<CreatureArt species={selected?appearanceOf(selected):allowed[0]} name={selected?.name??name(allowed[0])}/>}
  value={value} disabled={disabled} onChange={onChoose} placeholder={choices.length?'请选择精灵':'尚未持有指定精灵'}
  options={choices.map(option)} requirement={`指定形态：${allowed.map(name).join(' / ')}${isMale?'，需直接获得的第一代雄性。':'。'}`}>
  {selected&&selected.level<recipe.minLevel&&<p className="breeding-parent-warning">还需培养到 {recipe.minLevel} 级。</p>}
  {allowed.map(id=><button key={id} className="breeding-dex-link" onClick={()=>onOpenDex(id)}>查看{name(id)}图鉴 →</button>)}
 </ParentCard>;
}
