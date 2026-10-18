/** V58 decision 5: trainer battles show the opposing HP bar and damage numbers but never the opposing HP numbers. */
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}});
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',logLevel:'error'});
const checks=[],report={checks};
const check=(name,run)=>{run();checks.push(name)};
try{
  const [{loadCatalog},{createGame},{Rng},{createBattle,buildDataSet},{createFacilityEncounter},{npcTrainingScripts},{battleEventText},{default:Battle}]=await Promise.all([
    '/src/domain/catalog/catalog.ts','/src/kernel/game.ts','/battle/core/src/rng.ts','/battle/core/src/index.ts','/src/domain/challenges/battle-facilities.ts','/src/domain/challenges/npc-training-scripts.ts','/src/features/battle/battle-log.ts','/src/features/battle/ui/Battle.tsx',
  ].map(file=>server.ssrLoadModule(file)));
  const catalog=await loadCatalog(),data=buildDataSet(catalog);
  const seed=createGame(catalog,'');
  for(const uid of seed.snapshot().party)seed.dispatch({type:'cheatMonster',uid,level:100});
  const save=JSON.parse(seed.exportSave()),rngState=[...new Rng(20261016).s];save.rng_state=rngState;
  const make=()=>createGame(catalog,JSON.stringify(save));
  const render=game=>renderToStaticMarkup(React.createElement(Battle,{c:game}));
  /** Drive ordinary moves, switching on knockouts, and collect every presentation frame and snapshot. */
  function play(game,turns=12){
    const frames=[],snapshots=[game.snapshot().battle];
    for(let i=0;i<turns&&!game.snapshot().battle.finished;i++){
      const b=game.snapshot().battle;
      if(b.needsSwitch){const next=b.party.find(mon=>mon.hp>0&&mon.uid!==b.player.uid);if(!next)break;game.dispatch({type:'switch',uid:next.uid});}
      else{const skill=b.player.skills.find(row=>row.pp>0&&row.power>0)??b.player.skills.find(row=>row.pp>0);game.dispatch({type:'move',skillId:skill?.id??0});}
      const after=game.snapshot().battle;frames.push(...after.animation.frames);snapshots.push(after);
    }
    return {frames,snapshots,battle:game.snapshot().battle};
  }
  const foeViews=({frames,snapshots})=>[...snapshots.flatMap(b=>[b.enemy,...b.enemyParty]),...frames.flatMap(f=>[f.enemy,...f.enemyParty])];
  const hits=(frames,side)=>frames.filter(f=>f.kind==='hit'&&f.side===side&&f.amount>0);

  // Rebuild the facility roster from the same RNG state to learn the true opposing HP the views must not carry.
  const encounter=createFacilityEncounter(catalog,'random',new Rng(rngState));
  const truth=createBattle({data,scripts:npcTrainingScripts,seed:97,sides:[{kind:'player',team:[{species:1,level:100,skills:[10001]}]}],encounter}).sides[1].team.map(mon=>mon.maxHp);
  const trainer=make();trainer.dispatch({type:'startFacility',facilityId:'random'});
  assert(trainer.snapshot().battle,trainer.snapshot().notices[0]);
  const trainerStart=trainer.snapshot().battle;
  check('The reconstructed facility roster matches the controller battle',()=>{
    assert.deepEqual(trainerStart.enemyParty.map(mon=>mon.species),encounter.team.map(mon=>mon.species));
    assert(truth.every(hp=>hp>100),'Lv100 maximum HP is distinguishable from the 0-100 bar scale');
  });
  const startHtml=render(trainer);
  const trainerRun=play(trainer);
  check('Trainer battle: every opposing view carries only the bar ratio, never current or maximum HP',()=>{
    const views=foeViews(trainerRun);assert(views.length>12);
    for(const view of views){
      assert.equal(view.hpHidden,true);assert.equal(view.maxHp,100);assert(Number.isInteger(view.hp)&&view.hp>=0&&view.hp<=100);
      assert.equal(view.hp>0,!view.fainted,'the bar ratio stays above zero exactly while the monster can fight');
    }
    for(const frame of trainerRun.frames){assert.equal(frame.enemyHp,frame.enemy.hp,'frame bar value is the same ratio');assert(frame.enemyHp<=100);}
    assert(trainerStart.enemyParty.every(mon=>mon.hp===100),'full HP shows a full bar');
    assert(views.some(view=>view.hp>0&&view.hp<100),'damage moves the bar');
    for(const b of trainerRun.snapshots)for(const mon of [...b.party,b.player])assert.equal(mon.hpHidden,undefined,'the player side keeps its HP numbers');
  });
  check('Trainer battle: damage numbers remain for both sides while opposing remaining HP leaves frames and log',()=>{
    const foeHits=hits(trainerRun.frames,1);assert(foeHits.length>0,'the player damaged the trainer');
    for(const hit of foeHits){assert(hit.text.includes(`受到 ${hit.amount} 点伤害`));assert(!hit.text.includes('剩余体力'),hit.text);}
    for(const frame of trainerRun.frames.filter(f=>f.kind==='heal'&&f.side===1))assert(frame.text.includes(`恢复 ${frame.amount} 点体力`)&&!frame.text.includes('剩余体力'),frame.text);
    const log=trainerRun.battle.log.join('\n');
    assert(foeHits.some(hit=>log.includes(`受到 ${hit.amount} 点伤害`)));
    for(const max of new Set(truth))assert(!new RegExp(`剩余体力 \\d+/${max}(?!\\d)`).test(log),`log exposes an opposing maximum ${max}`);
    const allyHits=hits(trainerRun.frames,0);
    for(const hit of allyHits)assert(hit.text.includes(`受到 ${hit.amount} 点伤害`)&&/剩余体力 \d+\/\d+/.test(hit.text),hit.text);
    report.trainer={turns:trainerRun.battle.turn,foeHits:foeHits.map(hit=>hit.amount),allyHits:allyHits.length,finished:trainerRun.battle.finished};
  });
  check('Trainer battle: rendered opposing HP bar has no numbers and an accessible 0-100 value',()=>{
    const html=render(trainer),b=trainer.snapshot().battle;
    for(const markup of [startHtml,html]){
      const tracks=[...markup.matchAll(/<div class="classic-hp-track"[^>]*>.*?<\/div>/g)].map(match=>match[0]);assert.equal(tracks.length,2);
      assert(/<span>\d+ \/ \d+<\/span>/.test(tracks[0]),'the player bar keeps its numbers');
      assert(!tracks[1].includes('<span>'),'the opposing bar has no number text');assert(tracks[1].includes('aria-valuemax="100"'));assert(/style="width:\d+(\.\d+)?%"/.test(tracks[1]));
      for(const max of new Set(truth))assert(!markup.includes(`/ ${max}`)&&!markup.includes(`/${max}`),`markup exposes an opposing maximum ${max}`);
    }
    assert(html.includes(`aria-valuenow="${b.enemy.hp}"`));
    assert(/对手精灵队伍/.test(html)&&/HP \d+%/.test(html),'the opposing team list shows the bar ratio, not HP');
  });

  const boss=make();boss.dispatch({type:'startBattle',bossId:'boss_spt_liaosi'});
  assert(boss.snapshot().battle,boss.snapshot().notices[0]);
  const bossRun=play(boss,4);
  check('Boss battle is unchanged: absolute opposing HP in views, frames, log and markup',()=>{
    for(const view of foeViews(bossRun)){assert.equal(view.hpHidden,undefined);assert(view.maxHp>100);}
    const foeHits=hits(bossRun.frames,1);assert(foeHits.length>0);
    for(const hit of foeHits){assert.equal(hit.enemyHp,hit.enemy.hp);assert(hit.text.includes(`受到 ${hit.amount} 点伤害`)&&hit.text.includes(`剩余体力 ${hit.enemy.hp}/${hit.enemy.maxHp}`),hit.text);}
    const html=render(boss),b=boss.snapshot().battle;
    assert(html.includes(`<span>${b.enemy.hp} / ${b.enemy.maxHp}</span>`));assert(html.includes(`aria-valuemax="${b.enemy.maxHp}"`));
    report.boss={turns:b.turn,foeHits:foeHits.map(hit=>hit.amount)};
  });

  const wild=make();wild.dispatch({type:'startTraining',species:10,level:30});
  assert(wild.snapshot().battle,wild.snapshot().notices[0]);
  const wildRun=play(wild,1);
  check('Wild battle is unchanged: absolute opposing HP in views, frames, log and markup',()=>{
    assert(wildRun.snapshots[0].name.startsWith('野外遭遇'),wildRun.snapshots[0].name);
    for(const view of foeViews(wildRun))assert.equal(view.hpHidden,undefined);
    const foeHits=hits(wildRun.frames,1);assert(foeHits.length>0);
    for(const hit of foeHits)assert(hit.text.includes(`剩余体力 ${hit.enemy.hp}/${hit.enemy.maxHp}`),hit.text);
    assert(wildRun.battle.log.some(line=>line.includes(`剩余体力 ${foeHits[0].enemy.hp}/${foeHits[0].enemy.maxHp}`)));
    const start=wildRun.snapshots[0],fixed={...wild.snapshot(),battle:start};
    const html=renderToStaticMarkup(React.createElement(Battle,{c:{...wild,snapshot:()=>fixed}}));
    assert(html.includes(`<span>${start.enemy.hp} / ${start.enemy.maxHp}</span>`));
    report.wild={maxHp:start.enemy.maxHp,foeHits:foeHits.map(hit=>hit.amount)};
  });

  check('Log formatter: hidden opposing HP drops only the remaining-HP clause',()=>{
    const context=hide=>({data:{species:new Map(),skills:new Map(),items:new Map()},initialPlayer:{name:'我',hp:50,maxHp:80},initialEnemy:{name:'敌',hp:300,maxHp:400},hideEnemyHp:hide});
    const text=(event,hide)=>battleEventText(event,context(hide));
    assert.equal(text({type:'damage',side:1,amount:30,hp:270,maxHp:400},true),'敌受到 30 点伤害。');
    assert.equal(text({type:'damage',side:1,amount:30,hp:270,maxHp:400,crit:true},true),'敌受到 30 点伤害，致命一击！');
    assert.equal(text({type:'heal',side:1,amount:25,hp:295,maxHp:400},true),'敌恢复 25 点体力。');
    assert.equal(text({type:'revive',side:1,hp:200,maxHp:400},true),'敌恢复了战斗能力。');
    assert.equal(text({type:'damage',side:0,amount:9,hp:41,maxHp:80},true),'我受到 9 点伤害。剩余体力 41/80。');
    assert.equal(text({type:'heal',side:0,amount:4,hp:45,maxHp:80},true),'我恢复 4 点体力，剩余体力 45/80。');
    assert.equal(text({type:'damage',side:1,amount:30,hp:270,maxHp:400},false),'敌受到 30 点伤害。剩余体力 270/400。');
    assert.equal(text({type:'damage',side:1,amount:30,hp:270,maxHp:400,crit:true},false),'敌受到 30 点伤害，致命一击！剩余体力 270/400。');
    assert.equal(text({type:'heal',side:1,amount:25,hp:295,maxHp:400},false),'敌恢复 25 点体力，剩余体力 295/400。');
    assert.equal(text({type:'revive',side:1,hp:200,maxHp:400},false),'敌恢复了战斗能力，剩余体力 200/400。');
  });
  console.log(JSON.stringify(report,null,2));
}finally{
  await server.close();
  if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else delete globalThis.localStorage;
}
