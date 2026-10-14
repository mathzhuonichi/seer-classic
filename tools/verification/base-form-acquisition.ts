import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildAcquisitionIndex, buildPaidAcquisitionSeeds, type AcquisitionCatalog} from '../../src/progression/acquisition';
import {buildInitialFormAcquisitionIndex} from '../../src/progression/initial-acquisition';

export function verifyBaseFormAcquisition() {
  const catalog=JSON.parse(fs.readFileSync('data/gamedata.json','utf8'));
  catalog.bosses=fs.readdirSync('data/bosses').filter(file=>file.endsWith('.json')).sort().map(file=>JSON.parse(fs.readFileSync(`data/bosses/${file}`,'utf8')));
  const graph=buildAcquisitionIndex(catalog,undefined,undefined,[]),initial=buildInitialFormAcquisitionIndex(catalog,graph);
  for(const id of [19,20,21]){
    const entry=initial.get(id)!;
    assert.deepEqual(entry.initialForms.map(base=>base.species),[19]);
    assert.equal(entry.initialForms[0].routes.length,0,'Adult challenge reward must never become an infant acquisition entry.');
  }
  assert.equal(graph.get(21)!.status,'available','The adult challenge stays in the internal coverage graph.');
  for(const [id,root] of [[3,1],[6,4],[9,7],[303,301],[306,304],[309,307]]){
    const bases=initial.get(id)!.initialForms;
    assert.deepEqual(bases.map(base=>base.species),[root]);
    assert(bases[0].routes.length>0);
    assert(bases[0].routes.every(route=>route.entrySpecies===root&&route.kind!=='evolution'));
    assert(bases[0].evolutionPath.every(step=>step.implemented));
  }
  for(const id of [92,93,94])assert.deepEqual(initial.get(id)!.initialForms.map(base=>base.species),[91]);
  const species=[1,4,7,800,801,802,803,804,805,806,807,808].map(id=>({id,name:{zh:String(id)},evolves_from:null as number|null,evolution:[] as {to:number;method:string;level?:number}[]}));
  const edge=(from:number,to:number)=>species.find(s=>s.id===from)!.evolution.push({to,method:'level',level:10});
  edge(800,802);edge(801,803);edge(803,804);edge(802,804);edge(800,804);
  species.find(s=>s.id===805)!.evolves_from=801; // ancestry without an implemented edge
  edge(806,807);edge(807,806); // rootless cycle
  edge(801,808); // sibling must never provide a route for 805
  const tiny={species,bosses:[]} satisfies AcquisitionCatalog;
  assert.deepEqual(buildPaidAcquisitionSeeds(tiny),[],'An empty miniature SPT catalog must not auto-unlock paid seeds.');
  const injected=buildAcquisitionIndex(tiny,[],[],[
    {species:800,route:{kind:'quest',entrySpecies:800,questId:'paid-base-800',label:'Paid initial quest'}},
    {species:808,route:{kind:'boss',entrySpecies:808,bossId:'adult-sibling',label:'Adult sibling reward'}},
    {species:999999,route:{kind:'quest',entrySpecies:999999,questId:'outside-catalog',label:'Outside catalog'}},
  ]);
  const tinyInitial=buildInitialFormAcquisitionIndex(tiny,injected);
  const joined=tinyInitial.get(804)!.initialForms;
  assert.deepEqual(joined.map(base=>base.species).sort(),[800,801]);
  assert.equal(joined.find(base=>base.species===800)!.evolutionPath.length,1,'Use the shortest root-to-target ancestry path.');
  assert.equal(joined.find(base=>base.species===801)!.evolutionPath.length,2);
  assert.equal(joined.find(base=>base.species===800)!.routes[0].questId,'paid-base-800');
  assert.equal(joined.find(base=>base.species===801)!.routes.length,0,'Do not borrow a sibling adult route.');
  assert.equal(tinyInitial.get(805)!.initialForms[0].evolutionPath[0].implemented,false);
  assert.equal(tinyInitial.get(805)!.initialForms[0].routes.length,0);
  assert.deepEqual(tinyInitial.get(806)!.initialForms,[],'A rootless ancestry cycle must not invent a base.');
  assert.equal(injected.size,species.length,'Additional seed IDs outside this catalog do not leak into it.');
  assert.equal(injected.get(804)!.status,'available','An injected initial quest extends real forward evolution.');
  for(const id of [122,123,124,125])assert(initial.get(id)!.excluded&&initial.get(id)!.initialForms.every(base=>!base.routes.length));
  for(const [id,entry] of initial)for(const base of entry.initialForms)for(const route of base.routes)assert.equal(route.entrySpecies,base.species,`Initial entry belongs to the root for ${id}`);
  const paidSeeds=buildPaidAcquisitionSeeds(catalog),paidGraph=buildAcquisitionIndex(catalog);
  for(const seed of paidSeeds){assert(paidGraph.get(seed.species)?.routes.some(route=>route.kind==='quest'&&route.questId===seed.route.questId));assert.equal(seed.route.entrySpecies,seed.species);}
  return {paidInitialSeeds:paidSeeds.length,catalogSpecies:catalog.species.length,checkedInitialEntries:initial.size,passed:['19/20/21 adult route retained but unavailable initial entry hidden','starter and fusion infant links','source branch initial forms','multi-root ancestry and shortest paths','unsupported ancestry transformation distinguished','rootless cycle rejected','sibling adult reward rejected','paid initial quest seed extends evolution','outside-catalog seeds ignored','NPC entries excluded','all advertised routes match their initial form']};
}
