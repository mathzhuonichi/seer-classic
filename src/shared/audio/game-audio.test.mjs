import assert from 'node:assert/strict';
import test from 'node:test';
const storage=new Map();
globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
globalThis.window={};
let sources=[],fetches=[],blocked=false,pending=[],contexts=[];
const urls=new WeakMap();
class Source {
 loop=false;buffer=null;stopped=false;
 connect(){} disconnect(){}
 start(when=0,offset=0){this.started=true;this.when=when;this.offset=offset;sources.push(this)}
 stop(when=0){this.stopped=true;this.stopAt=when}
 finish(){this.ended=true;this.onended?.()}
}
class Context {
 state='suspended';currentTime=0;destination={};
 constructor(){contexts.push(this)}
 createGain(){return {gain:{value:1,setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}}}
 createBufferSource(){return new Source()}
 createBuffer(){return {duration:0}}
 async resume(){this.state='running'}
 async decodeAudioData(bytes){return {duration:68,url:urls.get(bytes)}}
}
globalThis.AudioContext=Context;
globalThis.fetch=async url=>{
 fetches.push(url);if(blocked)await new Promise(resolve=>pending.push(resolve));
 return {ok:true,arrayBuffer:async()=>{const bytes=new ArrayBuffer(1);urls.set(bytes,url);return bytes}};
};
const {GameAudio}=await import('./game-audio.ts');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const music=()=>sources.filter(source=>source.loop&&!source.stopped);
const effects=()=>sources.filter(source=>source.buffer?.duration===68&&!source.loop&&!source.stopped&&!source.ended);
const theme=track=>`/audio/scene/${track}.mp3`;
const themeFetches=()=>fetches.filter(url=>url.startsWith('/audio/scene/'));
/** The one playing music source's file, or a list when there are several. */
const playing=()=>{const urls=music().map(source=>source.buffer.url);return urls.length===1?urls[0]:urls};
const time=seconds=>{contexts.at(-1).currentTime=seconds};
/** A fresh owner, unlocked, with nothing loaded or played yet; `scene` is set before the gesture. */
async function fresh(scene){
 sources=[];fetches=[];contexts=[];storage.clear();blocked=false;pending=[];
 const audio=new GameAudio();if(scene)audio.setSceneMusic(scene);await audio.unlock();await settle();return audio;
}
test('gesture unlock, one music owner, visibility, exit and persisted controls',async()=>{
 sources=[];fetches=[];storage.clear();const audio=new GameAudio();
 audio.setBattleActive(true);audio.playSfx('win');await settle();assert.equal(sources.length,0,'no playback before gesture');
 await audio.unlock();await settle();assert.equal(music().length,1);assert.equal(fetches.length,9);
 audio.setBattleActive(true);await audio.unlock();await settle();assert.equal(music().length,1,'repeated unlock cannot duplicate music');
 audio.playSfx('click');audio.playSfx('click');await settle();assert.equal(effects().length,1,'rapid same cue coalesces');
 audio.playSfx('click');await settle();assert.equal(effects().length,1,'repeated playing cue replaces prior');
 audio.setVisible(false);assert.equal(music().length,0);assert.equal(effects().length,0);audio.playSfx('win');await settle();assert.equal(effects().length,0);
 audio.setVisible(true);await settle();assert.equal(music().length,1);
 audio.updateSettings({muted:true,musicVolume:2,sfxVolume:-1});assert.equal(music().length,0);assert.deepEqual(new GameAudio().snapshot(),{muted:true,musicVolume:1,sfxVolume:0});
 audio.updateSettings({muted:false,sfxVolume:0.5});await settle();assert.equal(music().length,1);
 audio.playSfx('win');audio.setBattleActive(false);await settle();assert.equal(music().length,0);assert.equal(effects().length,0,'pending result cannot play after exit');audio.playSfx('win');audio.playSfx('capture');await settle();assert.equal(effects().length,0,'late battle result calls are ignored outside combat');
});
test('late downloads cannot revive a closed battle; subsequent entry remains usable',async()=>{
 sources=[];storage.clear();blocked=true;pending=[];const audio=new GameAudio();audio.setBattleActive(true);await audio.unlock();audio.playSfx('win');audio.setBattleActive(false);
 blocked=false;pending.splice(0).forEach(resolve=>resolve());await settle();assert.equal(music().length,0);assert.equal(effects().length,0);
 audio.setBattleActive(true);await settle();assert.equal(music().length,1);audio.setBattleActive(false);assert.equal(music().length,0);
});
test('started result completes across normal exit but pending effects never begin',async()=>{
 sources=[];storage.clear();const audio=new GameAudio();audio.setBattleActive(true);await audio.unlock();await settle();
 audio.playSfx('win');audio.playSfx('heal');await settle();const result=effects()[0];assert.ok(result);
 audio.playSfx('lose');audio.setBattleActive(false);await settle();assert.equal(music().length,0);assert.equal(effects().length,1,'only already-started win survives');assert.equal(result.stopped,false);
 result.finish();assert.equal(effects().length,0,'result naturally ends');
 audio.setBattleActive(true);await settle();audio.playSfx('lose');await settle();audio.setBattleActive(false);assert.equal(effects().length,1,'started defeat also survives exit');
 audio.shutdown();assert.equal(effects().length,0,'shutdown stops retained active defeat result');
});
test('new battle, mute, hide and unmount interrupt a lingering result',async()=>{
 for(const interrupt of [audio=>audio.setBattleActive(true),audio=>audio.updateSettings({muted:true}),audio=>audio.setVisible(false),audio=>audio.shutdown()]){
  sources=[];storage.clear();const audio=new GameAudio();audio.setBattleActive(true);await audio.unlock();await settle();audio.playSfx('win');await settle();const result=effects()[0];audio.setBattleActive(false);assert.equal(result.stopped,false);interrupt(audio);assert.equal(result.stopped,true);audio.shutdown();
 }
});
test('a world theme loads only after the gesture, alone, and plays on across maps that share it',async()=>{
 sources=[];fetches=[];storage.clear();const audio=new GameAudio();
 audio.setSceneMusic('BGM_004');await settle();assert.deepEqual(themeFetches(),[],'nothing before the gesture');
 await audio.unlock();await settle();
 assert.deepEqual(themeFetches(),[theme('BGM_004')],'only the scene on screen is fetched');assert.equal(playing(),theme('BGM_004'));
 const first=music()[0];assert.equal(first.loop,true);assert.equal(first.offset,0);
 audio.setSceneMusic('BGM_004');await settle();assert.equal(music()[0],first,'the same theme plays on');
});
test('another map fades the theme out, then starts its own from the beginning',async()=>{
 const audio=await fresh('BGM_004'),first=music()[0];time(12);
 audio.setSceneMusic('BGM_037');await settle();
 assert.equal(first.stopped,true);assert.equal(first.stopAt,13,'the old theme fades for one second');
 assert.equal(playing(),theme('BGM_037'));assert.deepEqual([music()[0].when,music()[0].offset],[13,0],'the new one starts after the fade, from its start');
 audio.setSceneMusic(null);await settle();assert.deepEqual(music(),[],'a scene without a theme is quiet');
});
test('rapid map changes load the theme wanted at the end, and a theme not yet begun never sounds',async()=>{
 const audio=await fresh();blocked=true;
 audio.setSceneMusic('BGM_004');audio.setSceneMusic('BGM_005A');audio.setSceneMusic('BGM_006');await settle();
 assert.deepEqual(themeFetches(),[theme('BGM_004')],'one theme loads at a time');
 blocked=false;pending.splice(0).forEach(resolve=>resolve());await settle();await settle();
 assert.deepEqual(themeFetches(),[theme('BGM_004'),theme('BGM_006')],'the skipped map is never fetched');assert.equal(playing(),theme('BGM_006'));
 // A theme scheduled behind a fade and replaced before it begins is dropped at once instead of fading in and out.
 time(5);audio.setSceneMusic('BGM_004');await settle();const scheduled=music()[0];assert.equal(scheduled.when,6);
 time(5.5);audio.setSceneMusic('BGM_007');await settle();assert.equal(scheduled.stopAt,0);assert.equal(music()[0].when,6);
});
test('battle: the world theme yields to the battle theme and starts over after it',async()=>{
 const audio=await fresh('BGM_004'),world=music()[0];time(20);
 audio.setBattleActive(true);await settle();
 assert.equal(world.stopAt,21,'the world theme fades out');assert.equal(playing(),'/audio/battle.m4a');assert.equal(music()[0].when,21);
 audio.setSceneMusic('BGM_037');await settle();assert.equal(playing(),'/audio/battle.m4a','a scene change waits for the battle');
 time(40);audio.setBattleActive(false);await settle();
 assert.equal(playing(),theme('BGM_037'));assert.deepEqual([music()[0].when,music()[0].offset],[40,0],'at once, from the beginning');
 audio.setBattleActive(true);await settle();time(50);audio.setBattleActive(false);await settle();
 assert.equal(playing(),theme('BGM_037'));assert.equal(music()[0].offset,0);
});
test('a hidden tab, mute and a zero music volume pause the world theme at its position',async()=>{
 const audio=await fresh('BGM_004');time(5);
 audio.setVisible(false);assert.deepEqual(music(),[]);time(30);audio.setVisible(true);await settle();
 assert.equal(playing(),theme('BGM_004'));assert.deepEqual([music()[0].when,music()[0].offset],[30,5],'resumes where it paused');
 time(32);audio.updateSettings({muted:true});assert.deepEqual(music(),[]);
 audio.updateSettings({muted:false});await settle();assert.equal(music()[0].offset,7);
 time(33);audio.updateSettings({musicVolume:0});assert.deepEqual(music(),[]);
 audio.setSceneMusic('BGM_037');await settle();assert.deepEqual(themeFetches(),[theme('BGM_004')],'no download while the music is off');
 audio.updateSettings({musicVolume:0.5});await settle();assert.equal(playing(),theme('BGM_037'));assert.equal(music()[0].offset,0);
});
test('a scene change while hidden or muted waits, and a fading theme stops with the page',async()=>{
 const audio=await fresh('BGM_004'),world=music()[0];
 audio.setSceneMusic('BGM_037');await settle();assert.equal(world.stopAt,1);
 audio.setVisible(false);assert.deepEqual(music(),[]);assert.equal(world.stopAt,0,'the fading theme stops at once');
 audio.setSceneMusic('BGM_006');await settle();assert.equal(themeFetches().length,2,'nothing loads while hidden');
 audio.setVisible(true);await settle();assert.equal(playing(),theme('BGM_006'));
});
test('the two newest world themes stay decoded; older ones load again',async()=>{
 const audio=await fresh('BGM_004');
 for(const track of ['BGM_037','BGM_004','BGM_006','BGM_037'])audio.setSceneMusic(track),await settle();
 assert.deepEqual(themeFetches(),[theme('BGM_004'),theme('BGM_037'),theme('BGM_006'),theme('BGM_037')]);
 audio.setSceneMusic('BGM_006');await settle();assert.equal(themeFetches().length,4,'the previous theme is still decoded');
});
test('unmount stops the world theme; the next mount plays its scene again',async()=>{
 const audio=await fresh('BGM_004');
 audio.shutdown();assert.deepEqual(music(),[]);
 audio.setSceneMusic('BGM_004');await audio.unlock();await settle();assert.equal(playing(),theme('BGM_004'));
});
