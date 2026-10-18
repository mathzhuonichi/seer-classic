import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBattle} from '../../battle/core/src/battle.ts';
import {buildDataSet} from '../../battle/core/src/data.ts';
import {SEER_SCRIPTS} from '../../battle/core/src/scripts/index.ts';
import {campaignScripts} from '../../src/domain/challenges/campaign-rules.ts';
import {createGame} from '../../src/kernel/game.ts';
import type {BossEncounter,MonsterInput} from '../../battle/core/src/types.ts';
import type {CatalogData} from '../../src/domain/catalog/catalog.ts';
import {loadCatalogNode} from '../catalog.mjs';

const raw=loadCatalogNode();
const data=buildDataSet(raw);
const scripts={...SEER_SCRIPTS,...campaignScripts};
const stats={hp:400,atk:100,def:100,spa:100,spd:100,spe:200};
function fixture(options:{types?:string[];hp?:number;members?:number;userHp?:number;bench?:boolean}={}) {
  const enemy:MonsterInput={species:16,types:options.types??['normal'],level:100,stats:{...stats,hp:options.hp??400,spe:1},skills:[20001]};
  return createBattle({data,scripts,seed:17,sides:[{kind:'player',items:{item_potion_hp_150:2,item_potion_pp_5:2,item_cure:2},team:[{species:9,level:100,stats,hp:options.userHp,skills:[20007,10035,20269,20266]},...(options.bench?[{species:3,level:100,stats,skills:[20001]}]:[])]}],encounter:{id:'playtest',team:Array.from({length:options.members??1},()=>structuredClone(enemy)),win:[{kind:'ko_all'}],ai:{kind:'sequence',skills:[20001]}}});
}
const run=(battle:ReturnType<typeof createBattle>,skill:number)=>{battle.submit(0,{kind:'move',skill});return battle.resolveTurn();};
const passed:string[]=[];
for(const types of [['grass'],['water','grass']]) {
  const b=fixture({types});const before=b.active(1).hp;
  const events=run(b,20007);
  assert(events.some(event=>event.type==='status_blocked'&&event.status==='leech'));
  assert(!b.active(1).conditions.some(condition=>condition.id==='leech'));
  assert.equal(b.active(1).hp,before);
}
const leech=fixture({types:['water']});leech.active(1).hp=3;leech.active(0).hp=399;
const drained=run(leech,20007);
assert(drained.some(event=>event.type==='status_applied'&&event.status==='leech'));
assert.equal(leech.active(0).hp,400);
assert.equal(drained.find(event=>event.type==='heal'&&event.side===0)?.amount,1);
assert.equal(drained.find(event=>event.type==='damage'&&event.status==='leech')?.amount,3);
passed.push('BUG-001: single/dual grass immunity; non-grass leech; drain capped by actual lost and missing HP');

for(const [hp,userHp,members] of [[400,400,1],[1,400,1],[1,1,1],[1,400,2]] as const) {
  const b=fixture({hp,userHp,members});const events=run(b,10035);
  const attack=events.find(event=>event.type==='damage'&&event.side===1&&event.kind==='attack');
  const recoil=events.find(event=>event.type==='damage'&&event.side===0&&event.kind==='fixed');
  assert(attack&&recoil);
  assert.equal(recoil.amount,Math.min(userHp,Math.max(1,Math.floor(attack.amount/4))));
  assert.equal(b.active(0).hp,userHp-recoil.amount);
  if(members===2){assert(!b.result);assert.equal(b.active(1).slot,1);}
  if(hp===1&&members===1){assert(b.result);assert.equal(b.result.winner,userHp===1?1:0);assert(events.indexOf(recoil)<events.findIndex(event=>event.type==='battle_end'));}
}
passed.push('BUG-002: nonlethal/lethal recoil, simultaneous KO and automatic next opponent; result follows recoil');

