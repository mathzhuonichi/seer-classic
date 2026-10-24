export type GameSound='click'|'tab'|'heal'|'capture'|'win'|'lose'|'reward'|'level-up';
export interface AudioSettings {muted:boolean;musicVolume:number;sfxVolume:number}
const STORAGE_KEY='seer-classic-audio-settings-v1';
const DEFAULT_SETTINGS:AudioSettings={muted:false,musicVolume:0.35,sfxVolume:0.65};
type AudioKey=GameSound|'battle';
/** The battle theme and the cues: about 700 KB together, all loaded at the gesture unlock. */
const FILES:Record<AudioKey,string>={
 battle:'battle.m4a',click:'click.m4a',tab:'tab.m4a',heal:'heal.mp3',capture:'capture.m4a',win:'win.m4a',lose:'lose.m4a',reward:'reward.m4a','level-up':'level-up.m4a',
};
const fileUrl=(key:AudioKey)=>`/audio/${FILES[key]}`;
/** A world theme (data/scene-music.json), loaded only once its scene is on screen. */
const themeUrl=(track:string)=>`/audio/scene/${track}.mp3`;
/** How long a theme fades out before the next one starts: the original SoundManager takes it down 0.03 every 30 ms. */
const MUSIC_FADE_SECONDS=1;
/** World themes kept decoded, the newest first (a minute of decoded stereo is about 25 MB); a sounding theme keeps its own. */
const KEPT_THEMES=2;
/** Battle outcome cues: played only during a battle. */
const BATTLE_CUES:ReadonlySet<GameSound>=new Set(['win','lose','capture']);
/** Result cues that finish playing after the battle closes normally. */
const LINGERING_CUES:ReadonlySet<GameSound>=new Set(['win','lose']);
const clamp=(value:number,fallback:number)=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):fallback;
function readSettings():AudioSettings{
 try{
  const value=JSON.parse(localStorage.getItem(STORAGE_KEY)??'null');
  if(!value)return DEFAULT_SETTINGS;
  return {muted:value.muted===true,musicVolume:clamp(value.musicVolume,DEFAULT_SETTINGS.musicVolume),sfxVolume:clamp(value.sfxVolume,DEFAULT_SETTINGS.sfxVolume)};
 }catch{return DEFAULT_SETTINGS}
}
interface Music {url:string;source:AudioBufferSourceNode;fade:GainNode}
/**
 * One owner for all playback; async loads never outlive their playback generation. Music is the battle theme during a battle
 * and the scene's world theme otherwise (design/notes/bgm-2026-10-24.md).
 */
