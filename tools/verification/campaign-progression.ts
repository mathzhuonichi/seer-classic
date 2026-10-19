import assert from 'node:assert/strict';
import {createGame} from '../../src/kernel/game.ts';
import {loadCatalog} from '../../src/domain/catalog/catalog.ts';
import {CHALLENGE_CAMPAIGNS} from '../../src/domain/challenges/challenge-campaigns.ts';
import {challengeDetail,challengeEntries} from '../../src/features/challenges/challenge-center.ts';
import {newSave} from '../../src/kernel/save.ts';
import {suite} from './_harness.mjs';

const t=suite('campaign-progression');
const source=await loadCatalog() as any;
t.check('seven campaigns and valid ordered encounter records',()=>{
  assert.equal(CHALLENGE_CAMPAIGNS.length,7);
  for(const campaign of CHALLENGE_CAMPAIGNS)for(const stage of campaign.stages) {
    assert.equal(stage.bossIds.length,1);
    const encounter=source.bosses.find((boss:any)=>boss.id===stage.bossIds[0]);
    assert(encounter,`Missing ${stage.bossIds[0]}`);
    assert(encounter.team.length<=6&&encounter.team.length>=1);
    for(const member of encounter.team) {
      assert(source.species.some((species:any)=>species.id===member.species));
      assert(member.skills.every((id:number)=>source.skills.some((skill:any)=>skill.id===id)));
    }
  }
});
// A deterministic one-HP training opponent isolates victory-objective, reward,
// roster selection and progression integration from the full boss's difficulty.
const fixture=structuredClone(source);
const first=fixture.bosses.find((boss:any)=>boss.id==='boss_rei_training1');
first.team[0].hp_override=1;first.team[0].skills=[20006];first.phases=[];
const game=createGame(fixture,JSON.stringify(newSave(0x71cafe)));
t.check('reward kind and species name drive the stage and archive reward texts',()=>{
  const s=game.snapshot(),entries=challengeEntries(s);
  for(const campaign of s.campaigns) {
    const skills=campaign.id==='rei-training',entry=entries.find(row=>row.campaign?.id===campaign.id)!;
    assert.equal(campaign.reward,skills?'skills':'essence',campaign.id);
    assert.equal(campaign.speciesName,source.species.find((species:any)=>species.id===campaign.species).name.zh);
    assert.equal(entry.category,skills?'quest':'legendary');
    if(skills) {
      assert(campaign.stages.every(stage=>stage.rewardText.startsWith('领悟技能：')));
      assert.equal(challengeDetail(entry,s,false).reward,`通过每项特训，领悟对应的${campaign.speciesName}技能`);
    } else {
      assert.equal(campaign.stages.at(-1)!.rewardText,`获得${campaign.speciesName}精元`,campaign.id);
      assert.match(challengeDetail(entry,s,false).reward,/^完成全部阶段后获得精元/);
    }
  }
});
const reiTraining=()=>game.snapshot().campaigns.find(campaign=>campaign.id==='rei-training')!;
t.check('a fresh campaign shows its first stage\'s instruction',()=>assert.equal(reiTraining().description,reiTraining().stages[0].description));
t.check('entry and sequence requirements',()=>{
  assert.equal(game.snapshot().campaigns.length,7);
  game.dispatch({type:'startCampaignStage',campaignId:'puni',stageId:'body'});
  assert.equal(game.snapshot().battle,null,'The body must not bypass the seven seals.');
  game.dispatch({type:'startCampaignStage',campaignId:'rei-training',stageId:'liaosi'});
  assert.equal(game.snapshot().battle,null,'Training requires the player\'s Rei.');
});
game.dispatch({type:'cheatAcquire',species:1,level:5});
game.dispatch({type:'cheatAcquire',species:70,level:100});
const rei=game.snapshot().monsters.find(monster=>monster.species===70)!;
t.check('Rei-only roster with saved party preserved',()=>{
  for(const skill of [10823,10824,10825,20364])assert(!rei.learned.some(learned=>learned.id===skill),'Conditional training skills must not be learned merely because null <= level.');
  game.dispatch({type:'startCampaignStage',campaignId:'rei-training',stageId:'liaosi'});
  assert.equal(game.snapshot().battle?.party.length,1,'Training selects only Rei without rearranging the saved party.');
  assert.equal(game.snapshot().battle?.player.species,70);
  assert.equal(game.snapshot().party.length,2);
});
t.check('conditional learning and correct stage reward',()=>{
  game.dispatch({type:'move',skillId:10170});
  assert(game.snapshot().battle?.won,'The fixture must meet the original White Blade finishing objective.');
  assert(game.snapshot().monsters.find(monster=>monster.uid===rei.uid)!.learned.some(skill=>skill.id===10823));
  assert.equal(reiTraining().completed,1);
  assert.equal(reiTraining().description,reiTraining().stages[1].description,'The guardian panel shows the next stage\'s instruction.');
});
t.check('no premature training essence',()=>assert(!game.snapshot().items.some(item=>item.id.includes('essence_boss_rei_training')),'Training grants a skill rather than an essence.'));
game.dispatch({type:'closeBattle'});
t.check('no direct boss API bypass',()=>{
  game.dispatch({type:'startCampaignStage',campaignId:'rei-training',stageId:'shadow'});
  assert.equal(game.snapshot().battle,null,'A later stage must remain gated.');
  game.dispatch({type:'startBattle',bossId:'boss_rei_training2'});
  assert.equal(game.snapshot().battle,null,'The ordinary boss API must not bypass campaign entry.');
});
const reloaded=createGame(structuredClone(source),game.exportSave());
t.check('progress and reward reload',()=>{
  assert.equal(reloaded.snapshot().campaigns.find(campaign=>campaign.id==='rei-training')!.nextStageId,'tiyasi');
  assert(reloaded.snapshot().monsters.find(monster=>monster.uid===rei.uid)!.learned.some(skill=>skill.id===10823));
});
t.check('explicit restart preserves learned rewards',()=>{
  reloaded.dispatch({type:'resetCampaign',campaignId:'rei-training'});
  const restarted=reloaded.snapshot().campaigns.find(campaign=>campaign.id==='rei-training')!;
  assert.equal(restarted.completed,0);
  assert.equal(restarted.description,restarted.stages[0].description);
  assert(reloaded.snapshot().monsters.find(monster=>monster.uid===rei.uid)!.learned.some(skill=>skill.id===10823),'Restarting a challenge does not erase learned rewards.');
});
t.check('a finished campaign shows its last stage\'s instruction',()=>{
  const save=JSON.parse(createGame(structuredClone(source),JSON.stringify(newSave(0x71cafe))).exportSave());
  const xuanwu=CHALLENGE_CAMPAIGNS.find(campaign=>campaign.id==='xuanwu')!;
  save.game.campaigns.xuanwu=xuanwu.stages.map(stage=>stage.id);
  const finished=createGame(structuredClone(source),JSON.stringify(save)).snapshot().campaigns.find(campaign=>campaign.id==='xuanwu')!;
  assert.deepEqual([finished.finished,finished.description],[true,xuanwu.stages.at(-1)!.description]);
});
t.check('a replayed stage says it was passed again, and only a new clear says the next stage opened',()=>{
  // White Tiger's guardians on 1 HP, whose clear pays no essence: the stage's own text is the outcome the player reads.
  const weak=structuredClone(source),guardians=weak.bosses.find((boss:any)=>boss.id==='boss_campaign_baihu_guardians');
  for(const member of guardians.team)Object.assign(member,{hp_override:1,member_rules:[],member_phases:[],skills:[20006]});
  Object.assign(guardians,{phases:[],ai:{kind:'sequence',skills:[20006]}});
  const save=JSON.parse(createGame(structuredClone(source),JSON.stringify(newSave(0x71cafe))).exportSave());
  const play=(baihu:string[])=>{
    const g=createGame(weak,JSON.stringify({...save,game:{...save.game,campaigns:{baihu}}}));
    g.dispatch({type:'cheatAcquire',species:501,level:100});
    const lead=g.snapshot().monsters.find(monster=>monster.species===501)!;
    g.dispatch({type:'reorderParty',uids:[lead.uid,...g.snapshot().party.filter(uid=>uid!==lead.uid)]});
    g.dispatch({type:'startCampaignStage',campaignId:'baihu',stageId:'guardians'});
    for(let turn=0;turn<20&&!g.snapshot().battle!.finished;turn++)g.dispatch({type:'move',skillId:g.snapshot().battle!.player.skills.find(skill=>skill.power>0&&skill.pp>0)!.id});
    assert(g.snapshot().battle!.won,'the 1-HP guardians fall');
    return [g.snapshot().battle!.result,JSON.parse(g.exportSave()).game.campaigns.baihu];
  };
  const [first,opened]=play([]),[replayed,unchanged]=play(['guardians']),[finished]=play(['guardians','avatars','body']);
  assert.match(first,/^本阶段完成，下一阶段已开启。/);assert.deepEqual(opened,['guardians']);
  assert.match(replayed,/^本阶段再次通过。/,'a replay opens nothing');assert.deepEqual(unchanged,['guardians']);
  assert.match(finished,/^白虎试炼已全部完成。/,'a finished campaign keeps its text');
});
t.finish({stages:CHALLENGE_CAMPAIGNS.reduce((count,campaign)=>count+campaign.stages.length,0)});
