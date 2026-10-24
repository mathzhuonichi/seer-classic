import {useCallback,useEffect,useMemo,useRef,useState,type ChangeEvent,type MouseEvent} from 'react';
import {createGame} from '../kernel/game.ts';
import {loadCatalog} from '../domain/catalog/catalog.ts';
import type { GameController } from '../kernel/contract.ts';
import {Battle,BattleLoading} from '../features/battle/ui.ts';
import {WorldMap} from '../features/world/ui.ts';
import {ChallengeCampaignScene} from '../features/challenges/ui.ts';
import {Modifier} from '../features/raising/ui.ts';
import GameWindow from '../shared/ui/GameWindow.tsx';
import {useGame} from '../shared/ui/use-game.ts';
import {GameToolbar} from './ShellPanels.tsx';
import {ShellWindowContent} from './ShellWindowContent.tsx';
import {shellRoutes} from './shell-routes.ts';
import {useBattlePreparation,type BattleBackdrops} from './useBattlePreparation.ts';
import {useShellAudio} from './useShellAudio.ts';
import {useShellNavigation} from './useShellNavigation.ts';
import {locationBackdrop, type BattleBackdrop} from '../features/battle/index.ts';
import {useGameDisplay} from '../shared/game-display.ts';
import {battleActive,questAlert} from '../shared/view-helpers.ts';
import {COMPACT_WINDOWS,WINDOW_TITLES,campaignForAction,startsBattle,type WindowKind} from './shell-navigation.ts';
import {readWorldPreference,type WorldLocationId} from '../domain/world/world.ts';
import {gameAudio} from '../shared/audio/game-audio.ts';
import {actionSound} from './action-sounds.ts';
import {GameErrorBoundary} from './GameErrorBoundary.tsx';
import {SaveProblem} from './SaveProblem.tsx';
import {exportSaveFile} from './save-files.ts';
import type {UnreadableSave} from '../kernel/persistence.ts';
import './app.css';
import './game-shell.css';
if(import.meta.env.DEV)void import('./classic-font.css');

/** Buttons click, toolbar buttons tab; the battle scene plays its own sounds. */
function clickSound(event:MouseEvent<HTMLDivElement>){
 const target=event.target as HTMLElement,button=target.closest('button');
 if(button&&!button.disabled&&!target.closest('.battle-layer'))gameAudio.playSfx(target.closest('.game-toolbar')?'tab':'click');
}

const NOTICE_MS=3500;

/** The shell's own state and the snapshot selections it renders: navigation, selections, the modifier and the toast. */
function useShellState(c:GameController){
 const navigation=useShellNavigation();
 const [selected,setSelected]=useState(''),[modifier,setModifier]=useState(false),[message,setMessage]=useState('');
 const battleOpen=useGame(c,s=>!!s.battle),inBattle=useGame(c,battleActive),notice=useGame(c,s=>s.notices[0]);
 const questReady=useGame(c,questAlert);
 const activeCampaign=useGame(c,s=>s.campaigns.find(campaign=>campaign.id===navigation.nav.campaignId));
 // Selected only while the modifier is open, so monster changes elsewhere do not re-render the shell.
 const modifierTarget=useGame(c,s=>modifier?s.monsters.find(m=>m.uid===selected)??s.monsters[0]:undefined);
 // One mutable box for the backdrops a battle may open over, read when the battle starts.
 const [backdrops]=useState<{current:BattleBackdrops}>(()=>({current:{exploration:locationBackdrop(readWorldPreference()),campaign:null}}));
 const rememberScene=useCallback((scene:BattleBackdrop)=>{backdrops.current.exploration=scene},[]);
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){navigation.close();setModifier(false)}};
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[]);
 // The toast shows the shell's own message, else the newest notice, and dismisses itself; clicks pass through it.
 const toast=message||notice;
 const dismiss=()=>{setMessage('');c.dispatch({type:'dismissNotice'})};
 useEffect(()=>{if(!toast)return;const timer=setTimeout(dismiss,NOTICE_MS);return()=>clearTimeout(timer)},[toast,c]);
 return {
  navigation,selected,setSelected,modifier,setModifier,setMessage,
  battleOpen,inBattle,questReady,activeCampaign,modifierTarget,backdrops,rememberScene,toast,
 };
}

/** The screen before the game opens: loading, or why it could not open. */
function BootScreen({message}:{message:string}){
 return <div className="boot-screen"><h1>赛尔号 · 经典</h1><div className="boot-pulse"/><p>{message}</p></div>;
}

export default function App(){
 const [controller,setController]=useState<GameController|null>(null),[error,setError]=useState('');
 useEffect(()=>{loadCatalog().then(data=>setController(createGame(data))).catch(e=>setError(String(e)))},[]);
 if(!controller)return <BootScreen message={error||'正在载入星际档案…'}/>;
 return <GameErrorBoundary onExport={()=>exportSaveFile(controller.exportSave())}><Game controller={controller}/></GameErrorBoundary>;
}

