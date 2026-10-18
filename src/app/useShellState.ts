import {useCallback,useEffect,useState} from 'react';
import type { GameController, GameSnapshot } from '../kernel/contract.ts';
import {locationBackdrop, type BattleBackdrop} from '../features/battle/index.ts';
import {readWorldPreference} from '../domain/world/world.ts';
import {battleActive} from '../shared/view-helpers.ts';
import {useGame} from '../shared/ui/use-game.ts';
import type {BattleBackdrops} from './useBattlePreparation.ts';
import {useShellNavigation} from './useShellNavigation.ts';

const NOTICE_MS=3500;
const questAlert=(s:Pick<GameSnapshot,'quests'>)=>s.quests.some(quest=>quest.claimable);

/** The shell's own state and the snapshot selections it renders: navigation, selections, the modifier and the toast. */
export function useShellState(c:GameController){
 const navigation=useShellNavigation();
 const [selected,setSelected]=useState(''),[modifier,setModifier]=useState(false),[message,setMessage]=useState('');
 const [battleCommand,setBattleCommand]=useState<{command:'party'|'items';id:number}>();
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
 // The toast shows the shell's own message, else the newest notice, and dismisses itself.
 const toast=message||notice;
 const dismiss=()=>{setMessage('');c.dispatch({type:'dismissNotice'})};
 useEffect(()=>{if(!toast)return;const timer=setTimeout(dismiss,NOTICE_MS);return()=>clearTimeout(timer)},[toast,c]);
 return {
  navigation,selected,setSelected,modifier,setModifier,setMessage,battleCommand,setBattleCommand,
  battleOpen,inBattle,questReady,activeCampaign,modifierTarget,backdrops,rememberScene,toast,dismiss,
 };
}
