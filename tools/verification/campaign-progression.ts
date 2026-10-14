import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGame} from '../../src/game';
import {CHALLENGE_CAMPAIGNS} from '../../src/progression/challenge-campaigns';
import {newSave} from '../../raising/game/save';

const source=JSON.parse(fs.readFileSync('data/gamedata.json','utf8'));
source.bosses=fs.readdirSync('data/bosses').filter(file=>file.endsWith('.json')).map(file=>JSON.parse(fs.readFileSync(`data/bosses/${file}`,'utf8')));
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
// A deterministic one-HP training opponent isolates victory-objective, reward,
// roster selection and progression integration from the full boss's difficulty.
const fixture=structuredClone(source);
const first=fixture.bosses.find((boss:any)=>boss.id==='boss_rei_training1');
first.team[0].hp_override=1;first.team[0].skills=[20006];first.phases=[];
const initial=newSave(0x71cafe);
const game=createGame(fixture,JSON.stringify(initial));
assert.equal(game.snapshot().campaigns.length,7);
game.dispatch({type:'startCampaignStage',campaignId:'puni',stageId:'body'});
assert.equal(game.snapshot().battle,null,'The body must not bypass the seven seals.');
game.dispatch({type:'startCampaignStage',campaignId:'rei-training',stageId:'liaosi'});
assert.equal(game.snapshot().battle,null,'Training requires the player\'s Rei.');
game.dispatch({type:'cheatAcquire',species:1,level:5});
game.dispatch({type:'cheatAcquire',species:70,level:100});
const rei=game.snapshot().monsters.find(monster=>monster.species===70)!;
for(const skill of [10823,10824,10825,20364])assert(!rei.learned.some(learned=>learned.id===skill),'Conditional training skills must not be learned merely because null <= level.');
game.dispatch({type:'startCampaignStage',campaignId:'rei-training',stageId:'liaosi'});
assert.equal(game.snapshot().battle?.party.length,1,'Training selects only Rei without rearranging the saved party.');
assert.equal(game.snapshot().battle?.player.species,70);
assert.equal(game.snapshot().party.length,2);
game.dispatch({type:'move',skillId:10170});
assert(game.snapshot().battle?.won,'The fixture must meet the original White Blade finishing objective.');
assert(game.snapshot().monsters.find(monster=>monster.uid===rei.uid)!.learned.some(skill=>skill.id===10823));
assert.equal(game.snapshot().campaigns.find(campaign=>campaign.id==='rei-training')!.completed,1);
assert(!game.snapshot().items.some(item=>item.id.includes('essence_boss_rei_training')),'Training grants a skill rather than an essence.');
game.dispatch({type:'closeBattle'});
game.dispatch({type:'startCampaignStage',campaignId:'rei-training',stageId:'shadow'});
assert.equal(game.snapshot().battle,null,'A later stage must remain gated.');
game.dispatch({type:'startBattle',bossId:'boss_rei_training2'});
assert.equal(game.snapshot().battle,null,'The ordinary boss API must not bypass campaign entry.');
const reloaded=createGame(structuredClone(source),game.exportSave());
assert.equal(reloaded.snapshot().campaigns.find(campaign=>campaign.id==='rei-training')!.nextStageId,'tiyasi');
assert(reloaded.snapshot().monsters.find(monster=>monster.uid===rei.uid)!.learned.some(skill=>skill.id===10823));
reloaded.dispatch({type:'resetCampaign',campaignId:'rei-training'});
assert.equal(reloaded.snapshot().campaigns.find(campaign=>campaign.id==='rei-training')!.completed,0);
assert(reloaded.snapshot().monsters.find(monster=>monster.uid===rei.uid)!.learned.some(skill=>skill.id===10823),'Restarting a challenge does not erase learned rewards.');
console.log(JSON.stringify({passed:['seven campaigns and valid ordered encounter records','entry and sequence requirements','Rei-only roster with saved party preserved','conditional learning and correct stage reward','no premature training essence','no direct boss API bypass','progress and reward reload','explicit restart preserves learned rewards'],stages:CHALLENGE_CAMPAIGNS.reduce((count,campaign)=>count+campaign.stages.length,0)}));