export function Game({controller:c}:{controller:GameController}){
 const shell=useRef<HTMLDivElement>(null),display=useGameDisplay(shell),file=useRef<HTMLInputElement>(null);
 const {navigation,selected,setSelected,modifier,setModifier,setMessage,
  battleOpen,inBattle,questReady,activeCampaign,modifierTarget,backdrops,rememberScene,toast}=useShellState(c);
 const {nav,show,close,toggle,leaveCampaign}=navigation;
 const battle=useBattlePreparation(c,backdrops,battleOpen,{onStart(){close();setMessage('')},onBattle:started=>audio.track(started)});
 const audio=useShellAudio(c,!!battle.preparation,nav.campaignId),{showScene}=audio;
 const sceneShown=useCallback((scene:BattleBackdrop&WorldLocationId)=>{rememberScene(scene);showScene(scene)},[rememberScene,showScene]);
 const routes=shellRoutes({c,navigation,backdrops,setMessage,setSelected});
 const {preparation}=battle,{windowKind}=nav;
 // Components receive this controller: battles start behind the loading screen, campaign
 // encounters open their stage scene, and confirmed outcomes play their sound. It is created
 // once per game controller and calls this render's handlers.
 const latest=useRef({routes,battle,audio});latest.current={routes,battle,audio};
 const uiController=useMemo<GameController>(()=>({...c,dispatch:action=>{
  const {routes,battle,audio}=latest.current;
  if(action.type==='closeBattle'){
   const before=c.snapshot(),result=before.battle?.result;
   audio.closing(before);const done=c.dispatch(action);close();if(result)setMessage(result);return done;
  }
  const campaign=campaignForAction(action);
  if(campaign){routes.openCampaign(campaign.id);return {ok:true}}
  if(startsBattle(action)){void battle.begin(action);return {ok:true}}
  const before=c.snapshot(),done=c.dispatch(action),sound=actionSound(action,done,before,c.snapshot());if(sound)gameAudio.playSfx(sound);
  return done;
 }}),[c]);
 function openTool(kind:WindowKind){
  if(preparation)return;
  toggle(kind);
 }
 function exportFile(text:string,fileName?:string){
  try{exportSaveFile(text,fileName);setMessage('航行存档已导出。')}catch(error){setMessage('存档导出失败：'+String(error))}
 }
 const exportSave=()=>exportFile(c.exportSave());
 const exportUnreadable=(save:UnreadableSave)=>exportFile(save.text,`赛尔号-无法读取的存档-${save.name.replace(/\.json$/,'').replace(/[^\w.-]+/g,'-')}.json`);
 async function importSave(event:ChangeEvent<HTMLInputElement>){
  const chosen=event.target.files?.[0];
  if(chosen)try{c.importSave(await chosen.text());setMessage('航行存档已载入。');close()}catch(error){setMessage('存档无法读取：'+String(error))}
  event.target.value='';
 }
 return <div ref={shell} style={display} className={`game-shell${battleOpen||preparation?' is-in-battle':''}`} onClickCapture={clickSound}>
  <div className="game-stage">
   {/* Inert under a window, the modifier or the loading screen, so focus and keys cannot reach exits and creatures behind them. */}
   <div className="exploration-layer" hidden={battleOpen||!!activeCampaign} inert={!!windowKind||modifier||!!preparation}>
    <WorldMap c={uiController} onNavigate={routes.navigate} travelTo={nav.travelTo} onSceneChange={sceneShown}
     onInteract={event=>{if(event.kind==='species')show('dex',{dexSpecies:event.species});else show('quests',{questId:event.questId})}}/>
   </div>
   {activeCampaign&&!battleOpen&&<ChallengeCampaignScene campaign={activeCampaign} c={uiController} background={backdrops.current.campaign?.src}
    onLeave={leaveCampaign} onManage={()=>show('monsters')}/>}
   {battleOpen&&!preparation&&<div className="battle-layer">
    <Battle c={uiController} background={battle.backdrop.src}
     onSettings={()=>openTool('settings')}/>
   </div>}
   {preparation&&<BattleLoading state={preparation} onLeave={()=>{battle.leave();close()}}/>}
   {toast&&!preparation&&!battleOpen&&<div className="game-toast" role="status">{toast}</div>}
   <SaveProblem onExport={exportSave}/>
   {windowKind&&<div className="scene-window-shield" aria-hidden="true" onClick={close}/>}
   {windowKind&&<GameWindow key={windowKind} title={WINDOW_TITLES[windowKind]} compact={COMPACT_WINDOWS.has(windowKind)} onClose={close}>
    <ShellWindowContent kind={windowKind} c={uiController} focus={nav.focus} selected={selected} inBattle={inBattle} navigation={navigation} routes={routes}
     onSelect={setSelected} onMessage={setMessage} onExportSave={exportSave} onExportUnreadable={exportUnreadable} onImportSave={()=>file.current?.click()}
     onHeal={()=>{c.dispatch({type:'heal'});gameAudio.playSfx('heal');close()}} onModifier={()=>{close();setModifier(true)}}/>
   </GameWindow>}
   <input ref={file} type="file" accept=".json" hidden onChange={importSave}/>
  </div>
  <GameToolbar hidden={battleOpen||!!preparation} active={windowKind} questAlert={questReady} onOpen={openTool}/>
  {modifier&&<Modifier c={c} m={modifierTarget} onSelect={setSelected} close={()=>setModifier(false)}/>}
 </div>;
}
