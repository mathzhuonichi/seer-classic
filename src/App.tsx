import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {createGame,loadGameData} from './game';
import {preloadBattleImages,waitForBattleLoad} from './presentation/battle-loading';
import type {BossView,GameAction,GameController,GameSnapshot} from './game-types';
import Battle from './components/Battle';
import WorldMap from './components/WorldMap';
import WorldAtlas from './components/WorldAtlas';
import MonsterManager from './components/MonsterManager';
import Fusion from './components/Fusion';
import Breeding from './components/Breeding';
import ItemShop from './components/ItemShop';
import Inventory from './components/Inventory';
import Dex from './components/Dex';
import ChallengeCenter from './components/ChallengeCenter';
import BattleFacilities from './components/BattleFacilities';
import QuestPanel from './components/QuestPanel';
import ChallengeCampaignScene from './components/ChallengeCampaignScene';
import {CHALLENGE_CAMPAIGNS} from './progression/challenge-campaigns';
import type {AcquisitionRoute} from './progression/acquisition';
import Modifier from './components/Modifier';
import GameWindow from './components/GameWindow';
import BattleLoading,{type BattlePreparation} from './components/BattleLoading';
import {getCreatureArt} from './presentation/creature-art';
import {useGameDisplay} from './presentation/game-display';
import {findChallengeLocation,readWorldPreference,resolveWorldLocation} from './world';
import AudioSettings from './components/AudioSettings';
import {gameAudio} from './audio/game-audio';
import {actionSound,battleLevelGained} from './audio/action-sounds';
import {preloadBattleAnimations,clearIdleBattleAnimations} from './presentation/battle-animation';
import './app.css';
import './game-shell.css';
if(import.meta.env.DEV)void import('./presentation/classic-font.css');

