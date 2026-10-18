import {useMemo} from 'react';
import type {GameController,GameSnapshot,MonsterView} from '../game-types.ts';
import {BREEDING_RECIPES,type BreedingRecipe} from '../progression/breeding.ts';
import {
  breedingOutcomeLabel,breedingPairValid,breedingParentChoices,breedingRecipeRows,breedingRoutesMissing,isBredOffspring,type BreedingRecipeRow,
} from '../presentation/breeding-view.ts';
import {speciesNamer,type SpeciesName} from '../presentation/creature-art.ts';
import {battleActive} from '../presentation/view-helpers.ts';
import {CreatureArt} from './CreatureArt.tsx';
import {ConfirmBar,OutcomeCard,ParentCard,ParentPair,RecipeButton,RecipeHeading,useRecipeWorkbench} from './RecipeWorkbench.tsx';
import '../fusion.css';
import './Breeding.css';

interface BreedingResult {feedback:string;offspringUid:string}
interface BreedingProps {s:GameSnapshot;c:GameController;initialRecipeId?:string;onOpenDex:(species:number)=>void;onOpenMonsters:(uid:string)=>void}

export default function Breeding({s,c,initialRecipeId,onOpenDex,onOpenMonsters}:BreedingProps){
 const {recipe,setRecipeId,first:maleUid,setFirst:setMaleUid,second:femaleUid,setSecond:setFemaleUid,result,setResult}
  =useRecipeWorkbench<BreedingRecipe,BreedingResult>(BREEDING_RECIPES,initialRecipeId);
 const name=speciesNamer(s.species),activeBattle=battleActive(s);
 const rows=useMemo(()=>breedingRecipeRows(s.monsters),[s.monsters]);
 const choices=recipe?breedingParentChoices(recipe,s.monsters):{male:[],female:[]};
 const male=choices.male.find(mon=>mon.uid===maleUid),female=choices.female.find(mon=>mon.uid===femaleUid);
 const valid=!!recipe&&breedingPairValid(recipe,male,female);
 const offspring=s.monsters.find(mon=>mon.uid===result?.offspringUid);

 function breed(){
  if(!recipe||!male||!female||!valid||activeBattle)return;
  const before=new Set(c.snapshot().monsters.map(mon=>mon.uid));
  c.dispatch({type:'breed',recipeId:recipe.id,firstUid:male.uid,secondUid:female.uid});
  const next=c.snapshot(),infant=next.monsters.find(mon=>!before.has(mon.uid));
  setResult({offspringUid:infant?.uid??'',feedback:next.notices[0]??'请检查双亲和仓库空间。'});
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
    {breedingRoutesMissing(recipe)&&<p className="fusion-route-note">这组双亲的正常获取路线尚未补齐。可查看图鉴了解初始形态与进化条件。</p>}
    <ParentPair first={parent(recipe,'male',male,maleUid,setMaleUid)} second={parent(recipe,'female',female,femaleUid,setFemaleUid)}/>
    <div className="fusion-outcome-heading"><strong>后代与概率</strong><span>每次随机获得一只 Lv.1 幼体</span></div>
    <div className="fusion-outcomes">{recipe.outcomes.map(outcome=><OutcomeCard key={outcome.species} species={outcome.species}
     name={name(outcome.species)} highlight={outcome.species===recipe.offspringSpecies}
     detail={`${breedingOutcomeLabel(recipe,outcome.species)} · #${outcome.species}`} chance={`${outcome.weight}%`}/>)}</div>
    <p className="fusion-hatch-note">幼体使用随机性格与个体值，不保证继承双亲的数值。繁殖所得雄性不能再次作为雄性亲本。</p>
    <ConfirmBar status={status} action="繁殖并孵化" disabled={!valid||activeBattle} onConfirm={breed} feedback={result?.feedback}/>
    {offspring&&<div className="fusion-obtained">
     <div className="fusion-outcome-art"><CreatureArt species={offspring.appearanceSpecies??offspring.species} name={offspring.name}/></div>
     <div><small>孵化成功</small><strong>{offspring.name} · Lv.{offspring.level}</strong><span>已加入{offspring.inParty?'背包':'仓库'} · 双亲保留</span></div>
     <button onClick={()=>onOpenMonsters(offspring.uid)}>查看幼体 →</button>
    </div>}
   </>}</div>
  </div>
 </section>;
}

function BreedingIndex({rows,activeId,name,onSelect}:{rows:BreedingRecipeRow[];activeId?:string;name:SpeciesName;onSelect:(id:string)=>void}){
 return <aside className="fusion-recipe-index">
  <div className="fusion-index-heading"><strong>选择配对</strong><span>{rows.filter(row=>row.ready).length} 组已准备</span></div>
  <div className="fusion-recipe-scroll">{rows.map(({recipe,ready})=><RecipeButton key={recipe.id} active={recipe.id===activeId}
   art={{species:recipe.offspringSpecies,name:recipe.name}} name={recipe.name}
   detail={`${recipe.maleSpecies.map(name).join(' / ')} + ${recipe.femaleSpecies.map(name).join(' / ')}`}
   status={ready?'可繁殖':'准备双亲'} statusClass={ready?'ready':''} onClick={()=>onSelect(recipe.id)}/>)}</div>
 </aside>;
}

interface BreedingParentProps {
 role:'male'|'female';recipe:BreedingRecipe;selected?:MonsterView;value:string;choices:MonsterView[];name:SpeciesName;
 disabled:boolean;onChoose:(uid:string)=>void;onOpenDex:(species:number)=>void;
}
function BreedingParent({role,recipe,selected,value,choices,name,disabled,onChoose,onOpenDex}:BreedingParentProps){
 const isMale=role==='male',label=isMale?'雄性亲本':'雌性亲本',allowed=isMale?recipe.maleSpecies:recipe.femaleSpecies;
 const option=(mon:MonsterView)=>({value:mon.uid,
  label:`${mon.name} · Lv.${mon.level} · ${mon.inParty?'背包':'仓库'}${isMale&&isBredOffspring(mon)?' · 繁殖后代，不能作为雄性亲本':''}`});
 return <ParentCard id={`breeding-${role}`} label={label} heading={<>{label}<small> · Lv.{recipe.minLevel} 以上</small></>}
  art={<CreatureArt species={selected?.appearanceSpecies??selected?.species??allowed[0]} name={selected?.name??name(allowed[0])}/>}
  value={value} disabled={disabled} onChange={onChoose} placeholder={choices.length?'请选择精灵':'尚未持有指定精灵'}
  options={choices.map(option)} requirement={`指定形态：${allowed.map(name).join(' / ')}${isMale?'，需直接获得的第一代雄性。':'。'}`}>
  {selected&&selected.level<recipe.minLevel&&<p className="breeding-parent-warning">还需培养到 {recipe.minLevel} 级。</p>}
  {allowed.map(id=><button key={id} className="breeding-dex-link" onClick={()=>onOpenDex(id)}>查看{name(id)}图鉴 →</button>)}
 </ParentCard>;
}
