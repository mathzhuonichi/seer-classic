/** Read-only catalog audit and bounded ordinary-build sanity benchmark. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createServer} from 'vite';

const output='artifacts/elite-sub600-audit';
const statKeys=['hp','atk','def','spa','spd','spe'];
const bst=mon=>statKeys.reduce((sum,key)=>sum+mon.base[key],0);
const hash=path=>crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const files=['data/gamedata.json','data/npc-training-profiles.json','src/domain/challenges/battle-facilities.ts','src/domain/challenges/trainer-skills.ts','src/domain/challenges/npc-training.ts','src/domain/challenges/npc-training-scripts.ts','battle/core/src/battle.ts','battle/core/src/scripts/seer-main.ts','battle/core/src/scripts/seer-tail.ts'];
const sourceHashes=Object.fromEntries(files.map(path=>[path,hash(path)]));
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',logLevel:'error'});
try {
  const [{loadCatalog},{facilityPool,createFacilityEncounter},{trainerSkillOrigin},{createBattle,buildDataSet,Rng},{SEER_SCRIPTS},{normalizeNpcTrainingEncounter},{npcTrainingScripts}]=await Promise.all([
    '/src/domain/catalog/catalog.ts','/src/domain/challenges/battle-facilities.ts','/src/domain/challenges/trainer-skills.ts','/battle/core/src/index.ts','/battle/core/src/scripts/index.ts','/src/domain/challenges/npc-training.ts','/src/domain/challenges/npc-training-scripts.ts',
  ].map(path=>server.ssrLoadModule(path)));
  const catalog=await loadCatalog(),snapshot=JSON.stringify(catalog),data=buildDataSet(catalog);
  const species=new Map(catalog.species.map(mon=>[mon.id,mon])),skills=new Map(catalog.skills.map(skill=>[skill.id,skill]));
  const collectible=facilityPool(catalog),low=collectible.filter(mon=>bst(mon)<600),elite=facilityPool(catalog,600);
  const natural=mon=>[...new Set(mon.learnset.filter(row=>Number.isInteger(row.level)&&row.level>=1&&row.level<=100).map(row=>row.skill))].map(id=>skills.get(id));
  const multi=skill=>(skill.effects??[]).some(fx=>fx.op==='multi_hit');
  const script=(skill,id)=>(skill.effects??[]).some(fx=>fx.op==='script'&&fx.id===id);
  const stage=(skill,key)=>(skill.effects??[]).filter(fx=>fx.op==='stat_stage'&&fx.target==='self'&&(fx.chance??100)===100).reduce((sum,fx)=>sum+(fx.stats?.[key]??0),0);
  const pick=skill=>({id:skill.id,name:skill.name.zh,type:skill.type,category:skill.category,power:skill.power,accuracy:skill.accuracy,pp:skill.pp,priority:skill.priority??0,effects:skill.effects??[]});
  const autoCache=new Map();
  const auto=mon=>{
    if(autoCache.has(mon.id))return autoCache.get(mon.id);
    // The existing factory stays authoritative: a six-member pool guarantees selection.
    const pool=[mon,...collectible.filter(row=>row.id!==mon.id).slice(0,5)];
    const member=createFacilityEncounter({...catalog,species:pool},'random',new Rng(45)).team.find(row=>row.species===mon.id);
    assert(member);autoCache.set(mon.id,member);return member;
  };
  const scan=low.map(mon=>{
    const moves=natural(mon).filter(skill=>!multi(skill)),preferred=mon.base.atk>=mon.base.spa?'atk':'spa';
    const ids=test=>moves.filter(test).map(skill=>skill.id);
    const attackCategory=preferred==='atk'?'physical':'special';
    return {species:mon.id,name:mon.name.zh,bst:bst(mon),base:mon.base,types:mon.types,
      attackAtLeast110:mon.base[preferred]>=110,speedAtLeast100:mon.base.spe>=100,
      directOffenseBoost2:ids(skill=>stage(skill,preferred)>=2),
      offenseAndSpeedBoost:ids(skill=>stage(skill,preferred)>0&&stage(skill,'spe')>0),
      fiveStatBoost:ids(skill=>['atk','def','spa','spd','spe'].every(key=>stage(skill,key)>0)),
      reliableDirectControl:ids(skill=>(skill.accuracy??100)>=85&&(skill.effects??[]).some(fx=>fx.op==='status'&&fx.target==='foe'&&(fx.chance??100)===100&&['sleep','paralysis','fear','petrify','fatigue'].includes(fx.status))),
      directHealAtLeast33:ids(skill=>(skill.effects??[]).some(fx=>fx.op==='heal'&&fx.target==='self'&&fx.pct_max_hp>=33)),
      alignedPriority:ids(skill=>skill.category===attackCategory&&skill.power>=45&&(skill.priority??0)>0),
      alignedPowerAtLeast140:ids(skill=>skill.category===attackCategory&&skill.power>=140),
      removeFoeBoosts:ids(skill=>(skill.effects??[]).some(fx=>fx.op==='clear_stages'&&fx.target==='foe'&&['up','all'].includes(fx.which))),
      percentHpScript:ids(skill=>script(skill,'seer_eff_28')),delayedKoScript:ids(skill=>script(skill,'seer_eff_62')),
      teamCriticalSacrificeScript:ids(skill=>script(skill,'seer_eff_71')),stageInheritanceScript:ids(skill=>script(skill,'seer_eff_59')),
      ohko:ids(skill=>(skill.effects??[]).some(fx=>fx.op==='ohko')),
      multiHitMoves:natural(mon).filter(multi).map(skill=>{const fx=skill.effects.find(fx=>fx.op==='multi_hit');return {...pick(skill),nominalPowerTimesMeanHits:skill.power*((fx.min??2)+(fx.max??fx.min??2))/2};}),
    };
  });
  for(const row of scan)row.screenedTags=[
    row.attackAtLeast110&&row.speedAtLeast100&&row.alignedPowerAtLeast140.length&&row.alignedPriority.length?'fast-offense-with-priority':null,
    row.directOffenseBoost2.length&&row.alignedPowerAtLeast140.length?'large-offense-boost-with-finisher':null,
    row.fiveStatBoost.length?'five-stat-setup':null,
    row.reliableDirectControl.length&&row.attackAtLeast110&&row.speedAtLeast100?'fast-direct-control':null,
    row.directHealAtLeast33.length&&row.directOffenseBoost2.length?'boost-and-heal':null,
    row.percentHpScript.length||row.delayedKoScript.length||row.teamCriticalSacrificeScript.length||row.stageInheritanceScript.length?'special-script-role':null,
  ].filter(Boolean);
  const planned=[
    {id:70,moves:[10825,20364,10823,10166],reason:'Exact-species reward moves: attack/speed +2, priority +2, clear boosts; permanent training is a separate NPC profile.'},
    {id:261,moves:[10715,20312,10710,20309],reason:'Attack 119, speed 105; attack/accuracy +2, 150-power boost removal, priority, healing; optional single seal is separate.'},
    {id:421,moves:[11140,20564,10632,11135],reason:'Special attack 112, speed 103; five-stat setup and direct removal of opposing boosts.'},
    {id:468,moves:[11224,20486,20488,11017],reason:'Special attack 114, speed 108; 90-accuracy sleep plus special attack +2 and a 150-power finisher.'},
    {id:774,moves:[11884,20486,20957,10981],reason:'HP 123, special attack 113, speed 102; sleep and special attack/accuracy +2.'},
    {id:798,moves:[11925,20982,11924,10223],reason:'Attack 118, speed 101; sure-hit 150 power, offense/speed setup, priority; boost theft is a script the AI does not value.'},
    {id:865,moves:[12079,21070,12080,10060],reason:'Speed 115; attack +2 and both defenses +1, priority +2, boost removal; scripted blind-wind utility requires separate AI work.'},
    {id:875,moves:[12112,21090,11919,12110],reason:'Attack 117, speed 102; five-stat setup, 130-power boost removal, 85-power priority.'},
    {id:927,moves:[12217,20114,12216,20116],reason:'Attack/speed +2, priority, full heal with self-fatigue cost; slower initial speed 91.'},
    {id:1260,moves:[12937,20486,21533,12934],reason:'Attack 119, speed 105; sleep, attack/speed setup and 75-power priority.'},
    {id:1447,moves:[12079,21070,12080,10060],equivalentTo:865,reason:'The catalog base stats, types and learnset equal species 865; separate identity, same battle build.'},
    {id:1477,moves:[13423,21817,13422,13421],reason:'Special attack 116, speed 103; special attack +2, 75-power special priority and boost removal; full heal is an alternative fifth move.'},
  ];
  const shortlist=planned.map(plan=>{
    const mon=species.get(plan.id),automatic=auto(mon);
    assert(bst(mon)<600&&collectible.some(row=>row.id===mon.id));
    for(const id of plan.moves){assert(trainerSkillOrigin(catalog,mon.id,id),`${mon.id}/${id} is legal`);assert(!multi(skills.get(id)),`${mon.id}/${id} has no multi_hit`);}
    return {...plan,species:plan.id,name:mon.name.zh,bst:bst(mon),base:mon.base,types:mon.types,
      legalMoves:plan.moves.map(id=>({...pick(skills.get(id)),origin:trainerSkillOrigin(catalog,mon.id,id)})),
      automaticBuild:automatic,automaticMoveDetails:automatic.skills.map(id=>pick(skills.get(id))),
      missingPlannedMoves:plan.moves.filter(id=>!automatic.skills.includes(id)),
      automaticMultiHitMoves:automatic.skills.filter(id=>multi(skills.get(id))),
      authoredBuildRequiredForThisPlan:plan.moves.some(id=>!automatic.skills.includes(id)),
    };
  });
  assert.deepEqual(species.get(865).base,species.get(1447).base);assert.deepEqual(species.get(865).types,species.get(1447).types);assert.deepEqual(species.get(865).learnset,species.get(1447).learnset);
  const conditional=[[177,20215,'Delayed knockout requires staying alive through three end turns; specialist survival plan, not a raw damage duelist.'],[110,20143,'Engine removes one quarter of maximum HP; useful for large HP targets but ordinary opponents may be better hit directly.'],[359,20143,'Same percent-HP role with a stronger physical stat line; special build and AI awareness required.'],[356,20398,'Self-KO grants the living team two shared guaranteed-critical attacks; requires a reserve finisher.'],[755,20932,'Same team critical-sacrifice role; special attack 118 and higher speed 96 provide a different pivot.']].map(([id,move,reason])=>{
    const mon=species.get(id),automatic=auto(mon);assert(trainerSkillOrigin(catalog,id,move));
    return {species:id,name:mon.name.zh,bst:bst(mon),base:mon.base,move:pick(skills.get(move)),reason,automaticBuild:automatic,automaticIncludesRoleMove:automatic.skills.includes(move),aiUnderstandsRoleScript:false};
  });
  const classicIds=new Set(catalog.trainers.flatMap(team=>team.team.map(mon=>mon.species)));
  const classic=catalog.trainers.map(team=>({id:team.id,name:team.name.zh,group:team.roster_group,members:team.team.map(mon=>({species:mon.species,name:species.get(mon.species).name.zh,bst:bst(species.get(mon.species)),skills:mon.skills,trainingProfile:mon.training_profile??null}))}));
  const report={scope:'Read-only prioritization, not an exhaustive competitive ranking or authorization to expand the elite pool.',
    sourceHashes,counts:{species:catalog.species.length,rawBelow600:catalog.species.filter(mon=>bst(mon)<600).length,rawEqual600:catalog.species.filter(mon=>bst(mon)===600).length,rawAbove600:catalog.species.filter(mon=>bst(mon)>600).length,collectible:collectible.length,collectibleBelow600:low.length,elitePool:elite.length,screened:scan.filter(row=>row.screenedTags.length).length,strictPrioritySpecies:shortlist.length,strictDistinctBuilds:shortlist.filter(row=>!row.equivalentTo).length,conditionalPrioritySpecies:conditional.length,classicTeams:classic.length,classicSlots:classic.reduce((sum,row)=>sum+row.members.length,0),classicUniqueSpecies:classicIds.size,classicUniqueBelow600:[...classicIds].filter(id=>bst(species.get(id))<600).length},
    criteria:{scan:'Every collectible species below 600 is inspected; only integer level 1-100 natural moves enter automatic feature screening. Exact reward skills are separately checked for shortlisted Rei.',
      thresholds:'Tags screen ordinary aligned offense >=110, speed >=100, power >=140, priority >=45, guaranteed direct stat setup, >=85-accuracy guaranteed control, healing >=33%, boost removal, and specific specialist scripts. Tags nominate review, not admission.',
      prioritySelection:'Twelve species were prioritized for complementary explicit four-move plans and non-multi-hit mechanisms. Five specialists require script-aware team plans. The remaining screened species are retained in the full scan and are not claimed weaker.',
      exclusions:'All multi_hit moves are excluded from shortlisted four-move plans. OHKO lottery, script-only utility, evolution/terminal-form status, temporary stages and permanent training are not conflated with raw BST.',
      currentFactory:'Natural level moves only; ranks attacks by base power, accuracy, STAB and priority; takes one direct-effect support. It does not add reward moves or optimize four-move combinations.',
      currentAi:'Trainers use the engine-simulated search planner (design/notes/trainer-search-ai-v58.md); move effects, including scripts, are valued through simulated battle turns.'},
    shortlist,conditional,classic,fullScan:scan,
  };
  fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/catalog-scan.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({counts:report.counts,shortlist:shortlist.map(row=>({id:row.id,name:row.name,bst:row.bst,automatic:row.automaticBuild.skills,missing:row.missingPlannedMoves,multiHit:row.automaticMultiHitMoves}))},null,2));
  // The sample is frozen before playing any matchup. No data or live save mutation.
  const cleanElite=elite.filter(mon=>auto(mon).skills.every(id=>!multi(skills.get(id)))).sort((a,b)=>a.id-b.id),pool=[...cleanElite],sampleRng=new Rng(4515);
  for(let index=0;index<12;index++){const swap=sampleRng.int(index,pool.length-1);[pool[index],pool[swap]]=[pool[swap],pool[index]];}
  const opponents=pool.slice(0,12).map(mon=>({species:mon.id,name:mon.name.zh,bst:bst(mon),build:auto(mon)}));
  const scenarios=shortlist.filter(row=>!row.equivalentTo).map(row=>({id:`${row.id}-ordinary`,species:row.id,moves:row.moves}));
  scenarios.push({id:'70-trained',species:70,moves:shortlist.find(row=>row.id===70).moves,profile:'rei-classic-full'});
  const results=[];
  for(const scenario of scenarios){
    const mon=species.get(scenario.species),preferred=mon.base.atk>=mon.base.spa?'atk':'spa';
    const base={species:mon.id,level:100,iv:31,evs:{hp:255,[preferred]:255},nature:'hardy',skills:scenario.moves,...(scenario.profile?{training_profile:scenario.profile}:{})};
    const encounter=normalizeNpcTrainingEncounter(catalog,{id:'readonly_candidate_audit',category:'trainer',facility:'elite',team:[base],rules:[{rule:'no_capture'}],phases:[],reward:{items:{}},ai:{kind:'smart',style:'balanced',allow_switch:false}});
    const matches=[];
    for(const opponent of opponents)for(const seed of [7,29,101]){
      const battle=createBattle({data,scripts:{...SEER_SCRIPTS,...npcTrainingScripts},seed,sides:[{kind:'trainer',team:[structuredClone(opponent.build)],ai:{kind:'smart',style:'balanced',allow_switch:false}}],encounter});
      let calls=0;while(!battle.result&&battle.turn<=80&&calls++<100)battle.resolveTurn();
      matches.push({opponent:opponent.species,seed,outcome:!battle.result?'limit':battle.result.winner===1?'win':battle.result.winner===0?'loss':'draw',turns:battle.turn,candidateHp:battle.active(1).hp,opponentHp:battle.active(0).hp,moves:battle.log.filter(event=>event.type==='move_used').map(event=>({side:event.side,skill:event.skill}))});
    }
    results.push({...scenario,build:base,normalizedStats:encounter.team[0].stats??null,wins:matches.filter(row=>row.outcome==='win').length,losses:matches.filter(row=>row.outcome==='loss').length,draws:matches.filter(row=>row.outcome==='draw').length,limits:matches.filter(row=>row.outcome==='limit').length,matches});
  }
  assert.equal(JSON.stringify(catalog),snapshot,'Catalog was not mutated');
  const changedSources=files.filter(path=>hash(path)!==sourceHashes[path]);
  const benchmark={method:'Frozen 12-opponent seeded panel from current >=600 factory builds with no multi_hit moves; 3 seeds per matchup, 1v1, current smart AI both sides, same ordinary level 100/IV31/neutral nature/HP255+main-offense255 EVs, finite PP, no player items/boss phases. Curated candidate skill combinations differ from default factory. One explicit trained Rei scenario is separately labeled.',sampleSeed:4515,seeds:[7,29,101],cleanElitePopulation:cleanElite.length,fullElitePopulation:elite.length,excludedEliteWithMultiHit:elite.filter(mon=>!cleanElite.some(row=>row.id===mon.id)).map(mon=>mon.id),opponents,results,duels:results.reduce((sum,row)=>sum+row.matches.length,0),catalogImmutable:true,changedSourceFilesDuringAudit:changedSources,limitations:['A small asymmetric matchup panel is a sanity check, not a tier ranking or proof of overall competitiveness.','No full-team switch or sacrifice synergy is measured.','Script utility omitted by the current AI can depress results even when implemented correctly.','No result relies on multi_hit candidate or opponent moves.','Identical Toruk and Golden Toruk builds are simulated once.','Gaia seals are not included in these ordinary-stat comparisons.']};
  fs.writeFileSync(`${output}/benchmark.json`,JSON.stringify(benchmark,null,2)+'\n');
  console.log(JSON.stringify({duels:benchmark.duels,cleanElite:cleanElite.length,opponents:opponents.map(row=>row.species),results:results.map(({matches,...row})=>row),changedSources},null,2));
} finally {await server.close();}
