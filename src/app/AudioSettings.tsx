import {useSyncExternalStore} from 'react';
import {gameAudio} from '../shared/audio/game-audio.ts';
import './AudioSettings.css';
const VOLUMES=[['musicVolume','战斗音乐'],['sfxVolume','音效']] as const;
export default function AudioSettings(){
 const settings=useSyncExternalStore(gameAudio.subscribe,gameAudio.snapshot);
 return <fieldset className="audio-settings"><legend>声音</legend>
  <label className="audio-mute">
   <input type="checkbox" checked={settings.muted} onChange={event=>gameAudio.updateSettings({muted:event.target.checked})}/>静音
  </label>
  {VOLUMES.map(([key,label])=>{const percent=Math.round(settings[key]*100);return <label key={key} className="audio-slider">{label}
   <input type="range" min="0" max="100" step="1" value={percent} onChange={event=>gameAudio.updateSettings({[key]:Number(event.target.value)/100})}/>
   <output>{percent}%</output>
  </label>})}
  <p className="small muted">声音设置自动保存。首次点击或按键后启用播放。</p></fieldset>;
}