type WindowKind='atlas'|'monsters'|'fusion'|'breeding'|'shop'|'bag'|'dex'|'quests'|'challenge'|'facilities'|'recovery'|'settings';
const classicTools:{id:WindowKind;asset:string;label:string}[]=[
 {id:'quests',asset:'mission',label:'任务'},
 {id:'challenge',asset:'new-spt',label:'SPT'},
 {id:'bag',asset:'bag',label:'道具'},
 {id:'dex',asset:'dex',label:'图鉴'},
 {id:'atlas',asset:'map',label:'地图'},
 {id:'monsters',asset:'creatures',label:'精灵'},
 {id:'recovery',asset:'restore',label:'恢复'},
 {id:'settings',asset:'profile',label:'设置'},
];
const classicIconFiles:Record<string,string>={'new-spt':'new-spt-vector.svg',map:'hd/map-v44.svg',creatures:'hd/creatures-no-circle-v50.svg'};
const classicIcon=(asset:string)=>`/ui/classic/${classicIconFiles[asset]??`${asset}.svg`}`;
const titles:Record<WindowKind,string>={atlas:'星际地图',monsters:'精灵背包',fusion:'实验室 · 精灵融合',breeding:'实验室 · 精灵繁殖',shop:'实验室 · 道具商城',bag:'道具背包',dex:'精灵图鉴',quests:'航行任务',challenge:'SPT 挑战档案',facilities:'太空站 · 对战设施',recovery:'精灵恢复舱',settings:'航行设置'};
export default function App(){const [controller,setController]=useState<GameController|null>(null),[error,setError]=useState('');useEffect(()=>{loadGameData().then(data=>setController(createGame(data))).catch(e=>setError(String(e)))},[]);return controller?<Game controller={controller}/>:<div className="boot-screen"><h1>赛尔号 · 经典</h1><div className="boot-pulse"/><p>{error||'正在载入星际档案…'}</p></div>}
function currentBattleScene(){
 const preference=readWorldPreference(),{planet,region}=resolveWorldLocation(preference.planetId,preference.regionId);
 return {src:region.background??planet.background,name:region.name};
}
export function Game({controller:c}:{controller:GameController}){
 const shell=useRef<HTMLDivElement>(null),display=useGameDisplay(shell);
 const s=useSyncExternalStore(c.subscribe,c.snapshot);
 const [windowKind,setWindowKind]=useState<WindowKind|null>(null),[selected,setSelected]=useState(''),[modifier,setModifier]=useState(false);
 const [focusSpecies,setFocusSpecies]=useState<number>(),[message,setMessage]=useState('');
 const [travelTo,setTravelTo]=useState<{planetId:string;regionId:string;bossId?:string;requestId:number}>();
 const [campaignId,setCampaignId]=useState<string|null>(null);
 const activeCampaign=s.campaigns.find(campaign=>campaign.id===campaignId);
 const [preparation,setPreparation]=useState<BattlePreparation|null>(null);
 const [battleScene,setBattleScene]=useState(currentBattleScene);
 const explorationScene=useRef(currentBattleScene()),campaignScene=useRef<{src:string;name:string}|null>(null);
 const rememberScene=useCallback((scene:{src:string;name:string})=>{explorationScene.current=scene},[]);
 const [battleCommand,setBattleCommand]=useState<{command:'party'|'items';id:number}>();
 const [dexFocus,setDexFocus]=useState<number>();
 const [fusionRecipeId,setFusionRecipeId]=useState<string>();
 const [breedingRecipeId,setBreedingRecipeId]=useState<string>();
 const [bagPocket,setBagPocket]=useState<string>();
 const [questFocusId,setQuestFocusId]=useState<string>();
 const [facilityId,setFacilityId]=useState<string>();
 const battleLevels=useRef<Map<string,number>|null>(null),battleLevelUpPending=useRef(false);
 const preparing=useRef(false),preparationId=useRef(0),preparationAbort=useRef<AbortController|null>(null),file=useRef<HTMLInputElement>(null);
 useEffect(()=>()=>{preparationId.current++;preparationAbort.current?.abort();clearIdleBattleAnimations()},[]);
 useEffect(()=>{
  const unlock=()=>{void gameAudio.unlock()};
  const visibility=()=>gameAudio.setVisible(!document.hidden);
  window.addEventListener('pointerdown',unlock,{capture:true});window.addEventListener('keydown',unlock,{capture:true});document.addEventListener('visibilitychange',visibility);visibility();
  return()=>{window.removeEventListener('pointerdown',unlock,true);window.removeEventListener('keydown',unlock,true);document.removeEventListener('visibilitychange',visibility);gameAudio.shutdown()};
 },[]);
 useEffect(()=>{
  gameAudio.setBattleActive(!!s.battle&&!preparation);
  if(s.battle&&!battleLevels.current)battleLevels.current=new Map(s.battle.party.map(mon=>[mon.uid,mon.level]));
  if(!s.battle&&battleLevels.current){battleLevels.current=null;if(battleLevelUpPending.current)gameAudio.playSfx('level-up');battleLevelUpPending.current=false}
 },[!!s.battle,!!preparation]);
 useEffect(()=>{if(!s.battle)clearIdleBattleAnimations()},[!!s.battle]);
 const monster=s.monsters.find(m=>m.uid===selected)??s.monsters[0];
 useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setWindowKind(null);setModifier(false)}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[]);
 async function beginBattle(action:GameAction){
  if(preparing.current)return;preparing.current=true;const scene=action.type==='startCampaignStage'&&campaignScene.current?campaignScene.current:explorationScene.current;setBattleScene(scene);const request=++preparationId.current;setWindowKind(null);setMessage('');c.dispatch({type:'dismissNotice'});c.dispatch(action);
  const battle=c.snapshot().battle;if(!battle||battle.finished){preparing.current=false;return}
  preparationAbort.current?.abort();const loading=new AbortController();preparationAbort.current=loading;const {signal}=loading;
  battleLevels.current=new Map(battle.party.map(mon=>[mon.uid,mon.level]));
  const campaign=action.type==='startCampaignStage'?CHALLENGE_CAMPAIGNS.find(entry=>entry.id===action.campaignId):undefined;
  const initial={name:battle.name,species:battle.enemy.species,location:campaign?.location??scene.name,progress:0,step:'连接战斗场景…'};setPreparation(initial);
  const sources=[...new Set([scene.src,...[...battle.party,...battle.enemyParty].flatMap(m=>[getCreatureArt(m.appearanceSpecies??m.species).src,m.portrait])])];
  try{
   await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
   await waitForBattleLoad(250,signal);
   if(request!==preparationId.current)return;
   await preloadBattleImages(sources,signal,(loaded,total)=>{if(request===preparationId.current)setPreparation({...initial,progress:Math.round(loaded/total*75),step:'准备精灵立绘与场景…'})});
   if(request!==preparationId.current)return;
   setPreparation({...initial,progress:80,step:'准备精灵动作…'});
   await preloadBattleAnimations([battle.player.appearanceSpecies??battle.player.species,battle.enemy.appearanceSpecies??battle.enemy.species],{signal});
   if(request!==preparationId.current)return;
   setPreparation({...initial,progress:90,step:'部署出战精灵…'});
   await waitForBattleLoad(600,signal);
   setPreparation({...initial,progress:100,step:'战斗开始！'});
   await waitForBattleLoad(350,signal);
   if(request===preparationId.current){setPreparation(null);preparing.current=false;}
  }catch(error){if(!signal.aborted&&request===preparationId.current)setPreparation(state=>state?{...state,error:error instanceof Error?error.message:String(error)}:state)}
  finally{if(preparationAbort.current===loading)preparationAbort.current=null;}
 }
 function openCampaign(id:string){
  const campaign=c.snapshot().campaigns.find(entry=>entry.id===id),boss=c.snapshot().bosses.find(entry=>entry.id===campaign?.stages[0]?.bossIds[0]);
  if(boss){const destination=findChallengeLocation(boss),{planet,region}=resolveWorldLocation(destination.planetId,destination.regionId);campaignScene.current={src:region.background??planet.background,name:campaign?.location??region.name}}
  else campaignScene.current=explorationScene.current;
  if(c.snapshot().battle?.finished)c.dispatch({type:'closeBattle'});setCampaignId(id);setFocusSpecies(undefined);setWindowKind(null);setMessage('')
 }
 const uiController=useMemo<GameController>(()=>({...c,dispatch:action=>{
  if(action.type==='closeBattle'){const before=c.snapshot(),result=before.battle?.result;battleLevelUpPending.current=!!before.battle?.finished&&!!before.battle.won&&!!battleLevels.current&&battleLevelGained(battleLevels.current,before.monsters);c.dispatch(action);setWindowKind(null);if(result)setMessage(result);return}
  const campaign=action.type==='startBattle'?CHALLENGE_CAMPAIGNS.find(entry=>entry.stages.some(stage=>stage.bossIds.includes(action.bossId))):action.type==='startTraining'&&action.species!==70?CHALLENGE_CAMPAIGNS.find(entry=>entry.species===action.species):undefined;
  if(campaign){openCampaign(campaign.id);return}
  if(action.type==='startBattle'||action.type==='startTraining'||action.type==='startCampaignStage'||action.type==='startFacility')void beginBattle(action);else{const before=c.snapshot();c.dispatch(action);const sound=actionSound(action,before,c.snapshot());if(sound)gameAudio.playSfx(sound)};
 }}),[c]);
 function open(kind:WindowKind){if(preparation)return;if(s.battle&&!s.battle.finished){if(kind==='bag'||kind==='monsters'){setBattleCommand({command:kind==='bag'?'items':'party',id:Date.now()});setWindowKind(null);return}if(kind!=='settings'){setMessage('请先完成战斗，或选择逃跑返回场景。');return}}if(kind==='quests')setQuestFocusId(undefined);if(kind==='monsters')setFusionRecipeId(undefined);if(kind==='bag')setBagPocket(undefined);setWindowKind(current=>current===kind?null:kind)}
 function navigate(page:string){if(page.startsWith('campaign:')){const id=page.slice('campaign:'.length);if(s.campaigns.some(campaign=>campaign.id===id))openCampaign(id);return}if(page.startsWith('facilities:')){setFacilityId(page.slice('facilities:'.length));setWindowKind('facilities');return}if(page==='breeding')setBreedingRecipeId(undefined);if(page==='quests'||page==='home')setQuestFocusId(undefined);if(page==='fusion')setFusionRecipeId(undefined);const target:Record<string,WindowKind>={atlas:'atlas',map:'atlas',home:'quests',monsters:'monsters',fusion:'fusion',breeding:'breeding',shop:'shop',bag:'bag',dex:'dex',quests:'quests',challenge:'challenge',facilities:'facilities',recovery:'recovery',settings:'settings'};setWindowKind(target[page]??null)}
 function exportSave(){const url=URL.createObjectURL(new Blob([c.exportSave()],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='赛尔号-星际存档.json';link.click();URL.revokeObjectURL(url);setMessage('航行存档已导出。')}
 function locate(_species:number,route:AcquisitionRoute){
  setFocusSpecies(undefined);
  if(route.breedingRecipeId){setCampaignId(null);setBreedingRecipeId(route.breedingRecipeId);setTravelTo({planetId:'station',regionId:'lab',requestId:Date.now()});setWindowKind('breeding');return}
  if(route.fusionRecipeId){setCampaignId(null);setFusionRecipeId(route.fusionRecipeId);setTravelTo({planetId:'station',regionId:'lab',requestId:Date.now()});setWindowKind('fusion');return}
  if(route.campaignId){openCampaign(route.campaignId);return}
  if(route.bossId){travelToChallenge(s.bosses.find(boss=>boss.id===route.bossId)!);return}
  setCampaignId(null);
  if(route.questId){setQuestFocusId(route.questId);setWindowKind('quests');return}
  if(route.planetId&&route.regionId){setTravelTo({planetId:route.planetId,regionId:route.regionId,requestId:Date.now()});setWindowKind(null);return}
  const owned=s.monsters.find(mon=>mon.species===route.entrySpecies);
  if(owned)setSelected(owned.uid);
  setWindowKind('monsters');
  if(!owned)setMessage('初始伙伴在新旅程开始时赠送，可在精灵仓库查看。');
 }
 function travelToChallenge(boss:BossView){const {planetId,regionId}=findChallengeLocation(boss);setCampaignId(null);setFocusSpecies(undefined);setWindowKind(null);setTravelTo({planetId,regionId,bossId:boss.id,requestId:Date.now()})}
 function leaveLoading(){preparationId.current++;preparationAbort.current?.abort();preparationAbort.current=null;c.dispatch({type:'flee'});c.dispatch({type:'closeBattle'});setPreparation(null);preparing.current=false;clearIdleBattleAnimations()}
 const notices=message||s.notices[0];
 useEffect(()=>{if(!notices)return;const timer=setTimeout(()=>{setMessage('');c.dispatch({type:'dismissNotice'})},3500);return()=>clearTimeout(timer)},[notices,c]);
 function renderTool(tool:typeof classicTools[number]){return <button key={tool.id} className={`toolbar-${tool.id} ${windowKind===tool.id?'active':''}`} aria-label={tool.label} title={tool.label} aria-pressed={windowKind===tool.id} onClick={()=>open(tool.id)}><img src={classicIcon(tool.asset)} alt="" draggable={false}/>{['dex','recovery','settings'].includes(tool.id)&&<span className="toolbar-label">{tool.label}</span>}{tool.id==='quests'&&s.quests.some(q=>q.claimable??(q.complete&&!q.claimed))&&<i className="hud-alert"/>}</button>}
 return <div ref={shell} style={display} className={`game-shell${s.battle||preparation?' is-in-battle':''}`} onClickCapture={event=>{const target=event.target as HTMLElement;const button=target.closest('button');if(button&&!button.disabled&&!target.closest('.battle-layer'))gameAudio.playSfx(target.closest('.game-toolbar')?'tab':'click')}}>
  <div className="game-stage">
   <div className="exploration-layer" hidden={!!s.battle||!!activeCampaign}><WorldMap s={s} c={uiController} onNavigate={navigate} focusSpecies={focusSpecies} travelTo={travelTo} onSceneChange={rememberScene} onInteract={event=>{if(event.kind==='species'){setDexFocus(event.species);setWindowKind('dex')}else{setQuestFocusId(event.questId);setWindowKind('quests')}}}/></div>
   {activeCampaign&&!s.battle&&<ChallengeCampaignScene campaign={activeCampaign} c={uiController} background={campaignScene.current?.src} onLeave={()=>setCampaignId(null)} onManage={()=>setWindowKind('monsters')}/>}
   {s.battle&&!preparation&&<div className="battle-layer"><Battle s={s} c={uiController} commandRequest={battleCommand} background={battleScene.src} onSettings={()=>open('settings')}/></div>}
   {preparation&&<BattleLoading state={preparation} onLeave={leaveLoading}/>}
   {notices&&!preparation&&!s.battle&&<button className="game-toast" aria-label="关闭提示" onClick={()=>{setMessage('');c.dispatch({type:'dismissNotice'})}}>{notices}<span>×</span></button>}
   {windowKind&&<div className="scene-window-shield" aria-hidden="true" onClick={()=>setWindowKind(null)}/>}
   {windowKind&&<GameWindow key={windowKind} title={titles[windowKind]} compact={['recovery','settings','quests'].includes(windowKind)} onClose={()=>setWindowKind(null)}>
    {windowKind==='atlas'&&<WorldAtlas onTravel={destination=>{setCampaignId(null);setFocusSpecies(undefined);setTravelTo({...destination,requestId:Date.now()});setWindowKind(null)}}/>}
    {windowKind==='monsters'&&<MonsterManager s={s} c={uiController} selected={selected} onSelect={setSelected}/>}
    {windowKind==='fusion'&&<section className="management-panel" aria-label="实验室融合面板"><Fusion s={s} c={uiController} initialRecipeId={fusionRecipeId} onOpenBeads={()=>{setBagPocket('essence');setWindowKind('bag')}}/></section>}
    {windowKind==='breeding'&&<Breeding s={s} c={uiController} initialRecipeId={breedingRecipeId} onOpenDex={species=>{setDexFocus(species);setWindowKind('dex')}} onOpenMonsters={uid=>{setSelected(uid);setWindowKind('monsters')}}/>}
    {windowKind==='shop'&&<ItemShop s={s} c={uiController} onOpenBag={pocket=>{setBagPocket(pocket);setWindowKind('bag')}}/>}
    {windowKind==='bag'&&<Inventory s={s} c={uiController} onSave={exportSave} onMessage={setMessage} initialPocket={bagPocket}/>}
    {windowKind==='dex'&&<Dex s={s} c={uiController} onLocate={locate} focusSpecies={dexFocus}/>}
    {windowKind==='challenge'&&<ChallengeCenter s={s} c={uiController} onExplore={()=>setWindowKind('atlas')} onTravel={travelToChallenge} onCampaign={openCampaign}/>}
    {windowKind==='facilities'&&<BattleFacilities s={s} c={uiController} facilityId={facilityId} onManage={()=>setWindowKind('monsters')}/>}
    {windowKind==='quests'&&<QuestPanel s={s} c={uiController} focusQuestId={questFocusId} onTravel={travelToChallenge} onLocateSpecies={species=>{setDexFocus(species);setWindowKind('dex')}} onOpenBag={()=>{setBagPocket('essence');setWindowKind('bag')}}/>}
    {windowKind==='recovery'&&<section className="recovery-console"><div className="recovery-symbol">✚</div><h3>恢复体力与技能 PP</h3><div className="recovery-roster">{s.party.map(uid=>{const m=s.monsters.find(m=>m.uid===uid)!;return <div key={uid}><span>{m.name}</span><span>{m.hp} / {m.stats.hp}</span></div>})}</div><button className="primary" onClick={()=>{c.dispatch({type:'heal'});gameAudio.playSfx('heal');setWindowKind(null)}}>恢复全队</button></section>}
    {windowKind==='settings'&&<section className="settings-console"><AudioSettings/><h3>航行存档</h3><p>旅程自动保存。导出文件可保留或转移当前进度。</p><div className="action-row"><button onClick={exportSave}>导出存档</button><button disabled={!!s.battle&&!s.battle.finished} onClick={()=>file.current?.click()}>导入存档</button></div><h3>开发工具</h3><button disabled={!!s.battle&&!s.battle.finished} onClick={()=>{setWindowKind(null);setModifier(true)}}>修改器</button><h3>画面</h3><button onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen().catch(()=>setMessage('当前预览窗口不支持全屏，可扩大游戏窗口。'))}}>切换全屏</button><p className="small muted">Escape 关闭场景窗口 · 点击地面行走 · 方向键移动</p><p className="small muted">开发版本 0.3.2 · 本地单人航行</p></section>}
   </GameWindow>}
   <input ref={file} type="file" accept=".json" hidden onChange={async event=>{const f=event.target.files?.[0];if(f)try{c.importSave(await f.text());setMessage('航行存档已载入。');setWindowKind(null)}catch(error){setMessage('存档无法读取：'+String(error))}event.target.value=''}}/>
  </div>
  <footer className="game-hud" hidden={!!s.battle||!!preparation}><nav className="game-toolbar" aria-label="主界面功能"><div className="toolbar-side toolbar-side-left">{classicTools.slice(0,4).map(renderTool)}</div>{renderTool(classicTools[4])}<div className="toolbar-side toolbar-side-right">{classicTools.slice(5).map(renderTool)}</div></nav></footer>
  {modifier&&<Modifier s={s} c={c} m={monster} onSelect={setSelected} close={()=>setModifier(false)}/>}
 </div>;
}
