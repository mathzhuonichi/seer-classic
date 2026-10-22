import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Battle} from '../../battle/core/src/index.ts';
import {createGame} from '../../src/kernel/game.ts';
import type {GameController} from '../../src/kernel/contract.ts';
import {loadCatalog} from '../../src/domain/catalog/catalog.ts';
import {migrate,newSave,SAVE_VERSION} from '../../src/kernel/save.ts';
import {shellRoutes} from '../../src/app/shell-routes.ts';
import {findChallengeLocation,resolveWorldLocation,WORLD_PLANETS} from '../../src/domain/world/world.ts';
import {challengeDetail,challengeEntries,challengeHonors} from '../../src/features/challenges/challenge-center.ts';
import ChallengeCenter from '../../src/features/challenges/ui/ChallengeCenter.tsx';
import {buildWorldDialogue,buildWorldScene} from '../../src/features/world/world-scene.ts';
import {WorldDialogue} from '../../src/features/world/ui/WorldDialogue.tsx';
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
  // 盖亚 is fought one against one (player_team_size max 1).
  if(bossId===GAIA)for(const uid of game.snapshot().party.slice(1))game.dispatch({type:'party',uid,add:false});
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
/** The player's active member takes no damage, through switches too. */
function shield(){
  const id='boss-variants-shield';
  battle.active(0).conditions.push({id,def:{id,removed_on_switch:false,hooks:[{on:'modify_damage_taken',multiplier:0}]},turns:Infinity,appliedTurn:0});
}
/** The pooled experience a settled non-win still paid since `before` (an exported save), in the result text's words, or ''. */
function poolText(game:GameController,before:any){
  const exp=parse(game).exp_pool-before.exp_pool;
  return exp?`获得 ${exp} 积累经验。`:'';
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
    const {name,log}=game.snapshot().battle!;
    assert.equal(name,`${encounter(id).name.zh}（${variant.label.zh}）`,`${id}/${variant.id}: the battle caption names the variant`);
    assert.equal(log[0],`挑战${name}。`,`${id}/${variant.id}: so does the opening line`);
    (opened[id]??=[]).push(variant.id);
    leave(game);
  }
  assert.deepEqual(Object.values(opened).map(ids=>ids.length),[3,7,3]);
  const mon=start(game,EERSAILA,'mon').active(1);assert.equal(mon.maxHp,6000,'周一 doubles 3000 HP');leave(game);
  assert.equal(start(game,EERSAILA,'tue').active(1).stages.eva,3,'周二 raises evasion');leave(game);
  // Checked before the first command: the first_turn phase is in place on entry, and a critical hit would clear the boost.
  const saturday=start(game,EERSAILA,'sat');
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
  assert.equal(parse(game).progress.boss_wins[GAIA],1,'the win is counted');
  game.dispatch({type:'closeBattle'});
  const missed=parse(game);
  // The lead is still hurt from the first fight, and 盖亚 may open with its strongest attack (RULES.md 10.4): shield it here
  // and in the third fight.
  start(game,GAIA,'survive_10_then_ko');shield();view=knockOut(game);
  assert.deepEqual([view.won,essences()],[false,1],'knocked out before turn 10: no essence');
  // The Lv 100 lead's knockout share still reaches the pool, and the result says so; no coins or victory are paid.
  const pool=poolText(game,missed);
  assert(pool,'the knockout pays pooled experience');
  assert.deepEqual([parse(game).game.coins,parse(game).game.battlesWon],[missed.game.coins,missed.game.battlesWon]);
  assert.deepEqual([parse(game).progress.boss_attempts[GAIA],parse(game).progress.boss_wins[GAIA]],[2,1],'an unmet objective is a lost attempt');
  assert.equal(view.result,`对手已倒下，但未达成规则「${label(GAIA,'survive_10_then_ko')}」的目标，本次挑战未通过，请按规则要求重试。${pool}`);
  assert.equal(game.snapshot().notices[0],view.result,'the settlement notice states it');
  game.dispatch({type:'closeBattle'});
  start(game,GAIA,'finish_with_crit');shield();forceCrits();view=knockOut(game);
  assert.deepEqual([view.won,essences()],[true,2],'a critical final hit meets 致命一击');
  assert.deepEqual(parse(game).game.bossVariants,{[GAIA]:['within_2_turns','finish_with_crit']},'only met objectives are recorded');
});

