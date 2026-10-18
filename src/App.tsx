import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore,type ChangeEvent,type MouseEvent} from 'react';
import {createGame,loadCatalog} from './game.ts';
import type {GameController} from './game-types.ts';
import Battle from './components/Battle.tsx';
import WorldMap from './components/WorldMap.tsx';
import ChallengeCampaignScene from './components/ChallengeCampaignScene.tsx';
import Modifier from './components/Modifier.tsx';
import GameWindow from './components/GameWindow.tsx';
import BattleLoading from './components/BattleLoading.tsx';
import {GameToolbar} from './components/shell/ShellPanels.tsx';
import {ShellWindowContent} from './components/shell/ShellWindowContent.tsx';
import {shellRoutes} from './components/shell/shell-routes.ts';
import {useBattlePreparation,type BattleBackdrops} from './components/shell/useBattlePreparation.ts';
import {useShellAudio} from './components/shell/useShellAudio.ts';
import {useShellNavigation} from './components/shell/useShellNavigation.ts';
import {savedSceneBackdrop,type BattleBackdrop} from './presentation/battle-backdrop.ts';
import {useGameDisplay} from './presentation/game-display.ts';
import {COMPACT_WINDOWS,WINDOW_TITLES,campaignForAction,startsBattle,type WindowKind} from './presentation/shell-navigation.ts';
import {gameAudio} from './audio/game-audio.ts';
import {actionSound} from './audio/action-sounds.ts';
import './app.css';
import './game-shell.css';
if(import.meta.env.DEV)void import('./presentation/classic-font.css');

const NOTICE_MS=3500;
/** Buttons click, toolbar buttons tab; the battle scene plays its own sounds. */
function clickSound(event:MouseEvent<HTMLDivElement>){
 const target=event.target as HTMLElement,button=target.closest('button');
 if(button&&!button.disabled&&!target.closest('.battle-layer'))gameAudio.playSfx(target.closest('.game-toolbar')?'tab':'click');
}
function downloadSave(json:string){
 const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const link=document.createElement('a');
 link.href=url;link.download='赛尔号-星际存档.json';link.click();URL.revokeObjectURL(url);
}
const questAlert=(s:{quests:{claimable?:boolean;complete:boolean;claimed:boolean}[]})=>s.quests.some(q=>q.claimable??(q.complete&&!q.claimed));

export default function App(){
 const [controller,setController]=useState<GameController|null>(null),[error,setError]=useState('');
 useEffect(()=>{loadCatalog().then(data=>setController(createGame(data))).catch(e=>setError(String(e)))},[]);
 return controller?<Game controller={controller}/>:<div className="boot-screen"><h1>赛尔号 · 经典</h1><div className="boot-pulse"/><p>{error||'正在载入星际档案…'}</p></div>;
}

