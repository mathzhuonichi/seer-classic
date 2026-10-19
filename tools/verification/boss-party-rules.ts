import assert from 'node:assert/strict';
import {createGame} from '../../src/kernel/game.ts';
import type {GameController} from '../../src/kernel/contract.ts';
import {loadCatalog} from '../../src/domain/catalog/catalog.ts';
import {STARTER_LEVEL,STARTER_SPECIES} from '../../src/domain/economy.ts';
import {newSave} from '../../src/kernel/save.ts';
import {suite} from './_harness.mjs';

// Boss party rules through the real controller: the refusal notice of each rule kind.
const t=suite('boss-party-rules');
const SEED=0x9a27e,REI=70,FIXTURE_BOSS='boss_spt_saiweier',FIXTURE_LEVEL_CAP=50;
const ADJUST='请在精灵背包中调整出战精灵后再挑战。';
const source=await loadCatalog() as any;
const fixture=structuredClone(source);
fixture.bosses.find((boss:any)=>boss.id===FIXTURE_BOSS).rules=[
  {rule:'player_level_cap',level:FIXTURE_LEVEL_CAP},{rule:'script',id:'require_player_species',params:{species:[REI]}},
];

/** A new journey with the three starters, plus `extra` members at Lv.100. */
function journey(catalog:any,extra:number[]=[]){
  const game=createGame(structuredClone(catalog),JSON.stringify(newSave(SEED)));
  for(const species of STARTER_SPECIES)game.dispatch({type:'cheatAcquire',species,level:STARTER_LEVEL});
  for(const species of extra)game.dispatch({type:'cheatAcquire',species,level:100});
  return game;
}
function refused(game:GameController,bossId:string){
  const attempts=JSON.parse(game.exportSave()).progress.boss_attempts[bossId];
  const result=game.dispatch({type:'startBattle',bossId});
  assert.equal(result.ok,false,`${bossId} must refuse this party`);assert.equal(game.snapshot().battle,null);
  assert.equal(JSON.parse(game.exportSave()).progress.boss_attempts[bossId],attempts,'A refused start records no attempt');
  return result.notice;
}

t.check('Each party rule kind refuses the start through the controller with its Chinese reason',()=>{
  const starters=journey(source);assert.equal(starters.snapshot().party.length,3);
  for(const bossId of ['boss_buleike','boss_spt_ruiersi'])assert.equal(refused(starters,bossId),`本挑战只能派 1 只精灵出战（当前队伍 3 只）。${ADJUST}`);
  assert.equal(refused(starters,'boss_tower_brave_mystery'),`本挑战至少要派 6 只精灵出战（当前队伍 3 只）；出战精灵等级至少 100 级（3 只未达到）。${ADJUST}`);
  const full=journey(source,[300,503,1000]);
  for(const uid of full.snapshot().party.slice(0,2))full.dispatch({type:'cheatMonster',uid,level:100});
  assert.equal(refused(full,'boss_tower_brave_mystery'),`本挑战出战精灵等级至少 100 级（1 只未达到）。${ADJUST}`);
  const mixed=journey(fixture,[REI]),rei=source.species.find((species:any)=>species.id===REI).name.zh;
  assert.equal(refused(mixed,FIXTURE_BOSS),`本挑战出战精灵等级不超过 ${FIXTURE_LEVEL_CAP} 级（1 只超过）；只能派${rei}出战（3 只不符合）。${ADJUST}`);
});
t.check('A party that meets the rule starts the battle',()=>{
  const single=journey(source);
  for(const uid of single.snapshot().party.slice(1))single.dispatch({type:'party',uid,add:false});
  assert.equal(single.dispatch({type:'startBattle',bossId:'boss_buleike'}).ok,true);assert.equal(single.snapshot().battle?.party.length,1);
});

t.finish({});
