import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore,type ChangeEvent,type MouseEvent} from 'react';
import {createGame,loadCatalog} from './game.ts';
import type {BossView,GameController} from './game-types.ts';
import Battle from './components/Battle.tsx';
import WorldMap from './components/WorldMap.tsx';
import WorldAtlas from './components/WorldAtlas.tsx';
import MonsterManager from './components/MonsterManager.tsx';
import Fusion from './components/Fusion.tsx';
import Breeding from './components/Breeding.tsx';
import ItemShop from './components/ItemShop.tsx';
import Inventory from './components/Inventory.tsx';
import Dex from './components/Dex.tsx';
import ChallengeCenter from './components/ChallengeCenter.tsx';
import BattleFacilities from './components/BattleFacilities.tsx';
import BraveTower from './components/BraveTower.tsx';
import QuestPanel from './components/QuestPanel.tsx';
import ChallengeCampaignScene from './components/ChallengeCampaignScene.tsx';
import Modifier from './components/Modifier.tsx';
import GameWindow from './components/GameWindow.tsx';
import BattleLoading from './components/BattleLoading.tsx';
import {GameToolbar,RecoveryConsole,SettingsConsole} from './components/shell/ShellPanels.tsx';
import {useBattlePreparation,type BattleBackdrops} from './components/shell/useBattlePreparation.ts';
import {useShellAudio} from './components/shell/useShellAudio.ts';
import {useShellNavigation} from './components/shell/useShellNavigation.ts';
import {braveTowerFloor} from './progression/brave-tower.ts';
import type {AcquisitionRoute} from './progression/acquisition.ts';
import {campaignBackdrop,savedSceneBackdrop,type BattleBackdrop} from './presentation/battle-backdrop.ts';
import {useGameDisplay} from './presentation/game-display.ts';
import {COMPACT_WINDOWS,WINDOW_TITLES,campaignForAction,locateTarget,parseRoute,startsBattle,type WindowKind} from './presentation/shell-navigation.ts';
import {BRAVE_TOWER_LOCATION,findChallengeLocation} from './world.ts';
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

export default function App(){const [controller,setController]=useState<GameController|null>(null),[error,setError]=useState('');useEffect(()=>{loadCatalog().then(data=>setController(createGame(data))).catch(e=>setError(String(e)))},[]);return controller?<Game controller={controller}/>:<div className="boot-screen"><h1>赛尔号 · 经典</h1><div className="boot-pulse"/><p>{error||'正在载入星际档案…'}</p></div>}

