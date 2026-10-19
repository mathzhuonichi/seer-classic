/** Trainer integration, ordinary roster legality, and bounded real-team simulations. */
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {memoryStorage,suite,withSsr} from './_harness.mjs';

memoryStorage();
await withSsr('trainer-teams',async load=>{
 const t=suite('trainer-teams'),{check}=t,simulations=[],controller=[],report={};
 const [{loadCatalog},{createGame},{buildAcquisitionIndex},{buildRecruitmentRewards},{createBattle},{buildDataSet},{SEER_SCRIPTS},{default:ChallengeCenter},{findChallengeLocation},{chooseAiAction}]=await Promise.all([
  '/src/domain/catalog/catalog.ts','/src/kernel/game.ts','/src/domain/acquisition/acquisition.ts','/src/domain/acquisition/recruitment.ts','/tools/verification/_battle.ts','/battle/core/src/index.ts','/battle/core/src/scripts/index.ts','/src/features/challenges/ui/ChallengeCenter.tsx','/src/domain/world/world.ts','/battle/ai/src/ai.ts'
 ].map(load));
 const catalog=await loadCatalog(),trainers=catalog.trainers??[],without={...catalog,trainers:[]};
 const species=new Map(catalog.species.map(row=>[row.id,row])),skills=new Map(catalog.skills.map(row=>[row.id,row]));
 const trainedRewards=new Set(catalog.bosses.flatMap(boss=>boss.reward?.learn_skill?[`${boss.reward.learn_skill.species}/${boss.reward.learn_skill.skill}`]:[]));
 const inputBytes=JSON.stringify(catalog),data=buildDataSet(catalog);
 check('Every authored trainer roster contains six ordinary legal Lv100 builds',()=>{
  assert(trainers.length>=3);for(const style of ['attrition','control','offense'])assert(trainers.some(row=>row.ai.style===style));
  for(const trainer of trainers){assert.equal(trainer.category,'trainer');assert.equal(trainer.team.length,6);assert.equal(new Set(trainer.team.map(mon=>mon.species)).size,6);assert.deepEqual(trainer.reward,{items:{}});assert.deepEqual(trainer.phases,[]);assert.deepEqual(trainer.rules,[{rule:'no_capture'}]);assert.equal(trainer.ai.kind,'smart');assert.equal(trainer.ai.allow_switch,true);
   for(const mon of trainer.team){assert.equal(mon.level,100);assert.equal(mon.iv,31);assert.equal(mon.nature,'hardy');assert.equal(Object.values(mon.evs).reduce((a,b)=>a+b,0),510);assert(Object.values(mon.evs).every(value=>Number.isInteger(value)&&value>=0&&value<=255));assert.equal(mon.skills.length,4);assert.equal(new Set(mon.skills).size,4);
    for(const key of ['hp','hp_override','stats','stat_multipliers','pp','member_rules','member_phases','beads','types'])assert(!(key in mon),key);
    for(const id of mon.skills)assert(skills.has(id)&&(species.get(mon.species).learnset.some(row=>row.skill===id&&Number.isInteger(row.level)&&row.level>=1&&row.level<=100)||trainedRewards.has(`${mon.species}/${id}`)),`${mon.species}/${id}`);
   }
  }
 });
 check('Separate trainers do not change acquisition closure or recruitment definitions',()=>{
  assert.deepEqual([...buildAcquisitionIndex(catalog)],[...buildAcquisitionIndex(without)]);
  assert.deepEqual(buildRecruitmentRewards(catalog),buildRecruitmentRewards(without));
  assert(!catalog.bosses.some(boss=>boss.category==='trainer'||boss.id.startsWith('trainer_')));
 });
 const baseline=createGame(without),saved=baseline.exportSave(),game=createGame(catalog,saved);
 check('Controller preserves every existing encounter, supply, collection flag, and quest',()=>{
  const before=baseline.snapshot(),after=game.snapshot();
  for(const key of ['species','quests','shopItems','items','campaigns'])assert.deepEqual(after[key],before[key],key);
  assert.deepEqual(after.bosses.filter(row=>row.category!=='trainer'),before.bosses);
  assert.equal(after.bosses.filter(row=>row.category==='trainer').length,trainers.length);
  assert(!after.shopItems.some(row=>row.id.includes('trainer_')));
 });
 check('Trainer tab renders a disclosed six-member team and meaningful reward copy',()=>{
  const html=renderToStaticMarkup(React.createElement(ChallengeCenter,{c:game,initialCategory:'trainer',onTravel:()=>{}}));
  assert(html.includes('训练师对战'));assert(html.includes('aria-label="训练师队伍"'));assert(html.includes('对方阵容 · 6'));assert(html.includes('与训练师互动'));assert(html.includes('赛尔豆与经验。'));
  assert(!html.includes('获得首领精元'));assert(!html.includes('不解锁新的精灵获取路线'));
  for(const trainer of trainers){const view=game.snapshot().bosses.find(row=>row.id===trainer.id);assert.equal(view.opponents.length,6);assert(view.opponents.every(mon=>mon.level===100));assert.deepEqual(findChallengeLocation(view),{planetId:'space-station',regionId:'resources',staging:false});}
 });
 for(const trainer of trainers){
  const candidate=createGame(catalog,saved);candidate.dispatch({type:'startBattle',bossId:trainer.id});
  check(`${trainer.id}: public start action preserves real roster and blocks capture`,()=>{const b=candidate.snapshot().battle;assert(b);assert.equal(b.enemyParty.length,6);assert.deepEqual(b.enemyParty.map(mon=>mon.species),trainer.team.map(mon=>mon.species));assert.equal(b.canCapture,false);assert(b.enemyParty.every(mon=>mon.level===100));});
  candidate.dispatch({type:'flee'});const fled=JSON.parse(candidate.exportSave());
  check(`${trainer.id}: retreat does not unlock rewards or collection`,()=>{assert.deepEqual(fled.dex,JSON.parse(saved).dex);assert.deepEqual(fled.game.shopUnlocked,JSON.parse(saved).game.shopUnlocked);assert(!fled.progress.bosses_cleared.includes(trainer.id));});
 }
 // One-HP copies isolate reward integration from combat difficulty; NPC training cannot
 // combine with an HP override, so the copies drop it. The bounded simulations below
 // use unmodified production rosters and standard stats.
 const fixture={...catalog,trainers:trainers.map(trainer=>({...trainer,team:trainer.team.map(({training_profile,...mon})=>({...mon,hp_override:1}))}))};
 const prepared=createGame(fixture,saved);prepared.dispatch({type:'cheatAcquire',species:9,level:100});
 const attacker=prepared.snapshot().monsters.find(mon=>mon.species===9);assert(attacker);
 prepared.dispatch({type:'cheatMonster',uid:attacker.uid,level:100,iv:31,evs:{hp:0,atk:255,def:0,spa:0,spd:0,spe:255},traitId:null});
 prepared.dispatch({type:'equip',uid:attacker.uid,skills:[10031]});
 prepared.dispatch({type:'reorderParty',uids:[attacker.uid,...prepared.snapshot().party.filter(uid=>uid!==attacker.uid)]});
 const winningSave=prepared.exportSave();
 for(const trainer of trainers){
  const candidate=createGame(fixture,winningSave),before=JSON.parse(candidate.exportSave());candidate.dispatch({type:'startBattle',bossId:trainer.id});
  let actions=0;while(!candidate.snapshot().battle?.finished&&actions++<20)candidate.dispatch({type:'move',skillId:10031});
  const b=candidate.snapshot().battle,after=JSON.parse(candidate.exportSave());
  check(`${trainer.id}: victory grants standard rewards without new essence or collection`,()=>{
   assert(b?.finished&&b.won);assert.equal(after.game.coins-before.game.coins,500);
   assert(after.exp_pool-before.exp_pool>=1000,'Victory includes the 1000 bonus plus ordinary defeated-monster experience');
   const paid=`挑战成功，奖励已入账。获得 500 赛尔豆及 ${after.exp_pool-before.exp_pool} 积累经验。`;
   assert.equal(b.result,paid,'the result states the actual pooled experience');assert.equal(candidate.snapshot().notices[0],paid);
   assert.deepEqual(after.dex,before.dex);assert.deepEqual(after.game.shopUnlocked,before.game.shopUnlocked);assert.deepEqual(after.items,before.items);
   assert(after.progress.bosses_cleared.includes(trainer.id));assert(!candidate.snapshot().shopItems.some(row=>row.id.includes('trainer_')));
  });
  controller.push({trainer:trainer.id,fixture:'one-HP reward integration only',actions,coins:after.game.coins-before.game.coins,pooledExperience:after.exp_pool-before.exp_pool});
 }
 const balanced=[
  {species:6,level:100,iv:31,evs:{hp:255,spa:255},nature:'hardy',skills:[10027,10024,10025,20012]},
  {species:61,level:100,iv:31,evs:{hp:255,spa:255},nature:'hardy',skills:[10140,10105,20074,20038]},
  {species:24,level:100,iv:31,evs:{hp:255,spe:255},nature:'hardy',skills:[10056,20027,20026,20016]},
  {species:70,level:100,iv:31,evs:{atk:255,spe:255},nature:'hardy',skills:[10176,10170,10166,20085]},
  {species:3,level:100,iv:31,evs:{hp:255,spd:255},nature:'hardy',skills:[20007,20009,10016,10014]},
  {species:9,level:100,iv:31,evs:{atk:255,spe:255},nature:'hardy',skills:[10030,10031,10033,20014]},
 ];
 for(const mon of balanced)assert(mon.skills.every(id=>species.get(mon.species).learnset.some(row=>row.skill===id&&Number.isInteger(row.level)&&row.level>=1&&row.level<=100)));
 for(const trainer of trainers)for(const seed of [7,29,101]){
  const battle=createBattle({data,scripts:SEER_SCRIPTS,seed,sides:[{kind:'boss',team:structuredClone(balanced),ai:{kind:'smart',allow_switch:true}},{kind:'boss',team:structuredClone(trainer.team)}],encounter:structuredClone(trainer)});
  let iterations=0;while(!battle.result&&iterations++<400)battle.resolveTurn();
  const count=(type,side)=>battle.log.filter(event=>event.type===type&&(side===undefined||event.side===side)).length;
  const moves=battle.log.filter(event=>event.type==='move_used'&&event.side===1);
  const result={trainer:trainer.id,seed,turns:battle.turn,iterations,finished:!!battle.result,winner:battle.result?.winner,reason:battle.result?.reason,npcMoves:moves.length,npcStatusMoves:moves.filter(event=>skills.get(event.skill)?.category==='status').length,statusApplications:count('status_applied'),npcHeals:count('heal',1),npcSwitchOuts:count('switch_out',1),npcSwitchIns:count('switch_in',1)};
  simulations.push(result);assert(battle.result,`${trainer.id} seed ${seed}: exceeded 400 resolutions`);
 }
 check('A real trainer voluntarily pivots after two natural turns and survives the entry hit',()=>{
  const trainer=trainers.find(row=>row.id==='trainer_attrition');
  const player={species:6,level:100,iv:31,evs:{hp:255,def:255},nature:'hardy',skills:[10018,10027,20011,20012]};
  assert(player.skills.every(id=>species.get(player.species).learnset.some(row=>row.skill===id&&row.level>=1&&row.level<=player.level)));
  const battle=createBattle({data,scripts:SEER_SCRIPTS,seed:7,sides:[{kind:'player',team:[player]},{kind:'trainer',team:structuredClone(trainer.team),ai:trainer.ai}],encounter:structuredClone(trainer)});
  const trace=[];
  // Defense setup followed by the naturally learned Flying Strike keeps both leads
  // alive until the opt-in cooldown expires. Never submit an NPC action or edit
  // HP, counters, move announcements, PP, stats, or any decision outcome.
  for(const skill of [20011,10018,10018]){
   const before=JSON.stringify(battle.state),active=battle.active(1),action=chooseAiAction(battle,battle.sides[1]);
   assert.equal(JSON.stringify(battle.state),before,'Reading the decision must preserve combat state and RNG');
   trace.push({turn:battle.turn+1,npcSpecies:active.species.id,npcHp:active.hp,npcTurnsActive:active.turnsActive,playerSkill:skill,decision:action});
   battle.submit(0,{kind:'move',skill});
   assert.deepEqual(chooseAiAction(battle,battle.sides[1]),action,'Pending player input must not change the decision');
   const events=battle.resolveTurn();trace[trace.length-1].events=events.filter(event=>['move_used','damage','switch_out','switch_in'].includes(event.type));
  }
  assert.deepEqual(trace.map(row=>row.npcTurnsActive),[0,1,2]);
  assert(trace.slice(0,2).every(row=>row.decision.kind==='move'));
  assert.deepEqual(trace[2].decision,{kind:'switch',slot:5});
  assert.equal(battle.sides[1].active,5);assert.equal(battle.active(1).species.id,61);
  const switched=trace[2].events.filter(event=>event.type==='switch_out'||event.type==='switch_in');
  assert.deepEqual(switched.map(event=>[event.type,event.side,event.slot]),[['switch_out',1,0],['switch_in',1,5]]);
  assert(battle.sides[1].team[0].hp>0&&!battle.sides[1].team[0].fainted,'The outgoing lead must be alive, not a forced faint replacement');
  assert(trace[2].events.some(event=>event.type==='damage'&&event.side===1&&event.slot===5&&event.skill===10018),'The reserve must actually absorb the revealed flying attack');
  assert(battle.active(1).hp>0&&!battle.active(1).fainted,'The reserve must survive entry');
  assert.equal(battle.active(1).turnsActive,0);assert.equal(chooseAiAction(battle,battle.sides[1]).kind,'move','The new active member must not immediately reverse the switch');
  report.voluntarySwitch={trainer:trainer.id,seed:7,player,trace,outgoingHp:battle.sides[1].team[0].hp,incomingHp:battle.active(1).hp};
 });
 report.scriptOps=[...new Set(trainers.flatMap(row=>row.team.flatMap(mon=>mon.skills.flatMap(id=>skills.get(id).effects.filter(effect=>effect.op==='script').map(effect=>`${id}:${effect.id}`)))))];
 check('Verification does not mutate shared encounter definitions',()=>assert.equal(JSON.stringify(catalog),inputBytes));
 t.finish({simulations,controller,...report});
});
