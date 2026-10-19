import assert from 'node:assert/strict';
import {Battle} from '../../battle/core/src/index.ts';
import {createGame} from '../../src/kernel/game.ts';
import type {GameController} from '../../src/kernel/contract.ts';
import {loadCatalog} from '../../src/domain/catalog/catalog.ts';
import {newSave} from '../../src/kernel/save.ts';
import {suite} from './_harness.mjs';

// Boss variants through the real controller (user decision, 2026-10-19): the player picks 盖亚's weekday objective,
// 厄尔塞拉's weekday trait or 劳克蒙德's field before the start; the battle applies it, and the settlement pays and records
// per the source.
const t=suite('boss-variants');
const SEED=0x5e7a,LEVEL=100,STARTER_LINES=[3,6,9];
const GAIA='boss_gaia',EERSAILA='boss_spt_eersaila',LAOKE='boss_spt_laokemengde',VARIANT_BOSSES=[GAIA,EERSAILA,LAOKE];
const source=await loadCatalog() as any;
const encounter=(id:string)=>source.bosses.find((boss:any)=>boss.id===id);
const label=(id:string,variant:string)=>encounter(id).variants.find((entry:any)=>entry.id===variant).label.zh;

/** The engine battle the controller built last. */
let battle:any;
const parse=(game:GameController)=>JSON.parse(game.exportSave());
/** A journey with the three starter lines at Lv.100, or one opened from `save`; turn preparation never runs. */
function journey(save?:object):GameController{
  const game=createGame(source,JSON.stringify(save??newSave(SEED)),{createBattle:(options:any)=>(battle=new Battle(options)),idle:()=>{}});
  if(!save)for(const species of STARTER_LINES)game.dispatch({type:'cheatAcquire',species,level:LEVEL});
  return game;
}
function start(game:GameController,bossId:string,variant?:string){
  const result=game.dispatch({type:'startBattle',bossId,...(variant?{variant}:{})});
  assert.equal(result.ok,true,`${bossId}/${variant}: ${result.notice}`);assert(game.snapshot().battle&&!game.snapshot().battle!.finished);
  return battle;
}
function leave(game:GameController){game.dispatch({type:'flee'});game.dispatch({type:'closeBattle'});assert.equal(game.snapshot().battle,null);}
/** The first damaging move of the active member. */
const attack=(game:GameController)=>game.snapshot().battle!.player.skills.find(skill=>skill.power>0&&skill.pp>0)!.id;
/** Leaves the opposing Boss one HP and attacks, so the first hit knocks it out on turn 1. */
function knockOut(game:GameController){
  battle.active(1).hp=1;
  game.dispatch({type:'move',skillId:attack(game)});
  return game.snapshot().battle!;
}
/** The player's active member crits on every hit (a modify_crit_rate hook that forces it). */
function forceCrits(){
  const id='boss-variants-force-crit';
  battle.active(0).conditions.push({id,def:{id,hooks:[{on:'modify_crit_rate',force_crit:true}]},turns:Infinity,appliedTurn:0});
}
/** The party reduced to its first member. */
function loseQuickly(game:GameController){
  for(const uid of game.snapshot().party.slice(1))game.dispatch({type:'party',uid,add:false});
  return game;
}

t.check('Each variant of the three encounters starts through startBattle with its rules, phases and objectives active',()=>{
  const game=journey(),opened:Record<string,string[]>={};
  for(const id of VARIANT_BOSSES)for(const variant of encounter(id).variants){
    const b=start(game,id,variant.id),side=b.sides[1];
    assert.equal(b.variant?.id,variant.id,`${id}/${variant.id}: the engine applies the variant`);
    assert.deepEqual(b.winList,variant.win??encounter(id).win,`${id}/${variant.id}: its win objectives`);
    const rules=side.rules.map((entry:any)=>JSON.stringify(entry));
    for(const rule of variant.rules??[])assert(rules.includes(JSON.stringify(rule)),`${id}/${variant.id}: ${JSON.stringify(rule)}`);
    const log=game.snapshot().battle!.log;
    assert(log[0].includes(`（${variant.label.zh}）`),`${id}/${variant.id}: the opening line names the variant: ${log[0]}`);
    (opened[id]??=[]).push(variant.id);
    leave(game);
  }
  assert.deepEqual(Object.values(opened).map(ids=>ids.length),[3,7,3]);
  const mon=start(game,EERSAILA,'mon').active(1);assert.equal(mon.maxHp,6000,'周一 doubles 3000 HP');leave(game);
  assert.equal(start(game,EERSAILA,'tue').active(1).stages.eva,3,'周二 raises evasion');leave(game);
  const saturday=start(game,EERSAILA,'sat');game.dispatch({type:'move',skillId:attack(game)});
  assert(saturday.variantPhasesFired.has(0)&&saturday.active(1).stages.def>=2,'周六 raises defence on turn 1 (a variant phase)');leave(game);
  const field=start(game,LAOKE,'energy_field');
  assert(field.sides.every((side:any)=>side.team[side.active].conditions.some((entry:any)=>entry.id==='boss_field_damage_multiplier')),'能量领域 on both sides');
  leave(game);
  t.witness('variants',opened);
});

t.check('A start refuses an unknown variant, a variant of an encounter without any, and a missing one where every fight takes one',()=>{
  const game=journey();
  const refused=(bossId:string,variant:string|undefined,notice:string)=>{
    const before=game.exportSave(),result=game.dispatch({type:'startBattle',bossId,...(variant?{variant}:{})});
    assert.deepEqual([result.ok,result.notice],[false,notice],`${bossId}/${variant}`);
    assert.equal(game.snapshot().battle,null);assert.equal(game.exportSave(),before,`${bossId}/${variant}: no attempt is recorded`);
  };
  refused(EERSAILA,'monday','厄尔塞拉没有这项挑战规则，请重新选择。');
  refused(GAIA,'healing_field','盖亚没有这项挑战规则，请重新选择。');
  refused('boss_spt_liaosi','mon','里奥斯没有可选的挑战规则。');
  refused(EERSAILA,undefined,'请先选择厄尔塞拉的挑战规则。');
  refused(LAOKE,undefined,'请先选择劳克蒙德的挑战规则。');
});

