/** Execute the production item-card and submission handlers against real controllers. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseSync,transformSync} from 'rolldown/utils';
import {createServer} from 'vite';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=fs.readFileSync(path.join(root,'src/features/battle/ui/Battle.tsx'),'utf8');
const parsed=parseSync('Battle.tsx',source);assert.equal(parsed.errors.length,0);
const nodes=[];
function visit(node){if(!node||typeof node!=='object')return;nodes.push(node);for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}}
visit(parsed.program);
function definition(name){
  const matches=nodes.filter(node=>(node.type==='FunctionDeclaration'||node.type==='VariableDeclarator')&&node.id?.name===name);
  assert.equal(matches.length,1,`Unique production ${name}`);const node=matches[0];
  return node.type==='FunctionDeclaration'?source.slice(node.start,node.end):`const ${name}=${source.slice(node.init.start,node.init.end)};`;
}
const production=transformSync('handlers.ts',`${definition('submit')}\n${definition('chooseItem')}`).code;
const clicks=nodes.filter(node=>node.type==='JSXAttribute'&&node.name?.name==='onClick').map(node=>node.value?.expression).filter(Boolean);
function clickContaining(fragment,bindings){const matches=clicks.filter(node=>source.slice(node.start,node.end).includes(fragment));assert.equal(matches.length,1,`Unique ${fragment} click`);const expression=transformSync('click.ts',`const click=${source.slice(matches[0].start,matches[0].end)};`).code;return new Function(...Object.keys(bindings),expression+'return click;')(...Object.values(bindings));}
function handlers(game,overrides={}){
  const actions=[],selected=[],busyStates=[],messages=[],locked={current:false};
  const b={...game.snapshot().battle,...overrides};
  const bindings={b,busy:!!overrides.busy,disabled:!!overrides.busy||b.finished,locked,
    c:{dispatch:action=>{actions.push(action);game.dispatch(action);},snapshot:()=>game.snapshot()},
    gameAudio:{playSfx:()=>{}},setBusy:value=>busyStates.push(value),setDialogue:value=>messages.push(value),setItemSelection:id=>selected.push(id)};
  const result=new Function(...Object.keys(bindings),production+'return {chooseItem,submit};')(...Object.values(bindings));
  return {...result,actions,selected,locked,busyStates,messages,
    click:item=>clickContaining('chooseItem(item)',{chooseItem:result.chooseItem,item})(),
    use:(selectedItem,target)=>clickContaining("type: 'battleItem'",{selectedItem,target,submit:result.submit})()};
}
const checks=[],failures=[],capsules=[];
function check(name,run){try{run();checks.push(name);}catch(error){failures.push({name,error:String(error.stack)});console.error(`FAIL ${name}: ${error.message}`);}}
const previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}});
const cacheDir=path.join(root,'artifacts/.validation-cache/battle-capsule-click');
const server=await createServer({root,configFile:false,cacheDir,server:{middlewareMode:true,watch:null,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom',logLevel:'error'});
try{
  const [{loadCatalog},{createGame}]=await Promise.all(['/src/domain/catalog/catalog.ts','/src/kernel/game.ts'].map(file=>server.ssrLoadModule(file)));
  const catalog=await loadCatalog(),base=JSON.parse(createGame(catalog,'').exportSave());
  base.rng_state=[101,202,303,404];
  for(const item of catalog.items)if(item.kind==='capsule'||item.battle_effects?.length)base.items[item.id]=3;
  const make=(input=catalog,save=base)=>createGame(input,JSON.stringify(structuredClone(save)));
  const wild=(input=catalog,species=22)=>{const game=make(input);game.dispatch({type:'startTraining',species,level:3});assert(game.snapshot().battle);return game;};
  const count=(game,id)=>game.snapshot().items.find(item=>item.id===id)?.count??0;
  const item=(game,id)=>game.snapshot().items.find(value=>value.id===id);
  const failedData=structuredClone(catalog);failedData.species.find(species=>species.id===22).catch_rate=0;

  check('Capsule cards invoke direct use and no second capture confirmation remains',()=>{
    assert(source.includes('onClick={() => chooseItem(item)}'));
    assert(source.includes('aria-label={activeItemCategory === \'capsule\' ? `使用${item.name}捕捉${b.enemy.name}` : undefined}'));
    assert(!source.includes('使用选中胶囊捕捉'));
  });
  for(const capsule of catalog.items.filter(value=>value.kind==='capsule'))check(`${capsule.id}: one click consumes exactly one, repeated clicks stay locked`,()=>{
    const game=wild(failedData),ui=handlers(game),chosen=item(game,capsule.id),before=game.snapshot();
    assert(before.battle.canCapture);ui.click(chosen);
    assert.deepEqual(ui.actions,[{type:'capture',itemId:capsule.id}]);assert.equal(count(game,capsule.id),chosen.count-1);
    assert(game.snapshot().battle.animation.revision>before.battle.animation.revision);
    assert(game.snapshot().battle.animation.frames.some(frame=>frame.kind==='capture'));
    const save=game.exportSave(),battle=JSON.stringify(game.snapshot().battle);
    ui.click(chosen);ui.click(chosen);assert.equal(ui.actions.length,1);assert.equal(game.exportSave(),save);assert.equal(JSON.stringify(game.snapshot().battle),battle);
    assert.equal(ui.locked.current,true);assert.deepEqual(ui.selected,[]);capsules.push(capsule.id);
  });
  check('Successful direct capture adds one creature and preserves the capsule animation',()=>{
    const game=wild(),before=game.snapshot().monsters.length,ui=handlers(game);ui.click(item(game,'item_capsule_master'));
    assert(game.snapshot().battle.captured);assert.equal(game.snapshot().monsters.length,before+1);
    assert(game.snapshot().battle.animation.frames.some(frame=>frame.kind==='capture'&&frame.captureSuccess));
  });
  check('A failed attempt permits one fresh click after its animation is released',()=>{
    const game=wild(failedData),first=handlers(game);first.click(item(game,'item_capsule_basic'));
    assert(!game.snapshot().battle.finished);assert(game.snapshot().battle.animation.frames.some(frame=>frame.kind==='capture'&&!frame.captureSuccess));
    const second=handlers(game);second.click(item(game,'item_capsule_basic'));second.click(item(game,'item_capsule_basic'));
    assert.equal(count(game,'item_capsule_basic'),1);assert.equal(first.actions.length,1);assert.equal(second.actions.length,1);
  });
  check('Bosses, trainers and the Niao prerequisite retain their capture rejection',()=>{
    const boss=make();boss.dispatch({type:'startBattle',bossId:catalog.bosses[0].id});
    const trainer=make();trainer.dispatch({type:'startFacility',facilityId:'random'});
    for(const game of [boss,trainer,wild(catalog,416)]){assert(game.snapshot().battle);assert.equal(game.snapshot().battle.canCapture,false);const ui=handlers(game),save=game.exportSave(),battle=JSON.stringify(game.snapshot().battle);ui.click(item(game,'item_capsule_master'));assert.equal(ui.actions.length,0);assert.equal(game.exportSave(),save);assert.equal(JSON.stringify(game.snapshot().battle),battle);}
  });
  check('Busy, finished, replacement and empty-inventory cards cannot submit',()=>{
    for(const blocked of [{busy:true},{finished:true},{needsSwitch:true},{}]){const game=wild(),ui=handlers(game,blocked),chosen={...item(game,'item_capsule_basic'),...(Object.keys(blocked).length?{}:{count:0})},save=game.exportSave();ui.click(chosen);assert.equal(ui.actions.length,0);assert.equal(game.exportSave(),save);}
  });
  check('Recovery and status cards only select; the existing Use action retains its target',()=>{
    const game=wild(),ui=handlers(game),save=game.exportSave();
    const supplies=game.snapshot().items.filter(value=>value.battleCategory==='recovery'||value.battleCategory==='status');
    assert(supplies.some(value=>value.battleCategory==='status'));assert(supplies.some(value=>value.battleCategory==='recovery'));
    for(const supply of supplies)ui.click(supply);
    assert.deepEqual(ui.selected,supplies.map(value=>value.id));assert.equal(ui.actions.length,0);assert.equal(game.exportSave(),save);
    const injuredSave=structuredClone(base);for(const mon of injuredSave.storage)mon.hp=1;
    const healing=make(catalog,injuredSave);healing.dispatch({type:'startTraining',species:22,level:3});
    const patient=healing.snapshot().battle.party[1],potion=healing.snapshot().items.find(value=>value.battleCategory==='recovery'&&value.usableTargetUids?.includes(patient.uid));assert(potion);
    const recovery=handlers(healing);recovery.click(potion);assert.equal(recovery.actions.length,0);recovery.use(potion,patient);
    assert.deepEqual(recovery.actions,[{type:'battleItem',itemId:potion.id,targetUid:patient.uid}]);assert.equal(count(healing,potion.id),potion.count-1);assert(healing.snapshot().battle.party.find(mon=>mon.uid===patient.uid).hp>1);
  });
}finally{
  await server.close();if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else delete globalThis.localStorage;
  fs.mkdirSync(path.join(root,'artifacts/battle-capsule-click'),{recursive:true});
  fs.writeFileSync(path.join(root,'artifacts/battle-capsule-click/regression.json'),JSON.stringify({scope:'Production click and submission functions with real controllers; browser layout is outside this check.',checks,failures,capsules},null,2)+'\n');
}
console.log(JSON.stringify({passed:checks.length,failed:failures.length,capsules:capsules.length}));
if(failures.length)process.exitCode=1;
