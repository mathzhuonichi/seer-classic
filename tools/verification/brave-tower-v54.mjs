/** V54 tower entry, explicit rewards and acquisition routes through actual controllers. */
import assert from 'node:assert/strict';
import {suite,withSsr} from './_harness.mjs';

const limits=[
  'Tower opponents and Rios have 1 HP in an in-memory fixture; actual moves, rules, AI and settlement run unchanged.',
  'First-clear essence and suit limits are the V54 remake contract. Historical repeatability of the two pet rewards remains unverified.',
  'No browser storage or network is read. Persistence writes are discarded; no game build or package is produced.',
];
const witnesses=[];
let isolation;
const parse=game=>JSON.parse(game.exportSave());
const floorId=floor=>`boss_tower_brave_f${String(floor).padStart(3,'0')}`;
let storageReads=0,storageWrites=0,networkRequests=0;
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>{storageReads++;return null;},setItem:()=>{storageWrites++;},removeItem:()=>{}}});
globalThis.fetch=()=>{networkRequests++;throw new Error('Tower verification must not make HTTP requests.');};
await withSsr('brave-tower-v54',async load=>{
  const t=suite('brave-tower-v54'),{check}=t;
  const [{createGame},{loadCatalog},{makeDex,createMonster},{buildAcquisitionIndex},{buildRecruitmentRewards},{Rng}]=await Promise.all([
    load('/src/kernel/game.ts'),load('/src/domain/catalog/catalog.ts'),load('/raising/core/index.ts'),
    load('/src/domain/acquisition/acquisition.ts'),load('/src/domain/acquisition/recruitment.ts'),load('/battle/core/src/rng.ts'),
  ]);
  const original=await loadCatalog(),originalBytes=JSON.stringify(original),catalog=structuredClone(original);
  for(const boss of catalog.bosses)if(/^boss_tower_brave_f\d{3}$/.test(boss.id)||boss.id==='boss_spt_liaosi')for(const mon of boss.team)mon.hp_override=1;
  const catalogBytes=JSON.stringify(catalog),dex=makeDex(catalog),rng=new Rng(54),FAST=10166;
  const base=parse(createGame(catalog,''));
  base.storage=Array.from({length:6},(_,index)=>{
    const mon=createMonster(dex,70,100,rng,{uid:`tower-v54-${index}`,iv:31,nature:'hardy'});
    mon.skills=[FAST];mon.pp={[FAST]:dex.skill(FAST).pp};return mon;
  });
  base.party=base.storage.map(mon=>mon.uid);base.game.traits={};base.game.modules={};base.game.engravingStock={};base.rng_state=[54,108,162,216];
  const fixture=(highestCleared=0,resumeFloor=1)=>{const save=structuredClone(base);save.game.braveTower={highestCleared,resumeFloor};return save;};
  const make=(save=base,data=catalog)=>createGame(data,JSON.stringify(structuredClone(save)));
  function reject(game,action){
    const before=game.exportSave(),battle=JSON.stringify(game.snapshot().battle);
    assert.equal(game.dispatch(action).ok,false,'rejection reports failure; the shell opens the tower only on success');
    assert.equal(game.exportSave(),before,'rejection preserves the save');assert.equal(JSON.stringify(game.snapshot().battle),battle,'rejection preserves battle');
  }
  function win(game,floor){
    game.dispatch(typeof floor==='number'?{type:'startTower',floor}:{type:'startBattle',bossId:floor});
    assert(game.snapshot().battle&&!game.snapshot().battle.finished,JSON.stringify(game.snapshot().notices));
    let actions=0;
    while(!game.snapshot().battle.finished&&actions++<45){
      const battle=game.snapshot().battle;
      if(battle.needsSwitch||!battle.player.skills.some(skill=>skill.id===FAST&&skill.pp>0)){
        const next=battle.party.find(mon=>mon.uid!==battle.player.uid&&!mon.fainted&&mon.skills.some(skill=>skill.id===FAST&&skill.pp>0));
        assert(next,'a fresh fighter remains');game.dispatch({type:'switch',uid:next.uid});
      }else game.dispatch({type:'move',skillId:FAST});
    }
    const battle=game.snapshot().battle;assert.equal(battle.finished,true,'bounded actual battle');assert.equal(battle.won,true,battle.result);
    witnesses.push({floor,turns:battle.turn,opponents:battle.enemyParty.length,result:battle.result});
    game.dispatch({type:'closeBattle'});assert.equal(game.snapshot().battle,null);
    return battle.result;
  }

  check('Entering an unlocked floor changes only the saved location, without healing or starting combat',()=>{
    const save=fixture(16,17);save.storage[0].hp=1;save.storage[0].pp[FAST]=2;
    const game=make(save),before=parse(game);assert.equal(game.dispatch({type:'enterTower',floor:11}).ok,true);
    const expected=structuredClone(before);expected.game.braveTower.resumeFloor=11;
    assert.deepEqual(parse(game),expected);assert.equal(game.snapshot().battle,null);
    assert.deepEqual(parse(make(parse(game))),expected,'entry survives reconstruction');
    game.dispatch({type:'enterTower',floor:11});assert.deepEqual(parse(game),expected,'reentry is idempotent');
    const exhausted=fixture(16,17);exhausted.storage.forEach(mon=>mon.hp=0);
    const empty=make(exhausted);empty.dispatch({type:'enterTower',floor:11});assert.equal(parse(empty).game.braveTower.resumeFloor,11);assert(empty.snapshot().monsters.every(mon=>mon.hp===0));
    reject(empty,{type:'startTower',floor:11});
  });
  check('Entry guards reject invalid, locked, missing and active-battle floors atomically',()=>{
    const game=make();for(const floor of [0,2,11,70,71,1.5,NaN,Infinity,'1',undefined])reject(game,{type:'enterTower',floor});
    const missing=structuredClone(catalog);missing.bosses=missing.bosses.filter(boss=>boss.id!==floorId(11));
    reject(make(fixture(10,11),missing),{type:'enterTower',floor:11});
    const active=make(fixture(16,17));active.dispatch({type:'startTower',floor:17});assert(active.snapshot().battle);
    reject(active,{type:'enterTower',floor:11});reject(active,{type:'startBattle',bossId:floorId(70)});
  });
  check('Floor 1 grants exactly 10 beans per win and never an invented opponent essence',()=>{
    const game=make(),before=parse(game);win(game,1);assert.equal(parse(game).game.coins,before.game.coins+10);
    assert.equal(parse(game).items.item_seer_beans,undefined);assert(!Object.keys(parse(game).items).some(id=>id.startsWith('essence_boss_tower_brave_f')));
    win(game,1);assert.equal(parse(game).game.coins,before.game.coins+20);assert.equal(parse(game).items.item_seer_beans,undefined);
  });
  check('The floor-30 suit is visible and unique; beans remain repeatable and the shop cannot pre-grant it',()=>{
    const game=make(fixture(29,30)),before=parse(game).game.coins;
    assert(!game.snapshot().shopItems.some(item=>['item_suit_flash','item_gacha_coin'].includes(item.id)));
    reject(game,{type:'buyItem',itemId:'item_suit_flash',quantity:1});reject(game,{type:'buyItem',itemId:'item_gacha_coin',quantity:1});
    win(game,30);assert.equal(parse(game).items.item_suit_flash,1);assert.equal(parse(game).game.coins,before+300);
    assert(game.snapshot().items.some(item=>item.id==='item_suit_flash'&&item.count===1));
    const repeat=make(parse(game));for(let floor=21;floor<=30;floor++)win(repeat,floor);
    assert.equal(parse(repeat).items.item_suit_flash,1);assert.equal(parse(repeat).game.coins,before+300+2550);
    assert.equal(repeat.snapshot().braveTower.milestones.find(row=>row.floor===30).cleared,true);
    reject(repeat,{type:'buyItem',itemId:'item_suit_flash',quantity:1});
  });
  check('Floor 60 awards Ken once, hatches species 141 and evolves to 142 at level 30',()=>{
    const game=make(fixture(59,60)),before=parse(game).game.coins;win(game,60);
    assert.equal(parse(game).items.essence_ken,1);assert.equal(parse(game).game.coins,before);
    game.dispatch({type:'useItem',itemId:'essence_ken',uid:game.snapshot().party[0]});
    const ken=game.snapshot().monsters.find(mon=>mon.species===141);assert(ken,'the reward hatches Ken');
    assert.equal(game.snapshot().monsters.some(mon=>mon.species===617),false,'no Kenpede mix-up');
    assert.deepEqual(catalog.species.find(mon=>mon.id===141).evolution,[{to:142,method:'level',level:30}]);
    game.dispatch({type:'cheatMonster',uid:ken.uid,level:30});
    assert.equal(game.snapshot().monsters.find(mon=>mon.uid===ken.uid).species,142);
    const repeat=make(parse(game));for(let floor=51;floor<=60;floor++)win(repeat,floor);
    assert.equal(parse(repeat).items.essence_ken??0,0,'repeating does not replace the consumed first-clear essence');
    assert.equal(repeat.snapshot().braveTower.milestones.find(row=>row.floor===60).cleared,true);
    assert(repeat.snapshot().braveTower.honors.includes('称号：勇者'));
  });
  check('Floor 70 awards Daidaiyong once and the completed tower cannot award a floor 71',()=>{
    const game=make(fixture(69,70)),before=parse(game).game.coins;win(game,70);
    assert.equal(parse(game).items.essence_daidaiyong,1);assert.equal(parse(game).game.coins,before);assert.equal(parse(game).game.braveTower.resumeFloor,null);
    const repeat=make(parse(game));for(let floor=61;floor<=70;floor++)win(repeat,floor);
    assert.equal(parse(repeat).items.essence_daidaiyong,1);reject(repeat,{type:'enterTower',floor:71});reject(repeat,{type:'startTower',floor:71});
    repeat.dispatch({type:'useItem',itemId:'essence_daidaiyong',uid:repeat.snapshot().party[0]});assert(repeat.snapshot().monsters.some(mon=>mon.species===366));
  });
  check('Supply rewards use the explicit item counts and do not also pay a generic 500 beans',()=>{
    const game=make(fixture(9,10)),before=parse(game);win(game,10);
    assert.equal(parse(game).items.item_potion_hp_100,(before.items.item_potion_hp_100??0)+2);assert.equal(parse(game).game.coins,before.game.coins);
    const six=make(fixture(5,6)),coins=parse(six).game.coins;win(six,6);
    assert.equal(parse(six).items.item_gacha_coin,1);assert.equal(parse(six).game.coins,coins+60);assert(six.snapshot().items.some(item=>item.id==='item_gacha_coin'));
    const noReward=make(fixture(50,51)),emptyBefore=parse(noReward);win(noReward,51);
    assert.equal(parse(noReward).game.coins,emptyBefore.game.coins);assert.deepEqual(parse(noReward).items,emptyBefore.items);
  });
  check('A full six-copy allowance records the clear without promising another first-clear claim',()=>{
    for(const [floor,item] of [[60,'essence_ken'],[70,'essence_daidaiyong']]){
      const save=fixture(floor-1,floor);save.items[item]=6;
      const game=make(save),result=win(game,floor);
      assert.equal(parse(game).items[item],6);assert(parse(game).progress.bosses_cleared.includes(floorId(floor)));
      assert.match(result,/本次未增加精元/);assert.doesNotMatch(result,/腾出额度后|再领/);
      assert.equal(game.snapshot().braveTower.milestones.find(row=>row.floor===floor).cleared,true);
    }
  });
  check('An explicit first_clear flag suppresses repeat currency without changing the static catalog',()=>{
    const data=structuredClone(catalog);data.bosses.find(boss=>boss.id===floorId(1)).reward.first_clear=true;
    const game=make(base,data),coins=parse(game).game.coins;win(game,1);win(game,1);assert.equal(parse(game).game.coins,coins+10);
    assert.equal(data.bosses.find(boss=>boss.id===floorId(1)).reward.items.item_seer_beans,10);
  });
  check('Reward descriptions and honors reflect explicit data and exact legacy clears',()=>{
    const game=make();assert.deepEqual(game.snapshot().braveTower.milestones.map(row=>[row.floor,row.species,row.name,row.cleared]),[[30,undefined,'闪光套装',false],[60,141,'肯',false],[70,366,'呆呆蛹',false]]);
    assert.match(game.snapshot().bosses.find(boss=>boss.id===floorId(60)).rewardText,/肯精元.*30级进化为肯扎特/);
    assert.match(game.snapshot().bosses.find(boss=>boss.id===floorId(70)).rewardText,/呆呆蛹精元/);
    const legacy=fixture();delete legacy.game.braveTower;legacy.progress.bosses_cleared=[floorId(60)];
    const old=make(legacy);assert.deepEqual(old.snapshot().braveTower.honors,['勇者之塔（五）','称号：勇者']);
    assert.deepEqual(old.snapshot().braveTower.milestones.map(row=>[row.floor,row.cleared]),[[30,false],[60,true],[70,false]]);
    assert.equal(parse(old).items.essence_ken,undefined,'loading a legacy clear never invents a reward claim');
  });
  check('Acquisition routes keep the two explicit pet rewards and remove ordinary-floor ghost essences',()=>{
    const index=buildAcquisitionIndex(original);
    assert(![...index.values()].some(entry=>entry.routes.some(route=>route.bossId===floorId(1))));
    assert(index.get(141).routes.some(route=>route.bossId===floorId(60)));assert(index.get(366).routes.some(route=>route.bossId===floorId(70)));
    const species=original.species.filter(mon=>[1,141].includes(mon.id)),plain={...original.bosses.find(boss=>boss.id===floorId(1)),team:[{species:141}]};
    assert(buildRecruitmentRewards({species,bosses:[plain],items:[]},[]).some(row=>row.rewardSpecies===141),'a plain tower enemy cannot suppress a missing acquisition route');
    const explicit=original.bosses.find(boss=>boss.id===floorId(60));
    assert(!buildRecruitmentRewards({species,bosses:[explicit],items:[]},[]).some(row=>row.rewardSpecies===141),'explicit Ken reward remains a native acquisition route');
  });
  check('Ordinary SPT settlement retains its existing 500-bean grant',()=>{
    const game=make(),before=parse(game);win(game,'boss_spt_liaosi');assert.equal(parse(game).game.coins,before.game.coins+500);assert.deepEqual(parse(game).game.braveTower,before.game.braveTower);
  });
  check('Verification neither reads browser storage nor fetches data, and leaves catalog inputs unchanged',()=>{
    assert.equal(storageReads,0);assert.equal(networkRequests,0);assert.equal(JSON.stringify(original),originalBytes);assert.equal(JSON.stringify(catalog),catalogBytes);
    isolation={storageReads,discardedStorageWrites:storageWrites,networkRequests};
  });
  t.finish({limits,isolation,witnesses});
});
