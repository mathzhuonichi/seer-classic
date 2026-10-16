import {useEffect,useState} from 'react';
import type {GameController,GameSnapshot} from '../game-types';
import {BRAVE_TOWER_FLOORS,braveTowerBossId,braveTowerCheckpoints,normalizeBraveTowerProgress} from '../progression/brave-tower';
import {CreatureArt} from './CreatureArt';
import '../management.css';
import './BraveTower.css';

export default function BraveTower({s,c,onManage,onMystery}:{s:GameSnapshot;c:GameController;onManage?:()=>void;onMystery?:()=>void}) {
  const progress=s.braveTower??normalizeBraveTowerProgress(undefined,s.bosses.filter(boss=>boss.cleared).map(boss=>boss.id));
  const checkpoints=s.braveTower?.checkpoints??braveTowerCheckpoints(progress);
  const resume=progress.resumeFloor;
  const resumeBoss=resume===null?undefined:s.bosses.find(boss=>boss.id===braveTowerBossId(resume));
  const [floor,setFloor]=useState(()=>Math.floor(((resume??1)-1)/10)*10+1);
  useEffect(()=>setFloor(Math.floor(((resume??1)-1)/10)*10+1),[resume]);
  const selected=checkpoints.find(checkpoint=>checkpoint.floor===floor)??checkpoints[0];
  const opponent=s.bosses.find(boss=>boss.id===braveTowerBossId(selected.floor));
  const opponents=opponent?.opponents??(opponent?[{species:opponent.species,name:s.species.find(species=>species.id===opponent.species)?.name??opponent.name,level:opponent.level}]:[]);
  const ready=s.party.filter(uid=>s.monsters.some(mon=>mon.uid===uid&&mon.hp>0)).length;
  const activeBattle=!!s.battle&&!s.battle.finished;
  const hasProgress=progress.highestCleared>0||!!resumeBoss?.attempts;
  return <section className="management-panel brave-tower" aria-label="勇者之塔楼层选择">
    <div className="tower-progress"><span>最高通过 <b>{progress.highestCleared}</b> / {BRAVE_TOWER_FLOORS} 层</span><span>每通过十层，解锁下一段起点</span><meter aria-label="勇者之塔通关进度" value={progress.highestCleared} max={BRAVE_TOWER_FLOORS}/></div>
    {resume!==null&&hasProgress&&<div className="tower-resume"><div><strong>继续上次挑战 · 第 {resume} 层</strong><span>{resumeBoss?.name.replace(/^勇者之塔\s*/,'')} · 退出或失败后保留此层</span></div><button className="primary" disabled={activeBattle||!ready||!resumeBoss} onClick={()=>c.dispatch({type:'startTower',floor:resume})}>继续第 {resume} 层</button></div>}
    {resume===null&&<p className="tower-complete" role="status">已通过全部 70 层。可以选择下方已解锁的起点再次挑战。</p>}
    <nav className="tower-checkpoints" aria-label="选择十层挑战起点">{checkpoints.map(checkpoint=><button key={checkpoint.floor} aria-pressed={checkpoint.floor===selected.floor} disabled={!checkpoint.unlocked} className={`${checkpoint.floor===selected.floor?'active':''}${checkpoint.unlocked?'':' locked'}`} onClick={()=>setFloor(checkpoint.floor)}><strong>{checkpoint.floor}–{checkpoint.floor+9} 层</strong><small>{checkpoint.unlocked?'可从此段开始':`通过第 ${checkpoint.floor-1} 层解锁`}</small></button>)}</nav>
    <section className="tower-floor-preview" aria-label={`第 ${selected.floor} 层对手`}>
      <header><h3>第 {selected.floor} 层</h3><span>{selected.unlocked?'起点已解锁':`需先通过第 ${selected.floor-1} 层`}</span></header>
      <div className="tower-opponents">{opponents.map((mon,index)=><div key={`${index}-${mon.species}`}><div className="tower-opponent-art"><CreatureArt species={mon.species} name={mon.name}/></div><strong>{mon.name}</strong><small>Lv.{mon.level}</small></div>)}</div>
      {opponent?.description&&<p className="tower-floor-tip">{opponent.description}</p>}
      <div className="tower-start-row"><span>{selected.unlocked?`从第 ${selected.floor} 层开始；已解锁的起点保留。`:`通过第 ${selected.floor-1} 层后可从此处开始。`}</span><button className="primary" disabled={!selected.unlocked||activeBattle||!ready||!opponent} onClick={()=>c.dispatch({type:'startTower',floor:selected.floor})}>从第 {selected.floor} 层开始</button></div>
    </section>
    <footer className="tower-preparation"><span>{ready?`${ready} 只精灵可以出战`:'请先恢复精灵或调整出战队伍'}</span><button disabled={activeBattle} onClick={()=>c.dispatch({type:'heal'})}>恢复全队</button>{onManage&&<button onClick={onManage}>调整精灵</button>}{onMystery&&<button className="tower-mystery" onClick={onMystery}>前往神秘领域 →</button>}</footer>
  </section>;
}