const items=fixture({bench:true});
assert(!items.legalActions(0).some(action=>action.kind==='item'&&action.item==='item_potion_hp_150'));
assert.throws(()=>items.submit(0,{kind:'item',item:'item_potion_hp_150',target:0}),/illegal action/);
assert.equal(items.sides[0].items.item_potion_hp_150,2);assert.equal(items.turn,0);
items.active(0).hp=100;
items.submit(0,{kind:'item',item:'item_potion_hp_150',target:0});items.resolveTurn();
assert.equal(items.active(0).hp,250);assert.equal(items.sides[0].items.item_potion_hp_150,1);
assert(!items.legalActions(0).some(action=>action.kind==='item'&&action.item==='item_potion_pp_5'));
items.active(0).pp[20269]--;
assert(items.legalActions(0).some(action=>action.kind==='item'&&action.item==='item_potion_pp_5'));
passed.push('UX-003: full-HP/full-PP items rejected without turn or inventory consumption; useful healing still works');

for(const id of ['boss_puni_seal1','boss_puni_seal7','boss_puni_zhenshen']) {
  const encounter=JSON.parse(readFileSync(`data/bosses/${id}.json`,'utf8')) as BossEncounter;
  const make=(foeSkill=id==='boss_puni_seal1'?10001:20002)=>createBattle({data,scripts,seed:17,encounter,sides:[{kind:'player',team:[{species:264,level:100,stats:{...stats,hp:10000,spe:1000},skills:[20269,20266,20009,foeSkill]}]}]});
  const boost=make();assert(!run(boost,20269).some(event=>event.type==='miss'&&event.side===0));
  assert.equal(boost.active(0).stages.spe,1);
  const guard=make();const guarded=run(guard,20266);
  assert(!guarded.some(event=>event.type==='miss'&&event.side===0));
  assert(guarded.some(event=>event.type==='condition_added'&&event.side===0&&event.condition==='seer_eff_52'));
  assert(guarded.some(event=>event.type==='move_failed'&&event.side===1));
  const healing=make();healing.active(0).hp=100;assert(run(healing,20009).some(event=>event.type==='heal'&&event.side===0));
  const foeMove=make();assert(run(foeMove,id==='boss_puni_seal1'?10001:20002).some(event=>event.type==='miss'&&event.side===0));
  assert.deepEqual(boost.warnings,[]);assert.deepEqual(guard.warnings,[]);
}
passed.push('OBS-007: actual Puni seals 1/7 and body permit self boost/heal/protection while enemy-targeting restrictions remain');

const catalog=structuredClone(raw) as CatalogData;
const game=createGame(catalog),uid=game.snapshot().party[0];
const beads=catalog.items.filter(item=>(item.raising_effect as {op?:string}|undefined)?.op==='energy_bead');assert(beads.length>1);
game.dispatch({type:'useItem',uid,itemId:String(beads[0].id)});
const before=game.exportSave();game.dispatch({type:'useItem',uid,itemId:String(beads[1].id)});
assert.equal(game.exportSave(),before);assert.match(game.snapshot().notices[0],/已使用.*剩余.*不能替换.*未消耗/);
assert(!game.snapshot().notices[0].includes('energy_bead'));
assert(game.snapshot().items.filter(item=>beads.some(bead=>bead.id===item.id)).every(item=>item.description.includes('不能替换')));
passed.push('UX-006: bead conflict names active bead, remaining battles and no consumption; Chinese descriptions explain expiry');
const lisa=raw.species.find((species:{id:number})=>species.id===303);
const shield=raw.skills.find((skill:{name:{zh:string}})=>skill.name.zh==='花草护体');
assert(lisa.learnset.some((entry:{skill:number})=>entry.skill===shield.id));
assert(!game.snapshot().bosses.find(boss=>boss.id==='boss_spt_hamoleite')!.description.includes('暗影屏障'));
assert.equal(data.skills.get(20266)?.target,'self');assert.equal(data.skills.get(10618)?.effects?.[0].turns,1);
passed.push('CONTENT-004: replacement strategy uses an actual Lisa learnset skill');
console.log(JSON.stringify({passed,limits:['Synthetic deterministic battle fixtures do not certify a complete six-life player run.','OBS-005 retains the current official double-healing record pending mode/historical confirmation.','Normal shop/restocking remains a content gap.']},null,2));