export function Game({controller:c}:{controller:GameController}){
 const shell=useRef<HTMLDivElement>(null),display=useGameDisplay(shell),file=useRef<HTMLInputElement>(null);
 const s=useSyncExternalStore(c.subscribe,c.snapshot);
 const {nav,show,close,toggle,travel,enterCampaign,leaveCampaign}=useShellNavigation();
 const [selected,setSelected]=useState(''),[modifier,setModifier]=useState(false),[message,setMessage]=useState('');
 const [battleCommand,setBattleCommand]=useState<{command:'party'|'items';id:number}>();
 // One mutable box for the backdrops a battle may open over, read when the battle starts.
 const [backdrops]=useState<{current:BattleBackdrops}>(()=>({current:{exploration:savedSceneBackdrop(),campaign:null}}));
 const rememberScene=useCallback((scene:BattleBackdrop)=>{backdrops.current.exploration=scene},[]);
 const battle=useBattlePreparation(c,backdrops,!!s.battle,{onStart(){close();setMessage('')},onBattle:started=>audio.track(started)});
 const audio=useShellAudio(s,!!battle.preparation);
 const monster=s.monsters.find(m=>m.uid===selected)??s.monsters[0];
 const inBattle=!!s.battle&&!s.battle.finished;
 const openDex=(dexSpecies:number)=>show('dex',{dexSpecies}),openBag=(bagPocket:string)=>show('bag',{bagPocket});
 useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){close();setModifier(false)}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[]);

 function openCampaign(id:string){
  backdrops.current.campaign=campaignBackdrop(c.snapshot(),id)??backdrops.current.exploration;
  if(c.snapshot().battle?.finished)c.dispatch({type:'closeBattle'});
  enterCampaign(id);setMessage('');
 }
 // Components receive this controller: battles start behind the loading screen, campaign
 // encounters open their stage scene, and confirmed outcomes play their sound.
 const uiController=useMemo<GameController>(()=>({...c,dispatch:action=>{
  if(action.type==='closeBattle'){const before=c.snapshot(),result=before.battle?.result;audio.closing(before);c.dispatch(action);close();if(result)setMessage(result);return}
  const campaign=campaignForAction(action);
  if(campaign){openCampaign(campaign.id);return}
  if(startsBattle(action)){void battle.begin(action);return}
  const before=c.snapshot();c.dispatch(action);const sound=actionSound(action,before,c.snapshot());if(sound)gameAudio.playSfx(sound);
 }}),[c]);
 function openTool(kind:WindowKind){
  if(battle.preparation)return;
  if(inBattle){
   if(kind==='bag'||kind==='monsters'){setBattleCommand({command:kind==='bag'?'items':'party',id:Date.now()});close();return}
   if(kind!=='settings'){setMessage('请先完成战斗，或选择逃跑返回场景。');return}
  }
  toggle(kind);
 }
 const openTower=()=>travel(BRAVE_TOWER_LOCATION);
 function enterTower(floor:number){c.dispatch({type:'enterTower',floor});if(c.snapshot().braveTower.resumeFloor===floor)openTower()}
 function navigate(page:string){
  const route=parseRoute(page);
  if(route.kind==='tower')openTower();
  else if(route.kind==='campaign'){if(s.campaigns.some(campaign=>campaign.id===route.campaignId))openCampaign(route.campaignId)}
  else show(route.windowKind,route.focus);
 }
 function travelToChallenge(boss:BossView){
  if(braveTowerFloor(boss.id)!==undefined){openTower();return}
  const {planetId,regionId}=findChallengeLocation(boss);travel({planetId,regionId,bossId:boss.id});
 }
 function locate(_species:number,route:AcquisitionRoute){
  const target=locateTarget(route);
  if(target.kind==='travel')travel(target.destination,target.windowKind,target.focus);
  else if(target.kind==='campaign')openCampaign(target.campaignId);
  else if(target.kind==='boss')travelToChallenge(s.bosses.find(boss=>boss.id===target.bossId)!);
  else if(target.kind==='quest')show('quests',{questId:target.questId},true);
  else{
   const owned=s.monsters.find(mon=>mon.species===target.species);
   if(owned)setSelected(owned.uid);
   show('monsters',{},true);
   if(!owned)setMessage('初始伙伴在新旅程开始时赠送，可在精灵仓库查看。');
  }
 }
 function exportSave(){downloadSave(c.exportSave());setMessage('航行存档已导出。')}
 async function importSave(event:ChangeEvent<HTMLInputElement>){
  const chosen=event.target.files?.[0];
  if(chosen)try{c.importSave(await chosen.text());setMessage('航行存档已载入。');close()}catch(error){setMessage('存档无法读取：'+String(error))}
  event.target.value='';
 }
 function leaveLoading(){battle.leave();close()}
 const notices=message||s.notices[0];
 const dismiss=()=>{setMessage('');c.dispatch({type:'dismissNotice'})};
 useEffect(()=>{if(!notices)return;const timer=setTimeout(dismiss,NOTICE_MS);return()=>clearTimeout(timer)},[notices,c]);

 function windowContent(kind:WindowKind){
  const {focus}=nav;
  switch(kind){
   case 'atlas':return <WorldAtlas onTravel={destination=>travel(destination)}/>;
   case 'monsters':return <MonsterManager s={s} c={uiController} selected={selected} onSelect={setSelected}/>;
   case 'fusion':return <section className="management-panel" aria-label="实验室融合面板"><Fusion s={s} c={uiController} initialRecipeId={focus.fusionRecipeId} onOpenBeads={()=>openBag('essence')}/></section>;
   case 'breeding':return <Breeding s={s} c={uiController} initialRecipeId={focus.breedingRecipeId} onOpenDex={openDex} onOpenMonsters={uid=>{setSelected(uid);show('monsters')}}/>;
   case 'shop':return <ItemShop s={s} c={uiController} onOpenBag={openBag}/>;
   case 'bag':return <Inventory s={s} c={uiController} onSave={exportSave} onMessage={setMessage} initialPocket={focus.bagPocket}/>;
   case 'dex':return <Dex s={s} c={uiController} onLocate={locate} focusSpecies={focus.dexSpecies}/>;
   case 'challenge':return <ChallengeCenter s={s} c={uiController} initialCategory={focus.challengeCategory} onExplore={()=>show('atlas')} onTravel={travelToChallenge} onCampaign={openCampaign} onTower={openTower}/>;
   case 'facilities':return <BattleFacilities s={s} c={uiController} facilityId={focus.facilityId} onManage={()=>show('monsters')}/>;
   case 'tower':return <BraveTower s={s} onEnter={enterTower}/>;
   case 'quests':return <QuestPanel s={s} c={uiController} focusQuestId={focus.questId} onTravel={travelToChallenge} onLocateSpecies={openDex} onOpenBag={()=>openBag('essence')}/>;
   case 'recovery':return <RecoveryConsole s={s} onHeal={()=>{c.dispatch({type:'heal'});gameAudio.playSfx('heal');close()}}/>;
   case 'settings':return <SettingsConsole inBattle={inBattle} onExport={exportSave} onImport={()=>file.current?.click()} onModifier={()=>{close();setModifier(true)}} onMessage={setMessage}/>;
  }
 }
 const activeCampaign=s.campaigns.find(campaign=>campaign.id===nav.campaignId),{preparation}=battle,{windowKind}=nav;
 return <div ref={shell} style={display} className={`game-shell${s.battle||preparation?' is-in-battle':''}`} onClickCapture={clickSound}>
  <div className="game-stage">
   <div className="exploration-layer" hidden={!!s.battle||!!activeCampaign}><WorldMap s={s} c={uiController} onNavigate={navigate} travelTo={nav.travelTo} onSceneChange={rememberScene} onInteract={event=>{if(event.kind==='species')openDex(event.species);else show('quests',{questId:event.questId})}}/></div>
   {activeCampaign&&!s.battle&&<ChallengeCampaignScene campaign={activeCampaign} c={uiController} background={backdrops.current.campaign?.src} onLeave={leaveCampaign} onManage={()=>show('monsters')}/>}
   {s.battle&&!preparation&&<div className="battle-layer"><Battle s={s} c={uiController} commandRequest={battleCommand} background={battle.backdrop.src} onSettings={()=>openTool('settings')}/></div>}
   {preparation&&<BattleLoading state={preparation} onLeave={leaveLoading}/>}
   {notices&&!preparation&&!s.battle&&<button className="game-toast" aria-label="关闭提示" onClick={dismiss}>{notices}<span>×</span></button>}
   {windowKind&&<div className="scene-window-shield" aria-hidden="true" onClick={close}/>}
   {windowKind&&<GameWindow key={windowKind} title={WINDOW_TITLES[windowKind]} compact={COMPACT_WINDOWS.has(windowKind)} onClose={close}>{windowContent(windowKind)}</GameWindow>}
   <input ref={file} type="file" accept=".json" hidden onChange={importSave}/>
  </div>
  <GameToolbar hidden={!!s.battle||!!preparation} active={windowKind} questAlert={s.quests.some(q=>q.claimable??(q.complete&&!q.claimed))} onOpen={openTool}/>
  {modifier&&<Modifier s={s} c={c} m={monster} onSelect={setSelected} close={()=>setModifier(false)}/>}
 </div>;
}
