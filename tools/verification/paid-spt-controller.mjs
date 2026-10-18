/** Unified recruitment: mixed prerequisites, essence transactions, migration and repeat limits. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';
const memory=new Map();
globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
const server=await createServer({server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',logLevel:'error'});
try {
 const {createGame,loadCatalog}=await server.ssrLoadModule('/src/game.ts');
 const {buildRecruitmentRewards,recruitmentProgress,ACQUISITION_POLICIES}=await server.ssrLoadModule('/src/progression/recruitment.ts');
 const {buildPaidSPTRecruitments}=await server.ssrLoadModule('/src/progression/spt-recruitment.ts');
 const catalog=await loadCatalog(),original=JSON.stringify(catalog),rewards=buildRecruitmentRewards(catalog);
 const parse=g=>JSON.parse(g.exportSave());
 const starterSave=parse(createGame(catalog,'')),base=structuredClone(starterSave);base.storage=[];base.party=[];base.dex={seen:[],owned:[]};base.items={};base.rng_state=[101,202,303,404];base.game.coins=0;base.game.quests=[];base.game.shopUnlocked=[];base.game.recruitmentClaims={};
 const requirements=reward=>({owned:reward.prerequisites.filter(p=>p.kind==='species').map(p=>p.species),cleared:reward.prerequisites.filter(p=>p.kind==='boss').map(p=>p.bossId)});
 const fixture=(reward,missing=-1)=>{const save=structuredClone(base);reward.prerequisites.forEach((p,i)=>{if(i===missing)return;if(p.kind==='species')save.dex.owned.push(p.species);else save.progress.bosses_cleared.push(p.bossId)});save.dex.seen=[...save.dex.owned];return save;};
 const make=save=>createGame(catalog,JSON.stringify(save));
 const view=(g,r)=>g.snapshot().quests.find(q=>q.id===r.questId);
 const reject=(g,action,label)=>{const before=g.exportSave();g.dispatch(action);assert.equal(g.exportSave(),before,label);};
 const rows=[];
 const converted=ACQUISITION_POLICIES.filter(row=>row.categories.some(category=>['paid','vip','lottery'].includes(category)));
 assert.equal(converted.length,113,'Every classified converted family is included in this source snapshot');
 for(const row of converted)assert(rewards.some(reward=>reward.rewardSpecies===row.species),`Converted family ${row.species} has a collection-essence task`);
 assert(rewards.length>=42);
 for(const old of buildPaidSPTRecruitments(catalog))assert(rewards.some(r=>r.questId===old.questId&&r.rewardSpecies===old.rewardSpecies));
 for(const reward of rewards){
  const {owned,cleared}=requirements(reward);
  assert(reward.prerequisites.length>0&&reward.prerequisites.length<=6);
  assert(owned.length>0,`${reward.questId}: collection gate`);
  assert.equal(new Set(reward.prerequisites.map(p=>p.kind==='species'?`s${p.species}`:`b${p.bossId}`)).size,reward.prerequisites.length);
  assert(owned.every(id=>id<reward.rewardSpecies),`${reward.questId}: directed earlier-family dependency`);
  assert.equal(recruitmentProgress(reward,owned,cleared).complete,true);
  for(let missing=0;missing<reward.prerequisites.length;missing++){
   const p=reward.prerequisites[missing],os=p.kind==='species'?owned.filter(id=>id!==p.species):owned,cs=p.kind==='boss'?cleared.filter(id=>id!==p.bossId):cleared;
   assert.equal(recruitmentProgress(reward,[...os,...os],[...cs,...cs,'boss_puni']).complete,false,`${reward.questId}: distinct condition ${missing}`);
  }
  // One controller rejection for each kind of gate; duplicate unrelated records cannot fill it.
  for(const kind of ['species','boss']){
   const missing=reward.prerequisites.findIndex(p=>p.kind===kind);if(missing<0)continue;
   const save=fixture(reward,missing);save.dex.owned.push(...save.dex.owned);save.progress.bosses_cleared.push(...save.progress.bosses_cleared,'boss_puni');
   const incomplete=make(save);assert.equal(view(incomplete,reward).complete,false,`${reward.questId}: missing ${kind}`);
   reject(incomplete,{type:'claimQuest',questId:reward.questId},`${reward.questId}: incomplete claim preserves complete save/RNG`);
  }
  const ready=make(fixture(reward));assert.equal(view(ready,reward).complete,true);assert.equal(view(ready,reward).claimable,true);
  const before=parse(ready),oldView=ready.snapshot(),oldViewBytes=JSON.stringify(oldView);
  ready.dispatch({type:'claimQuest',questId:reward.questId});const after=parse(ready);
  assert.equal(after.items[reward.itemId],1,`${reward.questId}: grant essence`);
  assert.deepEqual(after.storage,before.storage,`${reward.questId}: claim does not create a creature`);
  assert.deepEqual(after.party,before.party);assert.deepEqual(after.rng_state,before.rng_state);assert.deepEqual(after.dex,before.dex);
  assert.equal(after.game.recruitmentClaims[reward.questId],1);assert(after.game.shopUnlocked.includes(reward.itemId));
  assert.equal(after.game.coins,0);assert.equal(after.exp_pool,before.exp_pool);assert.equal(JSON.stringify(oldView),oldViewBytes,'Prior snapshot immutable');
  assert.equal(view(make(after),reward).claimCount,1,'Claim ledger survives reload');
  rows.push({questId:reward.questId,species:reward.rewardSpecies,conditionCount:reward.prerequisites.length,itemId:reward.itemId});
 }
 const reward=rewards.find(r=>r.repeatability==='unknown'&&catalog.species.find(s=>s.id===r.rewardSpecies).evolution.some(e=>e.method==='level'));
 assert(reward,'An unknown, evolving reward is available');
 const repeated=make(fixture(reward));
 for(let i=0;i<6;i++)repeated.dispatch({type:'claimQuest',questId:reward.questId});
 assert.equal(parse(repeated).items[reward.itemId],6);assert.equal(parse(repeated).game.recruitmentClaims[reward.questId],6);
 reject(repeated,{type:'claimQuest',questId:reward.questId},'Seventh reserved copy rejected without RNG/resource changes');
 const hatchBefore=parse(repeated);repeated.dispatch({type:'useItem',uid:'unused',itemId:reward.itemId});const hatchAfter=parse(repeated);
 assert.equal(hatchAfter.storage.length,1);assert.equal(hatchAfter.storage[0].species,reward.rewardSpecies);assert.equal(hatchAfter.items[reward.itemId],5);
 reject(repeated,{type:'claimQuest',questId:reward.questId},'One held plus five reserved remains six');
 repeated.dispatch({type:'cheatMonster',uid:hatchAfter.storage[0].uid,level:100});assert.notEqual(parse(repeated).storage[0].species,reward.rewardSpecies);
 repeated.dispatch({type:'claimQuest',questId:reward.questId});assert.equal(parse(repeated).items[reward.itemId],6);assert.equal(parse(repeated).game.recruitmentClaims[reward.questId],7,'Cap is current holdings rather than lifetime claims');
 assert.deepEqual(hatchBefore.storage,[]);
 // Old direct-creature quest saves become claimed/unlocked ledgers without granting another item.
 const old=buildPaidSPTRecruitments(catalog)[0],legacyReward=rewards.find(r=>r.questId===old.questId),legacy=fixture(legacyReward);
 delete legacy.game.recruitmentClaims;legacy.game.quests=[old.questId];legacy.game.shopUnlocked=[];
 const migrated=make(legacy),migratedSave=parse(migrated);
 assert(migratedSave.game.recruitmentClaims[old.questId]>=1);assert(migratedSave.game.shopUnlocked.includes(legacyReward.itemId));assert.equal(migratedSave.items[legacyReward.itemId]??0,0);
 assert.equal(parse(make(migratedSave)).game.recruitmentClaims[old.questId],migratedSave.game.recruitmentClaims[old.questId]);
 // No production source currently establishes a whole-family once limit. Inject that
 // source fact into the pure builder rather than falsely labeling a real creature once.
 const once=buildRecruitmentRewards(catalog,undefined,ACQUISITION_POLICIES.map(p=>p.species===reward.rewardSpecies?{...p,repeatability:'once'}:p)).find(r=>r.questId===reward.questId);
 assert(once);assert.equal(once.repeatable,false);assert.equal(once.repeatability,'once');
 reject(migrated,{type:'claimQuest',questId:'collection-recruitment-invalid'},'Unknown reward is a no-op');
 // Preserve the real official encounter and settlement path. Only the fixture's
 // starter attack is strengthened to finish the final named prerequisite in one turn.
 const battleReward=rewards.find(r=>r.prerequisites.filter(p=>p.kind==='boss').at(-1)?.bossId==='boss_spt_delasa');assert(battleReward);
 const lastBoss=battleReward.prerequisites.findIndex(p=>p.kind==='boss'&&p.bossId==='boss_spt_delasa');
 const battleCatalog=structuredClone(catalog),attack=battleCatalog.skills.find(s=>s.id===10001);assert(attack);attack.power=1000000;attack.accuracy=null;attack.priority=20;
 const battleSave=fixture(battleReward,lastBoss);battleSave.storage=structuredClone(starterSave.storage);battleSave.party=[...starterSave.party];battleSave.game.traits={};
 const battleGame=createGame(battleCatalog,JSON.stringify(battleSave));assert.equal(view(battleGame,battleReward).complete,false);
 battleGame.dispatch({type:'startBattle',bossId:'boss_spt_delasa'});assert(battleGame.snapshot().battle);assert.equal(view(battleGame,battleReward).complete,false);
 battleGame.dispatch({type:'move',skillId:10001});assert.equal(battleGame.snapshot().battle?.finished,true);assert.equal(battleGame.snapshot().battle?.won,true);
 assert(parse(battleGame).progress.bosses_cleared.includes('boss_spt_delasa'));assert.equal(view(battleGame,battleReward).complete,true);assert.equal(view(battleGame,battleReward).claimable,true);
 const won=parse(battleGame);battleGame.dispatch({type:'claimQuest',questId:battleReward.questId});const claimed=parse(battleGame);
 assert.deepEqual(claimed.storage,won.storage);assert.deepEqual(claimed.rng_state,won.rng_state);assert.equal(claimed.game.coins,won.game.coins);assert.equal(claimed.items[battleReward.itemId],(won.items[battleReward.itemId]??0)+1);
 assert.equal(view(createGame(battleCatalog,battleGame.exportSave()),battleReward).complete,true,'Settled named clear survives reload');
 assert.equal(JSON.stringify(catalog),original,'Source catalog unchanged');
 const report={checks:['all unified mixed conditions <=6','duplicate/unrelated records cannot replace a gate','claim grants one essence only and no RNG/collection change','claim ledger and old quest migration','six held+reserved copies; evolution releases a slot','source-injected once policy','real final named-SPT victory completes the mixed gate and unlocks an essence-only claim','catalog and snapshot immutability'],rewardCount:rewards.length,controlledBattle:{bossId:'boss_spt_delasa',questId:battleReward.questId,testOnlySkillOverride:{id:10001,power:1000000,accuracy:null,priority:20}},rows};
 fs.mkdirSync('artifacts/acquisition-v32',{recursive:true});fs.writeFileSync('artifacts/acquisition-v32/recruitment-controller.json',JSON.stringify(report,null,2)+'\n');
 console.log(`Verified ${rewards.length} unified essence rewards, mixed gates, claim migration and bounded repetition.`);
}finally{await server.close();delete globalThis.localStorage;}
