import assert from 'node:assert/strict';
import test from 'node:test';
const storage=new Map();
globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
globalThis.window={};
let sources=[],fetches=[],blocked=false,pending=[];
class Source {
 loop=false;buffer=null;stopped=false;
 connect(){} disconnect(){}
 start(_when=0,offset=0){this.started=true;this.offset=offset;sources.push(this)}
 stop(){this.stopped=true}
 finish(){this.ended=true;this.onended?.()}
}
class Context {
 state='suspended';currentTime=0;destination={};
 createGain(){return {gain:{value:0},connect(){}}}
 createBufferSource(){return new Source()}
 createBuffer(){return {duration:0}}
 async resume(){this.state='running'}
 async decodeAudioData(){return {duration:68}}
}
globalThis.AudioContext=Context;
globalThis.fetch=async url=>{fetches.push(url);if(blocked)await new Promise(resolve=>pending.push(resolve));return {ok:true,arrayBuffer:async()=>new ArrayBuffer(1)}};
const {GameAudio}=await import('./game-audio.ts');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const music=()=>sources.filter(source=>source.loop&&!source.stopped);
const effects=()=>sources.filter(source=>source.buffer?.duration===68&&!source.loop&&!source.stopped&&!source.ended);
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
