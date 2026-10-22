/** Pure in-memory execution audit. No controller, browser, storage or server. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildDataSet,NATIVE_BOSS_RULE_FIELDS,partyRules,STRUGGLE_SKILL,validateEncounter} from '../../battle/core/src/index.ts';
import {createBattle} from './_battle.ts';
import {changesSomething} from '../../battle/ai/src/idle-moves.ts';
import {SEER_SCRIPTS} from '../../battle/core/src/scripts/index.ts';
import {campaignScripts} from '../../src/domain/challenges/campaign-rules.ts';
import {groupedBattleLog,openingEvents} from '../../src/features/battle/battle-log.ts';
import {loadCatalogNode} from '../catalog.mjs';
import {root,suite} from './_harness.mjs';

const read=relative=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
const data=buildDataSet(loadCatalogNode()),scripts={...SEER_SCRIPTS,...campaignScripts};
const bosses=fs.readdirSync(path.join(root,'data/bosses')).filter(file=>file.endsWith('.json')).sort().map(file=>read(`data/bosses/${file}`));
const byId=new Map(bosses.map(boss=>[boss.id,boss]));
const aliases={immune_pct_damage:'immune_percent_damage',infinite_pp:'unlimited_pp',reflect_damage:'reflect_damage'};
const contracts={
  drain_each_turn:['foe_loss','self_heal','below_pct','foe_loss_low','self_heal_low'],stages_unclearable:['stats','except_sure_hit','except_skills_zh'],
  immune_skill_list:['skills_zh'],
  foe_stage_each_turn:['stats'],copy_foe_boosts_on_switch_in:[],mirror_status_to_attacker:['statuses'],lifesteal:['pct_damage_dealt'],
  escalate_vs_same_foe:['stats','reset_on_foe_switch'],status_on_attacker:['status','chance','categories','turns_min','turns_max'],
  random_heal:['chance','pct_max_hp'],ignore_player_damage_reduction:['skills_zh','except_skills_zh'],foe_status_each_turn:['status','from_turn'],
  random_priority:['chance'],skill_effect_override:['skill','status','chance'],damage_cap_breaks_on_dot:['statuses','chance'],foe_cannot_boost:[],
  crit_rate_up:['stages'],heal_flat:['amount'],always_crit:[],damage_dealt_multiplier:['multiplier'],
  only_sure_hit_moves_land:[],status_moves_always_miss:[],status_damage_allowed:['statuses'],
  ko_attacker_on_big_hit:['threshold','inclusive','exclude_categories'],heal_flat_each_turn:['amount'],revive_restores_pp:[],
  require_player_species:['species'],priority_add:['amount'],always_moves_first:[],always_hit:[],foe_accuracy_penalty:['pct'],
  alternating_immunity:['on','order'],vs_type_use_only:['type','skill'],copy_foe_boosts:[],finish_while_foe_status:['status'],
  campaign_qilin_damage_filter:['mode','allowFixed'],campaign_qilin_low_damage_crit:['threshold','turns'],
  campaign_qilin_hurt_stage_down:['threshold','stats'],campaign_counter_type_extra_damage:['amount'],
  level_drops_per_attempt:['start','step','step_win','step_loss','floor'],always_move_first:[],always_crit_after_turn:['turn'],crit_rate_bonus:['stages'],
  hp_multiplier:['multiplier'],evasion_bonus:['stages'],unlimited_pp_skill:['skill'],damage_only_from_own_type_normal_or_status:[],
  type_rotation:['order'],field_heal_each_turn:['pct_max_hp','sides'],field_damage_each_turn:['amount','sides'],
  field_damage_multiplier:['multiplier','sides'],revive_unless_status_ko:['max_revives','through_turn'],ohko_attacks:['ignore_speed'],
  block_new_status:[],boss_fled:[],
  repeat_attack_damage_multiplier:['multiplier'],foe_stage_on_entry:['stats'],
};
const policyLedger=read('data/boss-user-policies-v57.json');
const policyFor=(bossId,mechanic)=>policyLedger.policies.find(policy=>policy.bossId===bossId&&policy.mechanic===mechanic);
const phaseOps={stat_stage:['target','stats'],revive:['pct_max_hp'],set_ai:['ai']};
const whenKeys=new Set(['first_turn','on_faint','self_hp_below_pct','self_hp_below','turn_ge','lives_left','not','foe_condition']);
const objectiveKinds=new Set(['ko_all','turn_limit','finish_with_crit','ko_after_turn','finish_with_skill','use_skill','finish_with_status_damage']);
const support={schemaVersion:1,scope:'Every top-level encounter, team member, variant, phase, condition and objective in data/bosses/*.json. Implementation coverage is not proof of official behavior.',summary:{},bosses:[]};
const unexpected=[];

for(const boss of bosses){
  const row={id:boss.id,handled:[],unsupported:[],approximated:[],waived:policyLedger.policies.filter(policy=>policy.bossId===boss.id&&policy.disposition==='waived'),replacements:policyLedger.policies.filter(policy=>policy.bossId===boss.id&&policy.disposition==='replaced')};
  function visit(value,scope='root',key=''){
    if(!value||typeof value!=='object')return;
    if(value.rule||value.op==='script'||value.kind==='script'){
      const mode=value.rule?'rule':value.op?'phase':'objective',fn={rule:'install',phase:'apply',objective:'objective'}[mode];
      const rule=value.rule??(mode==='phase'?'phase_script':'objective_script');
      const entry={rule,...(value.id?{id:value.id}:{}),scope,fields:Object.keys(value.params??value).filter(key=>!['rule','id'].includes(key))};
      if(value.rule&&value.rule!=='script'){
        const fields=NATIVE_BOSS_RULE_FIELDS[value.rule];
        const unknown=Object.keys(value).filter(key=>!['rule','member',...(fields??[])].includes(key));
        if(!fields||unknown.length){entry.reason=`Unsupported native rule or fields: ${unknown.join(',')||value.rule}`;row.unsupported.push(entry);unexpected.push({boss:boss.id,...entry});}
        else row.handled.push({...entry,implementation:'battle/core/src/engine/rules.ts'});
      }else if(policyFor(boss.id,value.id)?.disposition==='waived'){
        assert.equal(typeof scripts[value.id]?.[fn],'function','waived script must be acknowledged explicitly');
      }
      else {
        const script=scripts[value.id];
        const native=aliases[value.id],fields=native?NATIVE_BOSS_RULE_FIELDS[native]:contracts[value.id];
        const unknown=Object.keys(value.params??{}).filter(key=>!['member','target',...(fields??[])].includes(key));
        const valid=native||(script&&(typeof script==='function'?mode==='phase':typeof script[fn]==='function'));
        if(!valid||!fields||unknown.length){entry.reason=`Missing ${fn} path or unaudited parameter(s): ${unknown.join(',')||value.id}`;row.unsupported.push(entry);unexpected.push({boss:boss.id,...entry});}
        else row.handled.push({...entry,implementation:value.id==='level_drops_per_attempt'?'game adapter before battle construction':value.id==='require_player_species'?'validateEncounter before battle construction':native?'native alias':fn});
      }
    }else if(value.op){
      const fields=phaseOps[value.op],unknown=Object.keys(value).filter(key=>!['op',...(fields??[])].includes(key));
      const entry={rule:`phase:${value.op}`,scope,fields:Object.keys(value).filter(key=>key!=='op')};
      if(!fields||unknown.length){entry.reason='Unknown phase operation or field';row.unsupported.push(entry);unexpected.push({boss:boss.id,...entry});}else row.handled.push(entry);
    }
    if(key==='when')for(const field of Object.keys(value)){
      const entry={rule:`condition:${field}`,scope,fields:[field]};
      if(!whenKeys.has(field)){entry.reason='Unaudited phase condition';row.unsupported.push(entry);unexpected.push({boss:boss.id,...entry});}else row.handled.push(entry);
    }
    if((key==='win'||key==='lose')&&Array.isArray(value))for(const [index,objective]of value.entries())if(objective.kind!=='script'){
      const entry={rule:`objective:${objective.kind}`,scope:`${scope}/${index}`,fields:Object.keys(objective).filter(key=>key!=='kind')};
      if(!objectiveKinds.has(objective.kind)){entry.reason='Unaudited objective';row.unsupported.push(entry);unexpected.push({boss:boss.id,...entry});}else row.handled.push(entry);
    }
    for(const [child,part]of Object.entries(value))if(typeof part==='object')visit(part,`${scope}/${child}`,child);
  }
  visit(boss);
  // These are explicit retained reconstruction choices, not newly inferred values.
  for(const [index,note]of (boss.engine_notes??[]).entries())if(/assum|estimat|unclear|placeholder|not stated|unknown|no formula|not recovered|uncertif|uncertain|no .*source/i.test(note)&&!/^(skills:|reward:|HP |Level )/.test(note))row.approximated.push({rule:'catalog_reconstruction',scope:`engine_notes/${index}`,reason:note});
  if(boss.id==='boss_spt_eersaila')row.approximated.push({rule:'script',id:'revive_unless_status_ko',scope:'variants/fri',reason:'The retained seven-revival cap is not established by the 2010-08-13 guide. Other period wording mentions an early-turn window; its exact interaction is unresolved. The cap is not presented as official.'});
  support.bosses.push(row);
}
support.summary={encounters:bosses.length,handledEntries:support.bosses.reduce((n,row)=>n+row.handled.length,0),unsupportedEntries:support.bosses.reduce((n,row)=>n+row.unsupported.length,0),encountersWithUnsupported:support.bosses.filter(row=>row.unsupported.length).map(row=>row.id),approximatedEntries:support.bosses.reduce((n,row)=>n+row.approximated.length,0),unexpectedContractGaps:unexpected.length,waivedEntries:policyLedger.policies.filter(policy=>policy.disposition==='waived').length,replacementPolicies:policyLedger.policies.filter(policy=>policy.disposition==='replaced').length};
const supportPath=path.join(root,'data/boss-rule-support-v56.json');
if(process.argv.includes('--write-support'))fs.writeFileSync(supportPath,JSON.stringify(support,null,2)+'\n');

const report={smoke:[],summary:support.summary,limits:[
  'No browser, controller, user save, server or network is used. Boss JSON and full battle mechanics remain real; player HP is enlarged for finite-state smoke coverage.',
  'This is execution compatibility, not historical certification. Four explicitly declined mechanics are listed as waived; the below-25-percent execution rule is an authored user policy, not official behavior.',
  'Deterministic focused probes exercise public battle operations and selected internal hooks without replacing rule handlers.',
]};
const t=suite('boss-rules-v56'),{check}=t;
const player=(skills=[20001],n=1)=>({kind:'player',team:Array.from({length:n},(_,slot)=>({species:70,level:100,iv:31,nature:'hardy',skills,hp_override:1000000,uid:`rules-v56-${slot}`}))});
const make=(id,variant,options={})=>createBattle({data,scripts,encounter:structuredClone(byId.get(id)),variant,seed:56,sides:[player()],...options});
const tick=battle=>{if(!battle.result){battle.submit(0,{kind:'move',skill:20001});battle.resolveTurn();}};
const skill=(type,category='physical')=>({...data.skills.get(10001),id:-56,name:{zh:'Controlled rule probe'},type,category,power:50,accuracy:null,effects:[]});
const hit=(battle,mon,amount=10,type='normal',category='physical',kind='attack')=>battle.dealDamage(mon,amount,{kind,source:battle.active(0),skill:skill(type,category)});
const fullInput=JSON.stringify(bosses);
/** The events `act` emits. */
const emitted=(battle,act)=>{const from=battle.out.length;act();return battle.out.slice(from);};

