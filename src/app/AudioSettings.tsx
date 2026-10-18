import {useSyncExternalStore} from 'react';
import {gameAudio} from './audio/game-audio.ts';
import './AudioSettings.css';
export default function AudioSettings(){
 const settings=useSyncExternalStore(gameAudio.subscribe,gameAudio.snapshot);
 return <fieldset className="audio-settings"><legend>声音</legend><label className="audio-mute"><input type="checkbox" checked={settings.muted} onChange={event=>gameAudio.updateSettings({muted:event.target.checked})}/>静音</label>
  <label className="audio-slider">战斗音乐<input type="range" min="0" max="100" step="1" value={Math.round(settings.musicVolume*100)} onChange={event=>gameAudio.updateSettings({musicVolume:Number(event.target.value)/100})}/><output>{Math.round(settings.musicVolume*100)}%</output></label>
  <label className="audio-slider">音效<input type="range" min="0" max="100" step="1" value={Math.round(settings.sfxVolume*100)} onChange={event=>gameAudio.updateSettings({sfxVolume:Number(event.target.value)/100})}/><output>{Math.round(settings.sfxVolume*100)}%</output></label>
  <p className="small muted">声音设置自动保存。首次点击或按键后启用播放。</p></fieldset>;
}
