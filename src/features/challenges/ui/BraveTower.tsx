import {useEffect,useMemo,useState} from 'react';
import type { GameController } from '../../../kernel/contract.ts';
import type { BossView } from '../../../shared/views.ts';
import {BRAVE_TOWER_SEGMENT} from '../../../domain/challenges/brave-tower.ts';
import {battleActive} from '../../../shared/view-helpers.ts';
import {CreatureArt} from '../../../shared/ui/CreatureArt.tsx';
import {useGame} from '../../../shared/ui/use-game.ts';
import '../../../shared/ui/management.css';
import './BraveTower.css';

/** A challenge beside the climb, such as the Mystery Realm's 谱尼; like every Boss it is open from the start. */
function SideChallenge({c,boss,activeBattle}:{c:GameController;boss:BossView;activeBattle:boolean}) {
  return <div className="tower-resume tower-side-challenge" data-tower-side={boss.id}>
    <div><strong>{boss.name}</strong><span>{`通关奖励：${boss.rewardText}`}</span></div>
    <button className="primary" disabled={activeBattle} onClick={()=>c.dispatch({type:'startBattle',bossId:boss.id})}>
      {boss.cleared?'再次挑战':'开始挑战'}
    </button>
  </div>;
}

/** Select an entrance; floor battles begin only by approaching the floor's guardian, side challenges from their row. */
export default function BraveTower({c,onEnter}:{c:GameController;onEnter:(floor:number)=>void}) {
  const progress=useGame(c,s=>s.braveTower),activeBattle=useGame(c,battleActive),bosses=useGame(c,s=>s.bosses);
  const sides=useMemo(()=>bosses.filter(boss=>boss.towerSideFloor!==undefined),[bosses]);
  const attempted=useGame(c,s=>!!s.bosses.find(boss=>boss.id===s.braveTower.position.bossId)?.attempts);
  const {checkpoints,resumeFloor:resume,position}=progress;
  const hasProgress=progress.highestCleared>0||!position.climbComplete&&attempted;
  const [floor,setFloor]=useState(position.entrance);
  useEffect(()=>setFloor(position.entrance),[resume]);
  const selected=checkpoints.find(checkpoint=>checkpoint.floor===floor)??checkpoints[0];
  return <section className="management-panel brave-tower" aria-label="勇者之塔起点选择">
    <div className="tower-progress"><span>最高通过 <b>{progress.highestCleared}</b> / {progress.totalFloors} 层</span><span>每通过十层，解锁下一段起点</span><meter aria-label="勇者之塔通关进度" value={progress.highestCleared} max={progress.totalFloors}/></div>
    {resume!==null&&hasProgress&&<div className="tower-resume"><div><strong>继续上次挑战 · 第 {resume} 层</strong><span>进入楼层，与中央的守层精灵互动开始挑战</span></div><button className="primary" disabled={activeBattle} onClick={()=>onEnter(resume)}>继续第 {resume} 层</button></div>}
    {position.climbComplete&&<p className="tower-complete" role="status">{`已通过全部 ${progress.totalFloors} 层。可以选择已解锁的起点再次闯塔。`}</p>}
    <nav className="tower-checkpoints" aria-label="选择十层挑战起点">{checkpoints.map(checkpoint=><button key={checkpoint.floor} aria-pressed={checkpoint.floor===selected.floor} disabled={!checkpoint.unlocked||activeBattle} className={`${checkpoint.floor===selected.floor?'active':''}${checkpoint.unlocked?'':' locked'}`} onClick={()=>setFloor(checkpoint.floor)}><strong>{checkpoint.floor}–{checkpoint.floor+BRAVE_TOWER_SEGMENT-1} 层</strong><small>{checkpoint.unlocked?'可从此段开始':`通过第 ${checkpoint.floor-1} 层解锁`}</small></button>)}</nav>
    <div className="tower-start-row"><span>胜利后前往下一层，失败或撤离后保留当前楼层。</span><button className="primary" disabled={!selected.unlocked||activeBattle} onClick={()=>onEnter(selected.floor)}>进入第 {selected.floor} 层</button></div>
    {sides.map(boss=><SideChallenge key={boss.id} c={c} boss={boss} activeBattle={activeBattle}/>)}
    {!!progress.milestones.length&&<section className="tower-rewards" aria-label="勇者之塔通关奖励"><h3>通关奖励</h3><div>{progress.milestones.map(reward=><article key={reward.floor}>{reward.species&&<div className="tower-reward-art"><CreatureArt species={reward.species} name={reward.name} scaleByStage={false}/></div>}<div><strong>第 {reward.floor} 层 · {reward.name}</strong><p>{reward.description}</p>{reward.cleared&&<small>已通过本层</small>}</div></article>)}</div></section>}
    {!!progress.honors.length&&<p className="tower-honors">已解锁：{progress.honors.join(' · ')}</p>}
  </section>;
}