check('All 180 encounters, variants, member rules, phases and objectives have an explicit support classification',()=>{
  assert.equal(bosses.length,180);assert.deepEqual(unexpected,[]);assert.equal(support.bosses.length,180);
  if(fs.existsSync(supportPath))assert.deepEqual(read('data/boss-rule-support-v56.json'),support,'committed support manifest matches current sources');
});
check('Every actual boss and variant remains finite over bounded real turns with no unknown-script warnings',()=>{
  for(const boss of bosses)for(const variant of [undefined,...(boss.variants??[]).map(value=>value.id)]){
    const original=JSON.stringify(boss),battle=createBattle({data,scripts,encounter:boss,variant,seed:56,sides:[player([20001],6)]});
    for(let turn=0;turn<4&&!battle.result;turn++)tick(battle);
    for(const side of battle.sides)for(const mon of side.team){assert(Number.isFinite(mon.hp),`${boss.id}/${variant} HP`);assert(Number.isFinite(mon.maxHp));for(const stat of Object.values(mon.stats))assert(Number.isFinite(stat));}
    assert.deepEqual(battle.warnings,[],`${boss.id}/${variant}: no unknown scripts`);
    assert.equal(JSON.stringify(boss),original,'constructor and aliases do not mutate input');
    report.smoke.push({id:boss.id,variant:variant??null,turns:battle.turn,warnings:battle.warnings});
  }
});
check('Floor 60 allows each defender own type, normal and status moves, and rejects other types',()=>{
  const battle=make('boss_tower_brave_f060');
  for(const mon of battle.sides[1].team){
    assert.equal(hit(battle,mon,10,'water'),0);assert.equal(hit(battle,mon,10,mon.types[0]),10);
    assert.equal(hit(battle,mon,10,'normal'),10);assert.equal(hit(battle,mon,10,'water','status','fixed'),10);
    assert.equal(battle.dealDamage(mon,10,{kind:'true',source:battle.active(0),skill:skill('ice'),ohko:true}),0);
  }
  assert.deepEqual(battle.warnings,[]);
});
check('Floor 70 regeneration affects only member 3, which does not heal to full below 20 percent',()=>{
  const battle=make('boss_tower_brave_f070');
  for(const mon of battle.sides[1].team.slice(0,3)){mon.hp=300;hit(battle,mon,1);assert.equal(mon.hp,299);battle.switchIn(battle.sides[1],mon.slot);battle.endOfTurn();assert.equal(mon.hp,299);}
  const grass=battle.sides[1].team[3];battle.switchIn(battle.sides[1],3);grass.hp=321;hit(battle,grass,1);assert.equal(grass.hp,320);hit(battle,grass,1);assert.equal(grass.hp,319);
  grass.hp=1000;battle.endOfTurn();assert.equal(grass.hp,1200);
  grass.hp=1550;battle.endOfTurn();assert.equal(grass.hp,1600);
});
check('All percentage member thresholds and the dark-door flat 300 heal use their encoded units',()=>{
  for(const floor of [62,65]){const battle=make(`boss_tower_brave_f0${floor}`),rule=battle.sides[1].rules.find(rule=>rule.rule==='heal_full_below'),mon=battle.sides[1].team[rule.member];mon.hp=mon.maxHp*.2;hit(battle,mon,1);assert.equal(mon.hp,mon.maxHp);for(const other of battle.sides[1].team.filter(value=>value!==mon)){other.hp=100;hit(battle,other,1);assert.equal(other.hp,99);}}
  const dark=make('boss_dark_door7_mohuashizhe');dark.active(1).hp=100;dark.endOfTurn();assert.equal(dark.active(1).hp,400);
});
check('Every grass opponent on floors 61-70 but the floor-70 oak butterfly fully heals below one fifth of its HP',()=>{
  // 聚侠 2011-09-23: 61层以上的草系1/5血以下的时候会回满Hp (70层橡木蝶除外).
  const GRASS_HEAL_PCT=20,healers=[];
  for(let floor=61;floor<=70;floor++){
    const battle=make(`boss_tower_brave_f0${floor}`);
    for(const mon of battle.sides[1].team.filter(value=>value.types.includes('grass'))){
      const rule=battle.sides[1].rules.find(rule=>rule.rule==='heal_full_below'&&rule.member===mon.slot);
      if(floor===70&&mon.slot===3){assert.equal(rule,undefined);continue;}
      assert.equal(rule?.pct,GRASS_HEAL_PCT,`floor ${floor} member ${mon.slot} carries the grass rule`);
      mon.hp=mon.maxHp*GRASS_HEAL_PCT/100;hit(battle,mon,1);assert.equal(mon.hp,mon.maxHp,`floor ${floor} member ${mon.slot} heals to full`);
      healers.push(`${floor}/${mon.slot}`);
    }
  }
  assert.deepEqual(healers,['62/0','65/1']);
});
check('Floor 66 闪光艾菲亚 knows only psychic moves, and the encounter AI lists only moves its team knows',()=>{
  // 4399 2010-10-10: 闪尼只会超能技能，换光系 (闪尼 is the guides' nickname for 闪光艾菲亚).
  const battle=make('boss_tower_brave_f066'),nier=battle.sides[1].team.find(mon=>mon.species.id===312);
  assert(nier.skills.length>0);for(const id of nier.skills)assert.equal(data.skills.get(id).type,'psychic',`skill ${id}`);
  const known=new Set(battle.sides[1].team.flatMap(mon=>mon.skills));
  for(const id of byId.get('boss_tower_brave_f066').ai.skills)assert(known.has(id),`AI skill ${id} is on the team`);
});
check('Floor 64 critical trigger starts after turn 8 and installs only on the designated member',()=>{
  const battle=make('boss_tower_brave_f064');
  for(const turn of [8,9]){battle.turn=turn;for(const mon of battle.sides[1].team){const forced=battle.fire(mon,'modify_crit_rate',{skill:data.skills.get(mon.skills[0])}).some(value=>value?.force);assert.equal(forced,turn===9&&mon.slot===1);}}
});
check('Member-limited native aliases and lives apply to the designated slot without catalog mutation',()=>{
  const encounter=structuredClone(byId.get('boss_tower_brave_f060'));encounter.rules=[{rule:'script',id:'reflect_damage',params:{member:1,pct:100}},{rule:'lives',count:1,member:2}];
  const before=JSON.stringify(encounter),battle=createBattle({data,scripts,encounter,seed:56,sides:[player()]});
  const source=battle.active(0),hp=source.hp;hit(battle,battle.sides[1].team[0],10);assert.equal(source.hp,hp);hit(battle,battle.sides[1].team[1],10);assert.equal(source.hp,hp-10);
  assert.deepEqual(battle.sides[1].team.map(mon=>mon.livesLeft),[0,0,1]);assert.equal(JSON.stringify(encounter),before);
});
check('Dishuyan reflects a quarter of each hit except the one that knocks it out',()=>{
  const battle=make('boss_tower_brave_f061'),mon=battle.sides[1].team[1],source=battle.active(0),hp=source.hp;
  hit(battle,mon,100);assert.equal(source.hp,hp-25);hit(battle,mon,mon.hp);assert(mon.fainted);assert.equal(source.hp,hp-25);
});
check('Oak butterfly revives once and restores its opening boost',()=>{
  const battle=make('boss_tower_brave_f070'),mon=battle.sides[1].team[3];
  assert.deepEqual(battle.sides[1].team.map(member=>member.livesLeft),[0,1,1,1]);
  battle.checkPhases(mon);assert.equal(mon.stages.atk,2);
  hit(battle,mon,mon.hp);assert(!mon.fainted);assert.equal(mon.livesLeft,0);assert.equal(mon.stages.atk,0);battle.checkPhases(mon);assert.equal(mon.stages.atk,2);
});
check('Damage-cap categories protect powered attacks while status-category fixed damage remains uncapped',()=>{
  const battle=make('boss_spt_sibinsai'),mon=battle.active(1);assert.equal(hit(battle,mon,100),1);assert.equal(hit(battle,mon,100,'normal','status','fixed'),100);
});
check('Hamorait requires the encoded water-fire-grass cycle and blocked hits do not advance it',()=>{
  const battle=make('boss_spt_hamoleite'),mon=battle.active(1);
  assert.equal(battle.dealDamage(mon,10,{kind:'true',source:battle.active(0),skill:skill('fire'),ohko:true}),0);
  assert.equal(hit(battle,mon,10,'fire'),0);assert.equal(hit(battle,mon,10,'water'),10);assert.equal(hit(battle,mon,10,'water'),0);assert.equal(hit(battle,mon,10,'grass'),0);assert.equal(hit(battle,mon,10,'fire'),10);assert.equal(hit(battle,mon,10,'grass'),10);assert.equal(hit(battle,mon,10,'water'),10);
});
check('Hamorait stands at attack +2 before the first command and refuses the player\'s accuracy, evasion and other stage drops',()=>{
  const battle=make('boss_spt_hamoleite',undefined,{sides:[player([20025,20082])]}),mon=battle.active(1);
  assert.equal(mon.stages.atk,2);assert(battle.initialEvents.some(event=>event.type==='stat_stage'&&event.side===1&&event.stat==='atk'&&event.delta===2));
  for(const skill of [20025,20082]){
    battle.submit(0,{kind:'move',skill});const events=battle.resolveTurn();
    assert(events.some(event=>event.type==='stage_blocked'&&event.side===1&&event.stat==='acc'),`skill ${skill}: the accuracy drop is refused`);
  }
  const before={...mon.stages};for(const stat of ['eva','atk','def','spa','spd','spe'])battle.changeStage(mon,stat,-1,true);
  assert.deepEqual(mon.stages,before);assert.equal(mon.stages.acc,0);assert.equal(mon.stages.eva,0);
  battle.changeStage(mon,'spe',-1,false);assert.equal(mon.stages.spe,before.spe-1,'its own drops still apply');
});
check('米诺斯 starts every entering player pet at accuracy -2, never spends PP, always hits, and below half HP gains +1 to all five stats and a 4/16 crit rate',()=>{
  // 4399 2011-10-27: 自身所有技能必中，自身PP值无限…免疫所有异常和能力下降技能; 血量低于1/2，自身全属性等级+1，所有攻击技能致命一击率达到1/4; 所有出战精灵初始命中等级-2.
  const JUDGEMENT=12285,battle=make('boss_spt_minuosi',undefined,{sides:[player([20001],2)]}),mon=battle.active(1),events=battle.initialEvents;
  const lead=events.findIndex(event=>event.type==='switch_in'&&event.side===0);
  const dropped=events.findIndex(event=>event.type==='stat_stage'&&event.side===0&&event.stat==='acc'&&event.delta===-2);
  assert(lead>=0&&dropped>lead,'the lead stands at accuracy -2 before the first command');assert.equal(battle.active(0).stages.acc,-2);
  for(const slot of [1,0]){battle.submit(0,{kind:'switch',slot});battle.resolveTurn();assert.equal(battle.active(0).slot,slot);assert.equal(battle.active(0).stages.acc,-2,`slot ${slot} enters at -2`);}
  battle.submit(1,{kind:'move',skill:JUDGEMENT});tick(battle);assert.equal(mon.pp[JUDGEMENT],mon.maxPp[JUDGEMENT]);
  assert.equal(battle.applyStatus(mon,'paralysis',{fromFoe:true}),false);
  for(let seed=1;seed<=20;seed++){
    const sure=make('boss_spt_minuosi',undefined,{seed});sure.active(0).stages.eva=6;sure.submit(1,{kind:'move',skill:JUDGEMENT});sure.submit(0,{kind:'move',skill:20001});
    const events=sure.resolveTurn();assert(events.some(event=>event.type==='move_used'&&event.side===1));
    assert(!events.some(event=>event.type==='miss'&&event.side===1),`seed ${seed}: 魂之审判 hits through evasion +6`);
  }
  const low=make('boss_spt_minuosi'),boss=low.active(1),crit=()=>1+low.hooks(boss,'modify_crit_rate').reduce((n,hook)=>n+(hook.add??0),0);
  boss.hp=boss.maxHp/2+1;hit(low,boss,1);assert.deepEqual([boss.stages.atk,boss.stages.def,crit()],[2,0,1],'exactly half HP is not below it');
  for(let n=0;n<2;n++){hit(low,boss,1);assert.deepEqual(boss.stages,{atk:3,def:1,spa:1,spd:1,spe:1,acc:0,eva:0});assert.equal(crit(),4,'4/16');}
  assert.deepEqual([...battle.warnings,...low.warnings],[]);
});
check('塔西亚 gains special attack +2 once when its HP falls below a quarter, and a clear removes it for good',()=>{
  // 4399 2010-08-09: 血到1/4时有强化，可消除 (stat and size unstated; spa+2 by the +2 convention).
  const battle=make('boss_spt_taxiya'),mon=battle.active(1);
  mon.hp=mon.maxHp/4+1;hit(battle,mon,1);assert.equal(mon.stages.spa,0,'exactly a quarter is not below it');
  const fell=emitted(battle,()=>hit(battle,mon,1));assert.equal(mon.stages.spa,2);assert(fell.some(event=>event.type==='phase_triggered'));
  hit(battle,mon,1);assert.equal(mon.stages.spa,2,'once');
  battle.clearStages(mon,'up',true);assert.equal(mon.stages.spa,0,'clearable');hit(battle,mon,1);assert.equal(mon.stages.spa,0);
});
check('麒麟·幻化之轮 refuses statuses',()=>{
  // 7k7k 2013-09-04: 不吃弱化和异常.
  const battle=make('boss_campaign_qilin_wheel5'),mon=battle.active(1);
  for(const status of ['paralysis','poison']){
    const events=emitted(battle,()=>assert.equal(battle.applyStatus(mon,status,{fromFoe:true}),false));
    assert(events.some(event=>event.type==='status_blocked'&&event.status===status&&event.reason==='immune_status'),status);
  }
});
check('普兰特 refuses stat drops from status moves and conditions, but takes those an attack makes as its own effect',()=>{
  // 4399 2012-05-19: 属性消弱吸能无效（攻击技能附带属性消弱OK）.
  const [GLARE,SAND,BITE]=[20004,20025,12886],battle=make('boss_spt_pulante',undefined,{sides:[player([GLARE,SAND,BITE])]}),mon=battle.active(1);
  // The Boss answers with 蚀梦术, which puts nobody to sleep, so the player's move always comes.
  const use=id=>{battle.active(0).stages.acc=6;battle.submit(1,{kind:'move',skill:12794});battle.submit(0,{kind:'move',skill:id});return battle.resolveTurn();};
  for(const [id,stat] of [[GLARE,'def'],[SAND,'acc']])assert(use(id).some(event=>event.type==='stage_blocked'&&event.side===1&&event.stat===stat),`skill ${id}`);
  assert.equal(mon.stages.def,0);assert(use(BITE).some(event=>event.type==='stat_stage'&&event.side===1&&event.stat==='def'&&event.delta===-1));
  const before=mon.stages.def;battle.changeStage(mon,'def',-1,true);battle.changeStage(mon,'def',-1,true,data.skills.get(GLARE));assert.equal(mon.stages.def,before,'no skill, or a status skill');
  battle.changeStage(mon,'def',-1,true,data.skills.get(BITE));assert.equal(mon.stages.def,before-1,'an attack');
  const foe=battle.active(0);
  assert.deepEqual([GLARE,BITE].map(id=>changesSomething(battle,foe,mon,data.skills.get(id))),[false,true],'the AI reads the same refusal');
});
check('厄尔塞拉 refuses accuracy drops, burn and freeze only on Wednesday',()=>{
  // 4399 2010-08-11: 赛尔号星期三的光系BOSS厄尔塞拉…寄生、冻伤、烧伤、减命中无效.
  const [GLARE,SAND]=[20004,20025],fight=variant=>make('boss_spt_eersaila',variant,{sides:[player([SAND,GLARE])]});
  const use=(battle,id)=>{battle.submit(1,{kind:'move',skill:11136});battle.submit(0,{kind:'move',skill:id});return battle.resolveTurn();};
  const wed=fight('wed'),boss=wed.active(1);
  assert(use(wed,SAND).some(event=>event.type==='stage_blocked'&&event.side===1&&event.stat==='acc'));
  assert(use(wed,GLARE).some(event=>event.type==='stat_stage'&&event.side===1&&event.stat==='def'&&event.delta===-1));
  assert.deepEqual([SAND,GLARE].map(id=>changesSomething(wed,wed.active(0),boss,data.skills.get(id))),[false,true],'the AI reads the same refusal');
  assert.deepEqual(['burn','freeze','leech','poison'].map(status=>wed.applyStatus(boss,status,{fromFoe:true})),[false,false,false,true],'the day list adds to the top-level 寄生');
  const sat=fight('sat');assert(use(sat,SAND).some(event=>event.type==='stat_stage'&&event.side===1&&event.stat==='acc'&&event.delta===-1));
  assert.equal(sat.applyStatus(sat.active(1),'burn',{fromFoe:true}),true);
});
check('Only the named Younasi skill has unlimited PP; actual move consumption preserves its other skills',()=>{
  const battle=make('boss_spt_younasi'),mon=battle.active(1),other=mon.skills.find(id=>id!==10410);
  const keep=mon.pp[10410],before=mon.pp[other];battle.submit(1,{kind:'move',skill:10410});tick(battle);assert.equal(mon.pp[10410],keep);
  battle.submit(1,{kind:'move',skill:other});tick(battle);assert.equal(mon.pp[other],before-1);
});
check('Younasi shadow barrier: attacks do 0 and 寄生 drains until 贯穿水枪 breaks it; then attacks land and only 幻影 takes the last HP',()=>{
  // 4399 2010-05-26 (69566): 普通攻击打他都0滴血…用布鲁克克的贯穿水枪打破他的暗影屏障，之后才能攻击; 4399 70397: 最后一滴血，只有幻影可以打掉.
  const [ATTACK,FIXED,LEECH,BREAK,PHANTOM]=[10046,10080,20007,10323,10100];
  const younasi=skills=>{const battle=make('boss_spt_younasi',undefined,{sides:[player(skills)]});return {battle,mon:battle.active(1)};};
  const use=(battle,id)=>{battle.submit(0,{kind:'move',skill:id});return battle.resolveTurn();};
  const barred=events=>events.some(event=>event.type==='damage_blocked'&&event.side===1&&event.rule==='barrier_until_skill');
  const hitBy=(events,id)=>events.some(event=>event.type==='damage'&&event.side===1&&event.skill===id&&event.amount>0);
  const guarded=younasi([FIXED,PHANTOM]);
  for(const id of [FIXED,PHANTOM]){assert(barred(use(guarded.battle,id)),`skill ${id}`);assert.equal(guarded.mon.hp,guarded.mon.maxHp,`${id} deals 0`);}
  assert(!guarded.mon.persist.floorBroken,'a barred 幻影 does not break the HP floor');
  const {battle,mon}=younasi([ATTACK,LEECH,BREAK,PHANTOM]);
  assert(barred(use(battle,ATTACK)));assert.equal(mon.hp,mon.maxHp);use(battle,LEECH);
  const drained=use(battle,ATTACK),leech=Math.floor(mon.maxHp/8);assert(barred(drained));
  assert(drained.some(event=>event.type==='damage'&&event.side===1&&event.status==='leech'&&event.amount===leech),'寄生 drains through the barrier');
  assert(mon.hp<mon.maxHp&&(mon.maxHp-mon.hp)%leech===0,'only 寄生 has taken its HP');
  const before=mon.hp,broke=use(battle,BREAK),creature=value=>({name:value.name,hp:value.hp,maxHp:value.maxHp});
  assert.equal(broke.filter(event=>event.type==='boss_trait'&&event.trait==='barrier_broken').length,1);
  assert(hitBy(broke,BREAK),'the breaking hit deals damage');assert(mon.hp<before);
  const lines=groupedBattleLog(broke,{data,initialPlayer:creature(battle.active(0)),initialEnemy:creature(mon)});
  assert(lines.some(line=>line.includes('尤纳斯的屏障被打破了')),lines.join(' / '));
  const landed=use(battle,ATTACK);assert(!barred(landed));assert(hitBy(landed,ATTACK),'attacks land after the break');
  for(let turn=0;turn<30&&mon.hp>1;turn++)use(battle,ATTACK);
  assert.equal(mon.hp,1);use(battle,ATTACK);assert.equal(mon.hp,1,'the HP floor still holds after the barrier breaks');
  use(battle,PHANTOM);assert(mon.fainted);assert.equal(battle.result.winner,0);assert.deepEqual(battle.warnings,[]);
});
check('First-turn phases run when the Boss enters, so the Eersaila Saturday boosts stand before the first command',()=>{
  const battle=make('boss_spt_eersaila','sat'),mon=battle.active(1),events=battle.initialEvents;
  const entered=events.findIndex(event=>event.type==='switch_in'&&event.side===1);
  const stage=stat=>events.findIndex(event=>event.type==='stat_stage'&&event.side===1&&event.stat===stat&&event.delta===2);
  assert(entered>=0&&stage('def')>entered&&stage('spd')>entered);
  assert.equal(mon.stages.def,2);assert.equal(mon.stages.spd,2);tick(battle);tick(battle);
  assert.equal([...events,...battle.log].filter(event=>event.type==='phase_triggered').length,1);
});
check('Eersaila weekday HP, evasion and Sunday low-HP execution paths are live',()=>{
  assert.equal(make('boss_spt_eersaila','mon').active(1).maxHp,6000);assert.equal(make('boss_spt_eersaila','tue').active(1).stages.eva,3);
  const battle=make('boss_spt_eersaila','sun'),mon=battle.active(1);mon.hp=601;hit(battle,mon,1);assert.equal(battle.bossTrait(mon,'ohko_below_pct'),false);hit(battle,mon,1);assert.equal(battle.bossTrait(mon,'ohko_below_pct'),true);
});
check('Eersaila Friday revival stays live before settlement and poison, burn or freeze KOs bypass it',()=>{
  const battle=make('boss_spt_eersaila','fri'),mon=battle.active(1);
  for(let n=1;n<=7;n++){hit(battle,mon,mon.hp);assert.equal(mon.hp,3000);assert.equal(mon.fainted,false);assert.equal(battle.result,null);assert.equal(mon.persist.statusKoRevives,n);}
  hit(battle,mon,mon.hp);assert.equal(mon.fainted,true);assert.equal(battle.result.success,false,'direct KO misses the explicit status-damage objective');
  for(const status of ['poison','burn','freeze']){const value=make('boss_spt_eersaila','fri'),enemy=value.active(1);value.dealDamage(enemy,enemy.hp,{kind:'percent',status});assert.equal(enemy.fainted,true);assert.equal(value.result.success,true);}
});
check('Moshidilu absolute status threshold is exact at one million and retains existing statuses',()=>{
  const battle=make('boss_spt_moshidilu'),mon=battle.active(1);mon.hp=1000001;assert.equal(battle.applyStatus(mon,'poison',{turns:5}),true);hit(battle,mon,1);assert.equal(mon.hp,1000000);assert.equal(battle.applyStatus(mon,'burn',{turns:5}),true);hit(battle,mon,1);assert.equal(battle.applyStatus(mon,'freeze',{turns:5}),false);assert(mon.conditions.some(condition=>condition.id==='poison'));assert(mon.conditions.some(condition=>condition.id==='burn'));assert.equal(battle.bossTrait(mon,'ohko_below_pct'),false);assert.equal(battle.forcedExecution(mon),false,'one million boundary does not enable quarter-HP execution');
});
check('Moshidilu incoming type immunity does not neutralize its outgoing type effectiveness',()=>{
  const battle=make('boss_spt_moshidilu'),mon=battle.active(1),foe=battle.active(0),move=skill('ground');
  const outgoing=battle.calcAttack(mon,foe,move,undefined,{estimate:true}),incoming=battle.calcAttack(foe,mon,move,undefined,{estimate:true});
  assert.equal(outgoing.effectiveness,2);assert.equal(incoming.effectiveness,1);
});
const ordinaryMoshi=(options={})=>make('boss_spt_moshidilu',undefined,
  {sides:[{kind:'player',team:[{species:70,level:100,iv:31,nature:'hardy',evs:{},skills:[20001,10166]}]}],...options});
