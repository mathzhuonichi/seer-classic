import assert from 'node:assert/strict';
import {createGame} from '../../src/kernel/game.ts';
import type {CatalogData} from '../../src/domain/catalog/catalog.ts';
import {loadCatalogNode} from '../catalog.mjs';
// Ordinary capsules and supplies are unlimited (V50): a use spends the turn and leaves the finite stock as it was.
const source=loadCatalogNode();
/** A new journey seeds itself from the clock; pinning its RNG state makes every hit and capture roll repeatable. */
const JOURNEY_RNG_STATE=[0x0ca97,0x5eed,0x3,0x5ee4];
const journey=JSON.parse(createGame(structuredClone(source) as CatalogData).exportSave());journey.rng_state=JOURNEY_RNG_STATE;
const start=(catalog:CatalogData)=>createGame(catalog,JSON.stringify(journey));
const fresh=()=>start(structuredClone(source) as CatalogData);
const game=fresh(), initial=game.snapshot(), capsule='item_capsule_master', stock=initial.items.find(i=>i.id===capsule)!.count;
// Ten held recovery supplies plus the unlimited trainer-tier HP250 at zero stock.
assert.equal(initial.items.filter(i=>i.battleCategory==='recovery').length,11);
assert.equal(initial.items.filter(i=>i.battleCategory==='capsule').length,7);
assert.equal(initial.items.filter(i=>i.battleCategory==='status').length,1);
game.dispatch({type:'startTraining',species:22,level:3});
assert(game.snapshot().battle!.canCapture);
const enemy=game.snapshot().battle!.enemy, before=game.exportSave();
game.dispatch({type:'capture',itemId:capsule});
const caught=game.snapshot();
assert(caught.battle!.captured&&caught.battle!.finished&&caught.battle!.won);
assert.equal(caught.items.find(i=>i.id===capsule)!.count,stock);
const added=caught.monsters.find(m=>!initial.monsters.some(old=>old.uid===m.uid))!;
assert.equal(added.species,22);assert.equal(added.level,enemy.level);assert.equal(added.hp,enemy.hp);assert(caught.party.includes(added.uid));
assert(caught.battle!.animation.frames.some(f=>f.kind==='capture'&&f.side===1&&f.captureSuccess));
assert(caught.battle!.log.some(line=>line.includes('毛毛')&&line.includes('成功捕捉')));
assert.equal(caught.coins,initial.coins);assert.equal(caught.expPool,initial.expPool);
const reloaded=createGame(structuredClone(source),game.exportSave());assert(reloaded.snapshot().monsters.some(m=>m.uid===added.uid));
assert.equal(reloaded.snapshot().items.find(i=>i.id===capsule)!.count,stock);
const full=createGame(structuredClone(source),before);
for(const species of [13,16,19])full.dispatch({type:'cheatAcquire',species,level:3});
assert.equal(full.snapshot().party.length,6);const oldUids=full.snapshot().monsters.map(m=>m.uid);
full.dispatch({type:'startTraining',species:22,level:3});full.dispatch({type:'capture',itemId:capsule});
assert(full.snapshot().monsters.some(m=>!oldUids.includes(m.uid)&&m.species===22&&!m.inParty));
const boss=fresh();boss.dispatch({type:'startBattle',bossId:source.bosses.find((b:any)=>b.name.zh==='蘑菇怪').id});
assert.equal(boss.snapshot().battle!.canCapture,false);const bossItems=boss.snapshot().items.find(i=>i.id===capsule)!.count;
boss.dispatch({type:'capture',itemId:capsule});assert.equal(boss.snapshot().items.find(i=>i.id===capsule)!.count,bossItems);assert(boss.snapshot().notices[0].includes('不可捕捉'));
const ko=fresh();ko.dispatch({type:'cheatMonster',uid:ko.snapshot().party[0],level:100,traitId:null});ko.dispatch({type:'startTraining',species:22,level:3});
const attack=ko.snapshot().battle!.player.skills.find(s=>s.category!=='属性')!;ko.dispatch({type:'move',skillId:attack.id});assert(ko.snapshot().battle!.finished);assert.equal(ko.snapshot().monsters.length,3);
// Zero catch rate yields a deterministic failed capsule attempt and real opponent action.
const failureData=structuredClone(source);failureData.species.find((s:any)=>s.id===22).catch_rate=0;
const failure=start(failureData);failure.dispatch({type:'startTraining',species:22,level:3});failure.dispatch({type:'capture',itemId:'item_capsule_basic'});
const failed=failure.snapshot().battle!;
assert(!failed.finished);assert.equal(failed.turn,1);assert(failed.animation.frames.some(f=>f.kind==='capture'&&f.side===1&&!f.captureSuccess));
assert.equal(failure.snapshot().items.find(i=>i.id==='item_capsule_basic')!.count,stock);assert.equal(JSON.parse(failure.exportSave()).items.item_capsule_basic,stock);
assert.equal(failure.snapshot().monsters.length,3);assert(failed.log.some(l=>l.includes('挣脱')));
// Exercise the authored cure supply against a real status applied by the battle engine.
const statusData=structuredClone(source),poison=statusData.skills.find((s:any)=>s.name.zh==='毒粉');
poison.accuracy=null;statusData.species.find((s:any)=>s.id===22).learnset=[{level:1,skill:poison.id}];
const statusGame=start(statusData),lead=statusGame.snapshot().party[0];
statusGame.dispatch({type:'cheatMonster',uid:lead,level:50,traitId:null});statusGame.dispatch({type:'startTraining',species:22,level:3});
const defend=statusGame.snapshot().battle!.player.skills.find(s=>s.category==='属性')!;
statusGame.dispatch({type:'move',skillId:defend.id});assert(statusGame.snapshot().battle!.player.statuses.includes('中毒'));
statusGame.dispatch({type:'battleItem',itemId:'item_status_cure',targetUid:lead});
assert.equal(statusGame.snapshot().items.find(i=>i.id==='item_status_cure')!.count,stock);
assert(statusGame.snapshot().battle!.log.some(l=>l.includes('中毒')&&l.includes('已解除')));
console.log(JSON.stringify({passed:[
  'three item categories','capture transfers level/HP and party placement','unlimited capsule keeps its stock across a save roundtrip',
  'full-party storage placement','boss capture rejection without consumption','ordinary knockout does not acquire',
  'failed capture spends the turn without ending the battle or consuming stock','status-cure item removes actual poison',
],species:22}));
