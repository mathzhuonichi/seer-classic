export type GameSound='click'|'tab'|'heal'|'capture'|'win'|'lose'|'reward'|'level-up';
export interface AudioSettings {muted:boolean;musicVolume:number;sfxVolume:number}
const STORAGE_KEY='seer-classic-audio-settings-v1';
const files:Record<GameSound|string,string>={battle:'battle.m4a',click:'click.m4a',tab:'tab.m4a',heal:'heal.mp3',capture:'capture.m4a',win:'win.m4a',lose:'lose.m4a',reward:'reward.m4a','level-up':'level-up.m4a'};
const clamp=(value:number,fallback:number)=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):fallback;
function readSettings():AudioSettings{
 const defaults={muted:false,musicVolume:0.35,sfxVolume:0.65};
 try{const value=JSON.parse(localStorage.getItem(STORAGE_KEY)??'null');return value?{muted:value.muted===true,musicVolume:clamp(value.musicVolume,defaults.musicVolume),sfxVolume:clamp(value.sfxVolume,defaults.sfxVolume)}:defaults}catch{return defaults}
}
/** One owner for all playback; async loads never outlive their playback generation. */
export class GameAudio {
 private settings=readSettings();
 private listeners=new Set<()=>void>();
 private context:AudioContext|null=null;
 private musicGain:GainNode|null=null;
 private sfxGain:GainNode|null=null;
 private buffers=new Map<string,Promise<AudioBuffer>>();
 private active=false;
 private visible=true;
 private epoch=0;
 private music:AudioBufferSourceNode|null=null;
 private musicStarting=false;
 private musicOffset=0;
 private musicStarted=0;
 private effects=new Map<GameSound,AudioBufferSourceNode>();
 private requests=new Map<GameSound,number>();
 private requestId=0;
 private unlocked=false;
 readonly subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}};
 readonly snapshot=()=>this.settings;
 updateSettings(patch:Partial<AudioSettings>){
  this.settings={muted:patch.muted??this.settings.muted,musicVolume:clamp(patch.musicVolume??this.settings.musicVolume,this.settings.musicVolume),sfxVolume:clamp(patch.sfxVolume??this.settings.sfxVolume,this.settings.sfxVolume)};
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(this.settings))}catch{/* Private browsing may disable storage. */}
  this.applyVolume();
  if(this.settings.muted){this.epoch++;this.stopMusic(true);this.stopEffects()}else void this.startMusic();
  this.listeners.forEach(listener=>listener());
 }
 async unlock():Promise<void>{
  if(typeof window==='undefined')return;
  if(this.unlocked&&this.context?.state==='running'){void this.startMusic();return;}
  try{
   if(!this.context){this.context=new AudioContext();this.musicGain=this.context.createGain();this.sfxGain=this.context.createGain();this.musicGain.connect(this.context.destination);this.sfxGain.connect(this.context.destination);this.applyVolume();
    // Starting a silent source during the trusted gesture also unlocks mobile WebKit.
    const silent=this.context.createBufferSource();silent.buffer=this.context.createBuffer(1,1,22050);silent.connect(this.context.destination);silent.start();
   }
   await this.context.resume();this.unlocked=this.context.state==='running';
   if(this.unlocked){void this.startMusic();for(const key of Object.keys(files))void this.load(key).catch(()=>{})}
  }catch{/* A later trusted gesture can retry a denied browser unlock. */}
 }
 setBattleActive(active:boolean){
  if(active===this.active)return;this.active=active;this.epoch++;
  if(!active){this.stopMusic(false);this.stopEffects(true)}else{this.stopEffects();this.musicOffset=0;void this.startMusic()}
 }
 /** Unmount stops every source, including result cues surviving normal exit. */
 shutdown(){this.active=false;this.epoch++;this.stopMusic(false);this.stopEffects()}
 /** Hide pauses music at its current position and cancels pending/playing cues. */
 setVisible(visible:boolean){
  if(visible===this.visible)return;this.visible=visible;this.epoch++;
  if(!visible){this.stopMusic(true);this.stopEffects()}else void this.startMusic();
 }
 playSfx(sound:GameSound):void{
  if((sound==='win'||sound==='lose'||sound==='capture')&&!this.active)return;
  if(!this.context||!this.unlocked||!this.visible||this.settings.muted||this.settings.sfxVolume===0)return;
  const epoch=this.epoch,id=++this.requestId;this.requests.set(sound,id);
  void this.load(sound).then(buffer=>{
   if(epoch!==this.epoch||this.requests.get(sound)!==id||!this.visible||this.settings.muted||this.context?.state!=='running')return;
   // Repeated selections replace the same cue rather than stacking it.
   const previous=this.effects.get(sound);if(previous){previous.onended=null;previous.stop();previous.disconnect()}
   const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.sfxGain!);this.effects.set(sound,source);
   source.onended=()=>{source.disconnect();if(this.effects.get(sound)===source)this.effects.delete(sound)};source.start();
  }).catch(()=>{});
 }
 private applyVolume(){if(this.musicGain)this.musicGain.gain.value=this.settings.muted?0:this.settings.musicVolume;if(this.sfxGain)this.sfxGain.gain.value=this.settings.muted?0:this.settings.sfxVolume}
 private load(key:string):Promise<AudioBuffer>{
  const existing=this.buffers.get(key);if(existing)return existing;
  const promise=fetch(`/audio/${files[key]}`).then(response=>{if(!response.ok)throw new Error('Audio resource unavailable');return response.arrayBuffer()}).then(bytes=>this.context!.decodeAudioData(bytes));
  this.buffers.set(key,promise);void promise.catch(()=>{if(this.buffers.get(key)===promise)this.buffers.delete(key)});return promise;
 }
 private async startMusic(){
  if(!this.context||!this.unlocked||!this.active||!this.visible||this.settings.muted||this.music||this.musicStarting)return;
  const epoch=this.epoch;this.musicStarting=true;
  try{const buffer=await this.load('battle');if(epoch!==this.epoch||!this.active||!this.visible||this.settings.muted||this.context.state!=='running')return;
   const source=this.context.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(this.musicGain!);this.music=source;this.musicOffset%=buffer.duration;this.musicStarted=this.context.currentTime;source.start(0,this.musicOffset);
  }catch{/* Missing audio must not prevent gameplay. */}finally{this.musicStarting=false;if(epoch!==this.epoch)void this.startMusic()}
 }
 private stopMusic(preservePosition:boolean){
  if(this.music){if(preservePosition&&this.context)this.musicOffset+=this.context.currentTime-this.musicStarted;this.music.stop();this.music.disconnect();this.music=null}
  if(!preservePosition)this.musicOffset=0;
 }
 private stopEffects(preserveStartedResults=false){
  this.requests.clear();
  for(const [sound,source] of this.effects){if(preserveStartedResults&&(sound==='win'||sound==='lose'))continue;source.onended=null;source.stop();source.disconnect();this.effects.delete(sound)}
 }
}
export const gameAudio=new GameAudio();