export function Game({controller:c}:{controller:GameController}){
 const shell=useRef<HTMLDivElement>(null),display=useGameDisplay(shell),file=useRef<HTMLInputElement>(null);
 const s=useSyncExternalStore(c.subscribe,c.snapshot);
 const navigation=useShellNavigation(),{nav,show,close,toggle,leaveCampaign}=navigation;
 const [selected,setSelected]=useState(''),[modifier,setModifier]=useState(false),[message,setMessage]=useState('');
 const [battleCommand,setBattleCommand]=useState<{command:'party'|'items';id:number}>();
 // One mutable box for the backdrops a battle may open over, read when the battle starts.
 const [backdrops]=useState<{current:BattleBackdrops}>(()=>({current:{exploration:savedSceneBackdrop(),campaign:null}}));
 const rememberScene=useCallback((scene:BattleBackdrop)=>{backdrops.current.exploration=scene},[]);
 const battle=useBattlePreparation(c,backdrops,!!s.battle,{onStart(){close();setMessage('')},onBattle:started=>audio.track(started)});
 const audio=useShellAudio(s,!!battle.preparation);
 const routes=shellRoutes({c,s,navigation,backdrops,setMessage,setSelected});
 const inBattle=!!s.battle&&!s.battle.finished,{preparation}=battle,{windowKind}=nav;
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){close();setModifier(false)}};
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[]);
 // Components receive this controller: battles start behind the loading screen, campaign
 // encounters open their stage scene, and confirmed outcomes play their sound.
 const uiController=useMemo<GameController>(()=>({...c,dispatch:action=>{
  if(action.type==='closeBattle'){
   const before=c.snapshot(),result=before.battle?.result;
   audio.closing(before);c.dispatch(action);close();if(result)setMessage(result);return;
  }
  const campaign=campaignForAction(action);
  if(campaign){routes.openCampaign(campaign.id);return}
  if(startsBattle(action)){void battle.begin(action);return}
  const before=c.snapshot();c.dispatch(action);const sound=actionSound(action,before,c.snapshot());if(sound)gameAudio.playSfx(sound);
 }}),[c]);
 function openTool(kind:WindowKind){
  if(preparation)return;
  if(inBattle){
   if(kind==='bag'||kind==='monsters'){setBattleCommand({command:kind==='bag'?'items':'party',id:Date.now()});close();return}
   if(kind!=='settings'){setMessage('请先完成战斗，或选择逃跑返回场景。');return}
  }
  toggle(kind);
 }
 function exportSave(){downloadSave(c.exportSave());setMessage('航行存档已导出。')}
 async function importSave(event:ChangeEvent<HTMLInputElement>){
  const chosen=event.target.files?.[0];
  if(chosen)try{c.importSave(await chosen.text());setMessage('航行存档已载入。');close()}catch(error){setMessage('存档无法读取：'+String(error))}
  event.target.value='';
 }
 const notices=message||s.notices[0];
 const dismiss=()=>{setMessage('');c.dispatch({type:'dismissNotice'})};
 useEffect(()=>{if(!notices)return;const timer=setTimeout(dismiss,NOTICE_MS);return()=>clearTimeout(timer)},[notices,c]);
 const activeCampaign=s.campaigns.find(campaign=>campaign.id===nav.campaignId);
 return <div ref={shell} style={display} className={`game-shell${s.battle||preparation?' is-in-battle':''}`} onClickCapture={clickSound}>
  <div className="game-stage">
   <div className="exploration-layer" hidden={!!s.battle||!!activeCampaign}>
    <WorldMap s={s} c={uiController} onNavigate={routes.navigate} travelTo={nav.travelTo} onSceneChange={rememberScene}
     onInteract={event=>{if(event.kind==='species')show('dex',{dexSpecies:event.species});else show('quests',{questId:event.questId})}}/>
   </div>
   {activeCampaign&&!s.battle&&<ChallengeCampaignScene campaign={activeCampaign} c={uiController} background={backdrops.current.campaign?.src}
    onLeave={leaveCampaign} onManage={()=>show('monsters')}/>}
   {s.battle&&!preparation&&<div className="battle-layer">
    <Battle s={s} c={uiController} commandRequest={battleCommand} background={battle.backdrop.src} onSettings={()=>openTool('settings')}/>
   </div>}
   {preparation&&<BattleLoading state={preparation} onLeave={()=>{battle.leave();close()}}/>}
   {notices&&!preparation&&!s.battle&&<button className="game-toast" aria-label="关闭提示" onClick={dismiss}>{notices}<span>×</span></button>}
   {windowKind&&<div className="scene-window-shield" aria-hidden="true" onClick={close}/>}
   {windowKind&&<GameWindow key={windowKind} title={WINDOW_TITLES[windowKind]} compact={COMPACT_WINDOWS.has(windowKind)} onClose={close}>
    <ShellWindowContent kind={windowKind} s={s} c={uiController} focus={nav.focus} selected={selected} inBattle={inBattle} navigation={navigation} routes={routes}
     onSelect={setSelected} onMessage={setMessage} onExportSave={exportSave} onImportSave={()=>file.current?.click()}
     onHeal={()=>{c.dispatch({type:'heal'});gameAudio.playSfx('heal');close()}} onModifier={()=>{close();setModifier(true)}}/>
   </GameWindow>}
   <input ref={file} type="file" accept=".json" hidden onChange={importSave}/>
  </div>
  <GameToolbar hidden={!!s.battle||!!preparation} active={windowKind} questAlert={questAlert(s)} onOpen={openTool}/>
  {modifier&&<Modifier s={s} c={c} m={s.monsters.find(m=>m.uid===selected)??s.monsters[0]} onSelect={setSelected} close={()=>setModifier(false)}/>}
 </div>;
}
