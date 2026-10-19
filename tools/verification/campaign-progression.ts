import assert from 'node:assert/strict';
import {STRUGGLE_SKILL} from '../../battle/core/src/index.ts';
import {VICTORY_REWARDS} from '../../src/domain/economy.ts';
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
/** What the battle `g` settled paid since `before` (its exported save), in the result text's words. */
const paidText=(g:ReturnType<typeof createGame>,before:any)=>{
  const after=JSON.parse(g.exportSave()),coins=after.game.coins-before.game.coins,exp=after.exp_pool-before.exp_pool;
  return coins?`获得 ${coins} 赛尔豆及 ${exp} 积累经验。`:`获得 ${exp} 积累经验。`;
};
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
t.check('a last stage won on the player\'s 挣扎 completes the campaign and pays the victory and the essence',()=>{
  // 玄武真身 on 1 HP with only a harmless move; the lead has spent all its PP, so 挣扎 is its one command.
  const input=structuredClone(source),body=input.bosses.find((boss:any)=>boss.id==='boss_campaign_xuanwu_body');
  body.team[0].hp_override=1;body.team[0].skills=[20001];
  const journey=createGame(structuredClone(source),JSON.stringify(newSave(0x5eed)));
  journey.dispatch({type:'cheatAcquire',species:70,level:100});
  const save=JSON.parse(journey.exportSave());
  save.game.campaigns.xuanwu=['guardians'];
  for(const mon of save.storage)mon.pp=Object.fromEntries(mon.skills.map((id:number)=>[id,0]));
  const game=createGame(input,JSON.stringify(save));
  assert(game.dispatch({type:'startCampaignStage',campaignId:'xuanwu',stageId:'body'}).ok&&game.snapshot().battle);
  const result=game.dispatch({type:'move',skillId:STRUGGLE_SKILL.id}),view=game.snapshot().battle!,after=JSON.parse(game.exportSave());
  assert.equal(result.ok,true,result.notice);
  assert(view.won&&view.log.some(line=>line.includes(`使用了${STRUGGLE_SKILL.name.zh}。`)),'the 挣扎 turn wins and the log names it');
  const essence='essence_boss_campaign_xuanwu_body',{coins,exp}=VICTORY_REWARDS.encounter;
  assert.deepEqual(after.game.campaigns.xuanwu,['guardians','body']);
  assert(game.snapshot().campaigns.find(campaign=>campaign.id==='xuanwu')!.finished);
  assert(after.progress.bosses_cleared.includes(body.id));
  assert.deepEqual([after.game.battlesWon,after.game.coins,after.items[essence]],[save.game.battlesWon+1,save.game.coins+coins,(save.items[essence]??0)+1]);
  assert(after.exp_pool>=save.exp_pool+exp,'the pool gains the victory\'s experience besides the experience of the Boss the Lv 100 lead cannot take');
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
    const before=JSON.parse(g.exportSave());
    g.dispatch({type:'startCampaignStage',campaignId:'baihu',stageId:'guardians'});
    for(let turn=0;turn<20&&!g.snapshot().battle!.finished;turn++)g.dispatch({type:'move',skillId:g.snapshot().battle!.player.skills.find(skill=>skill.power>0&&skill.pp>0)!.id});
    assert(g.snapshot().battle!.won,'the 1-HP guardians fall');
    // After the stage's text, the result states what the win paid: the measured coins and pooled experience.
    const after=JSON.parse(g.exportSave());
    assert(after.game.coins>before.game.coins&&after.exp_pool>before.exp_pool,'a stage win pays coins and pooled experience');
    return [g.snapshot().battle!.result,after.game.campaigns.baihu,paidText(g,before)];
  };
  const [first,opened,firstPaid]=play([]),[replayed,unchanged,replayPaid]=play(['guardians']),[finished,,finishedPaid]=play(['guardians','avatars','body']);
  assert.equal(first,`本阶段完成，下一阶段已开启。${firstPaid}`);assert.deepEqual(opened,['guardians']);
  assert.equal(replayed,`本阶段再次通过。${replayPaid}`,'a replay opens nothing');assert.deepEqual(unchanged,['guardians']);
  assert.equal(finished,`白虎试炼已全部完成。${finishedPaid}`,'a finished campaign keeps its text');
  // 雷伊's training on the 1-HP 里奥斯: the 雷伊 that learns the skill says so; the same 雷伊 replaying it learns nothing more.
  const training=createGame(structuredClone(fixture),JSON.stringify(save));
  training.dispatch({type:'cheatAcquire',species:70,level:100});
  const train=()=>{
    const before=JSON.parse(training.exportSave());
    training.dispatch({type:'startCampaignStage',campaignId:'rei-training',stageId:'liaosi'});
    training.dispatch({type:'move',skillId:10170});
    const view=training.snapshot().battle!,paid=paidText(training,before),after=JSON.parse(training.exportSave());
    assert(view.won,'白光刃 finishes the 1-HP 里奥斯');assert.equal(training.snapshot().notices[0],view.result,'the notice repeats the result');
    training.dispatch({type:'closeBattle'});
    return [view.result,paid,after.game.campaigns['rei-training']];
  };
  const [learned,learnedPaid]=train(),[retrained,retrainedPaid,record]=train();
  assert.equal(learned,`雷伊领悟了「极光刃」，可在技能管理中装备。${learnedPaid}`);
  assert.equal(retrained,`本阶段再次通过。${retrainedPaid}`,'a 雷伊 that already knows 极光刃 learns nothing');assert.deepEqual(record,['liaosi']);
});
t.finish({stages:CHALLENGE_CAMPAIGNS.reduce((count,campaign)=>count+campaign.stages.length,0)});
