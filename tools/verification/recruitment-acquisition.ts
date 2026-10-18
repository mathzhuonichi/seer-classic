import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildAcquisitionIndex,type AcquisitionCatalog,type AcquisitionSeed} from '../../src/progression/acquisition.ts';
import {buildInitialFormAcquisitionIndex} from '../../src/progression/initial-acquisition.ts';
import {buildRecruitmentRewards,initialSpecies,type RecruitmentPrerequisite} from '../../src/progression/recruitment.ts';
import {getEligibleRecruitmentSPTs} from '../../src/progression/spt-recruitment.ts';
import {FUSION_RECIPES,type FusionRecipe} from '../../src/progression/fusion.ts';
import {BREEDING_RECIPES,getBreedingGender} from '../../src/progression/breeding.ts';
import {NIAO_CAPTURE_PARTNERS} from '../../battle/core/src/capture.ts';
import {WORLD_PLANETS,type WorldPlanet} from '../../src/world.ts';

export function verifyRecruitmentAcquisition(){
 const catalog=JSON.parse(fs.readFileSync('data/gamedata.json','utf8'));
 catalog.bosses=fs.readdirSync('data/bosses').filter(file=>file.endsWith('.json')).sort().map(file=>JSON.parse(fs.readFileSync(`data/bosses/${file}`,'utf8')));
 const original=JSON.stringify(catalog),graph=buildAcquisitionIndex(catalog),initial=buildInitialFormAcquisitionIndex(catalog,graph);
 const roots=initialSpecies(catalog),rewards=buildRecruitmentRewards(catalog),eligible=new Set(getEligibleRecruitmentSPTs(catalog).map(boss=>boss.id));
 const available=(id:number)=>graph.get(id)?.status==='available';
 assert.equal(roots.length,632);
 for(const root of roots)assert(initial.get(root.id)?.initialForms.some(form=>form.species===root.id&&form.routes.length),`Initial form ${root.id} must have an executable entry.`);
 for(const reward of rewards){
  assert(reward.prerequisites.length>0&&reward.prerequisites.length<=6);
  const route=graph.get(reward.rewardSpecies)?.routes.find(route=>route.kind==='quest'&&route.questId===reward.questId);
  assert(route,`${reward.questId} needs a reachable, gated entry.`);
  assert.equal(route.entrySpecies,reward.rewardSpecies);
  for(const condition of reward.prerequisites)assert(condition.kind==='species'?available(condition.species):eligible.has(condition.bossId));
 }
 const baseline=buildAcquisitionIndex(catalog,undefined,undefined,[]);
 for(const reward of rewards)assert(!baseline.get(reward.rewardSpecies)?.routes.some(route=>route.questId===reward.questId),'An explicit empty seed array disables all generated recruitment tasks.');
 const collectionMapEntries=WORLD_PLANETS.flatMap(planet=>planet.regions.flatMap(region=>(region.recruitmentSpecies??[]).map(species=>({species,planetId:planet.id,regionId:region.id}))));
 assert.deepEqual([...new Set(collectionMapEntries.map(entry=>entry.species))].sort((a,b)=>a-b),[406,430,560,576,760,789,818,831]);
 for(const entry of collectionMapEntries){
  assert(rewards.some(reward=>reward.rewardSpecies===entry.species),`Map collection entry ${entry.species} requires a visible task.`);
  for(const candidate of [graph,baseline])assert(!candidate.get(entry.species)?.routes.some(route=>route.kind==='wild'&&route.planetId===entry.planetId&&route.regionId===entry.regionId),`Map collection entry ${entry.species} must not become a direct capture or essence seed, even with recruitment tasks disabled.`);
 }
 for(const recipe of FUSION_RECIPES)assert(recipe.primary.some(available)&&recipe.secondary.some(available),`${recipe.id} needs both reachable parents.`);
 for(const recipe of BREEDING_RECIPES){
  assert(recipe.maleSpecies.some(id=>getBreedingGender(id)===1&&graph.get(id)?.routes.some(route=>!route.breedingRecipeId)),`${recipe.id} needs a first-generation male.`);
  assert(recipe.femaleSpecies.some(id=>getBreedingGender(id)===2&&available(id)),`${recipe.id} needs a reachable female.`);
 }
 const niaoRoutes=graph.get(416)?.routes.filter(route=>route.kind==='wild')??[];
 assert(niaoRoutes.length>0);
 for(const route of niaoRoutes){assert.deepEqual(route.requiredActiveSpecies,NIAO_CAPTURE_PARTNERS);assert(route.label.includes('需先获得并派出'));}

 const tiny:AcquisitionCatalog={species:[1,4,7,47,77,78,79,122,310,311,312,416,800,801,802,803,900].map(id=>({id,name:{zh:String(id)},obtain:['wild'],catch_rate:255,evolves_from:null,evolution:[]})),bosses:[]};
 const gate=(id:number,prerequisites:readonly RecruitmentPrerequisite[]):AcquisitionSeed=>({species:id,route:{kind:'quest',entrySpecies:id,questId:`fixture-${id}`,label:`Fixture reward ${id}`},prerequisites});
 const direct=(id:number):AcquisitionSeed=>({species:id,route:{kind:'quest',entrySpecies:id,questId:`direct-${id}`,label:`Explicit fixture ${id}`}});
 const blocked=(seeds:AcquisitionSeed[],source=tiny)=>assert.equal(buildAcquisitionIndex(source,[],[],seeds,[]).get(800)?.status,'unimplemented');
 blocked([gate(800,[])]);
 blocked([gate(800,[{kind:'species',species:999999}])]);
 blocked([gate(800,[{kind:'species',species:1},{kind:'species',species:900}])]);
 blocked([direct(122),gate(800,[{kind:'species',species:122}])]);
 blocked([gate(800,[{kind:'boss',bossId:'missing-spt'}])]);
 blocked([gate(800,Array.from({length:7},()=>({kind:'species' as const,species:1})))]);
 const realBoss={id:'boss_spt_moguguai',name:{zh:'Mushroom'},category:'spt',team:[{species:47}]};
 const withBoss={...tiny,bosses:[realBoss]};
 const bossGate=gate(800,[{kind:'species',species:1},{kind:'boss',bossId:realBoss.id}]);
 assert.equal(buildAcquisitionIndex(withBoss,[],[],[bossGate],[]).get(800)?.status,'available');
 blocked([bossGate],{...withBoss,bosses:[{...realBoss,category:'event'}]});
 blocked([bossGate],{...withBoss,bosses:[{...realBoss,team:[{species:900}]}]});
 blocked([bossGate],{...withBoss,species:tiny.species.filter(species=>species.id!==47)});
 const cycle=[gate(800,[{kind:'species',species:801}]),gate(801,[{kind:'species',species:800}])];
 blocked(cycle);
 assert.equal(buildAcquisitionIndex(tiny,[],[],[direct(800),...cycle],[]).get(801)?.status,'available','A real external entry can break a dependency cycle.');
 const evolution=structuredClone(tiny);evolution.species.find(species=>species.id===800)!.evolution=[{to:801,method:'level',level:10}];
 const chain=buildAcquisitionIndex(evolution,[],[],[gate(802,[{kind:'species',species:801}]),gate(800,[{kind:'species',species:1}])],[]);
 assert.equal(chain.get(802)?.status,'available','Quest, forward evolution and a later quest share one closure.');
 const fusion=(id:number,primary:number,secondary:number):FusionRecipe=>({id:`fixture-fusion-${id}`,name:'Fixture fusion',primary:[primary],secondary:[secondary],minPrimaryLevel:1,minSecondaryLevel:1,beadName:'Fixture bead',outcomes:[{species:id,weight:100,beadName:'Fixture bead'}],sources:[],probabilityBasis:'remake'});
 const fusionChain=buildAcquisitionIndex(tiny,[],[fusion(800,1,4),fusion(802,801,7)],[gate(801,[{kind:'species',species:800}])],[]);
 assert.equal(fusionChain.get(802)?.status,'available','Fusion parents and recruitment conditions propagate together.');
 const habitat:WorldPlanet={id:'fixture',name:'Fixture',subtitle:'',theme:'',color:'',galaxyId:'pano',background:'',regions:[{id:'niao',name:'Niao habitat',description:'',x:0,y:0,creatures:[416],levels:[5,5]}]};
 const collectionHabitat:WorldPlanet={...habitat,regions:[{...habitat.regions[0],id:'collection',creatures:[800],creatureLevels:{800:[5,5]},recruitmentSpecies:[800]}]};
 assert.equal(buildAcquisitionIndex(tiny,[collectionHabitat],[],[],[]).get(800)?.status,'unimplemented','A collection map entry grants neither a capsule nor challenge essence seed.');
 const independentHabitat:WorldPlanet={...collectionHabitat,regions:[...collectionHabitat.regions,{...collectionHabitat.regions[0],id:'native',recruitmentSpecies:[]}]};
 assert.equal(buildAcquisitionIndex(tiny,[independentHabitat],[],[],[]).get(800)?.status,'available','An independently supported native map route remains usable for the same species.');
 const independentBoss={...realBoss,reward_hatches:800};
 assert.equal(buildAcquisitionIndex({...tiny,bosses:[independentBoss]},[collectionHabitat],[],[],[]).get(800)?.status,'available','A real independent boss reward survives a map collection gate.');
 assert.equal(buildAcquisitionIndex(tiny,[habitat],[],[],[]).get(416)?.status,'unimplemented','A mapped Niao is not a seed without an eligible active partner.');
 for(const partner of NIAO_CAPTURE_PARTNERS)assert.equal(buildAcquisitionIndex(tiny,[habitat],[],[direct(partner)],[]).get(416)?.status,'available',`Capture accepts reachable partner ${partner}.`);
 const captureChain=buildAcquisitionIndex(tiny,[habitat],[],[gate(800,[{kind:'species',species:416}]),gate(77,[{kind:'species',species:1}])],[]);
 assert.equal(captureChain.get(800)?.status,'available','Recruitment, gated capture and later recruitment share one closure.');
 assert.equal(JSON.stringify(catalog),original,'Graph verification does not mutate catalog records.');
 const report={initialForms:roots.length,recruitmentRewards:rewards.length,mapCollectionEntries:collectionMapEntries,readyFusionRecipes:FUSION_RECIPES.length,readyBreedingRecipes:BREEDING_RECIPES.length,checks:['all initial entries reachable','generated recruitment disabled by explicit empty seeds','map collection gates remain active without tasks; independent native routes survive','empty, missing, partial, NPC and excessive conditions reject','only present ordinary SPTs with catalog opponents pass','ungrounded cycles remain blocked','quest/evolution/fusion/capture dependency closure','all six Niao active forms and visible route requirement','source immutability']};
 console.log(JSON.stringify(report));return report;
}