export class GameAudio {
 private settings=readSettings();
 private listeners=new Set<()=>void>();
 private context:AudioContext|null=null;
 private musicGain:GainNode|null=null;
 private sfxGain:GainNode|null=null;
 private buffers=new Map<string,Promise<AudioBuffer>>();
 /** World theme URLs in the order last asked for: the decoded ones kept. */
 private themes:string[]=[];
 private active=false;
 private visible=true;
 /** The world theme of the scene on screen. */
 private scene:string|null=null;
 /** Bumped by every state change that must cancel pending playback. */
 private epoch=0;
 private music:Music|null=null;
 private musicStarting=false;
 /** Themes fading out, and when the last of them goes quiet: the next theme starts then. */
 private fading=new Map<AudioBufferSourceNode,GainNode>();
 private fadeEnd=0;
 /** The theme whose position `musicOffset` holds. */
 private offsetUrl:string|null=null;
 private musicOffset=0;
 private musicStarted=0;
 private effects=new Map<GameSound,AudioBufferSourceNode>();
 private requests=new Map<GameSound,number>();
 private requestId=0;
 private unlocked=false;
 readonly subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}};
 readonly snapshot=()=>this.settings;
 updateSettings(patch:Partial<AudioSettings>){
  const old=this.settings;
  this.settings={muted:patch.muted??old.muted,musicVolume:clamp(patch.musicVolume??old.musicVolume,old.musicVolume),
   sfxVolume:clamp(patch.sfxVolume??old.sfxVolume,old.sfxVolume)};
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(this.settings))}catch{/* Private browsing may disable storage. */}
  this.applyVolume();
  if(this.settings.muted){this.epoch++;this.stopMusic(true);this.stopFading();this.stopEffects()}
  else if(this.settings.musicVolume===0){this.stopMusic(true);this.stopFading()}
  else void this.startMusic();
  this.listeners.forEach(listener=>listener());
 }
 async unlock():Promise<void>{
  if(typeof window==='undefined')return;
  if(this.unlocked&&this.context?.state==='running'){void this.startMusic();return;}
  try{
   if(!this.context)this.createContext();
   await this.context!.resume();this.unlocked=this.context!.state==='running';
   if(this.unlocked){void this.startMusic();for(const key of Object.keys(FILES) as AudioKey[])void this.load(fileUrl(key)).catch(()=>{})}
  }catch{/* A later trusted gesture can retry a denied browser unlock. */}
 }
 /**
  * The world theme of the scene on screen (null: none). The same theme plays on; another one fades the playing theme out and
  * starts from its beginning, as the original client did between maps. During a battle it waits for the battle to end.
  */
 setSceneMusic(track:string|null){
  if(track===this.scene)return;this.scene=track;
  if(this.active)return;
  this.stopMusic(false,true);void this.startMusic();
 }
 /** Entering, the world theme fades out before the battle theme; leaving, the battle theme stops and the world theme starts over. */
 setBattleActive(active:boolean){
  if(active===this.active)return;this.active=active;this.epoch++;
  if(active){this.stopEffects();this.stopMusic(false,true)}else{this.stopMusic(false);this.stopEffects(true)}
  void this.startMusic();
 }
 /** Unmount stops every source, including result cues surviving normal exit. */
 shutdown(){this.active=false;this.scene=null;this.epoch++;this.stopMusic(false);this.stopFading();this.stopEffects()}
 /** Hide pauses music at its current position and cancels pending/playing cues. */
 setVisible(visible:boolean){
  if(visible===this.visible)return;this.visible=visible;this.epoch++;
  if(!visible){this.stopMusic(true);this.stopFading();this.stopEffects()}else void this.startMusic();
 }
 playSfx(sound:GameSound):void{
  if(BATTLE_CUES.has(sound)&&!this.active)return;
  if(!this.context||!this.unlocked||!this.visible||this.settings.muted||this.settings.sfxVolume===0)return;
  const epoch=this.epoch,id=++this.requestId;this.requests.set(sound,id);
  void this.load(fileUrl(sound)).then(buffer=>{
   if(epoch!==this.epoch||this.requests.get(sound)!==id||!this.visible||this.settings.muted||this.context?.state!=='running')return;
   // Repeated selections replace the same cue rather than stacking it.
   const previous=this.effects.get(sound);if(previous){previous.onended=null;previous.stop();previous.disconnect()}
   const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.sfxGain!);this.effects.set(sound,source);
   source.onended=()=>{source.disconnect();if(this.effects.get(sound)===source)this.effects.delete(sound)};source.start();
  }).catch(()=>{});
 }
 private createContext(){
  const context=this.context=new AudioContext();
  this.musicGain=context.createGain();this.sfxGain=context.createGain();
  this.musicGain.connect(context.destination);this.sfxGain.connect(context.destination);this.applyVolume();
  // Starting a silent source during the trusted gesture also unlocks mobile WebKit.
  const silent=context.createBufferSource();silent.buffer=context.createBuffer(1,1,22050);silent.connect(context.destination);silent.start();
 }
 private applyVolume(){
  if(this.musicGain)this.musicGain.gain.value=this.settings.muted?0:this.settings.musicVolume;
  if(this.sfxGain)this.sfxGain.gain.value=this.settings.muted?0:this.settings.sfxVolume;
 }
 private load(url:string):Promise<AudioBuffer>{
  const existing=this.buffers.get(url);if(existing)return existing;
  const promise=fetch(url)
   .then(response=>{if(!response.ok)throw new Error('Audio resource unavailable');return response.arrayBuffer()})
   .then(bytes=>this.context!.decodeAudioData(bytes));
  this.buffers.set(url,promise);void promise.catch(()=>{if(this.buffers.get(url)===promise)this.buffers.delete(url)});return promise;
 }
 /** Loads a world theme and lets go of the older ones beyond KEPT_THEMES. */
 private loadTheme(url:string):Promise<AudioBuffer>{
  this.themes=[...this.themes.filter(old=>old!==url),url];
  for(const old of this.themes.splice(0,this.themes.length-KEPT_THEMES))this.buffers.delete(old);
  return this.load(url);
 }
 private musicUrl(){return this.active?fileUrl('battle'):this.scene===null?null:themeUrl(this.scene)}
 private musicAllowed(){return !!this.context&&this.unlocked&&this.visible&&!this.settings.muted&&this.settings.musicVolume>0}
 private async startMusic(){
  const url=this.musicUrl();
  if(!url||!this.musicAllowed()||this.music||this.musicStarting)return;
  const epoch=this.epoch;this.musicStarting=true;
  try{
   const buffer=await(this.active?this.load(url):this.loadTheme(url));
   if(epoch===this.epoch&&url===this.musicUrl()&&this.musicAllowed()&&this.context!.state==='running')this.playMusic(url,buffer);
  }catch{/* Missing audio must not prevent gameplay. */}finally{
   this.musicStarting=false;
   // A change while loading (another scene, a battle, a hide) asks again for the music wanted now.
   if(epoch!==this.epoch||url!==this.musicUrl())void this.startMusic();
  }
 }
 /** Loops `url` from its kept position, once any theme fading out has gone quiet. */
 private playMusic(url:string,buffer:AudioBuffer){
  const context=this.context!,source=context.createBufferSource(),fade=context.createGain();
  source.buffer=buffer;source.loop=true;source.connect(fade);fade.connect(this.musicGain!);
  if(url!==this.offsetUrl){this.offsetUrl=url;this.musicOffset=0}
  this.musicOffset%=buffer.duration;this.musicStarted=Math.max(context.currentTime,this.fadeEnd);
  source.start(this.musicStarted,this.musicOffset);this.music={url,source,fade};
 }
 /** `fade`: a theme that has begun fades out over MUSIC_FADE_SECONDS; otherwise, or not yet begun, it stops at once. */
 private stopMusic(preservePosition:boolean,fade=false){
  const music=this.music;this.music=null;
  if(music&&this.context){
   const now=this.context.currentTime;
   if(preservePosition)this.musicOffset+=Math.max(0,now-this.musicStarted);
   if(fade&&this.musicStarted<=now){
    const {source,fade:volume}=music;this.fadeEnd=now+MUSIC_FADE_SECONDS;this.fading.set(source,volume);
    volume.gain.setValueAtTime(volume.gain.value,now);volume.gain.linearRampToValueAtTime(0,this.fadeEnd);
    source.onended=()=>{this.fading.delete(source);source.disconnect();volume.disconnect()};source.stop(this.fadeEnd);
   }else{music.source.stop();music.source.disconnect();music.fade.disconnect()}
  }
  if(!preservePosition)this.musicOffset=0;
 }
 private stopFading(){
  for(const [source,volume] of this.fading){source.onended=null;source.stop();source.disconnect();volume.disconnect()}
  this.fading.clear();this.fadeEnd=0;
 }
 /** `preserveStartedResults` lets an already playing result cue finish after the battle closes. */
 private stopEffects(preserveStartedResults=false){
  this.requests.clear();
  for(const [sound,source] of this.effects){
   if(preserveStartedResults&&LINGERING_CUES.has(sound))continue;
   source.onended=null;source.stop();source.disconnect();this.effects.delete(sound);
  }
 }
}
export const gameAudio=new GameAudio();
