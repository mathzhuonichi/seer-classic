import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createBattle} from '../../battle/core/src/battle';
import {buildDataSet} from '../../battle/core/src/data';
import {createGame} from '../../src/game';
import {buildAcquisitionIndex,type AcquisitionCatalog} from '../../src/progression/acquisition';

/** Real controller fixtures isolate ordinary entry and reward settlement from boss difficulty. */
export function runSoloChallengeAudit(){
  const bundle=JSON.parse(readFileSync('data/gamedata.json','utf8'));
  const source={...bundle,bosses:readdirSync('data/bosses').filter(file=>file.endsWith('.json')).map(file=>JSON.parse(readFileSync(`data/bosses/${file}`,'utf8')))};
  const targets=[['boss_spt_saiweier',413,412],['boss_trial_brave_qigesa',532,531]]as const;
  for(const[id,species,infant]of targets){const boss=source.bosses.find((b:any)=>b.id===id)!;
    assert.deepEqual(bundle.bosses.find((b:any)=>b.id===id),boss,'Source and bundle record agree');assert.deepEqual(boss.team.map((m:any)=>m.species),[species]);assert.equal(boss.reward_hatches,infant);
    assert.ok(!boss.rules.some((rule:any)=>/co.?op|multi.?player|teammate/.test(rule.rule)));assert.ok(!boss.unlock.requires.length);
    for(let size=1;size<=6;size++){
      const game=createGame(structuredClone(source));
      while(game.snapshot().party.length<size)game.dispatch({type:'cheatAcquire',species:1,level:100});
      for(const uid of game.snapshot().party.slice(size))game.dispatch({type:'party',uid,add:false});
      game.dispatch({type:'startBattle',bossId:id});const battle=game.snapshot().battle!;
      assert.ok(battle,`${id} permits one player's ${size}-creature roster`);assert.equal(battle.party.length,size);assert.equal(battle.enemyParty.length,1);assert.equal(battle.enemy.species,species);assert.equal(battle.canCapture,false);
    }
    const fixture=structuredClone(source),easy=fixture.bosses.find((b:any)=>b.id===id);easy.team[0].hp_override=1;easy.team[0].skills=[20006];easy.phases=[];easy.rules=[];
    const game=createGame(fixture);for(const uid of game.snapshot().party)game.dispatch({type:'cheatMonster',uid,level:100});
    game.dispatch({type:'startBattle',bossId:id});const skill=game.snapshot().battle!.player.skills.find(skill=>skill.power>0)!;
    for(let turn=0;turn<4&&!game.snapshot().battle!.finished;turn++)game.dispatch({type:'move',skillId:skill.id});
    assert.equal(game.snapshot().battle!.won,true);const essence=Object.keys(easy.reward.items).find(item=>item.startsWith('essence_'))!;assert.equal(game.snapshot().items.find(item=>item.id===essence)?.count,1);
    game.dispatch({type:'closeBattle'});const restored=createGame(structuredClone(source),game.exportSave());restored.dispatch({type:'useItem',uid:restored.snapshot().party[0],itemId:essence});assert.equal(restored.snapshot().monsters.at(-1)!.species,infant);
    const repeat=createGame(structuredClone(fixture),restored.exportSave());repeat.dispatch({type:'startBattle',bossId:id});for(let turn=0;turn<4&&!repeat.snapshot().battle!.finished;turn++)repeat.dispatch({type:'move',skillId:repeat.snapshot().battle!.player.skills.find(s=>s.power>0)!.id});assert.equal(repeat.snapshot().items.some(item=>item.id===essence),false,'Repeated victory does not regrant first-clear essence');
  }
  const seville=source.bosses.find((boss:any)=>boss.id==='boss_spt_saiweier');
  assert.deepEqual(seville.rules.find((rule:any)=>rule.rule==='heal_full_below'),{rule:'heal_full_below',hp:200});
  const data=buildDataSet(source),playerStats={hp:1000,atk:100,def:100,spa:100,spd:100,spe:100};
  const healing=createBattle({data,seed:123,encounter:seville,sides:[{kind:'player',team:[{species:1,level:100,stats:playerStats,skills:[10001]}]}]});
  const defender=healing.active(1),attacker=healing.active(0);defender.hp=201;
  healing.dealDamage(defender,1,{kind:'fixed',source:attacker});assert.equal(defender.hp,200,'Exactly 200 HP does not heal');
  healing.dealDamage(defender,1,{kind:'fixed',source:attacker});assert.equal(defender.hp,defender.maxHp,'Nonlethal damage below 200 restores full HP');
  defender.hp=200;healing.dealDamage(defender,200,{kind:'fixed',source:attacker});assert.equal(defender.hp,0,'Lethal damage cannot trigger threshold revival');assert.equal(defender.fainted,true);
  const index=buildAcquisitionIndex(source as AcquisitionCatalog);assert.ok(index.get(412)!.routes.some(route=>route.bossId==='boss_spt_saiweier'));assert.ok(index.get(413)!.routes.some(route=>route.bossId==='boss_spt_saiweier'&&route.kind==='evolution'));
  assert.equal(source.species.find((s:any)=>s.id===412).evolution.find((e:any)=>e.to===413).level,32);
  for(const id of ['boss_campaign_qinglong_guardians','boss_puni_zhenshen','boss_campaign_xuanwu_body'])assert.ok(source.bosses.some((boss:any)=>boss.id===id),'Normal campaign enemies are retained');
  console.log('Solo challenges passed: Seville/Qigesa entry for roster sizes1–6, one opponent, victory/essence/hatch/reload, first-clear-only rewards, Sevi level32 evolution route and absolute200HP healing/lethal boundaries.');
}