t.check('盖亚 pays its essence only when the chosen variant’s objectives are met',()=>{
  const game=journey(),essences=()=>parse(game).items.essence_gaia??0;
  start(game,GAIA,'within_2_turns');
  let view=knockOut(game);
  assert.equal(view.won,true);assert.equal(essences(),1,'2 回合内 met: the essence');
  assert(view.result.startsWith(`已达成规则「${label(GAIA,'within_2_turns')}」的目标。提坦精元已入库`),view.result);
  assert.deepEqual(parse(game).game.bossVariants,{[GAIA]:['within_2_turns']});assert(parse(game).progress.bosses_cleared.includes(GAIA));
  game.dispatch({type:'closeBattle'});
  start(game,GAIA,'survive_10_then_ko');view=knockOut(game);
  assert.deepEqual([view.won,essences()],[false,1],'knocked out before turn 10: no essence');
  assert.equal(view.result,`对手已倒下，但未达成规则「${label(GAIA,'survive_10_then_ko')}」的目标，本次挑战未通过，请按规则要求重试。`);
  game.dispatch({type:'closeBattle'});
  start(game,GAIA,'finish_with_crit');forceCrits();view=knockOut(game);
  assert.deepEqual([view.won,essences()],[true,2],'a critical final hit meets 致命一击');
  assert.deepEqual(parse(game).game.bossVariants,{[GAIA]:['within_2_turns','finish_with_crit']},'only met objectives are recorded');
});

t.check('盖亚 without a variant is a practice fight: no attempt, clear record or essence, only the victory',()=>{
  const game=journey(),before=parse(game);
  start(game,GAIA);
  assert.equal(battle.variant,undefined);assert.deepEqual(parse(game).progress.boss_attempts,before.progress.boss_attempts,'no attempt');
  const view=knockOut(game),after=parse(game);
  assert.equal(view.won,true);assert(view.result.startsWith('练习战胜利：未选择挑战规则，不计入挑战记录，也不发放精元。获得 '),view.result);
  assert.equal(after.items.essence_gaia,undefined);assert(!after.progress.bosses_cleared.includes(GAIA));assert.deepEqual(after.game.bossVariants,{});
  assert(after.game.coins>before.game.coins&&after.exp_pool>before.exp_pool,'the victory pays coins and pooled experience');
});

t.check('厄尔塞拉 pays its essence on any variant clear; 周五 only on a status-damage knockout',()=>{
  const game=journey(),essences=()=>parse(game).items.essence_eersaila??0;
  start(game,EERSAILA,'mon');
  assert.equal(knockOut(game).won,true);assert.equal(essences(),1);game.dispatch({type:'closeBattle'});
  const friday=start(game,EERSAILA,'fri');knockOut(game);
  assert.equal(game.snapshot().battle!.finished,false,'a direct knockout revives it');assert.equal(friday.active(1).hp,friday.active(1).maxHp);
  friday.active(1).hp=1;friday.applyStatus(friday.active(1),'poison',{turns:4,fromFoe:true});
  assert(friday.active(1).conditions.some((entry:any)=>entry.id==='poison'),'the Boss is poisoned');
  game.dispatch({type:'switch',uid:game.snapshot().battle!.party.find(mon=>mon.uid!==game.snapshot().battle!.player.uid&&mon.hp>0)!.uid});
  const view=game.snapshot().battle!;
  assert.equal(view.won,true,`poison finishes 周五: ${view.result}`);assert.equal(essences(),2);
  assert.deepEqual(parse(game).game.bossVariants,{[EERSAILA]:['mon','fri']});
});

t.check('劳克蒙德 pays its essence on a field clear, and a defeat names the missed objective',()=>{
  const game=journey();
  start(game,LAOKE,'energy_field');
  assert.equal(knockOut(game).won,true);assert.equal(parse(game).items.essence_laokemengde,1);game.dispatch({type:'closeBattle'});
  // 极限领域 takes 100 HP from both sides at the end of the turn, so a lone member at one HP falls on turn 1.
  const lost=loseQuickly(journey());start(lost,LAOKE,'extreme_field');battle.active(0).hp=1;
  lost.dispatch({type:'move',skillId:attack(lost)});
  const view=lost.snapshot().battle!;
  assert.equal(view.finished,true);assert.equal(view.won,false);
  assert(view.result.endsWith(`本次未达成规则「${label(LAOKE,'extreme_field')}」的目标。`),view.result);
  assert.deepEqual(parse(lost).game.bossVariants,{});
});

t.check('A version-3 save opens at version 4 with an empty variant record and keeps its clears',()=>{
  const v3=parse(journey());v3.version=3;delete v3.game.bossVariants;v3.progress.bosses_cleared=[GAIA,EERSAILA];
  const game=journey(v3),opened=parse(game);
  assert.equal(opened.version,4);assert.deepEqual(opened.game.bossVariants,{});assert.deepEqual(opened.progress.bosses_cleared,[GAIA,EERSAILA]);
  start(game,EERSAILA,'thu');knockOut(game);
  const reopened=parse(journey(parse(game)));
  assert.deepEqual(reopened.game.bossVariants,{[EERSAILA]:['thu']},'the record survives a reload');
});

t.finish();
