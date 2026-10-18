/** Smart trainer supplies: real action ordering, public information, and unlimited recovery liveness. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createServer} from 'vite';

const report={checks:[],failures:[],witnesses:[],battles:[]};
const check=(name,run)=>{try{run();report.checks.push(name);}catch(error){report.failures.push({name,error:String(error.stack)});console.error(`FAIL ${name}: ${error.message}`);}};
const snapshot=b=>JSON.stringify(b,(_key,value)=>value instanceof Map?[...value]:value instanceof Set?[...value]:value);
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',logLevel:'error',plugins:[{name:'potion-audit-readonly',enforce:'pre',transform(code,id){if(id.endsWith('/battle/core/src/tactics.ts'))return code+'\nexport {potionProgress as auditProgress};';}}]});
try{
  const [{createBattle:createBattleRaw,buildDataSet},{chooseAiAction},{SEER_SCRIPTS},{loadCatalog},{normalizeNpcTrainingEncounter},{npcTrainingScripts},{TRAINER_UNLIMITED_ITEMS,normalizeBattleSupplyItems},{auditProgress}]=await Promise.all([
    '/battle/core/src/index.ts','/battle/core/src/ai.ts','/battle/core/src/scripts/index.ts','/src/mechanics/catalog.ts','/src/progression/npc-training.ts','/src/mechanics/npc-training.ts','/src/progression/battle-supplies.ts','/battle/core/src/tactics.ts',
  ].map(path=>server.ssrLoadModule(path)));
  // V58: this suite verifies the retained V57 planner (tactics.ts); the search planner has its own suites.
  const createBattle=(...args)=>{const battle=createBattleRaw(...args);for(const side of battle.sides)if(side.kind==='trainer'&&!side.ai)side.ai={kind:'smart'};for(const side of battle.sides)for(const holder of [side,...side.team])if(holder.ai&&(holder.ai.kind??'smart')==='smart')holder.ai={...holder.ai,planner:'v57'};return battle;};
  const HP='item_potion_hp_200',PP='item_potion_pp_20',CURE='item_status_cure',SMALL='audit-hp-100';
  const realItems=JSON.parse(fs.readFileSync('data/items.json','utf8'));
  const cure={id:CURE,name:{zh:'Audit status cure'},kind:'battle',battle_effects:[{op:'cure_status',target:'self'}]};
  const items=[...normalizeBattleSupplyItems(realItems),cure,{id:SMALL,name:{zh:'Audit partial potion'},kind:'battle',battle_effects:[{op:'heal',target:'self',amount:100}]}];
  const base={hp:100,atk:100,def:100,spa:100,spd:100,spe:100};
  const SK={hit:990480,strong:990481,weak:990482,wait:990483,control:990484};
  const attack=(id,amount,extra={})=>({id,name:{zh:`Potion fixture ${id}`},type:'normal',category:'physical',power:0,accuracy:null,pp:20,effects:[{op:'fixed_damage',amount}],...extra});
  const data=buildDataSet({items,types:{chart:{normal:{normal:1}}},species:[{id:1,name:{zh:'Potion fixture'},types:['normal'],base}],skills:[
    attack(SK.hit,80),attack(SK.strong,120),attack(SK.weak,10),attack(SK.wait,0,{category:'status',target:'self',effects:[]}),attack(SK.control,0,{category:'status',effects:[{op:'status',status:'fear'}]}),
  ]});
  function fixture({hp=30,foeHp=167,speed=120,maxHp=167,ownSkills=[SK.hit],foeSkills=[SK.hit,SK.wait],supplies=[HP,PP,CURE],foeSupplies=[],ownKind='trainer',ownAi={kind:'smart'},foeAi={kind:'sequence',skills:[SK.hit]},ownRules=[],foeRules=[],seed=48}={}){
    const b=createBattle({data,scripts:SEER_SCRIPTS,seed,sides:[{kind:'trainer',team:[{species:1,level:50,iv:15,skills:foeSkills,hp:foeHp}],unlimited_items:foeSupplies,ai:foeAi,rules:foeRules},
      {kind:ownKind,team:[{species:1,level:50,iv:15,skills:ownSkills,hp,stats:{hp:maxHp,atk:112,def:112,spa:112,spd:112,spe:speed}}],unlimited_items:supplies,ai:ownAi,rules:ownRules}]});
    b.log.push({type:'move_used',side:0,skill:SK.hit});return b;
  }
  const decide=b=>chooseAiAction(b,b.sides[1]);
  const item=(id,target=0)=>({kind:'item',item:id,target});
  const add=(b,id,turns=3)=>{const mon=b.active(1);mon.conditions.push({id,def:b.data.conditions.get(id),turns,appliedTurn:0});b.log.push({type:'status_applied',side:1,status:id});};
  const turn=(b,foe=SK.hit,own)=>{b.submit(0,{kind:'move',skill:foe});if(own)b.submit(1,own);return b.resolveTurn();};
  const legal=(b,a)=>assert(b.legalActions(1).some(candidate=>JSON.stringify(candidate)===JSON.stringify(a)),JSON.stringify(a));

  check('A threatened trainer uses the actual 200-HP potion before the opposing attack',()=>{
    const b=fixture(),before=snapshot(b),chosen=decide(b);assert.deepEqual(chosen,item(HP));assert.equal(snapshot(b),before);legal(b,chosen);
    const events=turn(b,SK.hit,chosen),use=events.findIndex(e=>e.type==='item_used'&&e.side===1),hit=events.findIndex(e=>e.type==='damage'&&e.side===1);
    assert(use>=0&&hit>use);assert.equal(b.active(1).hp,87);assert.equal(events.filter(e=>e.type==='move_used'&&e.side===1).length,0);assert(b.sides[1].unlimitedItems.has(HP));
    report.witnesses.push({case:'200-HP rescue',choice:chosen,hpAfter:b.active(1).hp,wholeTurn:true});
  });
  check('A reliable executable knockout takes priority over healing',()=>{
    const b=fixture({foeHp:70});assert.deepEqual(decide(b),{kind:'move',skill:SK.hit});turn(b);assert.equal(b.result?.winner,1);
    const slow=fixture({foeHp:70,speed:100});assert.deepEqual(decide(slow),item(HP),'A slower doomed knockout is not executable before healing');
  });
  check('Full HP, unneeded PP, and no status do not invite a potion action',()=>{
    const b=fixture({hp:167});assert.equal(decide(b).kind,'move');b.active(1).pp[SK.hit]=19;assert.equal(decide(b).kind,'move');
  });
  check('No-items and no-healing rules cannot turn into wasted healing actions',()=>{
    const noItems=fixture({foeRules:[{rule:'no_items'}]});assert(!noItems.legalActions(1).some(a=>a.kind==='item'));assert.equal(decide(noItems).kind,'move');
    const noHeal=fixture({foeRules:[{rule:'block_heal'}]});assert.notEqual(decide(noHeal).item,HP);
  });
  check('Healing is refused when even the restored active member still falls before acting again',()=>{
    const b=fixture({hp:30,speed:100,maxHp:100});assert.equal(decide(b).kind,'move');
  });
  check('Exhausted useful PP is restored to a finite cap and a useful alternative still acts',()=>{
    const b=fixture({hp:167});b.active(1).maxPp[SK.hit]=50;b.active(1).pp[SK.hit]=0;assert.deepEqual(decide(b),item(PP));turn(b,SK.wait,item(PP));assert.equal(b.active(1).pp[SK.hit],20);assert.equal(b.active(1).maxPp[SK.hit],50);
    const alternative=fixture({hp:167,foeHp:70,ownSkills:[SK.hit,SK.strong]});alternative.active(1).pp[SK.strong]=0;assert.deepEqual(decide(alternative),{kind:'move',skill:SK.hit});
    const useless=fixture({hp:167,ownSkills:[SK.wait]});useless.active(1).pp[SK.wait]=0;assert.notEqual(decide(useless).item,PP);
  });
  check('A lasting disabling status can be cured; an expiring one is not overvalued',()=>{
    const b=fixture({hp:167});add(b,'fear',3);assert.deepEqual(decide(b),item(CURE));turn(b,SK.wait,item(CURE));assert(!b.active(1).conditions.some(c=>c.id==='fear'));
    const expiring=fixture({hp:167});add(expiring,'fear',1);assert.notEqual(decide(expiring).item,CURE);
  });
  check('The real potion-backlash script remains harmful and the AI refuses HP medicine',()=>{
    const b=fixture();b.scripts.seer_eff_69.apply({battle:b,user:b.active(0),foe:b.active(1)},[3]);assert.notEqual(decide(b).item,HP);
    const events=turn(b,SK.wait,item(HP));assert.equal(b.active(1).hp,0);assert(events.some(e=>e.type==='damage'&&e.side===1&&e.kind==='fixed'));
  });
  check('Partial healing may be used on consecutive turns while it builds a real attack opportunity',()=>{
    const b=fixture({hp:10,maxHp:400,speed:100,supplies:[SMALL]});const actions=[];
    for(let i=0;i<12&&!b.result;i++){const chosen=decide(b);actions.push(chosen);turn(b,SK.hit,chosen);if(chosen.kind==='move')break;}
    assert(actions.slice(0,4).every(a=>a.kind==='item'&&a.item===SMALL),JSON.stringify(actions));assert(actions.some(a=>a.kind==='move'));
    report.witnesses.push({case:'Consecutive partial potions accumulate survival HP',actions,hp:b.active(1).hp});
    const finite=fixture({hp:10,maxHp:400,speed:100,supplies:[]});finite.sides[1].items[SMALL]=1;assert.notEqual(decide(finite).item,SMALL,'One finite potion cannot fund the several-potion rescue plan');
  });
  check('A visible damage-over-time tick cannot turn a doomed potion into an attack opportunity',()=>{
    const b=fixture({hp:30,maxHp:400,supplies:[SMALL]});add(b,'poison',3);assert.notEqual(decide(b).item,SMALL);
    turn(b,SK.hit,item(SMALL));assert.equal(b.active(1).hp,0);
  });
  check('An unchanged full-heal cycle stops while a new opposing low HP permits another rescue',()=>{
    const b=fixture();turn(b,SK.hit,item(HP));assert.notEqual(decide(b).item,HP);
    turn(b,SK.hit,{kind:'move',skill:SK.hit});assert.equal(decide(b).item,HP);
  });
  check('Public opponent entries separate individual recovery exchanges, including identical species',()=>{
    const b=fixture();turn(b,SK.hit,item(HP));assert(!auditProgress(b,b.active(1),b.active(0),'heal',false));
    b.log.push({type:'switch_in',side:0,slot:1,species:1,hp:167,maxHp:167});assert(auditProgress(b,b.active(1),b.active(0),'heal',false));
  });
  check('Healing an opposing reserve does not count as progress against the active opponent',()=>{
    const b=fixture();turn(b,SK.hit,item(HP));b.log.push({type:'item_used',side:0,item:HP,slot:1},{type:'heal',side:0,slot:1,amount:20,hp:20,maxHp:400});
    assert(!auditProgress(b,b.active(1),b.active(0),'heal',false));
  });
  check('Curing a reserve cannot remove the active member status from recovery history',()=>{
    const b=fixture({hp:167});add(b,'poison',3);turn(b,SK.wait,item(CURE));
    add(b,'poison',3);b.log.push({type:'item_used',side:1,item:CURE,slot:1},{type:'condition_removed',side:1,slot:1,condition:'poison'});
    assert(!auditProgress(b,b.active(1),b.active(0),'cure_status',false));
  });
  check('Finite inventory is not treated as an unlimited repeat policy',()=>{
    const b=fixture();turn(b,SK.hit,item(HP));b.active(1).hp=30;b.log.push({type:'damage',side:1,slot:0,amount:57,hp:30,maxHp:167});assert.notEqual(decide(b).item,HP);
    b.sides[1].unlimitedItems.clear();b.sides[1].items[HP]=2;assert.equal(decide(b).item,HP);turn(b,SK.wait,item(HP));assert.equal(b.sides[1].items[HP],1);
  });
  check('Boss, wild, sequence, random, and forced-move behavior stays outside trainer medicine',()=>{
    for(const ownKind of ['boss','wild'])assert.equal(decide(fixture({ownKind})).kind,'move');
    for(const ownAi of [{kind:'sequence',skills:[SK.hit]},{kind:'random'}])assert.equal(decide(fixture({ownAi})).kind,'move');
    const forced=fixture();forced.active(1).vol.forcedSkill=SK.hit;assert.deepEqual(decide(forced),{kind:'move',skill:SK.hit});
  });
  check('Medicine planning is deterministic and reads no private opponent fields or live callbacks',()=>{
    for(const setup of [()=>fixture(),()=>{const b=fixture({hp:167});b.active(1).pp[SK.hit]=0;return b;},()=>{const b=fixture({hp:167});add(b,'fear',3);return b;}]){
      const b=setup(),before=snapshot(b),expected=decide(b);assert.deepEqual(decide(b),expected);assert.equal(snapshot(b),before);
      for(const key of ['stats','skills','pp','maxPp','usedSkills','skillUses'])Object.defineProperty(b.active(0),key,{configurable:true,get(){throw Error(`Hidden opposing ${key}`);}});
      for(const key of ['pending','items','unlimitedItems'])Object.defineProperty(b.sides[0],key,{configurable:true,get(){throw Error(`Hidden opposing side ${key}`);}});
      Object.defineProperty(b.sides[0].team,'1',{configurable:true,get(){throw Error('Hidden opposing reserve');}});
      for(const key of ['estimateDamage','effStat','priority','callScript'])b[key]=()=>{throw Error(`Live ${key}`);};assert.deepEqual(decide(b),expected);
    }
  });

  const run=(name,b)=>{
    let longestItems=0,streaks=[0,0],itemsBySide=[0,0];const actions=[],raw=b.doAction.bind(b);
    b.doAction=(side,action,first)=>{actions.push({turn:b.turn,side,...action});streaks[side]=action.kind==='item'?streaks[side]+1:0;longestItems=Math.max(longestItems,streaks[side]);if(action.kind==='item')itemsBySide[side]++;return raw(side,action,first);};
    while(!b.result&&b.turn<205){b.resolveTurn();for(const side of b.sides)for(const mon of side.team){assert(Number.isFinite(mon.hp)&&mon.hp>=0&&mon.hp<=mon.maxHp);for(const id of mon.skills)assert(Number.isFinite(mon.pp[id])&&mon.pp[id]>=0&&mon.pp[id]<=mon.maxPp[id]);}}
    assert(b.result);assert(b.turn<=b.maxTurns);const row={name,turns:b.turn,reason:b.result.reason,winner:b.result.winner,itemsBySide,longestItems,actions};report.battles.push(row);return row;
  };
  check('Both unlimited-potion AIs escape a simple full-heal mirror without reaching the turn cap',()=>{
    const make=()=>{const b=fixture({hp:30,foeHp:30,ownSkills:[SK.weak],foeSkills:[SK.weak,SK.wait],supplies:[...TRAINER_UNLIMITED_ITEMS],foeSupplies:[...TRAINER_UNLIMITED_ITEMS],foeAi:{kind:'smart'}});b.log=[{type:'move_used',side:0,skill:SK.weak},{type:'move_used',side:1,skill:SK.weak}];return b;};
    const a=run('Unlimited highest-supply mirror',make()),b=run('Unlimited highest-supply deterministic replay',make());assert.equal(a.reason,'ko');assert(a.itemsBySide.every(n=>n>0));assert.deepEqual(a.actions,b.actions);
  });
  const catalog=await loadCatalog(),catalogBefore=JSON.stringify(catalog),battleCatalog={...catalog,items:[...normalizeBattleSupplyItems(catalog.items),cure]},actual=buildDataSet(battleCatalog),by=new Map(catalog.trainers.map(t=>[t.id,t]));
  const pairs=[['trainer_attrition','trainer_offense'],['trainer_offense','trainer_control'],['trainer_control','trainer_trained_core'],['trainer_trained_core','trainer_trained_core'],['trainer_fast_pressure','trainer_trained_core'],['trainer_resilient_counter','trainer_control']];
  report.supplies=TRAINER_UNLIMITED_ITEMS.map(id=>({id,effects:actual.items.get(id)?.battle_effects}));
  check('Twelve real six-versus-six trainer matches use final supplies and remain finite',()=>{
    for(const [left,right]of pairs)for(const seed of [7,29]){
      const teams=[left,right].map(id=>normalizeNpcTrainingEncounter(catalog,by.get(id)).team);
      const b=createBattle({data:actual,scripts:{...SEER_SCRIPTS,...npcTrainingScripts},seed,sides:teams.map(team=>({kind:'trainer',team,ai:{kind:'smart',allow_switch:true},unlimited_items:[...TRAINER_UNLIMITED_ITEMS]}))});
      run(`${left} versus ${right}, seed ${seed}`,b);
    }
    assert.equal(JSON.stringify(catalog),catalogBefore);
  });
  report.summary={battles:report.battles.length,turnCaps:report.battles.filter(row=>row.reason==='turn_cap').length,maxTurns:Math.max(...report.battles.map(row=>row.turns)),itemsBySide:[0,1].map(side=>report.battles.reduce((sum,row)=>sum+row.itemsBySide[side],0)),longestItems:Math.max(...report.battles.map(row=>row.longestItems))};
}catch(error){report.failures.push({name:'Harness',error:String(error.stack)});}
finally{
  await server.close();report.tacticsSha256=crypto.createHash('sha256').update(fs.readFileSync('battle/core/src/tactics.ts')).digest('hex');
  fs.mkdirSync('artifacts/potion-ai-v48',{recursive:true});fs.writeFileSync('artifacts/potion-ai-v48/regression.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.checks.length,failures:report.failures,supplies:report.supplies,summary:report.summary,battles:report.battles.map(({actions,...row})=>row)},null,2));if(report.failures.length)process.exitCode=1;
}