const moveEvents=events=>events.filter(event=>event.type==='move_used');
check('Moshidilu execution is strictly below 25 percent; exact boundary and above use normal attacks',()=>{
  for(const hp of [749999,750000,750001]){
    const battle=ordinaryMoshi(),mon=battle.active(1),foe=battle.active(0);mon.hp=hp;
    assert(foe.maxHp<1000,'real ordinary player HP, not smoke HP');
    assert.equal(battle.forcedExecution(mon),hp<750000);
    if(hp>=750000){battle.submit(1,{kind:'move',skill:10540});battle.submit(0,{kind:'move',skill:20001});const events=battle.resolveTurn();assert(foe.hp>0);assert(!events.some(event=>event.trait==='forced_execution_below_pct'));}
  }
});
check('Below-quarter execution chooses an attack over a status move the Boss policy would use',()=>{
  // A policy that always uses the status move: execution decides before any policy is asked.
  const statusOnly={
    chooseAction:(b,side)=>({kind:'move',skill:b.active(side.index).skills.find(id=>b.skill(id).category==='status')}),chooseReplacement:()=>undefined,
  };
  const battle=ordinaryMoshi({policy:statusOnly}),mon=battle.active(1);mon.hp=749999;
  battle.submit(0,{kind:'move',skill:10166});const events=battle.resolveTurn(),moves=moveEvents(events);
  assert.equal(moves[0].side,1);assert.notEqual(battle.skill(moves[0].skill).category,'status');assert.equal(mon.pp[moves[0].skill],mon.maxPp[moves[0].skill]-1);
  assert.equal(battle.active(0).hp,0);assert.equal(battle.result.winner,1);assert.equal(moves.length,1);
});
check('Execution outranks even maximum ordinary priority and higher speed, independent of tie RNG',()=>{
  const battle=ordinaryMoshi(),mon=battle.active(1),foe=battle.active(0);mon.hp=749999;foe.stats.spe=1000000;
  foe.skillOverrides={10166:{...data.skills.get(10166),priority:Number.MAX_SAFE_INTEGER}};
  battle.submit(0,{kind:'move',skill:10166});const moves=moveEvents(battle.resolveTurn());assert.equal(moves[0].side,1);assert.equal(foe.hp,0);assert.equal(moves.length,1);
});
check('Healing to the quarter boundary disables forced order and execution immediately',()=>{
  for(const heal of [1,2,2250001]){
    const battle=ordinaryMoshi(),mon=battle.active(1),foe=battle.active(0);mon.hp=749999;assert(battle.forcedExecution(mon));battle.heal(mon,heal);assert(!battle.forcedExecution(mon));
    foe.skillOverrides={20001:{...data.skills.get(20001),priority:100}};battle.submit(0,{kind:'move',skill:20001});const events=battle.resolveTurn(),moves=moveEvents(events);
    assert.equal(moves[0].side,0);assert(foe.hp>0);assert(!events.some(event=>event.trait==='forced_execution_below_pct'));
  }
});
check('Execution falls back to Struggle when attack PP is gone even with status PP remaining',()=>{
  const battle=ordinaryMoshi(),mon=battle.active(1);mon.hp=749999;mon.pp[10540]=0;mon.pp[10543]=0;
  assert(mon.pp[20232]>0);assert.deepEqual(battle.legalActions(1).filter(action=>action.kind==='move'),[{kind:'move',skill:STRUGGLE_SKILL.id}]);
  battle.submit(0,{kind:'move',skill:10166});const moves=moveEvents(battle.resolveTurn());assert.equal(moves[0].side,1);assert.equal(moves[0].skill,STRUGGLE_SKILL.id);assert.equal(battle.active(0).hp,0);
});
check('The adopted execution bypasses protection, evasion, incapacitation and ordinary OHKO floors',()=>{
  const battle=ordinaryMoshi(),mon=battle.active(1),foe=battle.active(0);
  battle.applyStatus(mon,'fear',{turns:3});mon.hp=749999;mon.stages.acc=-6;foe.stages.eva=6;
  battle.addCondition(foe,{id:'v57-protection-probe',name:{zh:'Protection probe'},kind:'other',hooks:[{on:'block_move'},{on:'modify_damage_taken',multiplier:0}]});
  foe.rules.push({rule:'immune_ohko'},{rule:'hp_floor_until',skill:10001});
  battle.submit(0,{kind:'move',skill:10166});const events=battle.resolveTurn();assert.equal(moveEvents(events)[0].side,1);assert.equal(foe.hp,0);
  assert(!events.some(event=>['miss','protected','cant_act','damage_blocked'].includes(event.type)));
});
check('Entering execution during the opponent attack converts an already selected status move to an attack',()=>{
  const battle=ordinaryMoshi(),mon=battle.active(1);mon.hp=750001;battle.submit(0,{kind:'move',skill:10166});const events=battle.resolveTurn(),moves=moveEvents(events);
  assert.equal(moves[0].side,0);assert(mon.hp<750000);assert.equal(moves[1].side,1);assert.notEqual(battle.skill(moves[1].skill).category,'status');assert.equal(battle.active(0).hp,0);
});
check('Execution adds no immortality against existing poison damage',()=>{
  const battle=ordinaryMoshi(),mon=battle.active(1);battle.applyStatus(mon,'poison',{turns:3});mon.hp=1;battle.endOfTurn();assert.equal(mon.hp,0);assert.equal(mon.fainted,true);assert.equal(battle.result.winner,0);
});
check('All three Laokemengde fields operate on both active sides, including replacements, once per member',()=>{
  const heal=make('boss_spt_laokemengde','healing_field',{sides:[player([20001],2)]});for(const mon of [heal.active(0),heal.active(1)])mon.hp=100;heal.endOfTurn();assert.equal(heal.active(0).hp,100+heal.active(0).maxHp*.1);assert.equal(heal.active(1).hp,100+heal.active(1).maxHp*.1);
  heal.switchIn(heal.sides[0],1);heal.active(0).hp=100;heal.endOfTurn();assert.equal(heal.active(0).hp,100+heal.active(0).maxHp*.1);
  const damage=make('boss_spt_laokemengde','extreme_field');for(const mon of [damage.active(0),damage.active(1)])mon.hp=500;damage.endOfTurn();assert.equal(damage.active(0).hp,400);assert.equal(damage.active(1).hp,400);
  const twice=make('boss_spt_laokemengde','energy_field');assert.equal(hit(twice,twice.active(1),10),20);const before=twice.active(0).hp;twice.dealDamage(twice.active(0),10,{kind:'attack',source:twice.active(1),skill:skill('normal')});assert.equal(twice.active(0).hp,before-20);
});
check('Singular priority alias and explicit critical bonus are installed',()=>{
  for(const id of ['boss_dark_door7_sanuolasi','boss_dark_door8_saduolani']){const battle=make(id),mon=battle.active(1);assert.equal(battle.priority(mon,data.skills.get(mon.skills[0])),Number.MAX_SAFE_INTEGER);}
  const battle=make('boss_dark_door8_saduolani');assert.equal(battle.hooks(battle.active(1),'modify_crit_rate').reduce((n,hook)=>n+(hook.add??0),0),2);
});
check('Akenoya has two total lives of 2500 HP, as the period guide explicitly describes',()=>{
  const battle=make('boss_dark_door9_akenuoya'),mon=battle.active(1);assert.equal(mon.maxHp,2500);assert.equal(mon.hp,2500);assert.equal(mon.livesLeft,1);
  hit(battle,mon,2500);assert.equal(mon.hp,2500);assert.equal(mon.livesLeft,0);assert.equal(mon.fainted,false);assert.equal(battle.result,null);
  hit(battle,mon,2500);assert.equal(mon.hp,0);assert.equal(mon.fainted,true);assert.equal(battle.result.success,true);
});
check('Baihu avatars: 战虎 moves first and keeps its boost except against sure-hit clears and 日月皆伤; each avatar afflicts its attacker',()=>{
  // 4399 2011-03-11, 7k7k 2013-01-06 and 百科: 强制先手; 消强化技能MISS, 必中技能与盖亚日月皆伤除外; 思维干涉、暗影护盾无效;
  // attacking 战虎 frightens and attacking 电虎 paralyses for 1-2 turns; 电虎 不吃海洋之心与异常状态, 绝命火焰有效.
  const avatars=skills=>make('boss_campaign_baihu_avatars',undefined,{sides:[player(skills)]});
  const turn=(battle,boss,mine)=>{battle.submit(1,{kind:'move',skill:boss});battle.submit(0,{kind:'move',skill:mine});return battle.resolveTurn();};
  const afflicted=(battle,id)=>battle.active(0).conditions.find(condition=>condition.id===id);
  for(const [clear,kept] of [[10632,true],[10377,false],[10714,false]]){
    const battle=avatars([clear]),tiger=battle.active(1),moves=turn(battle,20854,clear).filter(event=>event.type==='move_used');
    assert.deepEqual(moves.map(event=>event.side),[1,0]);assert.equal(tiger.stages.atk,kept?2:0,`clear ${clear}`);
    assert(afflicted(battle,'fear'),`clear ${clear} frightens its user`);
  }
  const first=avatars(),tiger=first.active(1);
  assert.equal(first.priority(tiger,data.skills.get(11710)),Number.MAX_SAFE_INTEGER);assert.equal(first.applyStatus(tiger,'poison',{turns:3}),true);
  for(const [slot,status] of [[0,'fear'],[1,'paralysis']]){
    const battle=avatars();if(slot)battle.switchIn(battle.sides[1],slot);hit(battle,battle.active(1),10);
    const turns=afflicted(battle,status)?.turns;assert(turns>=1&&turns<=2,`${status} lasts ${turns} turns`);
  }
  assert(turn(avatars([20560]),20854,20560).some(event=>event.type==='move_failed'&&event.side===0&&event.reason==='negated'),'思维干涉');
  for(const ignored of [true,false]){
    const battle=avatars([20484,20001]);if(!ignored)delete battle.active(1).persist.ignoreReduction;turn(battle,20854,20484);
    assert(afflicted(battle,'seer_eff_78'));assert.equal(turn(battle,11710,20001).some(event=>event.type==='miss'&&event.side===1),!ignored,'暗影护盾');
  }
  const volt=avatars(),electric=volt.sides[1].team[1];volt.switchIn(volt.sides[1],1);
  assert.equal(hit(volt,electric,25,'normal','status','percent'),0);assert.equal(volt.applyStatus(electric,'poison',{turns:3}),false);
  const kill={kind:'true',ohko:true,source:volt.active(0),skill:data.skills.get(11022)};
  assert.equal(volt.dealDamage(electric,electric.hp,kill),2500);assert(electric.fainted);assert.deepEqual(volt.warnings,[]);
});
check('Ruiersi passes full evasion such as 空间跳跃; only the block of 盖亚 群影乱舞 still stops it; a Boss without the rule is negated',()=>{
  // 4399 133584 特性3: 闪光艾菲亚空间跳跃等完全闪避技能无效，只有盖亚的群魔乱舞能挡五回合 (盖亚's protective skill is 群影乱舞).
  const fight=(id,guard,except)=>{
    const battle=make(id,undefined,{sides:[player([guard])]}),boss=battle.active(1),foe=battle.active(0);foe.stats.spe=1e6;
    if(except)boss.persist.ignoreReduction.except=except;
    battle.submit(1,{kind:'move',skill:boss.skills.find(skill=>data.skills.get(skill).category!=='status')});battle.submit(0,{kind:'move',skill:guard});
    const hp=foe.hp,events=battle.resolveTurn();
    return {failed:events.some(event=>event.type==='move_failed'&&event.side===1),hurt:foe.hp<hp};
  };
  assert.deepEqual(fight('boss_spt_ruiersi',20097),{failed:false,hurt:true},'空间跳跃');
  assert.deepEqual(fight('boss_spt_ruiersi',20310),{failed:false,hurt:false},'群影乱舞');
  assert.deepEqual(fight('boss_spt_ruiersi',20310,[]),{failed:false,hurt:true},'群影乱舞 without the exception');
  assert.equal(fight('boss_spt_palisi',20498).failed,false,'帕里斯 ignores 虚无');
  assert.equal(fight('boss_tower_brave_f001',20097).failed,true,'空间跳跃 negates a Boss without the rule');
});
check('莫尔加斯 takes a tenth from each attack right after an attack; a status move in between restores full damage',()=>{
  // 百科 暗黑武斗场: 连续第二次对其攻击，伤害只有第一次的十分之一; player comment 三: 使用属性技，再次攻击伤害还是高伤害.
  const ATTACK=10166,STATUS=20001,BOSS_STATUS=20461,REPEAT_MULTIPLIER=0.1;
  const plan=[ATTACK,ATTACK,STATUS,ATTACK,ATTACK,ATTACK],reduced=[false,true,false,false,true,true];
  const play=encounter=>{
    const battle=createBattle({data,scripts,encounter,seed:56,sides:[player([ATTACK,STATUS])]});
    return plan.map(move=>{
      battle.submit(1,{kind:'move',skill:BOSS_STATUS});battle.submit(0,{kind:'move',skill:move});
      return battle.resolveTurn().filter(event=>event.type==='damage'&&event.side===1&&event.kind==='attack').reduce((n,event)=>n+event.amount,0);
    });
  };
  const boss=structuredClone(byId.get('boss_dark_door7_moerjiasi')),taken=play(boss),full=play({...structuredClone(boss),rules:[]});
  assert.deepEqual(boss.rules,[{rule:'script',id:'repeat_attack_damage_multiplier',params:{multiplier:REPEAT_MULTIPLIER}}]);
  assert(full.every((damage,turn)=>plan[turn]===STATUS?damage===0:damage>=1/REPEAT_MULTIPLIER),`attacks land in full: ${full}`);
  assert.deepEqual(taken,full.map((damage,turn)=>reduced[turn]?Math.floor(damage*REPEAT_MULTIPLIER):damage));
});
check('Entry validation returns one structured refusal per broken party rule: team size, member level and required species',()=>{
  for(let n=1;n<=5;n++){
    const boss=byId.get(`boss_rei_training${n}`),wrong=player();wrong.team[0].species=1;
    assert.deepEqual(partyRules(boss),[{kind:'team_max',count:1},{kind:'species',species:[70]}]);assert.deepEqual(validateEncounter(boss,player()),[]);
    assert.deepEqual(validateEncounter(boss,wrong),[{kind:'species',species:[70],size:1,slots:[0]}]);
    assert.deepEqual(validateEncounter(boss,player([20001],2)),[{kind:'team_max',count:1,size:2,slots:[]}]);
  }
  const mystery=byId.get('boss_tower_brave_mystery'),low=player([20001],6);low.team[5].level=99;
  assert.deepEqual(validateEncounter(mystery,player([20001],5)),[{kind:'team_min',count:6,size:5,slots:[]}]);
  assert.deepEqual(validateEncounter(mystery,player([20001],6)),[]);
  assert.deepEqual(validateEncounter(mystery,low),[{kind:'level_min',level:100,size:6,slots:[5]}]);
  const capped={rules:[{rule:'player_level_cap',level:50}]};
  assert.deepEqual(validateEncounter(capped,player([20001],2)),[{kind:'level_max',level:50,size:2,slots:[0,1]}]);
});
check('Four declined mechanics and one authored replacement are explicit; defensive healing cannot propagate NaN',()=>{
  assert.equal(support.summary.unsupportedEntries,0);assert.equal(support.summary.waivedEntries,4);assert.equal(support.summary.replacementPolicies,1);
  const eer=make('boss_spt_eersaila','sat');tick(eer);assert(eer.initialEvents.some(event=>event.type==='mechanic_waived'&&event.policy==='v57-eersaila-critical-curve'));assert.deepEqual(eer.warnings,[]);
  assert(!byId.get('boss_spt_moshidilu').phases.some(phase=>phase.do.some(op=>['ohko_attacks','damage_scales_with_hp_lost'].includes(op.id))));
  const battle=make('boss_tower_brave_f001'),mon=battle.active(1),hp=mon.hp;assert.equal(battle.heal(mon,NaN),0);assert.equal(mon.hp,hp);assert(battle.warnings.includes('non-finite heal amount rejected'));
});
check('Rule conditions are installed before the first switch-in, so no Boss opening log line names one',()=>{
  const conditionEvents=new Set(['condition_added','condition_refreshed']);let installed=0;
  for(const boss of bosses){
    // Innate first-turn phases run when the Boss enters; what they add (塔克林's crit rate) is their own opening line.
    const battle=make(boss.id),phased=battle.initialEvents.findIndex(event=>event.type==='phase_triggered');
    const events=phased<0?battle.initialEvents:battle.initialEvents.slice(0,phased),fielded=events.findIndex(event=>event.type==='switch_in');
    installed+=events.slice(0,fielded).filter(event=>conditionEvents.has(event.type)).length;
    const late=events.slice(fielded).find(event=>conditionEvents.has(event.type)&&event.condition.startsWith('boss_'));
    assert(!late,`${boss.id}: rule condition ${late?.condition} after the switch-ins`);
    const creature=mon=>({name:mon.name,hp:mon.hp,maxHp:mon.maxHp});
    const lines=groupedBattleLog(openingEvents(events),{data,initialPlayer:creature(battle.active(0)),initialEnemy:creature(battle.active(1))});
    assert(!lines.some(line=>/获得|效果更新/.test(line)),`${boss.id}: ${lines.join(' / ')}`);
  }
  assert(installed>50,`the encounters install rule conditions (${installed})`);
});
check('Boss catalog inputs remain byte-equivalent in memory',()=>{assert.equal(JSON.stringify(bosses),fullInput);});

report.sourceSha256=createHash('sha256').update(fullInput).digest('hex');
t.finish(report);