t.check('盖亚’s 10-turn objective is met by a knockout after turn 10',()=>{
  const game=journey(),gaia=start(game,GAIA,'survive_10_then_ko').active(1),turns=encounter(GAIA).variants[2].win[1].turns;
  shield();gaia.maxHp=gaia.hp=1e6;
  while(battle.turn<turns)game.dispatch({type:'move',skillId:attack(game)});
  assert.equal(game.snapshot().battle!.finished,false,'盖亚 still stands after turn 10');
  const view=knockOut(game);
  assert.deepEqual([view.won,battle.turn,parse(game).items.essence_gaia],[true,turns+1,1]);
  assert.deepEqual(parse(game).game.bossVariants,{[GAIA]:['survive_10_then_ko']});
});

t.check('盖亚 without a variant is a practice fight: no attempt, clear record or essence, only the victory',()=>{
  const game=journey(),before=parse(game);
  start(game,GAIA);
  assert.equal(battle.variant,undefined);assert.deepEqual(parse(game).progress.boss_attempts,before.progress.boss_attempts,'no attempt');
  const view=knockOut(game),after=parse(game);
  assert.equal(view.won,true);assert(view.result.startsWith('练习战胜利：未选择挑战规则，不计入挑战记录，也不发放精元。获得 '),view.result);
  assert.equal(after.items.essence_gaia,undefined);assert(!after.progress.bosses_cleared.includes(GAIA));assert.deepEqual(after.game.bossVariants,{});
  assert.deepEqual(after.progress.boss_wins,before.progress.boss_wins,'no win');
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

t.check('厄尔塞拉 pays no essence or victory when a direct knockout sticks after 周五’s revives, nor on a defeat',()=>{
  const game=journey(),before=parse(game),revives=encounter(EERSAILA).variants.find((entry:any)=>entry.id==='fri').rules[0].params.max_revives;
  const friday=start(game,EERSAILA,'fri').active(1);shield();
  let revived=0;
  for(let turn=0;turn<3*revives&&!game.snapshot().battle!.finished;turn++)if(!knockOut(game).finished&&friday.hp===friday.maxHp)revived++;
  const view=game.snapshot().battle!,after=parse(game);
  assert.deepEqual([view.finished,view.won,revived],[true,false,revives],'the knockout after the last revive sticks');
  // Only the Lv 100 lead's knockout share reaches the pool, and the result says how much.
  assert.equal(view.result,`对手已倒下，但未达成规则「${label(EERSAILA,'fri')}」的目标，本次挑战未通过，请按规则要求重试。${poolText(game,before)}`);
  assert.deepEqual([after.items.essence_eersaila,after.game.bossVariants,after.progress.bosses_cleared,after.game.battlesWon],
    [undefined,{},before.progress.bosses_cleared,before.game.battlesWon],'no essence, variant, clear or victory');
  // A lone poisoned member at one HP falls on turn 1.
  const lost=loseQuickly(journey()),unpaid=parse(lost);
  start(lost,EERSAILA,'mon');battle.active(0).hp=1;battle.applyStatus(battle.active(0),'poison',{turns:4,fromFoe:true});
  lost.dispatch({type:'move',skillId:attack(lost)});
  const defeat=lost.snapshot().battle!;
  assert.deepEqual([defeat.finished,defeat.won,poolText(lost,unpaid)],[true,false,''],'a defeat without a knockout pays nothing');
  assert(defeat.result.endsWith(`本次未达成规则「${label(EERSAILA,'mon')}」的目标。`),defeat.result);
  assert.deepEqual([parse(lost).items.essence_eersaila,parse(lost).game.bossVariants],[undefined,{}]);
});

t.check('劳克蒙德 pays its essence on a field clear, and a defeat names the missed objective',()=>{
  const game=journey();
  // Its innate attack +2 stands from the start, so the Boss can strike first for double damage: the player's member is shielded.
  start(game,LAOKE,'energy_field');shield();
  assert.equal(knockOut(game).won,true);assert.equal(parse(game).items.essence_laokemengde,1);game.dispatch({type:'closeBattle'});
  // 极限领域 takes 100 HP from both sides at the end of the turn, so a lone member at one HP falls on turn 1.
  const lost=loseQuickly(journey());start(lost,LAOKE,'extreme_field');battle.active(0).hp=1;
  lost.dispatch({type:'move',skillId:attack(lost)});
  const view=lost.snapshot().battle!;
  assert.equal(view.finished,true);assert.equal(view.won,false);
  assert(view.result.endsWith(`本次未达成规则「${label(LAOKE,'extreme_field')}」的目标。`),view.result);
  assert.deepEqual(parse(lost).game.bossVariants,{});
});

/** 厄尔塞拉's Thursday: its healing, and the stat-drop immunity and innate attack +2 of 7k7k 2010-08-16. */
const THURSDAY_RULES=['首领每回合结束时回复 1000 体力','首领免疫能力下降（命中、闪避在内）','开场时，首领攻击+2'];
const variantIds=(id:string)=>encounter(id).variants.map((variant:any)=>variant.id);

t.check('A version-3 save opens at the current version and keeps its clears; a 厄尔塞拉 clear stands for all its variants, a 盖亚 clear for none',()=>{
  const v3=parse(journey());v3.version=3;delete v3.game.bossVariants;v3.progress.bosses_cleared=[GAIA,EERSAILA];
  const game=journey(v3),opened=parse(game);
  assert.equal(opened.version,SAVE_VERSION);assert.deepEqual(opened.progress.bosses_cleared,[GAIA,EERSAILA]);
  assert.deepEqual(opened.game.bossVariants,{[EERSAILA]:variantIds(EERSAILA)},'version 3 never showed 完胜盖亚, so 盖亚 records none');
  start(game,GAIA,'within_2_turns');knockOut(game);
  const reopened=parse(journey(parse(game)));
  assert.deepEqual(reopened.game.bossVariants,{[EERSAILA]:variantIds(EERSAILA),[GAIA]:['within_2_turns']},'the record survives a reload');
});

/**
 * A save the version-3 game wrote (a8a2c328c0347b176ee53d14f09efb0411b4c63d: createGame, the three starters at Lv.100, 盖亚 and
 * 厄尔塞拉 cleared without a variant in real battles whose opponents were held at 1 HP, exportSave). That game's honour roll for it
 * listed 击败盖亚 and 称号：七色光羽, and its 厄尔塞拉 entry read 已获得：称号：七色光羽.
 */
const VERSION_3_SAVE=readFileSync(new URL('./fixtures/save-version-3-boss-clears.json',import.meta.url),'utf8');
const VERSION_3_HONORS=[{label:'击败盖亚',source:'盖亚'},{label:'称号：七色光羽',source:'厄尔塞拉'}];

t.check('A save written by the version-3 game keeps the honour roll it showed at the current version, and opening it again changes nothing',()=>{
  assert.equal(JSON.parse(VERSION_3_SAVE).version,3);
  const game=createGame(source,VERSION_3_SAVE,{createBattle:(options:any)=>(battle=new Battle(options)),idle:()=>{}}),opened=parse(game);
  const detail=()=>challengeDetail(challengeEntries(game.snapshot()).find(entry=>entry.id===EERSAILA)!,game.snapshot(),false);
  assert.deepEqual([opened.version,opened.game.bossVariants],[SAVE_VERSION,{[EERSAILA]:variantIds(EERSAILA)}]);
  assert.deepEqual(opened.progress.boss_wins,{[GAIA]:1,[EERSAILA]:1},'each clear it recorded counts as one win');
  assert.deepEqual(challengeHonors(game.snapshot()),VERSION_3_HONORS);
  assert.deepEqual([detail().status,detail().honors],['✓ 已通过 7/7','已获得：称号：七色光羽']);
  const again=journey(opened);
  assert.equal(again.exportSave(),game.exportSave(),'reopening the upgraded save changes nothing');
  assert.deepEqual(migrate(structuredClone(opened)),opened,'a current save is not migrated again');
  assert.deepEqual(challengeHonors(again.snapshot()),VERSION_3_HONORS);
  start(game,EERSAILA,'mon');
  assert(!knockOut(game).result.includes('荣誉档案'),'a later clear does not announce the title again');
});

t.check('Clearing the last of 厄尔塞拉’s seven variants earns 七色光羽; its clear alone and a repeat earn nothing',()=>{
  const save=parse(journey());save.progress.bosses_cleared=[EERSAILA];save.game.bossVariants={[EERSAILA]:['tue','wed','thu','fri','sat','sun']};
  const game=journey(save),row=()=>game.snapshot().bosses.find(boss=>boss.id===EERSAILA)!;
  const detail=()=>challengeDetail(challengeEntries(game.snapshot()).find(entry=>entry.id===EERSAILA)!,game.snapshot(),false);
  const titled=()=>challengeHonors(game.snapshot()).filter(honor=>honor.label==='称号：七色光羽');
  assert.equal(row().honors,undefined,'a clear earns no honour');assert.deepEqual(row().variantHonors,['称号：七色光羽']);
  assert.deepEqual([titled(),detail().status,detail().honors],[[],'已通过 6/7','通过全部 7 种规则后获得：称号：七色光羽']);
  start(game,EERSAILA,'mon');
  const view=knockOut(game);
  assert(view.result.includes('7 种规则全部通过，荣誉档案新增「称号：七色光羽」。获得 '),view.result);
  assert.deepEqual([titled(),detail().status,detail().honors],[[{label:'称号：七色光羽',source:'厄尔塞拉'}],'✓ 已通过 7/7','已获得：称号：七色光羽']);
  game.dispatch({type:'closeBattle'});start(game,EERSAILA,'mon');
  assert(!knockOut(game).result.includes('荣誉档案'),'a repeat clear announces nothing');
});

t.check('Clearing 盖亚’s three objectives earns 完胜盖亚 beside the 击败盖亚 of its first clear',()=>{
  const save=parse(journey());save.progress.bosses_cleared=[GAIA];save.game.bossVariants={[GAIA]:['finish_with_crit','survive_10_then_ko']};
  const game=journey(save),earned=()=>challengeHonors(game.snapshot()).filter(honor=>honor.source==='盖亚').map(honor=>honor.label);
  assert.deepEqual(earned(),['击败盖亚']);
  start(game,GAIA,'within_2_turns');
  assert(knockOut(game).result.includes('3 种规则全部通过，荣誉档案新增「完胜盖亚」。获得 '));
  assert.deepEqual(earned(),['击败盖亚','完胜盖亚']);
});

t.check('No world contact meets a Boss with variants, whose fights start from the Boss dialogue with the choice',()=>{
  const species=new Set(source.bosses.filter((boss:any)=>boss.variants?.length).flatMap((boss:any)=>boss.team.map((mon:any)=>mon.species)));
  const contacts=WORLD_PLANETS.flatMap(planet=>planet.regions.flatMap(region=>region.creatures.filter(id=>species.has(id)).map(id=>`${region.id}:${id}`)));
  assert.deepEqual([species.size>=3,contacts],[true,[]],'startTraining starts a species’ Boss without a variant');
});

/** A controller whose snapshot lists only the Boss `id`, so the archive opens on it. */
function only(game:GameController,id:string):GameController{
  const full=game.snapshot();
  return Object.assign(Object.create(game),{snapshot:()=>({...full,bosses:full.bosses.filter(boss=>boss.id===id)})});
}
const checkedLabel=(html:string)=>html.match(/checked=""\/><span><strong>([^<]*)/)?.[1];
/** The Boss world dialogue at the contact of `id`, opened with `variant` as WorldMap passes it (a travel request's pick). */
function dialogueMarkup(game:GameController,id:string,variant?:string|null){
  const s=game.snapshot(),destination=findChallengeLocation(s.bosses.find(boss=>boss.id===id)!);
  const {planet,region}=resolveWorldLocation(destination.planetId,destination.regionId);
  const view=buildWorldDialogue(s,buildWorldScene(s,planet,region,id),{kind:'boss',id})!;
  return renderToStaticMarkup(createElement(WorldDialogue,{view,showDetails:false,c:game,variant,onClose(){},onToggleDetails(){},onChooseStart(){}}));
}

t.check('The challenge archive lists every variant with its rules and objectives, picks the first not cleared, and offers 盖亚’s practice fight',()=>{
  const save=parse(journey());save.game.bossVariants={[EERSAILA]:['mon','tue']};
  const game=journey(save),eersaila=game.snapshot().bosses.find(boss=>boss.id===EERSAILA)!;
  const archive=(id:string,initialCategory:any)=>renderToStaticMarkup(createElement(ChallengeCenter,{c:only(game,id),initialCategory,onTravel(){}}));
  const html=archive(EERSAILA,'spt');
  assert(html.includes('<span class="type-tag">已通过 2/7</span>'),'the progress tag');
  assert(html.includes('<legend>挑战规则 · 已通过 2/7</legend>'));
  for(const variant of eersaila.variants!){
    for(const text of [variant.label,...variant.rules,`胜利条件：${variant.win}。`,`失败条件：${variant.lose}。`])assert(html.includes(text),`${variant.id}: ${text}`);
  }
  assert.deepEqual(eersaila.variants!.find(variant=>variant.id==='thu')!.rules,THURSDAY_RULES);
  assert.deepEqual(eersaila.variants!.find(variant=>variant.id==='sun')!.rules,['首领总是先手行动','首领体力低于 20% 后，首领的攻击直接击倒对手'],'the phase names whose HP');
  assert.equal(eersaila.variants!.find(variant=>variant.id==='fri')!.win,'击败全部对手，最后一击须为中毒、烧伤、冻伤的异常状态伤害');
  assert.equal(checkedLabel(html),label(EERSAILA,'wed'),'the first variant not cleared is picked');
  const gaia=archive(GAIA,'legendary');
  assert(gaia.includes('<strong>练习战</strong>'));assert.equal(checkedLabel(gaia),label(GAIA,'within_2_turns'));
  assert(gaia.includes(`胜利条件：击败全部对手，第 10 回合之后才能击倒首领，提前击倒算作失败。`),'盖亚’s 10-turn objective');
  assert(!archive(LAOKE,'spt').includes('练习战'),'劳克蒙德 offers no practice fight');
});

t.check('The Boss world dialogue offers the variant choice and states the picked variant’s rules and objectives',()=>{
  const game=journey(),dialogue=(id:string,variant?:string|null)=>dialogueMarkup(game,id,variant);
  const plain=dialogue(EERSAILA);
  assert(plain.includes('<legend>挑战规则 · 已通过 0/7</legend>'));assert.equal(checkedLabel(plain),label(EERSAILA,'mon'));
  for(const variant of encounter(EERSAILA).variants)assert(plain.includes(variant.label.zh),variant.id);
  assert(plain.includes('规则：首领免疫所有异常状态；首领体力上限变为 2 倍。'),'the picked variant’s rules');
  assert(!plain.includes('首领每回合结束时回复 1000 体力'),'another variant’s rules stay folded');
  const thursday=dialogue(EERSAILA,'thu');
  assert.equal(checkedLabel(thursday),label(EERSAILA,'thu'));assert(thursday.includes(`规则：${THURSDAY_RULES.join('；')}。`));
  const practice=dialogue(GAIA,null);
  assert.equal(checkedLabel(practice),'练习战');assert(practice.includes('不计入挑战记录，也不发放精元'));
  const field=dialogue(LAOKE,'healing_field');
  assert(field.includes('规则：双方每回合结束时回复 10% 体力。'));assert(field.includes('失败条件：我方精灵全部倒下。'));
});

t.check('The archive’s pick travels to the Boss dialogue: 盖亚’s 练习战 stays the practice fight, and no pick takes the default',()=>{
  const game=journey(),gaia=game.snapshot().bosses.find(boss=>boss.id===GAIA)!,travels:any[]=[];
  const navigation={show(){},enterCampaign(){},travel:(destination:any)=>travels.push(destination)} as any;
  const routes=shellRoutes({c:game,navigation,backdrops:{current:{} as any},setMessage(){},setSelected(){}});
  routes.travelToChallenge(gaia,null);routes.travelToChallenge(gaia,'finish_with_crit');routes.travelToChallenge(gaia);
  assert.deepEqual(travels.map(destination=>'variant' in destination),[true,true,false],'only a pick is carried');
  const checked=travels.map(destination=>checkedLabel(dialogueMarkup(game,GAIA,destination.variant)));
  assert.deepEqual(checked,['练习战',label(GAIA,'finish_with_crit'),label(GAIA,'within_2_turns')]);
});

t.finish();
