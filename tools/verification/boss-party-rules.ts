import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {partyRules} from '../../battle/core/src/index.ts';
import {createGame} from '../../src/kernel/game.ts';
import type {GameController} from '../../src/kernel/contract.ts';
import {loadCatalog} from '../../src/domain/catalog/catalog.ts';
import {STARTER_LEVEL,STARTER_SPECIES} from '../../src/domain/economy.ts';
import {findChallengeLocation,resolveWorldLocation} from '../../src/domain/world/world.ts';
import {newSave} from '../../src/kernel/save.ts';
import {challengeDetail,challengeEntries,challengeRows} from '../../src/features/challenges/challenge-center.ts';
import BraveTower from '../../src/features/challenges/ui/BraveTower.tsx';
import ChallengeCenter from '../../src/features/challenges/ui/ChallengeCenter.tsx';
import {buildWorldDialogue,buildWorldScene} from '../../src/features/world/world-scene.ts';
import {WorldDialogue} from '../../src/features/world/ui/WorldDialogue.tsx';
import {suite} from './_harness.mjs';

// Boss party rules through the real controller: the refusal notice of each rule kind, and the rules stated in the
// challenge archive, the Boss world dialogue and the Brave Tower panel before the start.
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
t.check('The Mystery Realm 谱尼 starts on a fresh journey once the party meets its rule: no Tower floor is required',()=>{
  const ready=journey(source,[300,503,1000]);
  for(const uid of ready.snapshot().party)ready.dispatch({type:'cheatMonster',uid,level:100});
  assert.equal(ready.snapshot().braveTower.highestCleared,0);
  const result=ready.dispatch({type:'startBattle',bossId:'boss_tower_brave_mystery'});
  assert.equal(result.ok,true,result.notice);assert.equal(ready.snapshot().battle?.party.length,6);
});
t.check('A party that meets the rule starts the battle',()=>{
  const single=journey(source);
  for(const uid of single.snapshot().party.slice(1))single.dispatch({type:'party',uid,add:false});
  assert.equal(single.dispatch({type:'startBattle',bossId:'boss_buleike'}).ok,true);assert.equal(single.snapshot().battle?.party.length,1);
});

const game=journey(source),s=game.snapshot(),entries=challengeEntries(s);
const stated:Record<string,string[]>={
  boss_buleike:['只能派 1 只精灵出战。'],boss_spt_ruiersi:['只能派 1 只精灵出战。'],
  boss_tower_brave_mystery:['至少要派 6 只精灵出战。','出战精灵等级至少 100 级。'],boss_spt_saiweier:[],
  boss_gaia:['只能派 1 只精灵出战。'],
};
t.check('The challenge archive detail states each Boss party rule before the start',()=>{
  for(const [id,rules] of Object.entries(stated))assert.deepEqual(challengeDetail(entries.find(entry=>entry.id===id)!,s,false).rules,rules,id);
  const ruled=source.bosses.filter((boss:any)=>partyRules(boss).length);
  for(const boss of ruled)assert.equal(s.bosses.find(view=>view.id===boss.id)!.partyRuleTexts?.length,partyRules(boss).length,boss.id);
  assert.equal(ruled.length,17,'Bulaike, Ruiersi, Gaia, the five Rei trainings, the Mystery Realm and the seven seals and body of Puni carry party rules');
});
t.check('The challenge archive renders the selected Boss party rules as a 挑战条件 block, and none for a Boss without them',()=>{
  // The archive opens on a tab's first row, so a fixture gives that row a team-size rule.
  const first=challengeRows(entries,'spt','')[0]!,render=(c:GameController)=>
    renderToStaticMarkup(createElement(ChallengeCenter,{c,initialCategory:'spt',onTravel(){}}));
  assert.equal(first.partyRuleTexts,undefined,`${first.id} carries no party rule`);
  const plain=render(game);assert(plain.includes(`<h3>${first.name}</h3>`),'The archive shows the first row');
  assert(!plain.includes('挑战条件'),`${first.id}: no rules block without party rules`);
  const ruled=structuredClone(source),boss=ruled.bosses.find((row:any)=>row.id===first.id);
  boss.rules=[...boss.rules??[],{rule:'player_team_size',max:1}];
  assert(render(journey(ruled)).includes('<strong>挑战条件</strong><p>只能派 1 只精灵出战。</p>'),`${first.id}: the archive shows the rule`);
});
t.check('The Boss world dialogue states the party rule before the start',()=>{
  for(const id of ['boss_buleike','boss_spt_ruiersi']){
    const destination=findChallengeLocation(s.bosses.find(boss=>boss.id===id)!),{planet,region}=resolveWorldLocation(destination.planetId,destination.regionId);
    const view=buildWorldDialogue(s,buildWorldScene(s,planet,region,id),{kind:'boss',id})!;
    assert.deepEqual(view.partyRuleTexts,stated[id],id);
    const markup=renderToStaticMarkup(createElement(WorldDialogue,{view,showDetails:false,c:game,onClose(){},onToggleDetails(){},onChooseStart(){}}));
    assert(markup.includes('挑战条件：只能派 1 只精灵出战。'),`${id}: the dialogue shows the rule`);
  }
});
t.check('The Brave Tower panel states the Mystery Realm 谱尼 party rules on the row that starts it',()=>{
  const id='boss_tower_brave_mystery',html=renderToStaticMarkup(createElement(BraveTower,{c:game,onEnter(){}}));
  const row=html.match(new RegExp(`<div class="tower-resume tower-side-challenge" data-tower-side="${id}">.*?</button></div>`))?.[0];
  assert(row?.includes('开始挑战'),'the panel offers the row that starts the fight');
  assert(row.includes(`<span>挑战条件：${stated[id].join('')}</span>`),row);
});
t.finish({stated});
