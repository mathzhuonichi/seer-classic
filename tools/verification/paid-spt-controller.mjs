/** Source-controller recruitment transactions, persistence, and a bounded real battle settlement. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';
const memory=new Map();
globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
const results=[];
fs.mkdirSync('artifacts/paid-spt-recruitment-v23',{recursive:true});
fs.rmSync('artifacts/paid-spt-recruitment-v23/controller-verification.json',{force:true});
try {
  const {createGame,loadGameData}=await server.ssrLoadModule('/src/game.ts');
  const {buildPaidSPTRecruitments}=await server.ssrLoadModule('/src/progression/spt-recruitment.ts');
  const catalog=await loadGameData(),originalCatalog=JSON.stringify(catalog),quests=buildPaidSPTRecruitments(catalog);
  const base=JSON.parse(createGame(catalog,'').exportSave());base.rng_state=[101,202,303,404];base.game.coins=0;
  const make=(quest,cleared=[],claimed=[])=>{const save=structuredClone(base);save.progress.bosses_cleared=[...cleared];save.game.quests=[...claimed];return createGame(catalog,JSON.stringify(save));};
  const view=(game,quest)=>game.snapshot().quests.find(q=>q.id===quest.questId);
  const unchangedRejection=(game,questId,label)=>{const before=game.exportSave();game.dispatch({type:'claimQuest',questId});assert.equal(game.exportSave(),before,label);assert.ok(game.snapshot().notices[0].includes('尚不可领取'));};
  for(const quest of quests) {
    const required=quest.prerequisiteBossIds;
    const incomplete=make(quest,[...Array(10).fill(required[0]),'boss_puni','boss_campaign_qinglong_body','boss_campaign_baihu_body','boss_tower_brave_1']);
    assert.equal(view(incomplete,quest).complete,false);assert.equal(view(incomplete,quest).progress,`1/${required.length}`);
    assert.equal(view(incomplete,quest).group,'spt-recruitment');assert.deepEqual(view(incomplete,quest).requiredBossIds,required);
    unchangedRejection(incomplete,quest.questId,`${quest.questId}: incomplete claim changes no save/RNG/resources`);
    const partial=make(quest,required.slice(0,-1));assert.equal(view(partial,quest).complete,false);unchangedRejection(partial,quest.questId,`${quest.questId}: missing last named gate`);
    const ready=make(quest,[...required,required[0]]);assert.equal(view(ready,quest).complete,true);assert.equal(view(ready,quest).claimed,false);
    const before=JSON.parse(ready.exportSave());ready.dispatch({type:'claimQuest',questId:quest.questId});const after=JSON.parse(ready.exportSave());
    const acquired=after.storage.filter(mon=>!before.storage.some(existing=>existing.uid===mon.uid));assert.equal(acquired.length,1);
    assert.equal(acquired[0].species,quest.rewardSpecies);assert.equal(acquired[0].level,1);assert.equal(acquired[0].obtained.how,'quest');
    assert.equal(after.game.quests.filter(id=>id===quest.questId).length,1);assert.equal(after.game.coins,0);assert.deepEqual(after.items,before.items);assert.equal(after.exp_pool,before.exp_pool);
    assert.ok(after.party.includes(acquired[0].uid));assert.ok(view(ready,quest).claimed);assert.ok(ready.snapshot().species.find(s=>s.id===quest.rewardSpecies).owned);
    assert.deepEqual(after.storage.filter(mon=>mon.uid!==acquired[0].uid),before.storage);
    unchangedRejection(ready,quest.questId,`${quest.questId}: repeat claim changes no save/RNG/resources`);
    unchangedRejection(ready,'paid-spt-recruitment-999999',`${quest.questId}: unknown claim changes no save/RNG/resources`);
    const reloaded=createGame(catalog,ready.exportSave());assert.ok(view(reloaded,quest).claimed);assert.equal(reloaded.snapshot().monsters.filter(m=>m.uid===acquired[0].uid).length,1);
    unchangedRejection(reloaded,quest.questId,`${quest.questId}: reload preserves one-time claim`);
    results.push({questId:quest.questId,rewardSpecies:quest.rewardSpecies,prerequisites:required,initialLevel:acquired[0].level});
  }
  const quest=quests[0],fullParty=make(quest,quest.prerequisiteBossIds);
  for(const species of [10,13,16])fullParty.dispatch({type:'cheatAcquire',species,level:5});assert.equal(fullParty.snapshot().party.length,6);
  const fullBefore=JSON.parse(fullParty.exportSave());fullParty.dispatch({type:'claimQuest',questId:quest.questId});const fullAfter=JSON.parse(fullParty.exportSave());
  const boxed=fullAfter.storage.find(mon=>!fullBefore.storage.some(existing=>existing.uid===mon.uid));assert.ok(boxed);assert.equal(boxed.species,quest.rewardSpecies);assert.equal(boxed.level,1);assert.deepEqual(fullAfter.party,fullBefore.party);assert.ok(!fullAfter.party.includes(boxed.uid));assert.equal(fullAfter.game.coins,0);


  const capacitySave=structuredClone(fullBefore);
  for(let index=0;index<1000;index++)capacitySave.storage.push({...structuredClone(capacitySave.storage[0]),uid:`controller-box-${index}`});
  const capacityGame=createGame(catalog,JSON.stringify(capacitySave));
  const capacityBefore=capacityGame.exportSave();capacityGame.dispatch({type:'claimQuest',questId:quest.questId});
  const capacityAfter=capacityGame.exportSave();
  if(capacityAfter!==capacityBefore){const before=JSON.parse(capacityBefore),after=JSON.parse(capacityAfter);fs.writeFileSync('artifacts/paid-spt-recruitment-v23/capacity-rejection.json',JSON.stringify({beforeRng:before.rng_state,afterRng:after.rng_state,beforeMonsters:before.storage.length,afterMonsters:after.storage.length,beforeCoins:before.game.coins,afterCoins:after.game.coins,beforeClaims:before.game.quests,afterClaims:after.game.quests,notice:capacityGame.snapshot().notices[0]},null,2)+'\n');}
  assert.ok(capacityAfter===capacityBefore,'Full storage rejection must consume no RNG, creature or resource state.');

  // Keep the official boss identity/team/rules; only one test-fixture attack is strengthened for a bounded real engine turn.
  const battleQuest=quests.find(q=>q.prerequisiteBossIds.at(-1)==='boss_spt_delasa');assert.ok(battleQuest);
  const battleCatalog=structuredClone(catalog),attack=battleCatalog.skills.find(skill=>skill.id===10001);attack.power=1000000;attack.accuracy=null;attack.priority=20;
  const battleSave=structuredClone(base);battleSave.game.traits={};battleSave.progress.bosses_cleared=battleQuest.prerequisiteBossIds.slice(0,-1);
  const battleGame=createGame(battleCatalog,JSON.stringify(battleSave));const last=battleQuest.prerequisiteBossIds.at(-1);
  assert.equal(view(battleGame,battleQuest).complete,false);battleGame.dispatch({type:'startBattle',bossId:last});assert.ok(battleGame.snapshot().battle);
  assert.equal(view(battleGame,battleQuest).complete,false);battleGame.dispatch({type:'move',skillId:10001});
  assert.equal(battleGame.snapshot().battle.finished,true);assert.equal(battleGame.snapshot().battle.won,true);assert.ok(JSON.parse(battleGame.exportSave()).progress.bosses_cleared.includes(last));
  assert.equal(view(battleGame,battleQuest).complete,true);const won=JSON.parse(battleGame.exportSave());battleGame.dispatch({type:'claimQuest',questId:battleQuest.questId});const claimed=JSON.parse(battleGame.exportSave());
  assert.equal(claimed.storage.length,won.storage.length+1);assert.equal(claimed.game.coins,won.game.coins);assert.deepEqual(claimed.items,won.items);
  assert.equal(JSON.stringify(catalog),originalCatalog,'Source catalog remains unchanged across controllers and test fixture.');
  const output={checks:['all named gates and repeated/unrelated/Puni/divine rejection','all 42 source-backed initial Lv1 claims','rejections preserve RNG/monsters/resources/claims','zero coins and unchanged items/experience on claim','one-time claim through save/reload','full party places reward in storage','full storage rejection preserves RNG and all save state','real controlled last-prerequisite engine win sets readiness'],questCount:quests.length,quests:results,controlledBattle:{bossId:last,opponentSpecies:battleGame.snapshot().battle.enemy.species,questId:battleQuest.questId,testOnlySkillOverride:{id:10001,power:1000000,accuracy:null,priority:20},turn:battleGame.snapshot().battle.turn,result:battleGame.snapshot().battle.result}};
  fs.mkdirSync('artifacts/paid-spt-recruitment-v23',{recursive:true});fs.writeFileSync('artifacts/paid-spt-recruitment-v23/controller-verification.json',JSON.stringify(output,null,2)+'\n');
  console.log(`Verified ${quests.length} source-controller recruitment transactions, rejection/RNG invariants, save/reload, coin-free storage fallback, and real ${last} settlement.`);
} finally {await server.close();delete globalThis.localStorage;}
